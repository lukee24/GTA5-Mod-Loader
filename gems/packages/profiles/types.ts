export interface ProfileRef {modId:string;name:string;version?:string;fingerprint:string}
export interface Profile {format:1;id:string;name:string;gamePath:string;created:string;updated:string;mods:ProfileRef[]}
export type ProfileEntryStatus='enabled'|'disabled'|'missing'|'changed'|'uninstalled'|'wrong-game';
export interface ProfileEntry extends ProfileRef {status:ProfileEntryStatus;currentVersion?:string;message:string}
export interface ProfileView {profile:Profile;entries:ProfileEntry[];active:boolean;matchesCurrent:boolean}
export interface ProfileLayer {modId:string;name:string;hash:string}
export interface ProfileSwitchFile {target:string;before:string|null;after:string|null;baseline:string|null;owner?:string;changed:boolean}
export interface ProfileSwitchPlan {id:string;profileId:string;name:string;gamePath:string;created:string;actions:{modId:string;name:string;action:'enable'|'disable'|'keep'}[];files:ProfileSwitchFile[];overlaps:{target:string;order:ProfileLayer[];differentContent:boolean;winner:string}[];blockers:string[];warnings:string[];highRisk:boolean;bytes:number}
export type ProfileSwitchState='preparing'|'executing'|'recovery-required'|'completed'|'rolled-back';
export interface ProfileSwitchSummary {id:string;profileId:string;name:string;gamePath:string;created:string;state:ProfileSwitchState;error?:string;files:number;applied:number}
export interface ProfilesState {profiles:ProfileView[];activeProfileId:string|null;pending:ProfileSwitchSummary[]}
export interface ProfileSwitchResult {id:string;state:'completed'|'rolled-back'|'recovery-required';message:string;gameplayVerified:false}
export interface ProfileApproval {confirmed:boolean;binary:boolean}
