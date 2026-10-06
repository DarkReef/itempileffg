import {PHYSICAL_TYPES} from './inventory.mjs';
import {snapshotBundle,instantiateBundle,validateBundle,KIT_SCOPE} from './bundles.mjs';
const t=key=>game.i18n.localize(`ITEMPILEFFG.${key}`);
const esc=value=>foundry.utils.escapeHTML(String(value??''));
const grants=new Map();
const errorText=error=>{const key={'Invalid kit':'INVALID_KIT','Single container required':'SINGLE_CONTAINER','Container cycle':'CYCLE','Container capacity exceeded':'CAPACITY_ERROR','Physical item required':'UNKNOWN_ITEM'}[error.message];return key?t(key):error.message;};
function gm(){if(!game.user.isGM)throw new Error(t('GM_ONLY'));}
export function selectedRecipient(){
    const tokens=globalThis.canvas?.tokens?.controlled??[];
    if(tokens.length>1)throw new Error(t('ONE_RECIPIENT'));
    const actor=tokens[0]?.actor??game.user.character;
    if(!actor||(!actor.isOwner&&!game.user.isGM))throw new Error(t('SELECT_RECIPIENT'));
    return actor;
}
async function storeKit(items,name){
    gm();validateBundle(items);
    const root=structuredClone(items[0]);delete root._id;
    root.name=name?.trim()||root.name;root.flags??={};root.flags[KIT_SCOPE]??={};
    root.flags[KIT_SCOPE].kit={version:1,items};
    return Item.create(root);
}
export async function saveContainerKit(actor,itemId){
    gm();if(!actor?.isOwner)throw new Error(t('NO_PERMISSION'));
    return storeKit(snapshotBundle([...actor.items],itemId));
}
export async function grantKit(kit,actor=selectedRecipient()){
    gm();if(!actor?.isOwner)throw new Error(t('NO_PERMISSION'));
    const bundle=kit?.getFlag?.(KIT_SCOPE,'kit');
    if(bundle?.version!==1)throw new Error(t('INVALID_KIT'));
    const key=actor.uuid+':'+kit.uuid;if(grants.has(key))return grants.get(key);
    const operation=(async()=>{
        const data=instantiateBundle(bundle.items,()=>foundry.utils.randomID(),[...actor.items].map(item=>item.id));
        // The saved item's name, image and price remain editable in its normal sheet.
        data[0].name=kit.name;data[0].img=kit.img;data[0].system.price=kit.system.price??data[0].system.price;
        return actor.createEmbeddedDocuments('Item',data,{keepId:true});
    })();
    grants.set(key,operation);
    try{return await operation;}finally{grants.delete(key);}
}
export async function createKitDialog(){
    gm();
    const items=[...game.items].filter(item=>PHYSICAL_TYPES.has(item.type)&&!item.getFlag(KIT_SCOPE,'kit'));
    return foundry.applications.api.DialogV2.prompt({window:{title:t('NEW_KIT')},content:`<div class="dh-party-form">
        <label>${esc(t('KIT_NAME'))}<input name="kitName" value="${esc(t('NEW_KIT'))}" required></label>
        <p>${esc(t('KIT_BUILD_HINT'))}</p><div class="ipf-kit-picker">${items.map(item=>`<label>${esc(item.name)}<input name="qty_${esc(item.id)}" type="number" min="0" step="1" value="0"></label>`).join('')}</div></div>`,
        ok:{label:t('SAVE'),callback:async(_event,button)=>{
            gm();const form=button.form;const rootId=foundry.utils.randomID();
            const bundle=[{_id:rootId,name:form.elements.kitName.value.trim()||t('NEW_KIT'),type:'gear',img:'icons/containers/bags/pack-leather-brown.webp',system:{weight:0,quantity:1,price:0,inventory:{isContainer:true,capacity:0,containerId:'',containerKey:rootId,parentKey:''}}}];
            for(const item of items){const quantity=Number(form.elements[`qty_${item.id}`].value);if(!Number.isInteger(quantity)||quantity<0)throw new Error(t('INVALID_QUANTITY'));if(!quantity)continue;
                const data=item.toObject();data._id=foundry.utils.randomID();delete data.id;delete data.folder;delete data.ownership;delete data._stats;
                data.system.quantity=quantity;data.system.inventory={...data.system.inventory,containerId:rootId,parentKey:rootId,containerKey:data.system.inventory?.isContainer?data._id:''};
                bundle.push(data);bundle[0].system.price+=(Number(data.system.price)||0)*quantity;
            }
            if(bundle.length===1)throw new Error(t('EMPTY_KIT'));
            return storeKit(bundle);
        }}});
}
/** Suppress Foundry's root-only copy; transfer an actual bag through Item Piles. */
export function handleBundleDrop(actor,_sheet,data){
    if(game.system.id!=='dark-heresy'||data.type!=='Item'||!data.uuid)return;
    const item=fromUuidSync(data.uuid);if(!item)return;
    const kit=item.getFlag?.(KIT_SCOPE,'kit'),source=item.parent;
    if(!kit&&(!item.system?.inventory?.isContainer||source?.documentName!=='Actor'))return;
    if(source?.uuid===actor.uuid)return;
    void (async()=>{
        if(kit)return grantKit(item,actor);
        if(!source.isOwner||!actor.isOwner)throw new Error(t('NO_PERMISSION'));
        if(!game.itempiles?.API?.transferItems)throw new Error(t('INSTALL_ITEM_PILES'));
        return game.itempiles.API.transferItems(source,actor,[item.id]);
    })().catch(error=>ui.notifications.error(errorText(error)));
    return false;
}
export function enhanceKitDirectory(app,html){
    if(game.system.id!=='dark-heresy')return;
    const root=html?.querySelector?html:html?.[0]??app.element;
    if(!root)return;
    root.querySelector('.ipf-kits')?.remove();
    if(!game.user.isGM)return;
    const section=document.createElement('section');section.className='ipf-kits';
    const kits=[...game.items].filter(item=>item.getFlag(KIT_SCOPE,'kit')?.version===1 && Array.isArray(item.getFlag(KIT_SCOPE,'kit').items));
    section.innerHTML=`<h3>${esc(t('KITS'))}</h3><button type="button" data-kit-action="create">${esc(t('NEW_KIT'))}</button><p>${esc(t('KIT_TARGET_HINT'))}</p>${kits.map(kit=>`<details><summary>${esc(kit.name)}</summary><ul>${kit.getFlag(KIT_SCOPE,'kit').items.slice(1).map(item=>`<li>${esc(item.name)} ×${Number(item.system?.quantity??1)}</li>`).join('')}</ul><button type="button" data-kit-action="grant" data-kit-id="${esc(kit.id)}">${esc(t('GRANT_KIT'))}</button></details>`).join('')}`;
    section.addEventListener('click',async event=>{
        const button=event.target.closest('button[data-kit-action]');if(!button)return;
        event.preventDefault();event.stopPropagation();button.disabled=true;
        try{if(button.dataset.kitAction==='create')await createKitDialog();else await grantKit(game.items.get(button.dataset.kitId));}
        catch(error){ui.notifications.error(errorText(error));}finally{button.disabled=false;}
    });
    (root.querySelector('.directory-header')??root).prepend(section);
}
