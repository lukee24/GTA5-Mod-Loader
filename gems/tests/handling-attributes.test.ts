import test from 'node:test';
import assert from 'node:assert/strict';
import {editHandling,readHandling} from '../packages/vehicles/handling';

function xml(fields:string){return '<CHandlingDataMgr><HandlingData><Item type="CHandlingData"><handlingName>ATTR_FIXTURE</handlingName>'+fields+'</Item></HandlingData></CHandlingDataMgr>';}

test('双引号作者属性内的伪value不能遮蔽实际value',()=>{
 const source=xml(`<fMass author="note > value='77'" value='1500.000'/>`);
 const result=editHandling(source,'ATTR_FIXTURE',[{field:'fMass',value:1600}]);
 assert.equal(result.xml,source.replace("value='1500.000'","value='1600'"));
 assert.equal(readHandling(result.xml)[0].values.fMass,1600);
});
test('单引号作者属性内的伪value和不同空白完整保留',()=>{
 const source=xml(`<fMass author='note value = "77"'\n\tvalue = "1500.000"/>`);
 assert.equal(editHandling(source,'ATTR_FIXTURE',[{field:'fMass',value:1600}]).xml,source.replace('value = "1500.000"','value = "1600"'));
});
test('提交与原值相同的标量不能误改作者内容',()=>{
 const source=xml(`<fMass author="note value='1500.000'" value='1500.000'/>`);
 const result=editHandling(source,'ATTR_FIXTURE',[{field:'fMass',value:1500}]);
 assert.equal(result.xml,source.replace(" value='1500.000'/>"," value='1500'/>"));
 assert.deepEqual(result.changes,[{field:'fMass',before:1500,after:1500}]);
});
test('重心多轴修改不能写入作者属性内的伪坐标',()=>{
 const source=xml(`<vecCentreOfMassOffset author="note x='0.000' y='77'" x='0.000' y='0.1' z='-0.2'/>`);
 const result=editHandling(source,'ATTR_FIXTURE',[{field:'vecCentreOfMassOffset',axis:'x',value:0},{field:'vecCentreOfMassOffset',axis:'y',value:0.4}]);
 assert.equal(result.xml,source.replace(" x='0.000' y='0.1'"," x='0' y='0.4'"));
 assert.deepEqual(readHandling(result.xml)[0].values.vecCentreOfMassOffset,{x:0,y:0.4,z:-0.2});
});
