/** Derived ped references and preferences never prove game loading. */
export type PedSource={kind:'import'|'mod';id:string};
export type PedIdentity={source:PedSource;referenceId:string};
export type PedUserTag='military'|'police'|'civilian'|'animal';
export type PedUserState={schema:'gems.ped-user-state';schemaVersion:1;source:PedSource;referenceId:string;favorite:boolean;tags:PedUserTag[];updatedAt:string|null};
export type PedUserPatch={favorite?:boolean;tags?:PedUserTag[]};
export type PedKind='addon'|'npc-replace'|'protagonist-replace'|'unknown';
export type PedEvidence={kind:'peds-meta'|'manifest-declaration';sourcePath:string;sourceSha256:string;sourceBytes:number;locator:string};
export type PedDependency={kind:'props'|'clip-dictionary'|'expression-dictionary'|'creature-metadata'|'movement-clip-set'|'dlc'|'runtime'|'file';identifier:string;origin:'parsed-reference'|'manifest-declaration';required:'unknown'|'declared'};
export type PedThumbnail={sourcePath:string;sourceSha256:string;sourceBytes:number;mime:'image/png'|'image/jpeg';width:number;height:number};
export type PedThumbnailView=PedThumbnail&{dataUrl:string};
export type PedReference={referenceId:string;modelName:string;hash:string;kind:PedKind;parsedPedType:string|null;evidence:PedEvidence[];dependencies:PedDependency[];thumbnail?:PedThumbnail};
export type PedReferencesV1={schema:'gems.ped-references';schemaVersion:1;source:PedSource;reportId:string;inputDigest:string;parserVersion:'peds-meta-v1';analyzedAt:string;status:'parsed'|'partial'|'unsupported';references:PedReference[];issues:string[]};
export type PedIndexView={source:PedSource;name:string;status:'unindexed'|'current'|'stale'|'invalid';analysis:PedReferencesV1|null;issues:string[]};
export type PedFileState='verified'|'disabled'|'uninstalled'|'pending'|'missing'|'changed'|'shadowed'|'unverified';
export type PedCatalogRecord={id:string;modId:string;name:string;modelName:string;hash:string;kind:PedKind;parsedPedType:string|null;dependencyRefs:PedDependency[];evidence:PedEvidence[];transactionId:string|null;fileState:PedFileState;registration:'unknown'|'not-registered';dependencies:'unknown'|'missing'|'declared-only';desktopFavorite:boolean;userTags:PedUserTag[];issues:string[]};
export type PedCatalogV1={schemaVersion:1;component:'GEMS.PedCatalog';protocol:'gems.ped-catalog.v1';revision:string;gameRoot:string;gameRootId:string;targetGame:'enhanced';requiresGameRestart:true;peds:PedCatalogRecord[];issues:string[]};
export type PedCatalogCheck={target:string;expectedHash:string;observedHash:string|null;state:PedFileState};
/** Process-owned snapshots; verification rejects fabricated/serialized objects. */
export type PreparedPedCatalog={catalog:PedCatalogV1;text:string;checks:PedCatalogCheck[]};
