import {test} from 'node:test';
import assert from 'node:assert/strict';
import {templateTree,serializeTemplate,instantiateTemplate,addTemplateContents,updateTemplate,moveWithinActor,projectedTree,containerMetrics,prepareTargetContainer} from '../scripts/container-service.mjs';
import {inventoryRows} from '../scripts/inventory-tree.mjs';
const data=(id,bag=false,parent='',quantity=1)=>({_id:id,name:id,type:'gear',img:'bag.webp',system:{quantity,weight:1,price:150,equipped:true,inventory:{isContainer:bag,capacity:bag?20:0,containerId:parent,containerKey:bag?id:'',parentKey:parent}},effects:[{name:'test',changes:[]}]});
function document(d){return {...structuredClone(d),id:d._id,uuid:'Item.'+d._id,isOwner:true,toObject(){const {_id,name,type,img,system,flags,effects}=this;return structuredClone({_id,name,type,img,system,flags,effects});},async update(patch){for(const [key,value] of Object.entries(patch)){const parts=key.split('.');let obj=this;for(const p of parts.slice(0,-1))obj=obj[p]??={};obj[parts.at(-1)]=value;}return this;}};}
class Items extends Map{[Symbol.iterator](){return this.values();}}
function actor(items=[]){const a={uuid:'Scene.s.Token.unlinked.Actor.a',isOwner:true,items:new Items(items.map(i=>[i._id,document(i)])),writes:0,async createEmbeddedDocuments(_type,data){this.writes++;return data.map(d=>{const doc=document(d);this.items.set(doc.id,doc);return doc;});},async updateEmbeddedDocuments(_type,patches){for(const p of patches)await this.items.get(p._id).update(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='_id')));},async deleteEmbeddedDocuments(_type,ids){for(const id of ids)this.items.delete(id);}};return a;}
function template(){const tree=[data('bag',true),data('pouch',true,'bag'),data('battery',false,'pouch',3)];const d=document(tree[0]);d.flags={itempileffg:{containerTemplate:serializeTemplate(tree,'bag')}};return d;}
async function runtime(fn){const before={foundry:globalThis.foundry,game:globalThis.game};let n=0;globalThis.foundry={utils:{randomID:()=>`fresh${++n}`}};globalThis.game={user:{isGM:false},packs:new Map()};try{await fn();}finally{Object.assign(globalThis,before);}}
test('versioned templates survive JSON reload and instantiate independent nested trees for owner players',()=>runtime(async()=>{
 const t=document(JSON.parse(JSON.stringify(template().toObject()))),a=actor();
 const first=await instantiateTemplate(t,a),second=await instantiateTemplate(t,a);
 assert.equal(first.length,3);assert.equal(second.length,3);assert.equal(first[2].system.quantity,3);assert.equal(first[2].system.inventory.containerId,first[1].id);
 assert.equal(first[0].system.price,150);assert.equal(first[0].system.equipped,true);assert.equal(first[2].system.equipped,false);assert.deepEqual(first[2].effects,[{name:'test',changes:[]}]);
 first[2].system.quantity=1;assert.equal(second[2].system.quantity,3);assert.equal(templateTree(t)[2].system.quantity,3);
 assert.equal(first.some(i=>second.some(j=>i.id===j.id)),false);assert.equal(a.items.size,6);
}));
test('template into container validates all ancestors before writes and leaves no partial tree',()=>runtime(async()=>{
 const outer=data('outer',true),inner=data('inner',true,'outer');outer.system.inventory.capacity=4;
 const a=actor([outer,inner]);await assert.rejects(instantiateTemplate(template(),a,'inner'),/capacity/);assert.equal(a.writes,0);assert.equal(a.items.size,2);
 outer.system.inventory.capacity=20;a.items.get('outer').system.inventory.capacity=20;
 const created=await instantiateTemplate(template(),a,'inner');assert.equal(created[0].system.inventory.containerId,'inner');assert.equal(created[0].system.equipped,false);
 assert.equal(containerMetrics([...a.items],a.items.get('outer')).contents,6);
}));
test('failed embedded creation rolls back newly allocated documents only',()=>runtime(async()=>{
 const a=actor([data('existing')]);a.createEmbeddedDocuments=async(_type,rows)=>{a.items.set(rows[0]._id,document(rows[0]));throw new Error('write failed');};
 await assert.rejects(instantiateTemplate(template(),a),/write failed/);assert.deepEqual([...a.items.keys()],['existing']);
}));
test('ordinary world container supports nested drops, quantity edits and deletion without changing price',()=>runtime(async()=>{
 const root=document(data('world',true));await addTemplateContents(root,template());
 let tree=templateTree(root);assert.equal(tree.length,4);assert.equal(tree[1].system.inventory.containerId,'world');assert.equal(root.system.price,150);
 const batteryId=tree[3]._id;await updateTemplate(root,items=>{items.find(i=>i._id===batteryId).system.quantity=6;});assert.equal(templateTree(root)[3].system.quantity,6);
 await assert.rejects(addTemplateContents(root,root),/cycle/);
 await updateTemplate(root,items=>items.splice(1));assert.equal(templateTree(root).length,1);
}));
test('legacy kit flag remains readable, unknown versions reject, no destructive migration',()=>runtime(async()=>{
 const t=template();t.flags.itempileffg.kit=t.flags.itempileffg.containerTemplate;delete t.flags.itempileffg.containerTemplate;
 assert.equal(templateTree(t).length,3);assert.ok(t.flags.itempileffg.kit);t.flags.itempileffg.kit.version=99;assert.throws(()=>templateTree(t),/version/);
}));
test('native moves preserve quantities, reject cycles, unequip on containment, do not equip on extraction',()=>runtime(async()=>{
 const a=actor([data('bag',true),data('pouch',true),data('ammo',false,'',6)]);
 await moveWithinActor(a,'pouch','bag');await moveWithinActor(a,'ammo','pouch');assert.equal(a.items.get('ammo').system.equipped,false);
 await assert.rejects(moveWithinActor(a,'bag','pouch'),/cycle/);await assert.rejects(moveWithinActor(a,'bag','bag'),/cycle/);
 await moveWithinActor(a,'ammo');assert.equal(a.items.get('ammo').system.inventory.containerId,'');assert.equal(a.items.get('ammo').system.quantity,6);assert.equal(a.items.get('ammo').system.equipped,false);
}));
test('nonowners and locked packs cannot mutate; invalid old parent IDs render at root',()=>runtime(async()=>{
 const a=actor();a.isOwner=false;await assert.rejects(instantiateTemplate(template(),a),/NO_PERMISSION/);assert.equal(a.writes,0);
 const t=template();t.pack='test';game.packs.set('test',{locked:true});await assert.rejects(updateTemplate(t,()=>{}),/NO_PERMISSION/);
 const broken=data('old',false,'missing');assert.equal(inventoryRows([broken])[0].depth,0);
}));
test('Item Piles authority validates destination capacity and nests the complete transaction before writes',()=>runtime(async()=>{
 const a=actor([data('targetBag',true)]),rows=projectedTree(a,templateTree(template()));
 const updates={itemsToCreate:rows,itemsToUpdate:[],itemDeltas:rows.map(item=>({item,quantity:item.system.quantity}))};
 const interaction='ipf-container:'+JSON.stringify({target:a.uuid,containerId:'targetBag'});
 a.items.get('targetBag').system.inventory.capacity=1;
 assert.throws(()=>prepareTargetContainer(null,null,a,updates,interaction),/capacity/);assert.equal(rows[0].system.inventory.containerId,'');
 a.items.get('targetBag').system.inventory.capacity=20;
 assert.equal(prepareTargetContainer(null,null,a,updates,interaction),true);assert.equal(rows[0].system.inventory.containerId,'targetBag');assert.equal(rows[2].system.inventory.containerId,rows[1]._id);
}));

