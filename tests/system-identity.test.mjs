import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SUPPORTED_SYSTEM_IDS,isSupportedSystem} from '../scripts/system-identity.mjs';
import {enhanceActorContainers} from '../scripts/actor-inventory-ui.mjs';
import {integrationConfig} from '../scripts/item-piles.mjs';

test('manifest supports both Apex package IDs with matching runtime gates and owned update sources',()=>{
    const manifest=JSON.parse(readFileSync(new URL('../module.json',import.meta.url),'utf8'));
    assert.deepEqual(manifest.relationships.systems.map(s=>s.id),SUPPORTED_SYSTEM_IDS);
    for(const system of manifest.relationships.systems) {
        assert.equal(isSupportedSystem(system.id),true);
        assert.equal(system.compatibility.minimum,system.id==='apex-heresy-ru'?'1.6.1':'1.4.2');
        assert.equal(system.manifest,`https://github.com/DarkReef/Apex-Heresy-Ru/releases/${system.id==='dark-heresy'?'download/v1.5.6-ru':'latest/download'}/system.json`);
    }
    for(const id of ['dnd5e','',undefined,null])assert.equal(isSupportedSystem(id??''),false);
});

test('container sheet decoration reaches native selectors under either package ID',()=>{
    const before=globalThis.game;
    try {
        for(const id of [...SUPPORTED_SYSTEM_IDS,'unrelated']) {
            globalThis.game={system:{id}};
            const selectors=[];
            enhanceActorContainers({actor:{items:[]}},{querySelector:s=>{selectors.push(s);return null;}});
            assert.deepEqual(selectors,isSupportedSystem(id)?['.gear-unified > .items']:[]);
        }
    } finally {globalThis.game=before;}
});

test('container bundle origin keeps the stored legacy namespace after package rename',()=>{
    const before=globalThis.game;
    try {
        globalThis.game={system:{id:'apex-heresy-ru'},settings:{get:()=>undefined}};
        const original={type:'gear',system:{inventory:{isContainer:true,containerKey:'bag'}}};
        const copy=integrationConfig().ITEM_TRANSFORMER(original);
        assert.equal(copy.flags['dark-heresy'].containerOrigin,'bag');
        assert.equal(copy.flags['apex-heresy-ru'],undefined);
        assert.equal(original.flags,undefined);
    } finally {globalThis.game=before;}
});
