import {PHYSICAL_TYPES} from './inventory.mjs';

const lifecycleRegistrations=new WeakMap();

/** Foundry14 constructs world Documents before its setup hook. Extend models
 * at init, and immediately after an asynchronous Apex model publication. The
 * setup callback is only an idempotent fallback, never the primary registration.
 * Runtime globals are resolved lazily because module scripts load before init.
 */
export function registerSchemaHooks({hooks=globalThis.Hooks,getConfig=()=>globalThis.CONFIG,
    getRuntime=()=>globalThis.foundry,supported=()=>true}={}) {
    if(lifecycleRegistrations.has(hooks))return lifecycleRegistrations.get(hooks);
    const apply=()=>{
        if(!supported())return false;
        const config=getConfig(),runtime=getRuntime();
        if(!config?.Actor?.dataModels||!config?.Item?.dataModels||!runtime?.data?.fields)return false;
        extendSchemas(config,runtime);return true;
    };
    hooks.on('darkHeresy.dataModelsReady',apply);
    hooks.once('init',apply);
    hooks.once('setup',apply);
    lifecycleRegistrations.set(hooks,apply);return apply;
}

/** Register schema subclasses before world Documents are constructed. Existing
 * fields from the 1.5 fork or other modules retain their original definitions. */
export function extendSchemas(config = CONFIG, runtime = foundry) {
    const f = runtime.data.fields;
    const number = initial => new f.NumberField({required:false,nullable:false,initial,min:0});
    for (const [type, Base] of Object.entries(config.Actor.dataModels)) {
        if (Base.defineSchema().economy) continue;
        config.Actor.dataModels[type] = class extends Base {
            constructor(data = {}, options = {}) {
                // Embedded-document changes reset existing Actors with cleaning disabled.
                // Their persisted source may predate this module's wallet field.
                super(data.economy === undefined ? {...data,economy:{credits:0}} : data, options);
            }
            static defineSchema() {
                return {...super.defineSchema(),economy:new f.SchemaField({credits:number(0)},
                    {required:true,nullable:false,initial:() => ({credits:0})})};
            }
        };
    }
    for (const [type, Base] of Object.entries(config.Item.dataModels)) {
        if (!PHYSICAL_TYPES.has(type)) {
            if (!Base.defineSchema().price) config.Item.dataModels[type] = class extends Base {
                static defineSchema() { return {...super.defineSchema(), price:number(0)}; }
            };
            continue;
        }
        const fields = Base.defineSchema();
        if (fields.quantity && fields.price && fields.inventory) continue;
        config.Item.dataModels[type] = class extends Base {
            constructor(data = {}, options = {}) {
                super(!fields.inventory && data.inventory === undefined
                    ? {...data,inventory:{containerId:'',parentKey:'',containerKey:'',isContainer:false,capacity:0}}
                    : data, options);
            }
            static defineSchema() {
                const schema = super.defineSchema();
                return {...schema,
                    quantity:schema.quantity ?? new f.NumberField({required:false,nullable:false,initial:1,min:0,integer:true}),
                    price:schema.price ?? number(0),
                    inventory:schema.inventory ?? new f.SchemaField({
                        containerId:new f.StringField({initial:'',blank:true}),
                        parentKey:new f.StringField({initial:'',blank:true}),
                        containerKey:new f.StringField({initial:'',blank:true}),
                        isContainer:new f.BooleanField({initial:false}),capacity:number(0)
                    }, {required:true,nullable:false,initial:() => ({containerId:'',parentKey:'',containerKey:'',isContainer:false,capacity:0})})
                };
            }
        };
    }
}
