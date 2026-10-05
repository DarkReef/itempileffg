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