test('partial movement conserves quantities and effects, validates selected mass and rolls back a failed source update',()=>runtime(async()=>{
 const bag=data('bag',true);bag.system.inventory.capacity=2;
 const a=actor([bag,data('grenade',false,'',5)]);
 await moveWithinActor(a,'grenade','bag',2);
 assert.equal(a.items.get('grenade').system.quantity,3);
 const split=[...a.items].find(i=>i.id!=='bag'&&i.id!=='grenade');
 assert.equal(split.system.quantity,2);assert.equal(split.system.inventory.containerId,'bag');assert.deepEqual(split.effects,a.items.get('grenade').effects);
 await assert.rejects(moveWithinActor(a,'grenade','bag',1),/capacity/);
 await assert.rejects(moveWithinActor(a,'grenade','bag',4),/INVALID_QUANTITY/);
 const b=actor([data('bag',true),data('grenade',false,'',5)]);
 b.updateEmbeddedDocuments=async()=>{throw new Error('save failed');};
 await assert.rejects(moveWithinActor(b,'grenade','bag',2),/save failed/);
 assert.equal(b.items.size,2);assert.equal(b.items.get('grenade').system.quantity,5);
}));
test('successful moves whisper once to all GMs, no-op and rejected moves remain silent',()=>runtime(async()=>{
 const previous=globalThis.ChatMessage,calls=[];
 foundry.utils.escapeHTML=s=>String(s).replaceAll('<','&lt;');
 game.settings={get:()=> 'gm'};game.users=[{id:'gm1',isGM:true},{id:'gm2',isGM:true},{id:'player',isGM:false}];game.user.name='Player';
 game.i18n={localize:()=> 'Root',format:(_key,values)=>JSON.stringify(values)};
 globalThis.ChatMessage={getSpeaker:()=>({}),create:async data=>calls.push(data)};
 try{const a=actor([data('bag',true),data('grenade',false,'',5)]);a.name='Actor';
 await moveWithinActor(a,'grenade','bag',2);assert.equal(calls.length,1);assert.deepEqual(calls[0].whisper,['gm1','gm2']);
 await moveWithinActor(a,'grenade','');assert.equal(calls.length,1);
 await assert.rejects(moveWithinActor(a,'grenade','bag',99));assert.equal(calls.length,1);
 }finally{globalThis.ChatMessage=previous;}
}));
