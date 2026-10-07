import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshotBundle,instantiateBundle} from '../scripts/bundles.mjs';
import {inventoryRows} from '../scripts/inventory-tree.mjs';
import {grantKit} from '../scripts/kits.mjs';
import {receiveActorDrop} from '../scripts/container-ui.mjs';
const item=(id,parent='',bag=false)=>({_id:id,id,name:id,type:'gear',system:{quantity:1,weight:1,price:3,inventory:{isContainer:bag,containerId:parent,parentKey:parent,containerKey:bag?id:'',capacity:bag?10:0}}});
const tree=()=>[item('bag','',true),item('pouch','bag',true),{...item('ammo','pouch'),system:{...item('ammo','pouch').system,quantity:4}},item('loose')];

test('closed bags hide descendants without promoting them to root; nested state survives',()=>{
 const items=tree();assert.deepEqual(inventoryRows(items).filter(r=>!r.hidden).map(r=>r.item.id),['bag','loose']);
 assert.deepEqual(inventoryRows(items,new Set(['bag'])).filter(r=>!r.hidden).map(r=>r.item.id),['bag','pouch','loose']);
 assert.deepEqual(inventoryRows(items,new Set(['bag','pouch'])).filter(r=>!r.hidden).map(r=>r.item.id),['bag','pouch','ammo','loose']);
 items[0].system.inventory.containerId='pouch';assert.equal(inventoryRows(items).length,4);
});
test('bundle copies preserve quantities and nested links without changing source or sharing IDs',()=>{
 const items=tree(),snapshot=snapshotBundle(items,'bag');let n=0;
 const one=instantiateBundle(snapshot,()=>`new${++n}`),two=instantiateBundle(snapshot,()=>`new${++n}`);
 assert.equal(one.length,3);assert.equal(one[1].system.inventory.containerId,one[0]._id);assert.equal(one[2].system.inventory.containerId,one[1]._id);
 assert.equal(one[2].system.quantity,4);assert.equal(one[1].system.inventory.containerKey,one[1]._id);
 assert.equal(two.some(i=>one.some(j=>i._id===j._id)),false);assert.equal(items[1].system.inventory.containerId,'bag');
 const inner=snapshotBundle(items,'pouch');assert.equal(inner[0].system.inventory.containerId,'');assert.equal(inner.length,2);
});
test('invalid bundles fail before document creation',()=>{
 const items=tree();items[0].system.inventory.capacity=2;assert.throws(()=>snapshotBundle(items,'bag'),/capacity/);
 items[0].system.inventory.capacity=20;items[0].system.inventory.containerId='pouch';assert.throws(()=>snapshotBundle(items,'bag'),/cycle/);
 assert.throws(()=>instantiateBundle([item('orphan','missing')],()=> 'id'),/Invalid kit/);
});
test('kit grant enforces GM and recipient ownership and coalesces simultaneous clicks',async()=>{
 const before={game:globalThis.game,foundry:globalThis.foundry};let n=0,calls=0,release;
 globalThis.game={user:{isGM:true},i18n:{localize:k=>k}};globalThis.foundry={utils:{randomID:()=>`new${++n}`}};
 const data=snapshotBundle(tree(),'bag');const kit={...item('kit','',true),uuid:'Item.kit',name:'Field kit',img:'bag.webp',flags:{itempileffg:{kit:{version:1,items:data}}},system:{...item('kit','',true).system,price:25}};
 const actor={uuid:'Actor.a',isOwner:true,items:[],createEmbeddedDocuments:async(_type,items,options)=>{calls++;assert.equal(options.keepId,true);await new Promise(resolve=>release=resolve);return items;}};
 try{const first=grantKit(kit,actor),second=grantKit(kit,actor);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);release();const [a,b]=await Promise.all([first,second]);assert.equal(a,b);assert.equal(a[0].name,'Field kit');assert.equal(data[0].name,'bag');
 game.user.isGM=false;await assert.rejects(grantKit(kit,actor),/GM_ONLY/);game.user.isGM=true;actor.isOwner=false;await assert.rejects(grantKit(kit,actor),/NO_PERMISSION/);
 }finally{Object.assign(globalThis,before);}
});
test('owned bag transfer delegates the full subtree to Item Piles',async()=>{
 const before={game:globalThis.game,fromUuidSync:globalThis.fromUuidSync,ui:globalThis.ui};let call;
 const source={documentName:'Actor',uuid:'Actor.source',isOwner:true},target={uuid:'Actor.target',isOwner:true};
 globalThis.game={system:{id:'dark-heresy'},i18n:{localize:k=>k},itempiles:{API:{transferItems:async(...args)=>{call=args;}}}};
 globalThis.fromUuidSync=()=>({...item('bag','',true),parent:source});globalThis.ui={notifications:{error:()=>{}}};
 try{await receiveActorDrop(target,fromUuidSync());assert.deepEqual(call,[source,target,['bag']]);
 }finally{Object.assign(globalThis,before);}
});
