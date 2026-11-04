import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshotBundle,instantiateBundle} from '../scripts/bundles.mjs';
import {remapContainers} from '../scripts/inventory.mjs';
import {integrationConfig,prepareContainerTrade} from '../scripts/item-piles.mjs';
import {moveWithinActor} from '../scripts/container-service.mjs';

const raw=(id,type,parent='')=>({_id:id,type,name:id,system:{quantity:1,weight:0,price:5,equipped:true,
    inventory:{isContainer:type==='gear',capacity:0,containerId:parent,parentKey:parent,containerKey:type==='gear'?id:''}}});
const rounds=()=>({...raw('ammo','ammunition','bag'),system:{...raw('ammo','ammunition','bag').system,
    quantity:24,quantityUnit:'rounds',effect:{penetrationModifier:2,special:'Reliable'}}});
const gun=()=>({...raw('gun','weapon','bag'),system:{...raw('gun','weapon','bag').system,ammo:'ammo',clip:{value:7,max:10},
    loadedAmmo:{itemId:'ammo',uuid:'Actor.source.Item.ammo',name:'AP rounds',effect:{penetrationModifier:2}}}});
const tree=()=>[raw('bag','gear'),rounds(),gun()];
const asDocument=data=>({...data,id:data._id,uuid:`Actor.source.Item.${data._id}`,toObject:()=>structuredClone(data)});

test('closed kit snapshots normalize exact owned UUIDs and repeated grants bind their own new ammo',()=>{
    const original=tree();original[2].system.ammo='Actor.source.Item.ammo';
    const snapshot=snapshotBundle(original.map(asDocument),'bag');
    assert.equal(snapshot[2].system.ammo,'ammo');
    assert.equal(snapshot[2].system.loadedAmmo.uuid,null);
    let n=0;
    const first=instantiateBundle(snapshot,()=>`new${++n}`,[],{targetUuid:'Actor.first'});
    const second=instantiateBundle(snapshot,()=>`new${++n}`,[],{targetUuid:'Scene.s.Token.t.Actor.second'});
    for(const [copy,owner]of [[first,'Actor.first'],[second,'Scene.s.Token.t.Actor.second']]){
        assert.equal(copy[2].system.ammo,copy[1]._id);
        assert.equal(copy[2].system.loadedAmmo.itemId,copy[1]._id);
        assert.equal(copy[2].system.loadedAmmo.uuid,`${owner}.Item.${copy[1]._id}`);
        assert.equal(copy[1].system.inventory.containerId,copy[0]._id);
        assert.equal(copy[1].system.quantity,24);
        assert.equal(copy[1].system.quantityUnit,'rounds');
        assert.deepEqual(copy[2].system.loadedAmmo.effect,{penetrationModifier:2});
    }
    assert.notEqual(first[2].system.ammo,second[2].system.ammo);
    assert.equal(original[2].system.ammo,'Actor.source.Item.ammo');
    assert.equal(original[2].system.loadedAmmo.uuid,'Actor.source.Item.ammo');
});

test('excluded reserve and foreign UUID never bind a same-ID destination item; loaded profile survives',()=>{
    const original=tree();original[2].system.ammo='Actor.foreign.Item.ammo';
    const foreign=snapshotBundle(original.map(asDocument),'bag');
    assert.equal(foreign[2].system.ammo,'');
    const noAmmo=[raw('bag','gear'),gun()];
    let n=0;
    const copy=instantiateBundle(snapshotBundle(noAmmo,'bag'),()=>`copy${++n}`,['ammo']);
    assert.equal(copy[1].system.ammo,'');
    assert.equal(copy[1].system.loadedAmmo.itemId,null);
    assert.equal(copy[1].system.loadedAmmo.uuid,null);
    assert.deepEqual(copy[1].system.loadedAmmo.effect,{penetrationModifier:2});
    assert.deepEqual(copy[1].system.clip,{value:7,max:10});
    assert.equal(copy[1].system.loadedAmmo.name,'AP rounds');
});

