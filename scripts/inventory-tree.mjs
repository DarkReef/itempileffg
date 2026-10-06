/** Flat traversal retains hidden descendants so closed bags never leak to the root. */
export function inventoryRows(items, expanded = new Set()) {
    const byId = new Map(items.map(item => [item.id ?? item._id,item]));
    const children = new Map();
    for (const item of items) {
        const parent = item.system?.inventory?.containerId;
        const key = byId.get(parent)?.system?.inventory?.isContainer ? parent : '';
        if (!children.has(key)) children.set(key,[]);
        children.get(key).push(item);
    }
    const rows=[],seen=new Set();
    function walk(item,depth,hidden) {
        const id=item.id??item._id;if(seen.has(id))return;seen.add(id);
        rows.push({item,depth,hidden});
        for(const child of children.get(id)??[])walk(child,depth+1,hidden||!expanded.has(id));
    }
    for(const item of children.get('')??[])walk(item,0,false);
    // Corrupt cycles stay visible for repair and cannot recurse indefinitely.
    for(const item of items)if(!seen.has(item.id??item._id))walk(item,0,false);
    return rows;
}
