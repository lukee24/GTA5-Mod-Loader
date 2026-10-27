using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.IO;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using GTA;
using GTA.Math;
using GTA.Native;

namespace Gems.GameAssistant
{
    public sealed class GemsAssistantScript : Script
    {
        private readonly string bridgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GEMS", "bridge", "catalog.json");
        private readonly string dataPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GEMS", "game-assistant");
        private readonly bool enhancedProcess;
        private readonly VehicleController vehicles;
        private readonly GtaWorldPort worldPort;
        private readonly WorldController world;
        private readonly FavoriteStore favorites;
        private int[] favoriteModels = new int[0];
        private int vehiclePage;
        private int worldPage;
        private ChinesePanel? panel;
        private BridgeCatalog catalog = new BridgeCatalog { SchemaVersion = 1, Revision = "empty" };
        private bool opened;
        private int category;
        private readonly MenuViewport viewport = new MenuViewport();
        private readonly KeyEdges keys = new KeyEdges();
        private readonly InputRouter input = new InputRouter();
        private readonly InputEditor inputEditor;
        private readonly GtaInputPort inputPort;
        private readonly HashSet<int> keyboardEvents = new HashSet<int>();
        private bool inputBusy;
        private bool lastInputGamepad;
        private string? inputSession;
        private readonly MenuAcknowledgement acknowledged = new MenuAcknowledgement();
        private readonly OwnedBooleanState invincibility = new OwnedBooleanState();
        private readonly OwnedBooleanState visibility = new OwnedBooleanState();
        private bool pendingRestoration;
        private DateTime nextRestoreTry = DateTime.MinValue;
        private readonly PlayerMotionController motion;
        private readonly WeaponController weapons;
        private readonly WeaponActionsController weaponActions;
        private readonly WeaponCatalogBridge weaponBridge;
        private readonly WeaponMenu weaponMenu;
        private readonly SpawnQuota spawnQuota = new SpawnQuota();
        private readonly PedController peds;
        private readonly PedMenu pedMenu;
        private readonly PedCatalogBridge pedBridge;
        // Advanced ped creation remains maintenance-only; no production menu switch enables it.
        internal static bool ExperimentalPedsEnabled=false;
        private int CategoryCount=>ExperimentalPedsEnabled?CategoryTitles.Length:CategoryTitles.Length-1;
        private static readonly string[] CategoryTitles={"玩家","当前车辆","世界天气与时间","车辆生成器","收藏车型","输入与映射","武器库存与目录","人物生成器"};
        private string pendingReservation="";
        private PlayerIdentity? pendingVehicleActor;
        private bool showCoordinates;
        private int vehicleOffset;
        private DateTime nextCatalogRead = DateTime.MinValue;
        private string notice = "开发测试构建 · 尚未经过 Enhanced 游戏实测";
        private Model? pendingModel;
        private SpawnCompletion? pendingCompletion;
        private DateTime pendingDeadline;
        private string pendingSpawn = "";
        private string pendingVehicleId = "";
        private DateTime nextGuardErrorLog = DateTime.MinValue;

        public GemsAssistantScript()
        {
            enhancedProcess = string.Equals(Process.GetCurrentProcess().ProcessName, "GTA5_Enhanced", StringComparison.OrdinalIgnoreCase);
            vehicles = new VehicleController(CanOperate, Log);
            worldPort = new GtaWorldPort(CanOperate, Log, spawnQuota); world = new WorldController(worldPort);
            favorites = new FavoriteStore(Path.Combine(dataPath, "favorites-v1"));
            inputEditor = new InputEditor(new InputProfileStore(Path.Combine(dataPath, "input-mappings-v1")));
            inputPort = new GtaInputPort(CanOperate);
            motion = new PlayerMotionController(new GtaPlayerMotionPort(inputPort.Eligible));
            weaponBridge = new WeaponCatalogBridge(Path.Combine(Path.GetDirectoryName(bridgePath)!, WeaponCatalog.FileName), new WeaponGameIdentity());
            var weaponPort = new GtaWeaponPort(inputPort.Eligible);
            var weaponJournal = new WeaponJournal(Path.Combine(dataPath, "weapon-actions-v1"));
            weapons = new WeaponController(weaponPort, weaponJournal, weaponBridge.Validate);
            weaponActions = new WeaponActionsController(weaponPort, weaponJournal, weapons.InvalidateAuthority);
            weaponMenu = new WeaponMenu(weapons, weaponBridge, new WeaponActionsMenu(weaponActions));
            pedBridge = new PedCatalogBridge(Path.Combine(Path.GetDirectoryName(bridgePath)!, PedCatalog.FileName));
            peds = new PedController(new GtaPedPort(inputPort.Eligible,spawnQuota),new PedOperationJournal(Path.Combine(dataPath,"ped-actions-v1")),spawnQuota,pedBridge.Validate);
            pedMenu = new PedMenu(peds,pedBridge,new PedFavoriteStore(Path.Combine(dataPath,"ped-favorites-v1")),spawnQuota);
            Interval = 0;
            Tick += OnTick;
            KeyDown += OnKeyDown;
            KeyUp += (sender, arguments) => keys.Release((int)arguments.KeyCode);
            Aborted += OnAborted;
            try
            {
                BridgeCatalog.RejectLinks(dataPath);
                Directory.CreateDirectory(dataPath);
                panel = new ChinesePanel(Path.Combine(dataPath, "menu-cache"));
                try { favoriteModels = favorites.ReadModels(); } catch (Exception error) { Log("收藏读取失败", error.Message); }
                Log("脚本载入", "等待故事模式安全检查；此构建未完成游戏内验收。");
            }
            catch (Exception error) { Log("初始化失败", error.Message); }
        }

