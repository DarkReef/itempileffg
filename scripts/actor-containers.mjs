import {inventoryRows} from './inventory-tree.mjs';
import {PHYSICAL_TYPES} from './inventory.mjs';
const expandedByActor=new Map();
/** Move existing sheet rows, preserving their native edit/equip/drag handlers. */
export function enhanceActorContainers(app,html){
    if(game.system.id!=='dark-heresy')return;
    const actor=app.actor??app.document;if(!actor?.items)return;
    const root=html?.querySelector?html:html?.[0]??app.element;
    const list=root?.querySelector('.gear-unified > .items');if(!list||list.dataset.ipfTree)return;
    list.dataset.ipfTree='true';
    const expanded=expandedByActor.get(actor.uuid)??new Set();expandedByActor.set(actor.uuid,expanded);
    const items=[...actor.items].filter(item=>PHYSICAL_TYPES.has(item.type));
    const nodes=new Map([...list.querySelectorAll('.gear-block[data-item-id]')].map(node=>[node.dataset.itemId,node]));
    const bodies=new Map();
    for(const item of items){
        const node=nodes.get(item.id);if(!node||!item.system.inventory?.isContainer)continue;
        const details=document.createElement('details');details.className='ipf-container';details.open=expanded.has(item.id);
        const summary=document.createElement('summary');summary.textContent=game.i18n.localize('ITEMPILEFFG.CONTENTS');
        const body=document.createElement('div');body.className='ipf-container-items';
        details.append(summary,body);node.append(details);bodies.set(item.id,body);
        details.addEventListener('toggle',()=>{if(details.open)expanded.add(item.id);else expanded.delete(item.id);});
    }
    // inventoryRows cuts corrupt cycles. Only reparent into a shallower ancestor.
    const rows=inventoryRows(items,new Set(items.map(item=>item.id)));
    const depths=new Map(rows.map(row=>[row.item.id,row.depth]));
    for(const {item,depth} of rows){const parent=item.system.inventory?.containerId;
        if(depth>0&&depths.get(parent)<depth&&nodes.has(item.id)&&bodies.has(parent))bodies.get(parent).append(nodes.get(item.id));
    }
    for(const heading of list.querySelectorAll(':scope > .gear-group-title')){
        let sibling=heading.nextElementSibling,hasItems=false;
        while(sibling&&!sibling.classList.contains('gear-group-title')){if(sibling.classList.contains('gear-block'))hasItems=true;sibling=sibling.nextElementSibling;}
        heading.hidden=!hasItems;
    }
}
