import {test} from 'node:test';
import assert from 'node:assert/strict';

let imports=0;
function hooks() {
 const listeners=new Map();
 return {
  on(name,fn){const rows=listeners.get(name)??[];rows.push({fn,once:false});listeners.set(name,rows);},
  once(name,fn){const rows=listeners.get(name)??[];rows.push({fn,once:true});listeners.set(name,rows);},
  callAll(name,...args){for(const row of [...(listeners.get(name)??[])]){
   if(row.once)listeners.set(name,listeners.get(name).filter(value=>value!==row));row.fn(...args);
  }}
 };
}
function modelFixture() {
 class Field{constructor(options){this.options=options;}}
 class SchemaField{constructor(fields,options){this.fields=fields;this.options=options;}}
 class Model{
  static defineSchema(){return {};}
  constructor(data){this.data=Object.fromEntries(Object.entries(data).filter(([key])=>Object.hasOwn(this.constructor.defineSchema(),key)));}
 }
 return {Model,runtime:{data:{fields:{NumberField:Field,StringField:Field,BooleanField:Field,SchemaField}}}};
}
async function lifecycle({delayed=false,systemId='apex-heresy-ru'}={}) {
 const before={Hooks:globalThis.Hooks,game:globalThis.game,CONFIG:globalThis.CONFIG,foundry:globalThis.foundry};
 const hook=hooks(),{Model,runtime}=modelFixture(),config={Actor:{dataModels:{}},Item:{dataModels:{}}};
 let publish;
 const published=new Promise(resolve=>publish=resolve);
 hook.once('init',()=>{
  const assign=()=>{config.Actor.dataModels.acolyte=Model;config.Item.dataModels.gear=Model;
   hook.callAll('darkHeresy.dataModelsReady',{Actor:config.Actor.dataModels,Item:config.Item.dataModels});publish();};
  if(delayed)Promise.resolve().then(assign);else assign();
 });
 Object.assign(globalThis,{Hooks:hook,CONFIG:config,foundry:runtime,game:{system:{id:systemId},settings:{register(){}},modules:new Map()}});
 try{
  // Import the actual module entry point: its hook placement is part of this regression.
  await import(new URL(`../scripts/main.mjs?schemaLifecycle=${++imports}`,import.meta.url));
  hook.callAll('init');await published;
  // Foundry14 Game.setupGame calls initializeDocuments before Hooks.setup.
  const inventory={containerId:'bag',parentKey:'bag',containerKey:'',isContainer:false,capacity:0};
  const source={quantity:6,price:25,inventory};
  const item=new config.Item.dataModels.gear(source);
  const actor=new config.Actor.dataModels.acolyte({economy:{credits:125}});
  const modelsBeforeSetup={actor:config.Actor.dataModels.acolyte,item:config.Item.dataModels.gear};
  hook.callAll('setup');
  return {item,actor,source,inventory,config,hook,modelsBeforeSetup};
 }finally{Object.assign(globalThis,before);}
}

test('actual entry point registers inventory and wallet schemas before world document construction, not setup',async()=>{
 const result=await lifecycle();
 assert.deepEqual(result.item.data.inventory,result.inventory);assert.equal(result.item.data.quantity,6);assert.equal(result.item.data.price,25);
 assert.deepEqual(result.actor.data.economy,{credits:125});assert.equal(result.source.quantity,6);
 assert.equal(result.config.Item.dataModels.gear,result.modelsBeforeSetup.item,'setup must not wrap models twice');
 assert.equal(result.config.Actor.dataModels.acolyte,result.modelsBeforeSetup.actor);
});

test('late system model publication during async init is extended synchronously on dataModelsReady before documents load',async()=>{
 const result=await lifecycle({delayed:true});
 assert.deepEqual(result.item.data.inventory,result.inventory);assert.equal(result.item.data.quantity,6);assert.equal(result.item.data.price,25);
 assert.deepEqual(result.actor.data.economy,{credits:125});
});

test('schema lifecycle never changes an unrelated game system',async()=>{
 const result=await lifecycle({systemId:'dnd5e'});
 assert.deepEqual(result.config.Actor.dataModels.acolyte.defineSchema(),{});
 assert.deepEqual(result.config.Item.dataModels.gear.defineSchema(),{});
});