        private sealed class Context
        {
            public readonly Player Player; public readonly Ped Ped; public readonly PlayerIdentity Identity;
            public Context(Player player, Ped ped)
            { Player = player; Ped = ped; Identity = new PlayerIdentity(player.Handle, ped.Handle, ped.Model.Hash, ped.MemoryAddress.ToInt64()); }
        }

        private bool TryContext(out Context? context)
        {
            context = null;
            try
            {
                Player? player = null; Ped? ped = null;
                if (!StoryGuard.Probe(enhancedProcess,
                    () => Function.Call<bool>(Hash.NETWORK_IS_GAME_IN_PROGRESS),
                    () => Function.Call<bool>(Hash.NETWORK_IS_SESSION_ACTIVE),
                    () => Function.Call<bool>(Hash.NETWORK_IS_SESSION_STARTED),
                    () => Function.Call<bool>(Hash.GET_IS_LOADING_SCREEN_ACTIVE),
                    () => { player = Game.Player; ped = player.Character; return ped != null && ped.Exists() && !ped.IsDead; }))
                { motion?.Stop("故事模式守卫拒绝"); weapons?.Suspend("故事模式守卫拒绝"); weaponActions?.Suspend("故事模式守卫拒绝"); peds?.Suspend("故事模式守卫拒绝"); return false; }
                context = new Context(player!, ped!); return true;
            }
            catch (Exception error)
            {
                motion?.Stop("故事模式检查异常");
                weapons?.Suspend("故事模式检查异常");
                weaponActions?.Suspend("故事模式检查异常"); peds?.Suspend("故事模式检查异常");
                if (DateTime.UtcNow >= nextGuardErrorLog) { nextGuardErrorLog = DateTime.UtcNow.AddSeconds(5); Log("故事模式检查失败", error.Message); }
                return false;
            }
        }
        private bool CanOperate() => TryContext(out _);
        private static string InputSession(PlayerIdentity identity) => identity.PlayerHandle + ":" + identity.PedHandle + ":" + identity.ModelHash + ":" + identity.Address;
        private Context RequireContext(PlayerIdentity expected)
        {
            if (!TryContext(out var context) || !context!.Identity.Equals(expected))
            { motion.Stop("故事模式或目标角色已变化"); weapons.Suspend("故事模式或目标角色已变化"); weaponActions.Suspend("故事模式或目标角色已变化"); peds.Suspend("故事模式或目标角色已变化"); throw new InvalidOperationException("故事模式或目标角色已变化，已停止调用。"); }
            return context;
        }
        private bool ReadBoolean(PlayerIdentity target, bool visible)
        { var context = RequireContext(target); return visible ? context.Ped.IsVisible : context.Player.IsInvincible; }
        private void WriteBoolean(PlayerIdentity target, bool visible, bool expected, bool desired)
        {
            var context = RequireContext(target);
            var current = visible ? context.Ped.IsVisible : context.Player.IsInvincible;
            if (current != expected) throw new InvalidOperationException("状态已被外部修改，未覆盖。");
            if (visible) context.Ped.IsVisible = desired; else context.Player.IsInvincible = desired;
        }
        private StateOutcome RestoreOne(OwnedBooleanState state, Context context, bool visible)
            => state.Restore(true, context.Identity, () => ReadBoolean(context.Identity, visible), (expected, desired) => WriteBoolean(context.Identity, visible, expected, desired));
        private void RestoreManaged(Context context)
        {
            motion.Stop("用户条件恢复／停止请求");
            var first = "未执行"; var second = "未执行";
            try { first = RestoreOne(invincibility, context, false).ToString(); }
            catch (Exception error) { first = "未确认"; Log("无敌恢复异常", error.Message); }
            try { second = RestoreOne(visibility, context, true).ToString(); }
            catch (Exception error) { second = "未确认"; Log("可见性恢复异常", error.Message); }
            pendingRestoration = invincibility.HasValue || visibility.HasValue;
            nextRestoreTry = DateTime.UtcNow.AddSeconds(5);
            notice = "条件恢复：无敌 " + first + "；可见性 " + second;
            Log("条件恢复", notice);
        }

