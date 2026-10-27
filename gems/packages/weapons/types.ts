/** Versioned, derived weapon metadata. These records never prove game loading. */
export type WeaponSource={kind:'import'|'mod';id:string};
export type WeaponEvidence={kind:'weapons-meta'|'manifest-declaration';sourcePath:string;sourceSha256:string;sourceBytes:number;locator:string};
export type WeaponReference={
  referenceId:string;weaponName:string;hash:string;kind:'addon'|'replace'|'unknown';
  evidence:WeaponEvidence[];
  symbols:{model?:string;slot?:string;ammo?:string;components:string[]};
  dependencies:{kind:'model'|'ammo'|'component'|'dlc'|'runtime'|'file';identifier:string;origin:'parsed-reference'|'manifest-declaration';required:'declared'|'unknown'}[];
};
export type WeaponReferencesV1={
  schema:'gems.weapon-references';schemaVersion:1;source:WeaponSource;reportId:string;
  inputDigest:string;parserVersion:'weapons-meta-v1';analyzedAt:string;
  status:'parsed'|'partial'|'unsupported';references:WeaponReference[];issues:string[];
};
export type WeaponIndexView={source:WeaponSource;name:string;status:'unindexed'|'current'|'stale'|'invalid';analysis:WeaponReferencesV1|null;issues:string[]};
export type WeaponFileState='verified'|'disabled'|'uninstalled'|'pending'|'missing'|'changed'|'shadowed'|'unverified';
export type WeaponCatalogRecord={
  id:string;modId:string;name:string;weaponName:string;hash:string;kind:'addon'|'replace'|'unknown';
  evidence:WeaponEvidence[];transactionId:string|null;fileState:WeaponFileState;
  registration:'unknown'|'not-registered';dependencies:'unknown'|'missing'|'declared-only';issues:string[];
};
export type WeaponCatalogV1={
  schemaVersion:1;component:'GEMS.WeaponCatalog';protocol:'gems.weapon-catalog.v1';revision:string;
  gameRoot:string;gameRootId:string;targetGame:'enhanced';requiresGameRestart:true;
  weapons:WeaponCatalogRecord[];issues:string[];
};
export type WeaponCatalogCheck={target:string;expectedHash:string;observedHash:string|null;state:WeaponFileState};
/** Prepared snapshots are process-owned; verification rejects fabricated objects. */
export type PreparedWeaponCatalog={catalog:WeaponCatalogV1;text:string;checks:WeaponCatalogCheck[]};
