import {PHYSICAL_TYPES,descendants,contentsMass,itemMass} from './inventory.mjs';
export const KIT_SCOPE='itempileffg';
const id = item => item.id ?? item._id;
const copy = item => structuredClone(item.toObject ? item.toObject() : item);

/** Save a closed snapshot: every parent must be inside the bundle. */
export function snapshotBundle(items,rootId) {
    const root=items.find(item=>id(item)===rootId);
    if(!root?.system?.inventory?.isContainer)throw new Error('Single container required');
    const chosen=[root,...descendants(items,rootId)];
    const result=chosen.map(copy);
    result[0].system.inventory.containerId='';result[0].system.inventory.parentKey='';
    for(const item of result){delete item.id;delete item.folder;delete item.ownership;delete item._stats;if(item.flags?.[KIT_SCOPE]){delete item.flags[KIT_SCOPE].kit;delete item.flags[KIT_SCOPE].containerTemplate;}}
    validateBundle(result);
    return result;
}
export function validateBundle(items) {
    if(!Array.isArray(items)||!items.length)throw new Error('Invalid kit');
    const ids=new Set(items.map(id));if(ids.size!==items.length||ids.has(undefined))throw new Error('Invalid kit');
    if(items[0].system?.inventory?.containerId||items.filter(item=>!item.system?.inventory?.containerId).length!==1)throw new Error('Invalid kit');
    for(const item of items){
        if(!PHYSICAL_TYPES.has(item.type))throw new Error('Physical item required');
        const inv=item.system?.inventory;
        itemMass(item);
        if(inv?.isContainer&&(!Number.isFinite(Number(inv.capacity??0))||Number(inv.capacity??0)<0))throw new Error('Invalid kit');
        if(!Number.isSafeInteger(Number(item.system?.quantity??1))||Number(item.system?.quantity??1)<0)throw new Error('Invalid kit');
        if(inv?.isContainer){
            if(Number(item.system.quantity??1)!==1)throw new Error('Single container required');
            if(Number(inv.capacity)>0&&contentsMass(items,id(item))>Number(inv.capacity)+1e-8)throw new Error('Container capacity exceeded');
        }
        const parent=inv?.containerId;
        if(parent){const container=items.find(i=>id(i)===parent);if(!container?.system?.inventory?.isContainer)throw new Error('Invalid kit');}
        descendants(items,id(item));
    }
    return true;
}
/** Allocate fresh IDs for every copy; repeated kit grants cannot cross-link bags. */
export function instantiateBundle(items,randomID,existingIds=[]) {
    validateBundle(items);
    const used=new Set(existingIds),mapping=new Map();
    for(const item of items){let value;for(let n=0;n<100;n++){const candidate=randomID();if(!used.has(candidate)){value=candidate;used.add(value);break;}}if(!value)throw new Error('Cannot allocate item ID');mapping.set(id(item),value);}
    return items.map(item=>{
        const data=copy(item);data._id=mapping.get(id(item));delete data.id;delete data.folder;delete data.ownership;delete data._stats;
        data.system??={};if(item.system?.inventory?.containerId)data.system.equipped=false;
        const inv=data.system.inventory??={};inv.containerId=mapping.get(inv.containerId)||'';inv.parentKey=inv.containerId;
        inv.containerKey=inv.isContainer?data._id:'';
        data.flags??={};if(data.flags[KIT_SCOPE]){delete data.flags[KIT_SCOPE].kit;delete data.flags[KIT_SCOPE].containerTemplate;}
        data.flags['item-piles']??={};data.flags['item-piles'].item??={};
        if(inv.isContainer||inv.containerId)data.flags['item-piles'].item.canStack='no';
        return data;
    });
}
