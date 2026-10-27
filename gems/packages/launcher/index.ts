import path from 'node:path';
import {Store} from '../database';
import {validateGame, gameRunning} from '../diagnostics';
import {inspectSteam} from '../diagnostics/steam';
import {acquireGameDirectories} from '../installer/game-directory-lease';
import {explainError} from '../core/errors';

export const STEAM_ENHANCED_LAUNCH = 'steam://launch/3240220/dialog';
export interface LaunchState {
  format: 1;
  gamePath: string;
  requested: string;
  checked: string;
  phase: 'pending' | 'uncertain' | 'running' | 'exited' | 'cancelled';
  message: string;
  gameplayVerified: false;
}
interface Hooks { validate: typeof validateGame; running: typeof gameRunning }
const pending = (state: LaunchState | null) => state?.phase === 'pending' || state?.phase === 'uncertain';

/** A durable launch reservation prevents writes during the gap before GTA starts.
 * Observing a process is not evidence of story mode, mod loading, or mod function.
 * Steam/Rockstar own launch options and authentication; GEMS supplies no arguments.
 */
export class SteamLauncher {
  private busy = false;
  private hooks: Hooks;
  constructor(private store: Store, private openExternal: (uri: string) => Promise<void>, hooks: Partial<Hooks> = {}) {
    this.hooks = {validate: validateGame, running: gameRunning, ...hooks};
  }
  status(): LaunchState | null {
    const statement = this.store.db.prepare("SELECT CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=16384 THEN json ELSE NULL END AS json FROM documents WHERE kind='game-launch' AND id='current'");
    let raw: unknown;
    try { if (!statement.step()) return null; const json = statement.getAsObject().json; if (typeof json !== 'string') throw new Error(); raw = JSON.parse(json); }
    catch { throw new Error('启动记录无法读取；原记录保留，请先修复记录，暂不修改游戏'); }
    finally { statement.free(); }
    const record = raw as LaunchState;
    if (!record || Array.isArray(record) || typeof record !== 'object' || Object.keys(record).sort().join(',') !== 'checked,format,gamePath,gameplayVerified,message,phase,requested' || record.format !== 1 || typeof record.gamePath !== 'string' || !path.isAbsolute(record.gamePath) || record.gamePath.length > 4096 || /[\x00-\x1f\x7f]/u.test(record.gamePath) || !['pending','uncertain','running','exited','cancelled'].includes(record.phase) || record.gameplayVerified !== false || typeof record.message !== 'string' || record.message.length > 2000 || ![record.requested,record.checked].every(value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)))) {
      throw new Error('启动记录字段无效；原记录保留，请先修复记录，暂不修改游戏');
    }
    return record;
  }
  assertWritable(): void {
    if (pending(this.status())) throw new Error('游戏启动结果尚未确认，暂不修改游戏文件。请在启动页检查进程；如已取消，请关闭平台启动界面后确认结束等待');
  }
  private save(state: LaunchState): LaunchState { this.store.put('game-launch','current',state); return structuredClone(state); }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('已有启动检查正在进行，请稍候');
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }
  request(root: string): Promise<LaunchState> {
    return this.exclusive(async () => {
      this.assertWritable();
      await this.hooks.validate(root);
      const steam = inspectSteam(root);
      if (!steam || !steam.ready) throw new Error('当前只支持具有匹配、就绪 Steam 安装记录的 Enhanced 启动。其他平台启动尚未实现');
      const release = acquireGameDirectories([root]);
      try {
        if (await this.hooks.running()) throw new Error('已检测到 GTA V Enhanced 进程，请返回游戏；未重复发送启动请求');
        await this.hooks.validate(root);
        const now = new Date().toISOString();
        const state: LaunchState = {format:1,gamePath:path.resolve(root),requested:now,checked:now,phase:'pending',message:'已记录启动请求，等待 Steam / Rockstar 与游戏进程。请在平台中选择故事模式；尚未确认游戏或模组加载',gameplayVerified:false};
        // A database failure must prevent dispatch; a process crash after this commit
        // leaves a reservation which is still honored on the next application start.
        this.save(state);
        try { await this.openExternal(STEAM_ENHANCED_LAUNCH); }
        catch (error) {
          this.save({...state,phase:'uncertain',checked:new Date().toISOString(),message:'发送启动请求出现问题，启动结果未知：' + explainError(error).slice(0,1000)});
          throw new Error('启动请求发送失败或结果未知；请在启动页核对 Steam 状态后结束等待', {cause:error});
        }
        return this.save({...state,message:'启动请求已交给 Steam；是否进入游戏尚未确认。请选择故事模式并检查进程，模组加载与功能仍需实际验证'});
      } finally { release(); }
    });
  }
  refresh(): Promise<LaunchState | null> {
    return this.exclusive(async () => {
      const state = this.status();
      if (!state) return null;
      const running = await this.hooks.running(); // Unknown status never clears a reservation.
      const phase = running ? 'running' : state.phase === 'running' ? 'exited' : state.phase;
      return this.save({...state,phase,checked:new Date().toISOString(),message:running
        ? '检测到 GTA V Enhanced 进程；故事模式、模组加载与功能尚未验证'
        : phase === 'exited' ? '当前未检测到 GTA V Enhanced 进程；仅确认进程观察结果，未验证游戏内效果或恢复'
        : pending(state) ? '尚未检测到游戏进程。平台可能仍在等待登录或启动；取消平台启动后可确认结束等待' : state.message});
    });
  }
  /** Invoke only after the user explicitly confirms closing/cancelling platform launch. */
  acknowledgeStopped(): Promise<LaunchState | null> {
    return this.exclusive(async () => {
      const state = this.status();
      if (!state) return null;
      if (await this.hooks.running()) throw new Error('游戏仍在运行，不能确认启动已取消');
      return this.save({...state,phase:'cancelled',checked:new Date().toISOString(),message:'用户确认已取消或退出平台启动；当前未检测到游戏进程。此记录不代表游戏或模组验收'});
    });
  }
}
