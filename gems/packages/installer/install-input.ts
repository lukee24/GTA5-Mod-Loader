import type {InstallPlan,ImportReport} from '../core/types';
export interface InstallApproval {overwrite:boolean;binary:boolean}
/** Own the operation inputs before any await; this does not authenticate a caller or freeze files. */
export function captureInstallInputs(plan:InstallPlan,report:ImportReport,approved:InstallApproval):{plan:InstallPlan;report:ImportReport;approved:InstallApproval}{
 let captured:{plan:InstallPlan;report:ImportReport;approved:InstallApproval};
 try{captured=structuredClone({plan,report,approved});}
 catch(error){throw new Error('安装输入无法建立独立快照，未开始文件操作',{cause:error});}
 const approval=captured.approved;
 if(!approval||typeof approval!=='object'||Array.isArray(approval)||Object.keys(approval).length!==2||!Object.hasOwn(approval,'overwrite')||!Object.hasOwn(approval,'binary')||typeof approval.overwrite!=='boolean'||typeof approval.binary!=='boolean')throw new Error('安装审批字段无效：覆盖和脚本风险必须明确使用布尔确认，未开始文件操作');
 return captured;
}