        private void OnTick(object? sender, EventArgs arguments)
        {
            if (!TryContext(out var context))
            {
                SuspendInput();
                opened = false; acknowledged.Clear();
                pendingRestoration |= invincibility.HasValue || visibility.HasValue;
                vehicles.Suspend(); world.Suspend(); worldPort.ForgetSession(); CancelSpawn(false); return;
            }
            try
            {
                var keyEvents = keyboardEvents.ToArray(); keyboardEvents.Clear();
                var identity = context!.Identity;
                var session = InputSession(identity);
                if (inputSession != session) { SuspendInput(); inputSession = session; keyEvents = new int[0]; }
                var frame = inputPort.Read(session);
                lastInputGamepad = frame.Gamepad;
                frame.PressedKeys = inputBusy ? new string[0] : InputProfile.KeyTokens.Where(k => keyEvents.Contains((int)(Keys)Enum.Parse(typeof(Keys), k))).ToArray();
                frame.UnsupportedKeys = inputBusy ? new string[0] : keyEvents.Where(k => !InputProfile.KeyTokens.Any(t => (int)(Keys)Enum.Parse(typeof(Keys), t) == k)).Select(k => ((Keys)k).ToString()).ToArray();
                if (!frame.Eligible || inputBusy) SuspendInput();
                else
                {
                    keys.Reconcile(key => Game.IsKeyPressed((Keys)key));
                    if (inputEditor.Capturing)
                    {
                        inputEditor.Capture(frame, DateTime.UtcNow); input.RequireRelease(); acknowledged.Clear();
                        notice = inputEditor.Message;
                    }
                    else
                    {
                        var command = input.Poll(inputEditor.Active, frame, opened);
                        if (command.HasValue) DispatchCommand(command.Value);
                    }
                }
                // The input snapshot can become ineligible before dispatch/render, including a quiet frame.
                if (!inputPort.Eligible()) SuspendInput();
                vehicles.Tick(context!.Ped);
                world.Tick();
                if ((pendingRestoration && DateTime.UtcNow >= nextRestoreTry) || (invincibility.HasValue && !invincibility.Target.Equals(context!.Identity)) || (visibility.HasValue && !visibility.Target.Equals(context!.Identity))) RestoreManaged(context!);
                motion.Tick();
                var motionError = motion.TakeError();
                if (motionError != null) { notice = motion.LastResult; Log("移动请求中止", motionError); }
                var weaponWasPending = weapons.Pending; weapons.Tick(DateTime.UtcNow);
                if (weaponWasPending && !weapons.Pending) notice = weapons.LastResult;
                var weaponError = weapons.TakeError();
                if (weaponError != null) { notice = weapons.LastResult; Log("武器操作诊断", weaponError); }
                var actionWasPending = weaponActions.Pending; weaponActions.Tick(DateTime.UtcNow);
                if (actionWasPending && !weaponActions.Pending) notice = weaponActions.LastResult;
                var actionError = weaponActions.TakeError();
                if (actionError != null) { notice = weaponActions.LastResult; Log("角色武器操作诊断", actionError); }
                var pedWasPending=peds.Pending;if(ExperimentalPedsEnabled)peds.Tick(Game.FrameCount);if(pedWasPending&&!peds.Pending)notice=peds.Notice;
                var pedError=peds.TakeError();if(pedError!=null){notice=peds.Notice;Log("人物操作诊断",pedError);}
                if (DateTime.UtcNow >= nextCatalogRead)
                {
                    nextCatalogRead = DateTime.UtcNow.AddSeconds(5);
                    try
                    {
                        var updated = BridgeCatalog.Read(bridgePath);
                        if (updated.Revision != catalog.Revision)
                        {
                            catalog = updated; viewport.Reset(0); vehicleOffset = 0; acknowledged.Clear();
                            notice = "车辆目录已同步；资源更新需要重新启动游戏。";
                            Log("同步车辆目录", updated.Vehicles.Count + " 辆已安装且启用的车辆。");
                        }
                    }
                    catch (Exception error) { notice = "车辆目录读取失败，请查看本地日志。"; Log("桥接失败", error.Message); }
                }
                if (pendingModel.HasValue) TickSpawn();
                if (opened && panel != null)
                {
                    inputPort.Suppress(inputEditor.Active);
                    var titles = CategoryTitles;
                    var rows = Rows(context!); viewport.SetCount(rows.Length);
                    var coordinates = "";
                    if (category == 0 && viewport.Selected >= 0 && (rows[viewport.Selected].Key.StartsWith("player-", StringComparison.Ordinal) || rows[viewport.Selected].Key == "jump") && notice != motion.LastResult) coordinates = motion.LastResult;
                    if (showCoordinates) { var point = RequireContext(context!.Identity).Ped.Position; coordinates = string.Format(CultureInfo.InvariantCulture, "X={0:F1} Y={1:F1} Z={2:F1}", point.X, point.Y, point.Z); }
                    if (category == 5) coordinates = inputEditor.Detail(viewport.Selected, lastInputGamepad);
                    if (category == 6) coordinates = weaponMenu.Detail;
                    if (category == 7) coordinates = pedMenu.Detail;
                    var legible = panel.Draw("GEMS · " + titles[category], "Enhanced 故事模式 · " + (lastInputGamepad ? "手柄" : "键盘") + " · 效果未实测", rows, viewport, notice, coordinates,
                        inputEditor.Hint(MenuCommand.Up, lastInputGamepad) + "/" + inputEditor.Hint(MenuCommand.Down, lastInputGamepad) + " 选择；" + inputEditor.Hint(MenuCommand.PreviousCategory, lastInputGamepad) + "/" + inputEditor.Hint(MenuCommand.NextCategory, lastInputGamepad) + " 分类",
                        inputEditor.Hint(MenuCommand.Accept, lastInputGamepad) + " 执行；" + inputEditor.Hint(MenuCommand.Back, lastInputGamepad) + " 返回；" + inputEditor.Hint(MenuCommand.Toggle, lastInputGamepad) + " 开关；" + inputEditor.Hint(MenuCommand.Increase, lastInputGamepad) + "/" + inputEditor.Hint(MenuCommand.Decrease, lastInputGamepad) + " 调值");
                    if (viewport.Selected >= 0) acknowledged.Record(rows[viewport.Selected], legible);
                }
            }
            catch (Exception error) { SuspendInput(); notice = "操作发生错误，移动请求已停止，详情已写入日志。"; acknowledged.Clear(); Log("执行失败", error.Message); CancelSpawn(CanOperate()); }
        }

