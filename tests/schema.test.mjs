import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extendSchemas} from '../scripts/schema.mjs';
test('ItemPileFFG extends old system models before loading documents and preserves existing definitions',()=>{
    class Field {constructor(options){this.options=options;}}
    class SchemaField {constructor(fields){this.fields=fields;}}
    const runtime={data:{fields:{NumberField:Field,StringField:Field,BooleanField:Field,SchemaField}}};
    const originalQuantity=new Field({initial:0});
    class ActorModel {static defineSchema(){return {name:new Field({})};} static migrateData(source){return source;}}
    class AmmoModel {static defineSchema(){return {quantity:originalQuantity};}}
    class GearModel {static defineSchema(){return {};}}
    const config={Actor:{dataModels:{acolyte:ActorModel}},Item:{dataModels:{ammunition:AmmoModel,gear:GearModel,talent:GearModel}}};
    extendSchemas(config,runtime);
    assert.equal(config.Actor.dataModels.acolyte.defineSchema().economy.fields.credits.options.initial,0);
    assert.equal(config.Item.dataModels.ammunition.defineSchema().quantity,originalQuantity);
    assert.equal(config.Item.dataModels.gear.defineSchema().quantity.options.initial,1);
    assert.equal(config.Item.dataModels.gear.defineSchema().inventory.fields.capacity.options.min,0);
    assert.equal(config.Item.dataModels.talent.defineSchema().price.options.initial,0);
    const extended=config.Item.dataModels.gear;extendSchemas(config,runtime);assert.equal(config.Item.dataModels.gear,extended);
});

test('wallet and inventory have independent defaults for legacy documents',()=>{
    class Field {constructor(options){this.options=options;}}
    class SchemaField {constructor(fields,options){this.fields=fields;this.options=options;}}
    class Model {static defineSchema(){return {};}}
    const config={Actor:{dataModels:{acolyte:Model}},Item:{dataModels:{gear:Model}}};
    extendSchemas(config,{data:{fields:{NumberField:Field,StringField:Field,BooleanField:Field,SchemaField}}});
    const wallet=config.Actor.dataModels.acolyte.defineSchema().economy;
    const inventory=config.Item.dataModels.gear.defineSchema().inventory;
    assert.deepEqual(wallet.options.initial(),{credits:0});
    const first=wallet.options.initial();first.credits=99;
    assert.equal(wallet.options.initial().credits,0);
    assert.equal(wallet.options.required,true);
    assert.deepEqual(inventory.options.initial(),{containerId:'',parentKey:'',containerKey:'',isContainer:false,capacity:0});
});

test('legacy actor reset with cleaning disabled receives a wallet without mutating source or balances',()=>{
    class Field {constructor(options){this.options=options;}}
    class SchemaField {constructor(fields,options){this.fields=fields;this.options=options;}}
    class ActorModel {
        static defineSchema(){return {};}
        constructor(data,options){assert.notEqual(data.economy,undefined,'economy: may not be undefined');this.data=data;this.options=options;}
    }
    const config={Actor:{dataModels:{acolyte:ActorModel}},Item:{dataModels:{}}};
    extendSchemas(config,{data:{fields:{NumberField:Field,SchemaField}}});
    const Actor=config.Actor.dataModels.acolyte,source={name:'Veteran'};
    assert.equal(new Actor(source,{clean:false}).data.economy.credits,0);
    assert.equal(source.economy,undefined);
    const funded={economy:{credits:125}};
    assert.equal(new Actor(funded,{clean:false}).data.economy.credits,125);
    assert.equal(new Actor(funded,{clean:false}).options.clean,false);
});
