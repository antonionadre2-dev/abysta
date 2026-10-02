export type VisitPage<T> = { records:T[];total:number;snapshot_token:string };

// Offset pages are accepted only while the monotonic DB token remains equal.
// A visit edit changes sum(row_version); appends also change count. History is
// append-only. Bounded restart avoids missing/duplicating rows during edits.
export async function collectVisitPages<T extends {id:string}>(fetchPage:(offset:number)=>Promise<VisitPage<T>>):Promise<T[]> {
  for(let attempt=0;attempt<3;attempt++) {
    const rows:T[]=[]; const ids=new Set<string>();
    let token:string|undefined; let total:number|undefined; let changed=false;
    for(let offset=0;;) {
      const page=await fetchPage(offset);
      if (!page || !Array.isArray(page.records) || !Number.isSafeInteger(page.total) || page.total<0 || typeof page.snapshot_token!=="string" || !page.snapshot_token) throw new Error("Your site visits could not be loaded. Please try again.");
      if (token!==undefined && (token!==page.snapshot_token || total!==page.total)) {changed=true;break;}
      token=page.snapshot_token;total=page.total;
      for(const record of page.records) {
        if (!record || typeof record.id!=="string" || ids.has(record.id)) {changed=true;break;}
        ids.add(record.id);rows.push(record);
      }
      if (changed) break;
      offset+=page.records.length;
      if (offset===total) return rows;
      if (!page.records.length || offset>total) {changed=true;break;}
    }
  }
  throw new Error("These visits changed while loading. Please refresh to get a consistent list.");
}
