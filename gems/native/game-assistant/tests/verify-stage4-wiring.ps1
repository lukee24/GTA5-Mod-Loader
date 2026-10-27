param([string]$AssemblyPath = (Join-Path $PSScriptRoot '..\bin\Release\net48\GEMS.GameAssistant.dll'))
$ErrorActionPreference = 'Stop'
# Reads the built production assembly as PE metadata; never loads the game Script base type.
$stream = [IO.File]::OpenRead((Resolve-Path -LiteralPath $AssemblyPath))
$pe = [System.Reflection.PortableExecutable.PEReader]::new($stream)
$reader = [System.Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($pe)
$opcodes = @{}
foreach ($field in [Reflection.Emit.OpCodes].GetFields([Reflection.BindingFlags]'Public,Static')) { $op=$field.GetValue($null); $opcodes[([int]$op.Value -band 0xffff)]=$op }
function Name-Token([int]$token) {
    $row=$token -band 0xffffff
    switch ($token -shr 24) {
        1 { $m=$reader.GetTypeReference([System.Reflection.Metadata.Ecma335.MetadataTokens]::TypeReferenceHandle($row)); return $reader.GetString($m.Namespace)+'.'+$reader.GetString($m.Name) }
        2 { $m=$reader.GetTypeDefinition([System.Reflection.Metadata.Ecma335.MetadataTokens]::TypeDefinitionHandle($row)); return $reader.GetString($m.Namespace)+'.'+$reader.GetString($m.Name) }
        4 { $m=$reader.GetFieldDefinition([System.Reflection.Metadata.Ecma335.MetadataTokens]::FieldDefinitionHandle($row)); $parent=$m.GetDeclaringType() }
        6 { $m=$reader.GetMethodDefinition([System.Reflection.Metadata.Ecma335.MetadataTokens]::MethodDefinitionHandle($row)); $parent=$m.GetDeclaringType() }
        10 { $m=$reader.GetMemberReference([System.Reflection.Metadata.Ecma335.MetadataTokens]::MemberReferenceHandle($row)); $parent=$m.Parent }
        default { return ('token-'+$token) }
    }
    return (Name-Token ([System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken([System.Reflection.Metadata.EntityHandle]$parent)))+'::'+$reader.GetString($m.Name)
}
$events=@{}
foreach ($handle in $reader.MethodDefinitions) {
    $method=$reader.GetMethodDefinition($handle)
    if ($method.RelativeVirtualAddress -eq 0) { continue }
    $name=Name-Token ([System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken([System.Reflection.Metadata.EntityHandle]$handle))
    $bytes=[System.Reflection.Metadata.PEReaderExtensions]::GetMethodBody($pe,$method.RelativeVirtualAddress).GetILBytes()
    $offset=0; $list=[Collections.Generic.List[string]]::new()
    while ($offset -lt $bytes.Length) {
        $key=[int]$bytes[$offset++]; if($key-eq0xfe){$key=0xfe00-bor[int]$bytes[$offset++]}; $op=$opcodes[$key]
        switch ([string]$op.OperandType) {
            'InlineNone' { }
            {$_ -in @('ShortInlineI','ShortInlineVar','ShortInlineBrTarget')} {$offset+=1}
            'InlineVar' {$offset+=2}
            {$_ -in @('InlineI','ShortInlineR','InlineBrTarget','InlineString','InlineSig')} {$offset+=4}
            {$_ -in @('InlineI8','InlineR')} {$offset+=8}
            'InlineSwitch' {$count=[BitConverter]::ToInt32($bytes,$offset);$offset+=4+4*$count}
            {$_ -in @('InlineMethod','InlineField','InlineType','InlineTok')} {
                $token=[BitConverter]::ToInt32($bytes,$offset);$offset+=4
                $list.Add($op.Name+' '+(Name-Token $token))
            }
            default {throw 'Unhandled IL operand'}
        }
    }
    $events[$name]=$list.ToArray()
}
$checks=0
function Check([bool]$ok,[string]$message) { if(-not$ok){throw ('FAIL '+$message)}; $script:checks++; 'PASS '+$message }
function Has([string]$method,[string]$call) { return @($events['Gems.GameAssistant.GemsAssistantScript::'+$method] | Where-Object {$_ -match [regex]::Escape($call)}).Count -gt 0 }
try {
    Check (Has 'Rows' 'WorldMenu::Build') 'actual script Rows routes to WorldMenu'
    Check (Has 'ExecuteSelected' 'WorldController::Execute') 'actual menu action routes to controller'
    Check (Has 'DispatchCommand' 'WorldController::Execute') 'actual +/- key route reaches controller'
    Check (Has 'DispatchCommand' 'WorldController::ClearConfirmation') 'actual navigation clears stale confirmation'
    Check (Has 'OnTick' 'WorldController::Tick') 'actual Tick reaches world requests'
    Check (Has 'OnTick' 'WorldController::Suspend') 'actual guard refusal suspends world state'
    Check (Has 'OnTick' 'GtaWorldPort::ForgetSession') 'actual guard refusal drops adapter authority'
    Check (Has 'OnAborted' 'WorldController::Abort') 'actual Abort reaches world cleanup'
    Check (Has 'BeginModel' 'SpawnCompletion::.ctor') 'new model request has its own completion ticket'
    Check (Has 'TickSpawn' 'SpawnCompletion::Complete') 'actual spawn runs completion/finally layer'
    $spawn=$events['Gems.GameAssistant.GemsAssistantScript::TickSpawn']
    $complete=[Array]::FindIndex($spawn,[Predicate[string]]{param($v) $v -match 'SpawnCompletion::Complete'})
    $model=[Array]::FindLastIndex($spawn,[Predicate[string]]{param($v) $v -eq 'ldflda Gems.GameAssistant.GemsAssistantScript::pendingModel'})
    $ticket=[Array]::FindIndex($spawn,[Predicate[string]]{param($v) $v -eq 'stfld Gems.GameAssistant.GemsAssistantScript::pendingCompletion'})
    Check ($model-ge0-and$model-lt$complete-and$spawn[$model+1]-like'initobj *'-and$ticket-ge0-and$ticket-lt$complete) 'nullable pending model initialized empty and ticket consumed before completion call'
    $create=@($events.GetEnumerator() | Where-Object {@($_.Value | Where-Object {$_-match 'GTA.World::CreateVehicle$'}).Count-gt0})
    Check ($create.Count-eq1-and$create[0].Key-match 'TickSpawn') 'only one CreateVehicle call site in spawn closure'
    Check (@($create[0].Value | Where-Object {$_-match 'GtaWorldPort::TrackCreated$'}).Count-eq1) 'actual creation closure registers with adapter'
    Check (@($create[0].Value | Where-Object {$_-match 'WorldController::RegisterManaged$'}).Count-eq1) 'actual creation closure registers with controller'
    $release=@($events.GetEnumerator() | Where-Object {$_.Key-match'TickSpawn'-and@($_.Value|Where-Object{$_-match'GTA.Model::MarkAsNoLongerNeeded$'}).Count-gt0})
    Check ($release.Count-eq1-and@($release[0].Value|Where-Object{$_-match'GemsAssistantScript::CanOperate$'}).Count-gt0) 'actual completion release checks story guard'
    Check (Has 'OnTick' 'InputRouter::Poll') 'actual Tick polls shared router'
    Check (Has 'OnTick' 'GtaInputPort::Read') 'actual Tick reads production input port'
    Check (Has 'OnTick' 'GemsAssistantScript::DispatchCommand') 'actual Tick dispatches unified command'
    Check (Has 'Rows' 'InputEditor::Rows') 'real menu includes input editor rows'
    Check (Has 'DispatchCommand' 'InputEditor::Execute') 'actual command dispatch invokes editor'
    Check (Has 'DispatchCommand' 'GtaInputPort::Eligible') 'dispatch rechecks final input eligibility'
    Check (Has 'DispatchCommand' 'GemsAssistantScript::SuspendInput') 'dispatch errors suspend input and confirmations'
    Check (Has 'SuspendInput' 'InputRouter::Suspend') 'suspension reaches release barrier'
    Check (Has 'SuspendInput' 'WorldController::ClearConfirmation') 'suspension clears world confirmation'
    Check (Has 'OnKeyDown' 'keyboardEvents') 'SHVDNE key events authorize keyboard input'
    Check (Has 'OnTick' 'GtaInputPort::Suppress') 'opened menu invokes modal suppression port'
    $suppress=$events['Gems.GameAssistant.GtaInputPort::Suppress']
    Check (@($suppress|Where-Object{$_-match'GTA.Game::DisableAllControlsThisFrame$'}).Count-eq1) 'port uses fixed SDK modal per-frame suppression'
    Check (@($events.GetEnumerator()|Where-Object{@($_.Value|Where-Object{$_-match'GTA.Game::EnableAllControlsThisFrame$'}).Count-gt0}).Count-eq0) 'no force-enable-all call in final assembly'
    "Completed $checks built-assembly wiring checks; no GTA runtime loaded or game behavior tested."
    'SHA256 '+(Get-FileHash -Algorithm SHA256 -LiteralPath $AssemblyPath).Hash.ToLowerInvariant()
} finally { $pe.Dispose(); $stream.Dispose() }