        private MenuRow[] Rows(Context context)
        {
            switch (category)
            {
                case 0: return PlayerMenu.Build(context.Player.IsInvincible, context.Player.Wanted.WantedLevel, context.Ped.IsVisible, showCoordinates, motion);
                case 1: return VehicleRows(context);
                case 2: return WorldMenu.Build(worldPage, world.View);
                case 3:
                    return new[] { new MenuRow("spawn:adder", "生成原版 Adder（测试）") }.Concat(catalog.Vehicles.Skip(vehicleOffset).Take(6).Select(v => new MenuRow("spawn:" + v.Id + ":" + v.SpawnName, v.SpawnName, v.Name))).Concat(new[] { new MenuRow("next-page", "下一页已安装车辆") }).ToArray();
                case 5: return inputEditor.Rows();
                case 6: return weaponMenu.Rows();
                case 7: return ExperimentalPedsEnabled?pedMenu.Rows():new[]{new MenuRow("ped-maintenance","高级人物生成仍在维护中","默认关闭",false)};
                default:
                    return favoriteModels.Length == 0 ? new[] { new MenuRow("empty-favorites", "收藏为空：请在当前车辆页添加", "", false) }
                        : favoriteModels.Select(hash => new MenuRow("favorite-model:" + hash.ToString(CultureInfo.InvariantCulture), "生成收藏车型", unchecked((uint)hash).ToString("X8"))).ToArray();
            }
        }
        private MenuRow[] VehicleRows(Context context)
        {
            var vehicle = context.Ped.CurrentVehicle; var valid = vehicle != null && vehicle.Exists();
            return VehicleMenu.Build(vehiclePage, valid, valid && vehicle!.IsEngineRunning, valid && vehicle!.IsInvincible,
                valid ? vehicle!.Speed * 3.6f : 0, valid && favoriteModels.Contains(vehicle!.Model.Hash), vehicles.Confirmation.Key);
        }

