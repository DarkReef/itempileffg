import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transferTree} from '../scripts/container-service.mjs';

class Items extends Map {[Symbol.iterator](){return this.values();}}
function actor(uuid,items=[]) {
 const result={uuid,isOwner:true,documentName:'Actor',items:new Items()};
 for(const value of items){
  const item={...structuredClone(value),id:value._id,parent:result,toObject(){
   const {_id,name,type,system,flags}=this;return structuredClone({_id,name,type,system,flags});
  }};result.items.set(item.id,item);
 }
 return result;
}
const data=(id,{container=false,parent='',quantity=1}={})=>({_id:id,name:id,type:'gear',
 system:{quantity,weight:1,inventory:{isContainer:container,capacity:50,containerId:parent,parentKey:parent,containerKey:container?id:''}}});

/** Item Piles 3.3.4 resolves IDs, then calls Foundry14 getProperty on each
 * original input to read flags.item-piles.item. Its first `in` check rejects a
 * primitive string despite the API JSDoc advertising string IDs. This mock keeps
 * that runtime boundary strict instead of accepting arguments the real host rejects.
 */
function strictTransferAPI(calls,{result={transferred:true},error}={}) {
 return {transferItems:async(source,target,descriptors,options)=>{
  const rows=descriptors.map(descriptor=>{
   const key='flags.item-piles.item';
   // Same primitive-sensitive lookup boundary as the installed Foundry helper.
   const direct=key in descriptor;
   const flags=direct?descriptor[key]:descriptor.flags?.['item-piles']?.item;
   assert.equal(typeof descriptor._id,'string');
   const item=source.items.get(descriptor._id);assert.ok(item,'source item must exist');
   return {id:item.id,quantity:descriptor.quantity??item.system.quantity,flags};
  });
  calls.push({source,target,descriptors,rows,options});
  if(error)throw error;return result;
 }};
}
async function runtime(operation,options={}) {
 const previous={game:globalThis.game,foundry:globalThis.foundry},calls=[];let next=0;
 globalThis.game={itempiles:{API:strictTransferAPI(calls,options)}};
 globalThis.foundry={utils:{randomID:()=>`fresh${++next}`}};
 try{await operation(calls);}finally{Object.assign(globalThis,previous);}
}

test('transfer to actor root uses an object descriptor accepted by the installed Item Piles flag lookup',()=>runtime(async calls=>{
 const source=actor('Actor.source',[data('grenades',{quantity:6})]),target=actor('Actor.target');
 const result=await transferTree(source.items.get('grenades'),target);
 assert.deepEqual(result,{transferred:true});assert.equal(calls.length,1);
 assert.deepEqual(calls[0].descriptors,[{_id:'grenades'}]);
 assert.equal(calls[0].rows[0].quantity,6);assert.equal(calls[0].options,undefined);
 assert.equal(source.items.get('grenades').system.quantity,6,'the adapter never mutates inventory itself');
}));

test('root backpack and transfer into a target container use the same object API contract and preserve no-stack routing',()=>runtime(async calls=>{
 const source=actor('Scene.s.Token.source.Actor.a',[data('bag',{container:true}),data('ammo',{parent:'bag',quantity:3})]);
 const target=actor('Scene.s.Token.target.Actor.b',[data('destination',{container:true})]);
 const bag=source.items.get('bag');
 await transferTree(bag,target);
 await transferTree(bag,target,'destination');
 assert.equal(calls.length,2);assert.deepEqual(calls[0].descriptors,[{_id:'bag'}]);
 assert.deepEqual(calls[1].descriptors,[{_id:'bag',flags:{'item-piles':{item:{canStack:'no'}}}}]);
 assert.equal(calls[1].rows[0].quantity,1);assert.equal(calls[1].rows[0].flags.canStack,'no');
 assert.deepEqual(JSON.parse(calls[1].options.interactionId.slice('ipf-container:'.length)),{target:target.uuid,containerId:'destination'});
 assert.equal(source.items.size,2);assert.equal(target.items.size,1);
}));

test('a cancelled Item Piles transfer is refused on both root and container paths without a retry',()=>runtime(async calls=>{
 const source=actor('Actor.source',[data('item')]),target=actor('Actor.target',[data('bag',{container:true})]);
 await assert.rejects(transferTree(source.items.get('item'),target),/transfer rejected/);
 await assert.rejects(transferTree(source.items.get('item'),target,'bag'),/transfer rejected/);
 assert.equal(calls.length,2);assert.equal(source.items.size,1);assert.equal(target.items.size,1);
},{result:false}));

test('permission and capacity failures never invoke the transfer API; persistence failures propagate once',async()=>{
 await runtime(async calls=>{
  const source=actor('Actor.source',[data('item',{quantity:6})]),target=actor('Actor.target',[data('bag',{container:true})]);
  source.isOwner=false;await assert.rejects(transferTree(source.items.get('item'),target),/NO_PERMISSION/);
  source.isOwner=true;target.isOwner=false;await assert.rejects(transferTree(source.items.get('item'),target),/NO_PERMISSION/);
  target.isOwner=true;target.items.get('bag').system.inventory.capacity=1;
  await assert.rejects(transferTree(source.items.get('item'),target,'bag'),/capacity/);assert.equal(calls.length,0);
 });
 await runtime(async calls=>{
  const source=actor('Actor.source',[data('item')]),target=actor('Actor.target');
  await assert.rejects(transferTree(source.items.get('item'),target),/backend acknowledgement lost/);assert.equal(calls.length,1);
 },{error:Error('backend acknowledgement lost')});
});