test('Item Piles remaps nested sibling ammunition after assigning IDs and discards transient markers',()=>{
    const original=tree(),config=integrationConfig();
    const pending=original.map(item=>config.ITEM_TRANSFORMER(item));
    [pending[0]._id,pending[1]._id,pending[2]._id]=['newBag','newAmmo','newGun'];
    pending[1].system.inventory.containerId='';pending[2].system.inventory.containerId='';
    // Only roots retain original IDs as map keys; children need incoming metadata.
    remapContainers({actor:{uuid:'Actor.buyer'},map:{bag:{item:pending[0],items:pending.slice(1)}}});
    assert.equal(pending[2].system.ammo,'newAmmo');
    assert.equal(pending[2].system.loadedAmmo.itemId,'newAmmo');
    assert.equal(pending[2].system.loadedAmmo.uuid,'Actor.buyer.Item.newAmmo');
    assert.equal(pending[1].system.inventory.containerId,'newBag');
    assert.equal(pending[2].system.inventory.containerId,'newBag');
    assert.ok(pending.every(item=>!Object.hasOwn(item.flags?.itempileffg??{},'ammoTransferSource')));
    assert.equal(original[2].system.ammo,'ammo');
    assert.equal(original[1].flags,undefined);
    const alone=config.ITEM_TRANSFORMER(gun());alone._id='newAlone';
    remapContainers({actor:{uuid:'Actor.buyer'},map:{gun:{item:alone,items:[]}}});
    assert.equal(alone.system.ammo,'');assert.equal(alone.system.loadedAmmo.itemId,null);
    assert.deepEqual(alone.system.loadedAmmo.effect,{penetrationModifier:2});
});

test('merchant bundle preserves weapon links, loaded effects and the agreed financial transaction',()=>{
    const source=tree().map(asDocument),seller={items:source},buyer={uuid:'Actor.buyer',items:[]};
    const root=structuredClone(source[0].toObject());root._id='soldBag';root.flags={'dark-heresy':{containerOrigin:'bag'}};
    const sellerChanges={itemsToDelete:['bag'],itemDeltas:[{item:{_id:'bag'},quantity:-1}],documentChanges:{'system.economy.credits':15}};
    const buyerChanges={itemsToCreate:[root],documentChanges:{'system.economy.credits':5}};
    let n=0;prepareContainerTrade(seller,sellerChanges,buyer,buyerChanges,()=>`sold${++n}`);
    const ammo=buyerChanges.itemsToCreate.find(item=>item.type==='ammunition'),weapon=buyerChanges.itemsToCreate.find(item=>item.type==='weapon');
    assert.equal(weapon.system.ammo,ammo._id);
    assert.equal(weapon.system.loadedAmmo.uuid,`Actor.buyer.Item.${ammo._id}`);
    assert.deepEqual(weapon.system.loadedAmmo.effect,{penetrationModifier:2});
    assert.equal(ammo.system.quantity,24);
    assert.deepEqual(sellerChanges.itemsToDelete,['bag','ammo','gun']);
    assert.deepEqual(buyerChanges.documentChanges,{'system.economy.credits':5});
    assert.deepEqual(sellerChanges.documentChanges,{'system.economy.credits':15});
    for(const key of ['system.effect','system.quantityUnit','system.ammo','system.loadedAmmo','system.clip'])
        assert.ok(integrationConfig().ITEM_SIMILARITIES.includes(key),key);
});

test('same-Actor full moves and ammo stack splits keep a weapon bound to its original reserve',async()=>{
    class Collection extends Map{[Symbol.iterator](){return this.values();}}
    const saved={game:globalThis.game,foundry:globalThis.foundry};
    const items=tree().map(asDocument);items[1].system.inventory.containerId='';
    const actor={uuid:'Actor.source',isOwner:true,items:new Collection(items.map(item=>[item.id,item])),
        async updateEmbeddedDocuments(_type,patches){for(const patch of patches){const target=this.items.get(patch._id);for(const [path,value]of Object.entries(patch)){if(path==='_id')continue;const parts=path.split('.'),last=parts.pop();let cursor=target;for(const part of parts)cursor=cursor[part]??={};cursor[last]=value;}}},
        async createEmbeddedDocuments(_type,data){const docs=data.map(asDocument);for(const doc of docs)this.items.set(doc.id,doc);return docs;},
        async deleteEmbeddedDocuments(_type,ids){for(const id of ids)this.items.delete(id);}};
    globalThis.game={settings:{get:()=> 'off'}};globalThis.foundry={utils:{randomID:()=> 'splitAmmo'}};
    try{
        await moveWithinActor(actor,'ammo','bag',6);
        assert.equal(actor.items.get('ammo').system.quantity,18);
        assert.equal(actor.items.get('splitAmmo').system.quantity,6);
        assert.equal(actor.items.get('gun').system.ammo,'ammo');
        await moveWithinActor(actor,'ammo','bag');
        assert.equal(actor.items.get('gun').system.ammo,'ammo');
        assert.equal(actor.items.get('ammo').system.inventory.containerId,'bag');
    }finally{Object.assign(globalThis,saved);}
});
