import {inventoryRows} from './inventory-tree.mjs';
import {PHYSICAL_TYPES} from './inventory.mjs';
import {containerMetrics} from './container-service.mjs';
import {bindActorDropZone,bindSheetDrop,movementDialog,requestMove,report} from './container-ui.mjs';
const expandedByActor=new Map();
const t=key=>game.i18n.localize('ITEMPILEFFG.'+key);
/** Decorate native rows, preserving edit/chat/delete and native drag payloads. */
export function enhanceActorContainers(app,html){
 if(game.system.id!=='dark-heresy')return;
 const actor=app.actor??app.document;if(!actor?.items)return;
 const root=html?.querySelector?html:html?.[0]??app.element;
 const list=root?.querySelector('.gear-unified > .items');if(!list||list.dataset.ipfTree)return;
 list.dataset.ipfTree='true';
 bindSheetDrop(root,app,actor);
 const expanded=expandedByActor.get(actor.uuid)??new Set();expandedByActor.set(actor.uuid,expanded);
 const items=[...actor.items].filter(item=>PHYSICAL_TYPES.has(item.type));
 const nodes=new Map([...list.querySelectorAll('.gear-block[data-item-id]')].map(node=>[node.dataset.itemId,node]));
 const bodies=new Map();
 const rootZone=document.createElement('div');rootZone.className='ipf-root-drop';rootZone.textContent=t('DROP_ROOT');list.prepend(rootZone);bindActorDropZone(rootZone,actor,'',app);
 for(const item of items){
  const node=nodes.get(item.id);if(!node)continue;
  const row=node.querySelector(':scope > .gear.item');if(!row)continue;
  const controls=row.querySelector('.button');
  const action=(text,title,callback)=>{const button=document.createElement('button');button.type='button';button.className='ipf-row-action';button.textContent=text;button.title=t(title);button.disabled=!actor.isOwner;button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void callback().catch(report);});controls?.append(button);};
  action('↳','MOVE_TO',()=>movementDialog(actor,item));
  if(item.system.inventory?.containerId)action('↥','EXTRACT',()=>requestMove(actor,item,''));
  action('⚙','CONTAINER_SETTINGS',async()=>item.sheet.render(true));
  const name=row.querySelector('.name');
  if(name){const count=document.createElement('span');count.className='ipf-quantity';count.textContent=` ×${Number(item.system.quantity??1)}`;name.append(count);}
  if(!item.system.inventory?.isContainer)continue;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='ipf-chevron';toggle.setAttribute('aria-label',t('CONTENTS')+': '+item.name);(name??row.querySelector('.marker')).prepend(toggle);
  const body=document.createElement('div');body.className='ipf-container-items';node.append(body);bodies.set(item.id,body);
  const refresh=()=>{const open=expanded.has(item.id);body.hidden=!open;toggle.textContent=open?'▾':'▸';toggle.setAttribute('aria-expanded',String(open));};refresh();
  toggle.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(expanded.has(item.id))expanded.delete(item.id);else expanded.add(item.id);refresh();});
  const weight=row.querySelector('.weight');try{const m=containerMetrics(items,item);if(weight){weight.textContent=`${m.contents.toFixed(2)} / ${m.capacity||'∞'} kg`;weight.title=`${t('OWN_WEIGHT')}: ${m.own.toFixed(2)} kg · ${t('CONTENTS')}: ${m.contents.toFixed(2)} kg · ${t('TOTAL_WEIGHT')}: ${m.total.toFixed(2)} kg`;}}catch{if(weight)weight.title=t('CYCLE');}
  bindActorDropZone(node,actor,item.id,app);
 }
 const rows=inventoryRows(items,new Set(items.map(item=>item.id))),depths=new Map(rows.map(r=>[r.item.id,r.depth]));
 for(const {item,depth} of rows){nodes.get(item.id)?.style.setProperty('--ipf-depth',String(Math.min(depth,6)));const parent=item.system.inventory?.containerId;if(depth>0&&depths.get(parent)<depth&&nodes.has(item.id)&&bodies.has(parent))bodies.get(parent).append(nodes.get(item.id));}
 for(const heading of list.querySelectorAll(':scope > .gear-group-title')){
  let sibling=heading.nextElementSibling,hasItems=false;while(sibling&&!sibling.classList.contains('gear-group-title')){if(sibling.classList.contains('gear-block'))hasItems=true;sibling=sibling.nextElementSibling;}heading.hidden=!hasItems;
 }
}
