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
        2 { $m=$reader.GetTypeDefinition([System.Reflection.Metadata.Ecma335.MetadataTokens]::TypeDefinitionHandle($row)); $declaring=$m.GetDeclaringType(); if(-not$declaring.IsNil){return (Name-Token ([System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken([System.Reflection.Metadata.EntityHandle]$declaring)))+'+'+$reader.GetString($m.Name)}; return $reader.GetString($m.Namespace)+'.'+$reader.GetString($m.Name) }
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
function Has([string]$type,[string]$method,[string]$call) { return @($events[('Gems.GameAssistant.'+$type+'::'+$method)] | Where-Object {$_ -match [regex]::Escape($call)}).Count -gt 0 }
try {
 foreach($call in @('GtaWeaponPort::.ctor','WeaponJournal::.ctor','WeaponController::.ctor','WeaponActionsController::.ctor','WeaponActionsMenu::.ctor','WeaponMenu::.ctor')) { Check (Has 'GemsAssistantScript' '.ctor' $call) ('actual script constructs '+$call) }
 foreach($method in @('TryContext','RequireContext','SuspendInput')) { Check (Has 'GemsAssistantScript' $method 'WeaponActionsController::Suspend') ($method+' revokes new session authority') }
 foreach($call in @('WeaponActionsController::Tick','WeaponActionsController::TakeError')) { Check (Has 'GemsAssistantScript' 'OnTick' $call) ('actual Tick invokes '+$call) }
 Check (Has 'GemsAssistantScript' 'Rows' 'WeaponMenu::Rows') 'script uses real weapon rows'
 Check (Has 'GemsAssistantScript' 'ExecuteSelected' 'WeaponMenu::Execute') 'Accept routes to shared weapon menu'
 Check (Has 'GemsAssistantScript' 'DispatchCommand' 'WeaponMenu::Execute') 'numeric commands route to shared weapon menu'
 Check (Has 'WeaponMenu' 'Rows' 'WeaponActionsMenu::Rows') 'weapon page routes new rows'
 Check (Has 'WeaponMenu' 'Execute' 'WeaponActionsMenu::Execute') 'weapon page routes new commands'
 foreach($call in @('WeaponActionsController::Execute','WeaponActionsController::PreviewRestore')) { Check (Has 'WeaponActionsMenu' 'Execute' $call) ('new menu invokes '+$call) }
 foreach($api in @('GTA.WeaponCollection::RemoveAll','GTA.Weapon::set_InfiniteAmmo','GTA.Weapon::set_InfiniteAmmoClip','GTA.WeaponComponent::set_Active','GTA.Weapon::set_Tint')) {
  $sites=@($events.GetEnumerator() | Where-Object {@($_.Value | Where-Object {$_ -match ([regex]::Escape($api)+'$')}).Count -gt 0})
  Check ($sites.Count-eq1-and$sites[0].Key-match'GtaWeaponPort') ('one SDK action site '+$api)
 }
 foreach($method in @('Cancel','Suspend','Tick')) {
  $forbidden=@($events[('Gems.GameAssistant.WeaponActionsController::'+$method)] | Where-Object {$_ -match 'IWeaponActionsPort::(Clear|InfinitePool|InfiniteClip|Component|WeaponTint|ComponentLivery)$'})
  Check ($forbidden.Count-eq0) ($method+' contains no mutation replays or implicit flag-off calls')
 }
 foreach($api in @('IWeaponActionJournal::BeginAction','IWeaponActionsPort::Clear','IWeaponActionsPort::InfinitePool','IWeaponActionsPort::InfiniteClip','IWeaponActionsPort::Component','IWeaponActionsPort::WeaponTint')) { Check (Has 'WeaponActionsController' 'Submit' $api) ('actual submission route includes '+$api) }
 Check (Has 'WeaponActionsController' 'Finish' 'IWeaponActionJournal::FinishAction') 'actual audit completion reaches durable journal'
 Check (Has 'WeaponActionsController' 'Cancel' 'WeaponActionsController::EndClear') 'cancel closes held clear intent'
 Check (Has 'WeaponActionsController' 'Restore' 'IWeaponActionJournal::BeginAction') 'each restoration step has audit intent'
 Check (Has 'WeaponActionsController' 'Restore' 'WeaponActionsController::Finish') 'restoration step records result'
 Check (Has 'WeaponActionsController' 'Revoke' 'WeaponChangeRecord::Eligible') 'revocation invalidates authority rather than deleting history'
 "Completed $checks Stage7 assembly wiring checks; metadata only, not behavior or gameplay."
 'SHA256 '+(Get-FileHash -Algorithm SHA256 -LiteralPath $AssemblyPath).Hash.ToLowerInvariant()
} finally { $pe.Dispose(); $stream.Dispose() }