        private void OnKeyDown(object? sender, KeyEventArgs arguments)
        {
            if (!inputBusy && keys.Press((int)arguments.KeyCode)) keyboardEvents.Add((int)arguments.KeyCode);
        }
        private void SuspendInput()
        {
            motion.Stop("输入资格中断／暂停／失焦／动作异常");
            weapons.Suspend("输入资格中断／暂停／失焦／动作异常");
            weaponActions.Suspend("输入资格中断／暂停／失焦／动作异常");
            peds.Suspend("输入资格中断／暂停／失焦／动作异常");CancelSpawn(false);
            keyboardEvents.Clear(); inputSession = null; input.Suspend(); inputEditor.Suspend(); opened = false;
            acknowledged.Clear(); vehicles.Confirmation.Clear(); world.ClearConfirmation();
        }
        private void DispatchCommand(MenuCommand command)
        {
            if (inputBusy || !TryContext(out var context) || InputSession(context!.Identity) != inputSession || panel == null || !inputPort.Eligible()) { SuspendInput(); return; }
            if (command == MenuCommand.Toggle) { opened = !opened; weaponMenu.Cancel(); pedMenu.Cancel(); inputEditor.ClearConfirmation(); acknowledged.Clear(); vehicles.Confirmation.Clear(); world.ClearConfirmation(); if (opened) notice = inputEditor.ReadFailed ? inputEditor.Message : "开发测试构建；可切换输入映射与武器分类，游戏效果未实测。"; return; }
            if (!opened) return;
            if (command == MenuCommand.Back) { if (category == 1 && vehiclePage != 0) { vehiclePage = 0; viewport.Reset(0); } else if (category == 2 && worldPage != 0) { worldPage = 0; viewport.Reset(0); } else if (category == 6 && weaponMenu.Back()) viewport.Reset(0); else if(category==7&&pedMenu.Back())viewport.Reset(0); else opened = false; weaponMenu.Cancel(); pedMenu.Cancel(); inputEditor.ClearConfirmation(); acknowledged.Clear(); vehicles.Confirmation.Clear(); world.ClearConfirmation(); return; }
            var rows = Rows(context!); viewport.SetCount(rows.Length);
            if (command == MenuCommand.Up || command == MenuCommand.Down)
            { viewport.Move(command == MenuCommand.Up ? -1 : 1); weaponMenu.Cancel(); pedMenu.Cancel(); inputEditor.ClearConfirmation(); acknowledged.Clear(); vehicles.Confirmation.Clear(); world.ClearConfirmation(); notice = "已选择新条目；旧结果保留在日志。"; return; }
            if (command == MenuCommand.PreviousCategory || command == MenuCommand.NextCategory)
            {
                category = (category + (command == MenuCommand.NextCategory ? 1 : CategoryCount-1)) % CategoryCount; vehiclePage = 0; worldPage = 0; weaponMenu.Reset(); pedMenu.Reset(); viewport.Reset(0); inputEditor.ClearConfirmation(); acknowledged.Clear(); vehicles.Confirmation.Clear(); world.ClearConfirmation(); notice = "已切换分类；手柄打开组合默认不占用。"; return;
            }
            if (command == MenuCommand.Accept || command == MenuCommand.Increase || command == MenuCommand.Decrease)
            {
                if (viewport.Selected < 0) return;
                var row = rows[viewport.Selected];
                if (!row.Enabled) { notice = row.Label + "：" + row.Value; return; }
                if (!acknowledged.Allows(row)) { notice = "请等待所选条目完整显示后再执行。"; weaponMenu.Cancel(); pedMenu.Cancel(); inputEditor.ClearConfirmation(); world.ClearConfirmation(); vehicles.Confirmation.Clear(); return; }
                try {
                    if (!inputPort.Eligible()) { SuspendInput(); return; }
                    inputBusy = true; keyboardEvents.Clear();
                    if (category == 5) { inputEditor.Execute(row.Key, command, DateTime.UtcNow); notice = inputEditor.Message; Log("输入映射", notice + " " + inputEditor.RecoveryAudit); }
                    else if (command == MenuCommand.Accept) ExecuteSelected(context!, row.Key);
                    else if (row.Key == "wanted") SetWanted(context!, PlayerRules.AdjustWanted(context!.Player.Wanted.WantedLevel, command == MenuCommand.Increase ? 1 : -1));
                    else if (category == 0 && (row.Key == "player-run" || row.Key == "player-swim")) notice = motion.Adjust(row.Key, command == MenuCommand.Increase ? 1 : -1);
                    else if (category == 6) notice = weaponMenu.Execute(row.Key, command == MenuCommand.Increase ? 1 : -1, DateTime.UtcNow);
                    else if(category==7&&ExperimentalPedsEnabled)notice=pedMenu.Execute(row.Key,command==MenuCommand.Increase?1:-1);
                    else if (category == 1 && row.Key == "speed") notice = vehicles.Speed(context!.Ped, command == MenuCommand.Increase ? 1 : -1);
                    else if (category == 2 && (row.Key == "time-hour" || row.Key == "time-minute" || row.Key == "density-ped" || row.Key == "density-traffic" || row.Key == "speed-scale" || row.Key == "gravity-choice")) notice = world.Execute(row.Key, command == MenuCommand.Increase ? 1 : -1);
                }
                catch (Exception error) { SuspendInput(); notice = "操作失败，请查看本地日志。"; Log("操作失败", error.Message); }
                finally { inputBusy = false; keyboardEvents.Clear(); input.RequireRelease(); acknowledged.Clear(); } // A second confirmation requires a fresh frame of its full warning.
            }
        }

        private void SetWanted(Context context, int value)
        {
            var safe = RequireContext(context.Identity); var desired = PlayerRules.Wanted(value);
            safe.Player.Wanted.SetWantedLevel(desired, false);
            RequireContext(context.Identity).Player.Wanted.ApplyWantedLevelChangeNow(false);
            notice = "通缉等级读取：" + RequireContext(context.Identity).Player.Wanted.WantedLevel + " / 请求 " + desired;
        }

