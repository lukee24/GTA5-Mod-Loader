// Shared labels contain no filesystem or Node runtime dependencies.
export const handlingFields={
 fMass:'质量参数',fInitialDriveForce:'驱动力系数',fDriveInertia:'驱动惯性',fInitialDriveMaxFlatVel:'最高速度相关配置值',
 fBrakeForce:'制动力系数',fHandBrakeForce:'手刹系数',fSteeringLock:'转向参数',fTractionCurveMax:'最大抓地参数',fTractionCurveMin:'最小抓地参数',fTractionCurveLateral:'横向抓地参数',
 fSuspensionForce:'悬挂力度',fSuspensionCompDamp:'压缩阻尼',fSuspensionReboundDamp:'回弹阻尼',fSuspensionUpperLimit:'悬挂上限',fSuspensionLowerLimit:'悬挂下限',fSuspensionRaise:'悬挂高度',
 fSuspensionBiasFront:'前后悬挂分配',fDriveBiasFront:'前后驱动分配',nInitialDriveGears:'初始挡位数',vecCentreOfMassOffset:'重心偏移'
} as const;
export type HandlingField=keyof typeof handlingFields;
export interface HandlingChange {field:HandlingField;axis?:'x'|'y'|'z';value:number;}
export interface HandlingModel {name:string;values:Partial<Record<HandlingField,number|{x:number;y:number;z:number}>>;}
