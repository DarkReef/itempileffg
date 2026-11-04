// Transfer bookkeeping exists only on the destination's pending Item data. It
// is removed before creation, never written to the source Actor or world kit.
export const AMMO_SOURCE_FLAG = 'ammoTransferSource';
const id = item => item.id ?? item._id;
const weapons = new Set(['weapon', 'vehicleWeapon']);

/** Only explicit source IDs/UUIDs are accepted. Never match an arbitrary UUID
 * by suffix or an ammunition item by name: another Actor may share both. */
export function ammunitionReferenceMap(items, mapping) {
    const references = new Map();
    for (const item of items) {
        if (item.type !== 'ammunition') continue;
        const destination = mapping.get(id(item));
        if (!destination) continue;
        references.set(id(item), destination);
        if (typeof item.uuid === 'string' && item.uuid) references.set(item.uuid, destination);
    }
    return references;
}

/** Mutate a copied Item's links only; its already-loaded rounds retain their
 * recorded profile even if the reserve ammunition is outside this transfer. */
export function remapAmmunitionLinks(item, references, targetUuid = '') {
    if (!weapons.has(item.type) || !item.system) return item;
    if (Object.hasOwn(item.system, 'ammo')) item.system.ammo = references.get(item.system.ammo) ?? '';
    const loaded = item.system.loadedAmmo;
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
        const destination = references.get(loaded.itemId) ?? references.get(loaded.uuid) ?? null;
        loaded.itemId = destination;
        loaded.uuid = destination && targetUuid ? `${targetUuid}.Item.${destination}` : null;
    }
    return item;
}

/** Item Piles assigns new IDs before its containerTransformer, including to
 * children which are absent from the map's root keys. Preserve their old ID
 * on the incoming copy so that sibling weapon links can be restored later. */
export function rememberAmmunitionSource(item) {
    if (item.type !== 'ammunition' || !id(item)) return item;
    item.flags ??= {};
    item.flags.itempileffg ??= {};
    item.flags.itempileffg[AMMO_SOURCE_FLAG] = id(item);
    return item;
}

export function remapTransferredAmmunition({actor, map}, items) {
    const references = new Map();
    for (const [oldId, entry] of Object.entries(map)) {
        if (entry.item.type === 'ammunition') references.set(oldId, id(entry.item));
    }
    for (const item of items) {
        const oldId = item.flags?.itempileffg?.[AMMO_SOURCE_FLAG];
        if (item.type === 'ammunition' && oldId) references.set(oldId, id(item));
    }
    for (const item of items) {
        remapAmmunitionLinks(item, references, actor?.uuid);
        if (item.flags?.itempileffg) delete item.flags.itempileffg[AMMO_SOURCE_FLAG];
    }
}
