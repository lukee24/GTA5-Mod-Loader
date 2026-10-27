import type {LaunchState} from '../launcher';
export type Category = '车辆'|'人物'|'武器'|'地图与房产'|'脚本与玩法'|'图形与环境'|'音效'|'其他';
export interface FileEntry {path:string;source:string;size:number;hash:string;target?:string;binary:boolean;resource?:string}
export interface ImportReport {id:string;name:string;original:string;created:string;categories:Category[];files:FileEntry[];warnings:string[];blockers:string[];readme:string;method:string;compatibility:string;author?:string;version?:string;spawnNames:string[];dlcNames:string[];sourceUrl?:string}
export interface PlanFile extends FileEntry {target:string;beforeHash:string|null;owner?:string}
export interface InstallPlan {id:string;reportId:string;name:string;gamePath:string;files:PlanFile[];conflicts:PlanFile[];blockers:string[];warnings:string[];bytes:number;highRisk:boolean;created:string;trustedRestore?:boolean;reenableFrom?:string}
export interface ModRecord {id:string;report:ImportReport;transactionId:string;status:'已启用'|'已停用'|'已卸载';installed:string;bytes:number;metadata?:{brand?:string;favorite?:boolean}}
export interface Change {target:string;before:string|null;after:string|null;applied:boolean}
export interface Transaction {id:string;name:string;modId:string;gamePath:string;created:string;state:'准备中'|'执行中'|'已完成'|'已回滚'|'恢复待处理';changes:Change[];error?:string;trustedRestore?:boolean;operation?:'update'}
export interface UpdateRemoval {target:string;beforeHash:string;restoreHash:string|null}
export interface ModUpdatePlan extends InstallPlan {modId:string;previousTransactionId:string;previousName:string;previousVersion?:string;nextVersion?:string;removals:UpdateRemoval[]}
export interface Settings {gamePath:string;theme:'dark'|'light';accent:string;reduceMotion:boolean;scale:number;collapsed:boolean}
export interface Environment {valid:boolean;path:string;version:string;platform:string;running:boolean|null;integrity:string;components:{name:string;status:string;evidence:string}[];dlcs:{name:string;size:number;status:string}[];checked:string}
export interface LogEntry {id:string;time:string;kind:string;message:string;source:'数据库'|'文件补充';scope?:string}
export interface LogView {checked:string;entries:LogEntry[];issues:string[];coverage:{limit:number;databaseTotal:number;databaseSampled:number;fileBytes:number;fileReadBytes:number;truncated:boolean}}
export interface State {version:string;settings:Settings;mods:ModRecord[];imports:ImportReport[];transactions:Transaction[];logs:LogEntry[];logInfo:Omit<LogView,'entries'>;operationWarnings:string[];dataPath:string;environment:Environment|null;recovery:string[];launch?:LaunchState|null;launchIssue?:string|null}
export type Reply<T=any> = {ok:true;data:T;operationWarnings?:string[]}|{ok:false;error:string;operationWarnings?:string[]};
export interface GemsApi {call<T=any>(command:string,args?:any):Promise<Reply<T>>;paths(files:File[]):string[];onProgress(fn:(value:{phase:string;message:string;current?:number;total?:number})=>void):()=>void;onDataChanged(fn:()=>void):()=>void}