        private void ExecuteSelected(Context context, string key)
        {
            context = RequireContext(context.Identity);
            var player = context.Player; var ped = context.Ped; var selected = viewport.Selected;
            switch (category)
            {
                case 0:
                    if (key == "invincible" || key == "invisible")
                    {
                        var visible = key == "invisible"; var state = visible ? visibility : invincibility;
                        var result = state.Set(true, context.Identity, !ReadBoolean(context.Identity, visible), () => ReadBoolean(context.Identity, visible), (expected, desired) => WriteBoolean(context.Identity, visible, expected, desired));
                        notice = "开关处理：" + result + "；读取=" + ReadBoolean(context.Identity, visible);
                    }
                    if (key == "health") { var maximum = ped.MaxHealth; if (maximum <= 0) throw new InvalidDataException("生命上限无效，未写入。"); ped.Health = maximum; notice = "生命值读取：" + RequireContext(context.Identity).Ped.Health; }
                    if (key == "armor") { ped.Armor = PlayerRules.Armor(player.MaxArmor); notice = "护甲值读取：" + RequireContext(context.Identity).Ped.Armor; }
                    if (key == "clear-wanted") SetWanted(context, 0);
                    if (key == "wanted") SetWanted(context, player.Wanted.WantedLevel >= 5 ? 0 : player.Wanted.WantedLevel + 1);
                    if (key == "jump" || key == "player-run" || key == "player-swim") notice = motion.Toggle(key);
                    if (key == "player-motion-stop") { motion.Stop("用户停止全部移动请求"); notice = motion.LastResult; }
                    if (key == "coordinates") { showCoordinates = !showCoordinates; notice = "坐标显示" + (showCoordinates ? "已开启" : "已关闭"); }
                    if (key == "restore") { RestoreManaged(context); Log("车辆恢复", vehicles.Restore()); }
                    break;
                case 1:
                    if (key == "vehicle-back") { vehiclePage = 0; viewport.Reset(0); acknowledged.Clear(); vehicles.Confirmation.Clear(); break; }
                    if (key == "paint-menu" || key == "windows-menu" || key == "lights-menu") { vehiclePage = key == "paint-menu" ? 1 : key == "windows-menu" ? 2 : 3; viewport.Reset(0); acknowledged.Clear(); break; }
                    if (key == "restore-vehicle") { notice = vehicles.Restore(); break; }
                    var vehicle = vehicles.Current(ped);
                    if (key == "repair") { vehicle.Repair(); notice = "引擎/车身生命读回 " + vehicle.EngineHealth.ToString("F0") + "/" + vehicle.BodyHealth.ToString("F0") + "；外观待观察"; }
                    if (key == "clean") { vehicle.DirtLevel = 0; notice = "车辆污渍值读取：" + vehicle.DirtLevel; }
                    if (key == "engine" || key == "interior" || key == "vehicle-invincible") notice = vehicles.Toggle(ped, key == "vehicle-invincible" ? "invincible" : key);
                    if (key == "upright") notice = vehicles.Upright(ped);
                    if (key == "doors-open" || key == "doors-close") notice = vehicles.Doors(ped, key == "doors-open");
                    if (key == "windows-up" || key == "windows-down") notice = vehicles.Windows(ped, key == "windows-down");
                    if (key == "performance" || key == "suspension" || key == "lights") notice = vehicles.Once(ped, key);
                    if (key == "paint-primary" || key == "paint-secondary") notice = vehicles.Paint(ped, key == "paint-secondary");
                    if (key == "plate") notice = vehicles.Plate(ped);
                    if (key == "tires") notice = vehicles.FixTires(ped);
                    if (key == "speed") notice = vehicles.Speed(ped, 0);
                    if (key == "favorite") { var saved = favorites.Toggle(vehicle.Model.Hash); favoriteModels = favorites.ReadModels(); notice = "车型收藏" + (saved ? "已保存" : "已取消") + "；不保存实体及改装"; }
                    break;
                case 2:
                    if (key == "world-back" || key.StartsWith("world-page:", StringComparison.Ordinal))
                    {
                        worldPage = key == "world-back" ? 0 : int.Parse(key.Substring(11), CultureInfo.InvariantCulture);
                        if (worldPage < 0 || worldPage > 5) throw new InvalidDataException("未知世界页面。");
                        viewport.Reset(0); acknowledged.Clear(); world.ClearConfirmation();
                    }
                    else notice = world.Execute(key);
                    break;
                case 3:
                    if (selected == 0) BeginSpawn("adder", "builtin:adder");
                    else if (key == "next-page") { vehicleOffset += 6; if (vehicleOffset >= catalog.Vehicles.Count) vehicleOffset = 0; viewport.Reset(0); acknowledged.Clear(); }
                    else { var entry = catalog.Vehicles[vehicleOffset + selected - 1]; BeginSpawn(entry.SpawnName, entry.Id); }
                    break;
                case 4:
                    var hash = favoriteModels[selected]; BeginModel(new Model(hash), "model:" + unchecked((uint)hash).ToString("X8"), "favorite:" + hash); break;
                case 6:
                    if (key == "weapon-search")
                    {
                        var text = Game.GetUserInput(weaponMenu.Query);
                        RequireContext(context.Identity);
                        if (!inputPort.Eligible()) { SuspendInput(); break; }
                        if (!string.IsNullOrWhiteSpace(text)) { weaponMenu.Filter(text); notice = "搜索条件已更新；未写武器库存。"; }
                        else notice = "空输入或取消保留原搜索；用清空搜索条目清除。";
                    }
                    else
                    {
                        var beforePage = weaponMenu.Page;
                        notice = weaponMenu.Execute(key, 0, DateTime.UtcNow);
                        if (weaponMenu.Page != beforePage || key == "weapon-next" || key == "wa-next") viewport.Reset(0);
                        if (key == "weapon-refresh" || key == "weapon-audit") Log("武器目录诊断", weaponBridge.Status + " " + weaponBridge.Detail);
                    }
                    break;
                case 7:
                    if(!ExperimentalPedsEnabled){notice="高级人物生成当前关闭，留待维护验证。";break;}
                    if(key=="ped-search")
                    {
                        var text=Game.GetUserInput(pedMenu.Query);RequireContext(context.Identity);
                        if(!inputPort.Eligible()){SuspendInput();break;}
                        if(!string.IsNullOrWhiteSpace(text)){pedMenu.Filter(text);notice="人物搜索已更新，未生成对象。";}else notice="空输入/取消保留人物搜索。";
                    }
                    else {var previous=pedMenu.Page;notice=pedMenu.Execute(key,0);if(previous!=pedMenu.Page||key=="ped-next"||key=="ped-refresh")viewport.Reset(0);if(key=="ped-refresh")Log("人物目录诊断",pedMenu.Diagnostics);}
                    break;
            }
            Log("菜单操作", notice);
        }

