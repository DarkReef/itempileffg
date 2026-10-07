import {PHYSICAL_TYPES,descendants,movePatch,contentsMass,remapContainers,itemMass} from './inventory.mjs';
import {snapshotBundle,instantiateBundle,validateBundle} from './bundles.mjs';
export {descendants as getDescendants,movePatch as validateMove,contentsMass,remapContainers as remapTree};
export {snapshotBundle,instantiateBundle};
const queues=new Map();
const id=item=>item.id??item._id;
const source=item=>structuredClone(item.toObject?item.toObject():item);
export function requireOwner(document){if(!document?.isOwner)throw new Error('NO_PERMISSION');}
export function inventoryLock(key,operation){
 const next=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(operation);
 queues.set(key,next);next.finally(()=>{if(queues.get(key)===next)queues.delete(key);}).catch(()=>{});return next;
}
export async function moveWithinActor(actor,itemId,containerId=''){
 requireOwner(actor);return inventoryLock(actor.uuid,async()=>{
  requireOwner(actor);const patch=movePatch([...actor.items],itemId,containerId);
  await actor.updateEmbeddedDocuments('Item',[patch]);return patch;
 });
}
export const detachToRoot=(actor,itemId)=>moveWithinActor(actor,itemId,'');
/** Current root source is authoritative; contents are a versioned, detached snapshot. */
export function templateTree(item){
 const root=source(item);root._id=id(item)||'templateRoot';delete root.id;
 root.system??={};root.system.inventory={...root.system.inventory,containerId:'',parentKey:''};
 const flags=root.flags?.itempileffg;
 const saved=flags?.containerTemplate??flags?.kit;
 if(saved&&saved.version!==1)throw new Error('Unsupported container template version');
 let children=[];
 if(saved){
  if(!Array.isArray(saved.items)||!saved.items.length)throw new Error('Invalid kit');
  const oldRoot=id(saved.items[0]);
  children=structuredClone(saved.items.slice(1));
  for(const child of children)if(child.system?.inventory?.containerId===oldRoot){child.system.inventory.containerId=root._id;child.system.inventory.parentKey=root._id;}
 }
 if(flags){delete flags.containerTemplate;delete flags.kit;}
 const tree=[root,...children];validateBundle(tree);return tree;
}
export function serializeTemplate(items,rootId){return {version:1,items:snapshotBundle(items,rootId)};}
export function projectedTree(actor,tree,containerId='',randomID=()=>foundry.utils.randomID()){
 const data=instantiateBundle(tree,randomID,[...actor.items].map(id));
 const patch=movePatch([...actor.items,...data],data[0]._id,containerId);
 data[0].system.inventory.containerId=patch['system.inventory.containerId'];
 data[0].system.inventory.parentKey=patch['system.inventory.parentKey'];
 if(containerId)data[0].system.equipped=false;
 return data;
}
/** Validate the complete projection before one embedded creation batch. */
export async function instantiateTemplate(item,actor,containerId=''){
 requireOwner(actor);
 if(item.testUserPermission&&!item.testUserPermission(game.user,'OBSERVER'))throw new Error('NO_PERMISSION');
 return inventoryLock(actor.uuid,async()=>{
  requireOwner(actor);const data=projectedTree(actor,templateTree(item),containerId);
  try{
   const created=await actor.createEmbeddedDocuments('Item',data,{keepId:true});
   if(created.length!==data.length)throw new Error('Incomplete container creation');
   return created;
  }catch(error){
   const existing=data.filter(d=>actor.items.get(d._id)).map(d=>d._id);
   if(existing.length)await actor.deleteEmbeddedDocuments('Item',existing);
   throw error;
  }
 });
}
export async function updateTemplate(item,edit){
 requireOwner(item);if(item.pack&&game.packs.get(item.pack)?.locked)throw new Error('NO_PERMISSION');
 return inventoryLock(item.uuid,async()=>{
  const tree=templateTree(item);await edit(tree);validateBundle(tree);
  return item.update({'flags.itempileffg.containerTemplate':serializeTemplate(tree,id(tree[0]))});
 });
}
export async function addTemplateContents(item,incoming,targetId){
 if(!PHYSICAL_TYPES.has(incoming.type))throw new Error('Physical item required');
 if(item.uuid===incoming.uuid)throw new Error('Container cycle');
 if(incoming.testUserPermission&&!incoming.testUserPermission(game.user,'OBSERVER'))throw new Error('NO_PERMISSION');
 return updateTemplate(item,tree=>{
  const incomingTree=incoming.parent?.documentName==='Actor'&&incoming.system.inventory?.isContainer
   ?snapshotBundle([...incoming.parent.items],incoming.id):templateTree(incoming);
  const copies=instantiateBundle(incomingTree,()=>foundry.utils.randomID(),tree.map(id));
  const parentId=targetId||id(tree[0]);
  const patch=movePatch([...tree,...copies],id(copies[0]),parentId);
  copies[0].system.inventory.containerId=parentId;copies[0].system.inventory.parentKey=patch['system.inventory.parentKey'];
  copies[0].system.equipped=false;tree.push(...copies);
 });
}
export async function transferTree(item,target,containerId=''){
 requireOwner(item.parent);requireOwner(target);
 if(!game.itempiles?.API?.transferItems)throw new Error('INSTALL_ITEM_PILES');
 if(!containerId)return game.itempiles.API.transferItems(item.parent,target,[item.id]);
 projectedTree(target,item.system.inventory?.isContainer?snapshotBundle([...item.parent.items],item.id):templateTree(item),containerId);
 const result=await game.itempiles.API.transferItems(item.parent,target,[{_id:item.id,flags:{'item-piles':{item:{canStack:'no'}}}}],{interactionId:'ipf-container:'+JSON.stringify({target:target.uuid,containerId})});
 if(result===false)throw new Error('Container transfer rejected');return result;
}
/** Runs on the Item Piles transaction authority before either Actor is written. */
export function prepareTargetContainer(_source,_sourceUpdates,target,updates,interactionId){
 if(typeof interactionId!=='string'||!interactionId.startsWith('ipf-container:'))return;
 const request=JSON.parse(interactionId.slice('ipf-container:'.length));
 if(request.target!==target.uuid||!request.containerId)throw new Error('Invalid container transfer');
 const rows=updates.itemsToCreate??[],roots=rows.filter(i=>!i.system?.inventory?.containerId);
 if(roots.length!==1||(updates.itemsToUpdate??[]).length)throw new Error('Container transfer cannot merge stacks');
 const root=roots[0],patch=movePatch([...target.items,...rows],id(root),request.containerId);
 for(const data of [root,...(updates.itemDeltas??[]).filter(d=>id(d.item)===id(root)).map(d=>d.item)]){
  data.system.inventory.containerId=request.containerId;data.system.inventory.parentKey=patch['system.inventory.parentKey'];data.system.equipped=false;
 }
 return true;
}
export function containerMetrics(items,item){
 const own=itemMass(item),contents=contentsMass(items,id(item));
 return {own,contents,total:own+contents,capacity:Number(item.system.inventory?.capacity)||0};
}
