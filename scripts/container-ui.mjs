import {templateTree,addTemplateContents,updateTemplate,instantiateTemplate,moveWithinActor,transferTree,containerMetrics,projectedTree} from './container-service.mjs';
import {descendants,PHYSICAL_TYPES,movePatch} from './inventory.mjs';
import {inventoryRows} from './inventory-tree.mjs';
const t=key=>game.i18n.localize('ITEMPILEFFG.'+key);
export const report=error=>{const key={'Container cycle':'CYCLE','Container capacity exceeded':'CAPACITY_ERROR','Single container required':'SINGLE_CONTAINER','Physical item required':'UNKNOWN_ITEM'}[error.message]??error.message;const label=t(key);ui.notifications.error(label==='ITEMPILEFFG.'+key?error.message:label);};
const id=item=>item.id??item._id;
export function dragData(event){try{return JSON.parse(event.dataTransfer.getData('text/plain'));}catch{return null;}}
export async function droppedItem(data){if(data?.type!=='Item')return null;return data.uuid?fromUuid(data.uuid):null;}
export async function receiveActorDrop(actor,item,containerId=''){
 if(item.parent?.uuid===actor.uuid)return moveWithinActor(actor,item.id,containerId);
 if(item.parent?.documentName==='Actor'){
  return transferTree(item,actor,containerId);
 }
 return instantiateTemplate(item,actor,containerId);
}
export function bindSheetDrop(root,app,actor){
 root.addEventListener('drop',event=>{
  if(event.target.closest('[data-ipf-drop]'))return;
  const data=dragData(event);if(data?.type!=='Item')return;
  event.preventDefault();event.stopImmediatePropagation();clearHighlights();
  void droppedItem(data).then(item=>{
   if(!item)return;
   if(!PHYSICAL_TYPES.has(item.type)||item.parent?.uuid===actor.uuid)return app._onDropItem(event,data);
   return receiveActorDrop(actor,item);
  }).catch(report);
 },true);
}
export function clearHighlights(root=document){for(const el of root.querySelectorAll('.ipf-drop-valid,.ipf-drop-invalid'))el.classList.remove('ipf-drop-valid','ipf-drop-invalid');}
let activeDrag=null;
export function registerDragTracking(){
 document.addEventListener('dragstart',event=>{activeDrag=null;const data=dragData(event);if(data?.type==='Item')void droppedItem(data).then(item=>{activeDrag=item;}).catch(()=>{});});
 for(const name of ['dragend','drop'])document.addEventListener(name,()=>{activeDrag=null;clearHighlights();});
}
/** Capture the native drop only on our explicit inventory targets. */
export function bindActorDropZone(zone,actor,containerId='',app=null){
 zone.dataset.ipfDrop=containerId||'root';
 const over=event=>{
  if(event.target.closest('[data-ipf-drop]')!==zone)return;
  event.preventDefault();event.stopPropagation();clearHighlights(zone.closest('.gear-unified')??zone);
  let valid=actor.isOwner;
  try{if(activeDrag){if(activeDrag.parent?.uuid===actor.uuid)movePatch([...actor.items],activeDrag.id,containerId);else if(activeDrag.parent?.documentName==='Actor'){if(!activeDrag.parent.isOwner)valid=false;}else projectedTree(actor,templateTree(activeDrag),containerId);}}catch{valid=false;}
  zone.classList.add(valid?'ipf-drop-valid':'ipf-drop-invalid');event.dataTransfer.dropEffect=valid?'move':'none';
 };
 zone.addEventListener('dragover',over,true);zone.addEventListener('dragenter',over,true);
 zone.addEventListener('dragleave',event=>{if(!zone.contains(event.relatedTarget))clearHighlights(zone);});
 zone.addEventListener('drop',event=>{
  if(event.target.closest('[data-ipf-drop]')!==zone)return;
  const data=dragData(event);if(data?.type!=='Item')return;
  event.preventDefault();event.stopImmediatePropagation();clearHighlights();
  void droppedItem(data).then(item=>{if(!item)return;if(!PHYSICAL_TYPES.has(item.type))return app?._onDropItem(event,data);return receiveActorDrop(actor,item,containerId);}).catch(report);
 },true);
}
export async function movementDialog(actor,item){
 const options=[{id:'',name:t('ROOT')},...[...actor.items].filter(i=>i.system.inventory?.isContainer&&i.id!==item.id).map(i=>({id:i.id,name:i.name}))];
 const esc=foundry.utils.escapeHTML;
 return foundry.applications.api.DialogV2.prompt({window:{title:t('MOVE_TO')},content:`<label>${esc(item.name)}<select name="container">${options.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select></label>`,ok:{label:t('SAVE'),callback:(_e,b)=>moveWithinActor(actor,item.id,b.form.elements.container.value)}});
}
export function enhanceContainerSheet(app,root,item){
 if(!PHYSICAL_TYPES.has(item.type)||root.querySelector('.ipf-container-editor'))return;
 const owned=item.isOwner&&app.isEditable!==false&&!(item.pack&&game.packs.get(item.pack)?.locked);
 const section=document.createElement('section');section.className='ipf-container-editor';
 const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!!item.system.inventory?.isContainer;toggle.disabled=!owned;label.append(toggle,document.createTextNode(t('CONTAINER')));section.append(label);
 const capLabel=document.createElement('label'),cap=document.createElement('input');cap.type='number';cap.min='0';cap.step='0.1';cap.value=item.system.inventory?.capacity??0;cap.disabled=!owned;capLabel.append(document.createTextNode(t('CAPACITY')),cap);section.append(capLabel);
 async function configure(){
  if(!owned)throw new Error('NO_PERMISSION');
  const capacity=Number(cap.value);if(!Number.isFinite(capacity)||capacity<0)throw new Error('CAPACITY_ERROR');
  if(item.parent?.documentName==='Actor')return game.itempileffg.configureItem({actorUuid:item.parent.uuid,itemId:item.id,quantity:item.system.quantity,price:item.system.price,isContainer:toggle.checked,capacity});
  const tree=templateTree(item);
  if(!toggle.checked&&tree.length>1)throw new Error('CAPACITY_ERROR');
  if(toggle.checked&&Number(item.system.quantity??1)!==1)throw new Error('Single container required');
  if(capacity>0&&containerMetrics(tree,tree[0]).contents>capacity)throw new Error('Container capacity exceeded');
  return item.update({'system.inventory.isContainer':toggle.checked,'system.inventory.capacity':capacity,'system.inventory.containerKey':item.system.inventory?.containerKey||item.id});
 }
 for(const control of [toggle,cap])control.addEventListener('change',event=>{event.stopPropagation();void configure().catch(error=>{toggle.checked=!!item.system.inventory?.isContainer;cap.value=item.system.inventory?.capacity??0;report(error);});});
 if(item.system.inventory?.isContainer){
  const heading=document.createElement('h3');heading.textContent=t('CONTENTS');section.append(heading);
  const ownedActor=item.parent?.documentName==='Actor'?item.parent:null;
  let tree;
  try{tree=ownedActor?[item,...descendants([...ownedActor.items],item.id)]:templateTree(item);}catch(error){report(error);tree=[item];}
  const summary=document.createElement('p');try{const m=containerMetrics(tree,item);summary.textContent=`${t('OWN_WEIGHT')}: ${m.own.toFixed(2)} · ${t('CONTENTS')}: ${m.contents.toFixed(2)} / ${m.capacity||'∞'} · ${t('TOTAL_WEIGHT')}: ${m.total.toFixed(2)} kg`;}catch{summary.textContent=t('INVALID_KIT');}section.append(summary);
  const contents=document.createElement('div');contents.className='ipf-template-contents';contents.textContent=t('DROP_CONTENTS');section.append(contents);
  if(ownedActor)bindActorDropZone(contents,ownedActor,item.id);
  const bindTemplateDrop=(zone,targetId)=>{
   zone.dataset.ipfTemplateTarget=targetId;
   const over=e=>{if(e.target.closest('[data-ipf-template-target]')!==zone)return;e.preventDefault();e.stopPropagation();clearHighlights(contents);zone.classList.add(owned?'ipf-drop-valid':'ipf-drop-invalid');};
   zone.addEventListener('dragover',over,true);zone.addEventListener('dragenter',over,true);
   zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))clearHighlights(zone);});
   zone.addEventListener('drop',e=>{if(e.target.closest('[data-ipf-template-target]')!==zone)return;const data=dragData(e);if(data?.type!=='Item')return;e.preventDefault();e.stopImmediatePropagation();clearHighlights();if(!owned){report(new Error('NO_PERMISSION'));return;}void droppedItem(data).then(incoming=>{if(incoming)return addTemplateContents(item,incoming,targetId);}).catch(report);},true);
  };
  if(!ownedActor)bindTemplateDrop(contents,item.id);
  for(const {item:child,depth} of inventoryRows(tree,new Set(tree.map(id)))){
   if(id(child)===item.id)continue;
   const row=document.createElement('div');row.className='ipf-template-row';row.style.paddingLeft=`${Math.min(depth,16)*12}px`;
   const name=document.createElement('span');name.textContent=child.name;row.append(name);
   const qty=document.createElement('input');qty.type='number';qty.min='0';qty.step='1';qty.value=child.system.quantity??1;qty.disabled=!owned||!!ownedActor;
   qty.setAttribute('aria-label',t('QUANTITY')+': '+child.name);
   qty.addEventListener('change',e=>{e.stopPropagation();const value=Number(qty.value);if(!Number.isSafeInteger(value)||value<0){report(new Error('INVALID_QUANTITY'));return;}void updateTemplate(item,items=>{items.find(i=>id(i)===id(child)).system.quantity=value;}).catch(report);});row.append(qty);
   const remove=document.createElement('button');remove.type='button';remove.textContent=ownedActor?t('EXTRACT'):t('REMOVE_CONTENT');remove.disabled=!owned;
   remove.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void(ownedActor?moveWithinActor(ownedActor,id(child),''):updateTemplate(item,items=>{const removed=new Set([id(child),...descendants(items,id(child)).map(id)]);for(let i=items.length-1;i>0;i--)if(removed.has(id(items[i])))items.splice(i,1);})).catch(report);});row.append(remove);contents.append(row);
   if(child.system.inventory?.isContainer){if(ownedActor)bindActorDropZone(row,ownedActor,id(child));else bindTemplateDrop(row,id(child));}
  }
 }
 (root.querySelector('.sheet-body')??root.querySelector('form')??root).append(section);
}
