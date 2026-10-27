export type SiteId = 'gta5mods' | 'nexus' | 'github';
export interface MarketAsset {
  id:string; repository:string; name:string; version:string; author:string;
  pageUrl:string; downloadUrl:string; size:number; digest:string|null;
  published:string; description:string; categories:string[]; brands:string[]; vehicleTypes:string[];
  classification:string; compatibility:string;
}
export interface DownloadRecord {
  id:string; name:string; sourceUrl:string; created:string; status:'排队中'|'下载中'|'正在扫描'|'已分析'|'失败'|'已取消'|'已中断';
  received:number; size:number|null; sha256?:string; checksum?:string; file?:string; reportId?:string; error?:string;
  retryAsset?:import('./download-retry').RetryAsset;retryOf?:string;retryRoot?:string;retryIssue?:string|null;
}
export interface MarketView { assets:MarketAsset[]; downloads:DownloadRecord[]; repository:string; checked:string|null; sources:import('./sources').SavedSource[]; sourceIssues:string[];downloadIssue?:string|null;downloadLogIssue?:string|null; }
