import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {fixture,xml} from './ped-fixture';
import {analyzePedReferences,setPedUserState,preparePedCatalog,verifyPedCatalogSnapshot} from '../packages/peds';
import {canonicalGameRoot,gameRootId,digest} from '../packages/peds/validation';

test('实际TS producer生成跨端人物目录与不合并case/Unicode的根身份向量',async()=>{
 const f=await fixture();try{
  f.add('ped-a',xml().replace('</Pedtype>','</Pedtype><PropsName>props_test</PropsName><ClipDictionaryName>clip@test</ClipDictionaryName><ExpressionDictionaryName>expr_test</ExpressionDictionaryName><CreatureMetadataName>creature_test</CreatureMetadataName><MovementClipSet>move_m@generic</MovementClipSet>'));
  const source={kind:'mod' as const,id:'ped-a'},ref=analyzePedReferences(f.store,source).analysis!.references[0];setPedUserState(f.store,{source,referenceId:ref.referenceId},{favorite:true,tags:['police','military']});
  const prepared=await preparePedCatalog(f.store,f.game);await verifyPedCatalogSnapshot(f.store,prepared);assert.equal(prepared.catalog.peds.length,1);assert.equal(prepared.catalog.peds[0].dependencyRefs.length,5);assert.deepEqual(prepared.catalog.peds[0].userTags,['military','police']);assert.equal(prepared.catalog.peds[0].desktopFavorite,true);assert.equal(prepared.catalog.peds[0].registration,'unknown');
  const paths=['C:\\Ped 中文\\GAME','C:\\Ped 中文\\game','C:\\café','C:\\cafe\u0301','\\\\server\\share\\GEMS'];
  const vectors=paths.map(input=>({input,canonical:canonicalGameRoot(input),gameRootId:gameRootId(input)}));assert.notEqual(vectors[0].gameRootId,vectors[1].gameRootId);assert.notEqual(vectors[2].gameRootId,vectors[3].gameRootId);
  const requested=process.env.GEMS_PED_PRODUCER_OUT;
  if(requested){
   const destination=path.resolve(requested),allowed=path.resolve('../../.oss-private/acceptance');if(!destination.startsWith(allowed+path.sep))throw new Error('Producer output must remain inside private acceptance workspace');fs.mkdirSync(destination,{recursive:true});
   fs.writeFileSync(path.join(destination,'ped-catalog-v1.json'),prepared.text,{flag:'wx'});fs.writeFileSync(path.join(destination,'path-vectors.json'),JSON.stringify(vectors,null,2),{flag:'wx'});
   fs.writeFileSync(path.join(destination,'producer.json'),JSON.stringify({generated:new Date().toISOString(),packetSha256:digest(prepared.text),revision:prepared.catalog.revision,rows:1,gameRoot:f.game,source:'actual GEMS TS core with synthetic source/game fixtures; never started GTA',vectorsAreStaticCanonicalizationCases:true},null,2),{flag:'wx'});
  }
 }finally{f.close();}
});