        private void BeginSpawn(string spawnName, string id)
        {
            if (pendingModel.HasValue) { notice = "已有模型正在加载，请稍候。"; return; }
            if (!BridgeCatalog.IsSpawnName(spawnName)) throw new InvalidDataException("车辆生成名称无效。");
            var model = new Model(spawnName);
            BeginModel(model, spawnName, id);
        }
        private void BeginModel(Model model, string name, string id)
        {
            if (pendingModel.HasValue) { notice = "已有模型正在加载，请稍候。"; return; }
            if (!TryContext(out var actor)||!inputPort.Eligible()) return;
            if (spawnQuota.Charged >= 16) { notice = "本实例已有16个临时车型记录，请先在世界页清理可用样本。"; return; }
            if (!model.IsValid || !model.IsInCdImage || !model.IsVehicle) { notice = "车辆模型不可用；检查 DLC 注册并重启游戏。"; Log("车辆生成失败", name + ": model unavailable"); return; }
            pendingReservation=spawnQuota.Reserve("vehicle",1);pendingVehicleActor=actor!.Identity;
            pendingModel = model; pendingCompletion = new SpawnCompletion(); pendingSpawn = name; pendingVehicleId = id; pendingDeadline = DateTime.UtcNow.AddSeconds(5);
            try{RequireContext(pendingVehicleActor.Value);model.Request();notice="正在加载车辆模型，最长等待5秒；占用共享预约。";}catch{CancelSpawn(false);throw;}
        }

