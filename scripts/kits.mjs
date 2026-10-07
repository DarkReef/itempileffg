// Compatibility API for 0.1.x macros. Templates are ordinary container Items.
import {serializeTemplate,instantiateTemplate,requireOwner} from './container-service.mjs';
const grants=new Map();
const t=key=>game.i18n.localize('ITEMPILEFFG.'+key);
function gm(){if(!game.user.isGM)throw new Error(t('GM_ONLY'));}
export function selectedRecipient(){const tokens=globalThis.canvas?.tokens?.controlled??[];if(tokens.length>1)throw new Error(t('ONE_RECIPIENT'));const actor=tokens[0]?.actor??game.user.character;if(!actor?.isOwner)throw new Error(t('SELECT_RECIPIENT'));return actor;}
export async function saveContainerKit(actor,itemId){
 gm();requireOwner(actor);const tree=serializeTemplate([...actor.items],itemId);const data=structuredClone(tree.items[0]);delete data._id;
 data.flags??={};data.flags.itempileffg??={};data.flags.itempileffg.containerTemplate=tree;return Item.create(data);
}
export async function grantKit(item,actor=selectedRecipient()){
 gm();requireOwner(actor);const key=actor.uuid+':'+item.uuid;if(grants.has(key))return grants.get(key);
 const operation=instantiateTemplate(item,actor);grants.set(key,operation);
 try{return await operation;}finally{grants.delete(key);}
}