        private void TickSpawn()
        {
            if (!pendingModel.HasValue || !TryContext(out var context)) { CancelSpawn(false); return; }
            if(!pendingVehicleActor.HasValue||!context!.Identity.Equals(pendingVehicleActor.Value)||!inputPort.Eligible()){CancelSpawn(false);return;}
            var model = pendingModel.Value;
            if (DateTime.UtcNow > pendingDeadline) { notice = "模型加载超时；请检查资源兼容性。"; Log("车辆生成失败", pendingSpawn + ": timeout"); CancelSpawn(CanOperate()); return; }
            if (!model.IsLoaded) { model.Request(); return; }
            var ped = context!.Ped;
            var point = ped.Position + ped.ForwardVector * 9f;
            if (!World.GetGroundHeight(point + new Vector3(0, 0, 15), out var ground) || Math.Abs(ground - ped.Position.Z) > 8)
            { notice = "附近地面不安全，请移动到平坦开阔位置。"; CancelSpawn(CanOperate()); return; }
            point.Z = ground + 0.6f;
            if (World.GetNearbyVehicles(point, 6f).Length != 0 || World.GetNearbyPeds(point, 6f).Length != 0)
            { notice = "生成区域有车辆或行人，请移动到开阔位置。"; CancelSpawn(CanOperate()); return; }
            RequireContext(context.Identity);
            var completion = pendingCompletion ?? throw new InvalidOperationException("车辆请求缺少完成票据。");
            var reservation=pendingReservation;var expected=pendingVehicleActor!.Value;
            pendingModel = null; pendingCompletion = null;pendingReservation="";pendingVehicleActor=null;
            completion.Complete(() =>
            {
                // Fixed SDK World.CreateVehicle contains Request(1000)/Yield. Preparation above is Tick-based;
                // use its already-verified named CREATE_VEHICLE signature after the final guards instead.
                spawnQuota.Require(reservation,0);if(!inputPort.Eligible())throw new InvalidOperationException("车辆提交前输入资格失效。");
                var finalActor=RequireContext(expected);var vehicleCount=World.VehicleCount;var vehicleCapacity=World.VehicleCapacity;
                if(vehicleCount<0||vehicleCapacity<1||vehicleCount>=vehicleCapacity||!model.IsLoaded||!model.IsVehicle)throw new InvalidOperationException("车辆模型或动态容量不再可用。");
                if(World.GetNearbyVehicles(point,6f).Length!=0||World.GetNearbyPeds(point,6f).Length!=0)throw new InvalidOperationException("车辆提交前区域已占用。");
                if(!inputPort.Eligible())throw new InvalidOperationException("车辆最后输入资格失效。");finalActor=RequireContext(expected);
                var livePlayer=Game.Player;var livePed=livePlayer.Character;
                if(!new PlayerIdentity(livePlayer.Handle,livePed.Handle,livePed.Model.Hash,livePed.MemoryAddress.ToInt64()).Equals(expected)||!finalActor.Identity.Equals(expected))throw new InvalidOperationException("车辆最后角色身份改变。");
                var heading=livePed.Heading;spawnQuota.Issue(reservation,0);
                var created=Entity.FromHandle(Function.Call<int>(Hash.CREATE_VEHICLE,model.Hash,point.X,point.Y,point.Z,heading,false,false)) as Vehicle;
                if (created == null || !created.Exists()) { notice = "生成接口未返回有效车辆，生成失败。"; Log("车辆生成失败", pendingSpawn); }
                else
                {
                    notice = "已检测到生成车辆；模型外观仍需人工验收。"; Log("车辆对象创建", pendingVehicleId + " / " + pendingSpawn + " / handle=" + created.Handle);
                    if (worldPort.TrySession(out var spawnSession)&&spawnSession.Actor.Equals(expected))
                    {
                        var identity = worldPort.TrackCreated(spawnSession, created,reservation); world.RegisterManaged(spawnSession, identity);
                        Log("临时车辆生命周期", "本实例保留管理记录；世界页只清理10米内无人占用且仍安全的本助手临时车辆。");
                    }
                    else Log("临时车辆未登记", "创建后守卫失效；未继续写实体状态，不声称可清理或恢复。");
                }
            }, () => { try{if (CanOperate()) model.MarkAsNoLongerNeeded();}finally{spawnQuota.End(reservation);} });
        }

        private void CancelSpawn(bool canCallNative)
        {
            if (pendingModel.HasValue && canCallNative)
            {
                try { pendingModel.Value.MarkAsNoLongerNeeded(); } catch { }
            }
            if(pendingReservation.Length!=0)spawnQuota.End(pendingReservation);pendingReservation="";pendingVehicleActor=null;
            pendingModel = null; pendingCompletion = null;
        }

        private void OnAborted(object? sender, EventArgs arguments)
        {
            SuspendInput();
            opened = false; acknowledged.Clear();
            var allowed = TryContext(out var context);
            try
            {
                if (allowed) { RestoreManaged(context!); Log("车辆恢复", vehicles.Restore()); }
                else if (invincibility.HasValue || visibility.HasValue || vehicles.HasChanges) Log("恢复未执行", "故事模式守卫拒绝；未调用状态恢复接口，不能声称已恢复。");
            }
            catch (Exception error) { Log("恢复失败", error.Message); }
            try { world.Abort(); } catch (Exception error) { Log("世界恢复未确认", error.Message); }
            CancelSpawn(allowed && CanOperate());
            Log("脚本卸载", "脚本停止；恢复结果以条件恢复日志为准。已提交无限请求可能仍有效，未自动关闭或恢复未知原值。");
        }

        private void Log(string operation, string detail)
        {
            try
            {
                BridgeCatalog.RejectLinks(dataPath);
                Directory.CreateDirectory(dataPath);
                var path = Path.Combine(dataPath, "assistant.log");
                BridgeCatalog.RejectLinks(path);
                if (File.Exists(path) && new FileInfo(path).Length > 4 * 1024 * 1024) File.Move(path, Path.Combine(dataPath, "assistant-" + DateTime.UtcNow.ToString("yyyyMMddHHmmssfff") + ".log"));
                File.AppendAllText(path, DateTime.UtcNow.ToString("O") + " | " + operation + " | " + detail.Replace('\n', ' ').Replace('\r', ' ') + Environment.NewLine, Encoding.UTF8);
            }
            catch { /* File errors must never cause a game loop exception. */ }
        }
    }
}
