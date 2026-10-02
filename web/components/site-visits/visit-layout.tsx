"use client";

import { ChevronDown, Copy, Layers3, Plus, Ruler, Trash2 } from "lucide-react";
import {
  emptyMeasurement, emptyZone, measurementSources, reconcileLayout, summarizeLayout, zoneKinds,
  type Floor, type Measurement, type SiteInventory, type VisitLayout, type Zone,
} from "@/lib/site-visits/layout";
import { visitInput, visitPanel, visitSecondary } from "./visit-ui";

const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const format = (value: number) => numberFormat.format(value);
const scopes = { included: "Included", excluded: "Excluded", undecided: "To confirm" };
const states: Record<Measurement["state"], string> = {
  unanswered: "Not recorded", answered: "Value recorded", unknown: "Unknown", not_applicable: "Not applicable",
};
type Errors = Record<string, string> | undefined;
type ZoneText = "name" | "reference" | "material" | "occupancy" | "obstacles" | "access" | "exclusion_reason" | "notes" | "fixture_type";
const measurementFields = [
  { key: "floor_area", label: "Floor area", unit: "m²" },
  { key: "glass_area", label: "Glass area", unit: "m²" },
  { key: "edge_length", label: "Edge length", unit: "m" },
  { key: "fixture_count", label: "Fixture count", unit: "items" },
] as const;

function focusAfterRender(id: string) {
  requestAnimationFrame(() => {
    const field = document.getElementById(id);
    let parent = field?.parentElement;
    while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
    field?.focus();
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}
function measurementText(value: Measurement, unit: string) {
  if (value.state !== "answered") return states[value.state];
  if (value.value === null) return "Value required";
  if (!Number.isFinite(value.value) || value.value < 0 || value.value > 10000000 || (unit === "items" ? !Number.isInteger(value.value) : Number(value.value.toFixed(2)) !== value.value)) return "Check value";
  return `${format(value.value)} ${unit}${value.source ? "" : " · source needed"}`;
}
function scopeClass(scope: Zone["service_scope"]) {
  return scope === "included" ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : scope === "excluded" ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
}

export function LayoutSummary({ layout }: { layout: VisitLayout }) {
  const totals = summarizeLayout(layout);
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <SummaryMetric label="Known floor area" value={`${format(totals.knownFloorArea)} m²`} note={`${totals.estimatedFloorZones} zone(s) use estimates`} />
      <SummaryMetric label="Floor area to confirm" value={String(totals.pendingFloorZones)} note={`zone(s) · ${totals.naFloorZones} marked not applicable`} amber={totals.pendingFloorZones > 0} />
      <SummaryMetric label="Recorded structure" value={`${totals.floorCount} floors · ${totals.zoneCount} zones`} note={`${totals.emptyFloorCount} floor(s) without zones`} />
    </div>
    <div className="grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-900">
      <div><p className="font-semibold text-slate-500">Known floor area by service scope</p><p className="mt-2 leading-6">Included <strong>{format(totals.includedFloorArea)} m²</strong> · Excluded <strong>{format(totals.excludedFloorArea)} m²</strong> · To confirm <strong>{format(totals.undecidedFloorArea)} m²</strong></p><p className="mt-1 text-slate-500">Scope still to confirm for {totals.pendingScopeZones} zone(s).</p></div>
      <div><p className="font-semibold text-slate-500">Other known surface totals</p><p className="mt-2 leading-6">Known glass <strong>{format(totals.glassArea)} m²</strong> · Known edges <strong>{format(totals.edgeLength)} m</strong></p><p className="mt-1 leading-5 text-slate-500">Separate totals. Glass and reference area are never added to floor area. Fixture counts stay with each zone.</p></div>
    </div>
    <p className="text-xs leading-5 text-slate-500">Totals cover recorded zones only. A zero total can mean no areas have been recorded. Missing measurements and zones marked not applicable are excluded; this does not confirm that every part of the building has been surveyed.</p>
  </div>;
}
function SummaryMetric({ label, value, note, amber = false }: { label: string; value: string; note: string; amber?: boolean }) {
  return <div className={`min-w-0 rounded-xl border p-4 ${amber ? "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"}`}><p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 break-words text-xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{note}</p></div>;
}

export function LayoutEditor({ layout, inventory, onChange, errors, imported }: { layout: VisitLayout; inventory: SiteInventory; onChange: (layout: VisitLayout) => void; errors?: Errors; imported: boolean }) {
  function updateZone(id: string, changes: Partial<Zone>) { onChange({ ...layout, zones: layout.zones.map(zone => zone.id === id ? { ...zone, ...changes } : zone) }); }
  function updateFloor(id: string, changes: Partial<Floor>) { onChange({ ...layout, floors: layout.floors.map(floor => floor.id === id ? { ...floor, ...changes } : floor) }); }
  function addFloor() {
    if (layout.floors.length >= 50) return;
    const id = crypto.randomUUID();
    onChange({ ...layout, floors: [...layout.floors, { id, name: "New floor", reference: "", level: "" }] });
    focusAfterRender(`layout.floors.${id}.name`);
  }
  function addZone(floorId: string, original?: Zone) {
    if (layout.zones.length >= 300) return;
    const id = crypto.randomUUID();
    const zone = emptyZone(id, floorId, original ? `${Array.from(original.name).slice(0, 95).join("")} copy` : "New zone", original?.kind);
    onChange({ ...layout, zones: [...layout.zones, zone] });
    focusAfterRender(`layout.zones.${id}.name`);
  }
  function removeFloor(floor: Floor) {
    const count = layout.zones.filter(zone => zone.floor_id === floor.id).length;
    if (!window.confirm(`Remove ${floor.name || "this floor"} and its ${count} zone(s) from this draft? Their current observations will be removed from the draft. Previously saved revisions are preserved. This updates the current building structure only when you save.`)) return;
    onChange({ ...layout, floors: layout.floors.filter(item => item.id !== floor.id), zones: layout.zones.filter(zone => zone.floor_id !== floor.id) });
  }
  function removeZone(zone: Zone) {
    if (!window.confirm(`Remove ${zone.name || "this zone"} and its observations from this draft? Previously saved revisions are preserved. This updates the current building structure only when you save.`)) return;
    onChange({ ...layout, zones: layout.zones.filter(item => item.id !== zone.id) });
  }
  function useCurrentStructure() {
    const currentIds = new Set(inventory.structure.zones.map(zone => zone.id));
    const removedZones = layout.zones.filter(zone => !currentIds.has(zone.id));
    const currentFloorIds = new Set(inventory.structure.floors.map(floor => floor.id));
    const removedFloors = layout.floors.filter(floor => !currentFloorIds.has(floor.id));
    if ((removedZones.length || removedFloors.length) && !window.confirm(`Use the current building structure? ${removedZones.length} zone(s) and ${removedFloors.length} floor(s) in this draft are absent from it and will be removed, including their draft observations. Saved history is preserved. Retained zones keep their observations; new zones start blank.`)) return;
    onChange(reconcileLayout(layout, inventory));
  }
  return <section id="layout" tabIndex={-1} className={`${visitPanel} scroll-mt-6 space-y-6`} aria-labelledby="layout-heading">
    <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><Layers3 className="size-5" aria-hidden="true" /></span><div className="min-w-0"><h2 id="layout-heading" className="text-lg font-semibold">Floors & zones</h2><p className="mt-2 text-sm leading-6 text-slate-500">Organise this building, record measurements and keep information gaps visible. These observations belong to this visit.</p></div></div>
    {imported && <p className="rounded-xl bg-blue-50 p-4 text-xs leading-6 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">The current building structure is used as a starting point. Measurements, service scope and observations have not been copied from another visit.</p>}
    {layout.inventory_version !== inventory.version && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><p className="font-semibold">The building structure has changed</p><p className="mt-2">This draft uses structure version {layout.inventory_version}; the current version is {inventory.version}. Use the current structure before saving. Retained zones keep their observations. New zones start blank and removed zones remain in saved history.</p><button type="button" onClick={useCurrentStructure} className={`${visitSecondary} mt-4`}>Use current building structure</button></div>}
    <LayoutSummary layout={layout} />
    <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3"><span className="min-w-0"><span className="block text-sm font-semibold">Building reference area</span><span className="mt-1 block text-xs text-slate-500">{measurementText(layout.gross_floor_area, "m²")} · shown separately</span></span><ChevronDown className="size-4 shrink-0" aria-hidden="true" /></summary><p className="my-4 text-xs leading-6 text-slate-500">Optional gross or reference floor area from a building document. It is not a net service area and is never added to the zone totals.</p><MeasurementEditor id="layout.gross_floor_area" label="Building reference area" unit="m²" value={layout.gross_floor_area} onChange={gross_floor_area => onChange({ ...layout, gross_floor_area })} error={errors?.["layout.gross_floor_area"]} /></details>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Building structure</h3><p className="mt-1 text-xs leading-5 text-slate-500">{layout.floors.length}/50 floors · {layout.zones.length}/300 zones per building</p></div><button type="button" className={visitSecondary} onClick={addFloor} disabled={layout.floors.length >= 50}><Plus className="size-4" aria-hidden="true" />Add floor</button></div>
    {!layout.floors.length && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-600"><Layers3 className="mx-auto size-7 text-slate-400" aria-hidden="true" /><p className="mt-3 text-sm font-semibold">Start with a floor</p><p className="mt-2 text-xs leading-6 text-slate-500">For example, Ground floor. Add its reception, offices and other zones. An empty building is an information gap, not a completed survey.</p></div>}
    <div className="space-y-5">{layout.floors.map((floor, floorIndex) => {
      const zones = layout.zones.filter(zone => zone.floor_id === floor.id);
      const floorArea = summarizeLayout({ ...layout, zones }).knownFloorArea;
      return <section key={floor.id} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" aria-label={`Floor ${floorIndex + 1}`}>
        <div className="space-y-4 bg-slate-50 p-4 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Floor {floorIndex + 1} · {zones.length} zones · {format(floorArea)} m² known</p><button type="button" onClick={() => removeFloor(floor)} className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300" aria-label={`Remove floor ${floor.name}`}><Trash2 className="size-4" aria-hidden="true" />Remove floor</button></div><div className="grid gap-4 sm:grid-cols-2"><TextControl id={`layout.floors.${floor.id}.name`} label="Floor name" required value={floor.name} max={100} onChange={name => updateFloor(floor.id, { name })} error={errors?.[`layout.floors.${floor.id}.name`]} /><TextControl id={`layout.floors.${floor.id}.reference`} label="Floor reference" value={floor.reference} max={40} onChange={reference => updateFloor(floor.id, { reference })} error={errors?.[`layout.floors.${floor.id}.reference`]} /><TextControl id={`layout.floors.${floor.id}.level`} label="Level" value={floor.level} max={20} onChange={level => updateFloor(floor.id, { level })} error={errors?.[`layout.floors.${floor.id}.level`]} hint="For example: 0, 1, B1 or Mezzanine." /></div></div>
        <div className="space-y-3 p-4">{zones.map(zone => <ZoneEditor key={zone.id} zone={zone} errors={errors} onChange={changes => updateZone(zone.id, changes)} onDuplicate={() => addZone(floor.id, zone)} onRemove={() => removeZone(zone)} canAdd={layout.zones.length < 300} />)}{!zones.length && <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">No zones recorded on this floor. Add the areas you surveyed.</p>}<button type="button" className={visitSecondary} onClick={() => addZone(floor.id)} disabled={layout.zones.length >= 300} aria-label={`Add zone to ${floor.name}`}><Plus className="size-4" aria-hidden="true" />Add zone</button></div>
      </section>;
    })}</div>
    <p className="border-t border-slate-100 pt-4 text-xs leading-6 text-slate-500 dark:border-slate-800">Saving updates the structure shared by this building across its portfolios. Each visit keeps its own saved observations. Removing a floor or zone here never deletes earlier revisions. This release supports up to 50 floors and 300 zones per building.</p>
    {errors?.layout && <p className="text-sm text-red-700 dark:text-red-300">{errors.layout}</p>}
  </section>;
}

function ZoneEditor({ zone, errors, onChange, onDuplicate, onRemove, canAdd }: { zone: Zone; errors: Errors; onChange: (changes: Partial<Zone>) => void; onDuplicate: () => void; onRemove: () => void; canAdd: boolean }) {
  const prefix = `layout.zones.${zone.id}`;
  function textField(key: ZoneText, label: string, max: number, multiline = false, hint?: string, required = false) {
    return <TextControl id={`${prefix}.${key}`} label={label} value={zone[key]} max={max} multiline={multiline} hint={hint} required={required} onChange={value => onChange({ [key]: value })} error={errors?.[`${prefix}.${key}`]} />;
  }
  return <details className="min-w-0 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="break-words text-sm font-semibold">{zone.name || "Unnamed zone"}</p><p className="mt-1 break-words text-xs leading-6 text-slate-500">{zoneKinds.find(kind => kind.value === zone.kind)?.label} · {measurementText(zone.floor_area, "m²")}</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${scopeClass(zone.service_scope)}`}>{scopes[zone.service_scope]}</span></div><ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" /></summary>
    <div className="space-y-6 border-t border-slate-100 p-4 dark:border-slate-800"><div className="grid gap-4 sm:grid-cols-2">{textField("name", "Zone name", 100, false, undefined, true)}{textField("reference", "Zone reference", 40)}<SelectControl id={`${prefix}.kind`} label="Zone type" value={zone.kind} onChange={value => onChange({ kind: value as Zone["kind"] })} options={zoneKinds} error={errors?.[`${prefix}.kind`]} /><SelectControl id={`${prefix}.service_scope`} label="Service scope" value={zone.service_scope} onChange={value => onChange({ service_scope: value as Zone["service_scope"] })} options={Object.entries(scopes).map(([value, label]) => ({ value, label }))} error={errors?.[`${prefix}.service_scope`]} /></div>
      {zone.service_scope === "excluded" && textField("exclusion_reason", "Reason for exclusion", 1000, true, "This zone remains visible and its area is shown separately from included areas.", true)}
      <div><h4 className="flex items-center gap-2 text-sm font-semibold"><Ruler className="size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" />Measurements</h4><p className="mt-2 text-xs leading-6 text-slate-500">Enter the measured quantity directly. Use zero only when it is confirmed. Unknown and not applicable both need a reason.</p><div className="mt-4 space-y-3">{measurementFields.map(item => <details key={item.key} open={item.key === "floor_area" ? true : undefined} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs"><span className="min-w-0"><strong className="block">{item.label}</strong><span className="mt-1 block text-slate-500">{measurementText(zone[item.key], item.unit)}</span></span><ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" /></summary><div className="mt-4"><MeasurementEditor id={`${prefix}.${item.key}`} label={item.label} unit={item.unit} value={zone[item.key]} onChange={value => onChange({ [item.key]: value })} error={errors?.[`${prefix}.${item.key}`]} integer={item.key === "fixture_count"} />{item.key === "fixture_count" && zone.fixture_count.state === "answered" && <div className="mt-4">{textField("fixture_type", "Fixture type", 100, false, "For example: toilets, basins or desks. Different fixture types are never combined into a building count.", true)}</div>}</div></details>)}</div></div>
      <details className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">Materials & observations<ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" /></summary><div className="mt-4 space-y-4"><div className="grid gap-4 sm:grid-cols-2">{textField("material", "Main surface material", 100)}<SelectControl id={`${prefix}.condition`} label="Condition" value={zone.condition} onChange={value => onChange({ condition: value as Zone["condition"] })} options={[{ value: "unknown", label: "Not confirmed" }, { value: "good", label: "Good" }, { value: "fair", label: "Fair" }, { value: "poor", label: "Poor" }]} error={errors?.[`${prefix}.condition`]} /></div>{textField("occupancy", "Occupancy and use", 200, false, "For example: busy weekday office, approximately 25 occupants.")}{textField("obstacles", "Obstacles", 1000, true)}{textField("access", "Access restrictions", 1000, true)}{textField("notes", "Zone notes", 1000, true)}</div></details>
      <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800"><button type="button" className={visitSecondary} onClick={onDuplicate} disabled={!canAdd} aria-label={`Duplicate zone ${zone.name}`}><Copy className="size-4" aria-hidden="true" />Duplicate zone</button><button type="button" className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300" onClick={onRemove} aria-label={`Remove zone ${zone.name}`}><Trash2 className="size-4" aria-hidden="true" />Remove zone</button></div><p className="text-xs leading-5 text-slate-500">Duplicate copies the name and type only. Measurements, sources and observations start blank. To place a zone on another floor, create a new zone there.</p>
    </div>
  </details>;
}

function MeasurementEditor({ id, label, unit, value, onChange, error, integer = false }: { id: string; label: string; unit: string; value: Measurement; onChange: (value: Measurement) => void; error?: string; integer?: boolean }) {
  function setState(state: Measurement["state"]) {
    if (state === value.state) return;
    if ((value.value !== null || value.source || value.note) && !window.confirm(`Change the status of ${label.toLowerCase()}? Its current value, source and note will be cleared.`)) return;
    onChange({ ...emptyMeasurement(), state });
  }
  return <fieldset id={id} tabIndex={-1} className="min-w-0 scroll-mt-6 space-y-4" aria-describedby={error ? `${id}-error` : undefined}>
    <legend className="sr-only">{label}</legend>
    <SelectControl id={`${id}.state`} label={`${label} status`} value={value.state} onChange={state => setState(state as Measurement["state"])} options={[{ value: "unanswered", label: "Not recorded yet" }, { value: "answered", label: "Record a value" }, { value: "unknown", label: "Unknown — needs confirmation" }, { value: "not_applicable", label: "Not applicable" }]} />
    {value.state === "answered" && <div className="grid gap-4 sm:grid-cols-2"><div className="min-w-0 space-y-2"><label htmlFor={`${id}.value`} className="block text-xs font-semibold">{label} ({unit}) <span className="font-normal text-slate-500">(required)</span></label><input id={`${id}.value`} type="number" inputMode={integer ? "numeric" : "decimal"} min="0" max="10000000" step={integer ? "1" : "0.01"} value={value.value ?? ""} onChange={event => onChange({ ...value, value: event.target.value === "" ? null : event.target.valueAsNumber })} aria-invalid={Boolean(error)} aria-describedby={`${id}.hint`} className={visitInput} /><p id={`${id}.hint`} className="text-xs leading-5 text-slate-500">{integer ? "Whole numbers only." : "Up to 2 decimal places."} Zero is a recorded value.</p></div><SelectControl id={`${id}.source`} label="Measurement source" required value={value.source} onChange={source => onChange({ ...value, source: source as Measurement["source"] })} options={[{ value: "", label: "Choose a source" }, ...measurementSources]} /></div>}
    {value.state !== "unanswered" && <TextControl id={`${id}.note`} label={value.state === "answered" ? "Supporting note" : value.state === "unknown" ? "What needs confirming?" : "Why is this not applicable?"} value={value.note} max={500} multiline required={value.state !== "answered"} onChange={note => onChange({ ...value, note })} hint={value.state === "not_applicable" ? "This measurement is excluded from the known total and remains separate from unknown or zero." : undefined} />}
    {error && <p id={`${id}-error`} className="text-sm text-red-700 dark:text-red-300">{error}</p>}
  </fieldset>;
}
function TextControl({ id, label, value, onChange, max, error, multiline = false, hint, required = false }: { id: string; label: string; value: string; onChange: (value: string) => void; max: number; error?: string; multiline?: boolean; hint?: string; required?: boolean }) {
  const common = { id, value, maxLength: max, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), className: visitInput, "aria-invalid": Boolean(error), "aria-describedby": [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined };
  return <div className="min-w-0 space-y-2"><label htmlFor={id} className="block text-xs font-semibold">{label} <span className="font-normal text-slate-500">({required ? "required" : "optional"})</span></label>{multiline ? <textarea {...common} rows={3} /> : <input {...common} type="text" />}{hint && <p id={`${id}-hint`} className="text-xs leading-5 text-slate-500">{hint}</p>}{error && <p id={`${id}-error`} className="text-sm text-red-700 dark:text-red-300">{error}</p>}</div>;
}
function SelectControl({ id, label, value, onChange, options, error, required = false }: { id: string; label: string; value: string; onChange: (value: string) => void; options: readonly { value: string; label: string }[]; error?: string; required?: boolean }) {
  return <div className="min-w-0 space-y-2"><label htmlFor={id} className="block text-xs font-semibold">{label}{required && <span className="font-normal text-slate-500"> (required)</span>}</label><select id={id} value={value} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className={visitInput}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{error && <p id={`${id}-error`} className="text-sm text-red-700 dark:text-red-300">{error}</p>}</div>;
}

export function LayoutSnapshot({ layout }: { layout: VisitLayout | null | undefined }) {
  if (!layout) return <section className={visitPanel}><h2 className="text-lg font-semibold">Floors & zones</h2><p className="mt-3 text-sm leading-6 text-slate-500">No floor or zone snapshot was recorded in this revision. This older visit does not indicate an empty building or a completed survey.</p></section>;
  return <section className={`${visitPanel} space-y-6`} aria-labelledby="saved-layout-heading"><div><h2 id="saved-layout-heading" className="text-lg font-semibold">Floors & zones</h2><p className="mt-2 text-xs leading-6 text-slate-500">Saved with this visit revision · building structure version {layout.inventory_version}. Later changes to the building do not change this snapshot.</p></div><LayoutSummary layout={layout} /><dl className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900"><SavedMeasurement label="Building reference area" value={layout.gross_floor_area} unit="m²" /></dl>{!layout.floors.length && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">No floors or zones were recorded. Building coverage still needs checking.</p>}<div className="space-y-4">{layout.floors.map(floor => {
    const zones = layout.zones.filter(zone => zone.floor_id === floor.id);
    const knownArea = summarizeLayout({ ...layout, zones }).knownFloorArea;
    return <details key={floor.id} className="rounded-xl border border-slate-200 dark:border-slate-700"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 p-4"><div className="min-w-0"><h3 className="break-words font-semibold">{floor.name}</h3><p className="mt-2 break-words text-xs leading-6 text-slate-500">{floor.reference && `${floor.reference} · `}{floor.level && `Level ${floor.level} · `}{zones.length} zones · {format(knownArea)} m² known</p></div><ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" /></summary><div className="space-y-4 border-t border-slate-100 p-4 dark:border-slate-800">{!zones.length && <p className="text-sm text-amber-700 dark:text-amber-300">No zones recorded on this floor.</p>}{zones.map(zone => <details key={zone.id} className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3"><div className="min-w-0"><h4 className="break-words text-sm font-semibold">{zone.name}</h4><p className="mt-1 break-words text-xs leading-6 text-slate-500">{zoneKinds.find(kind => kind.value === zone.kind)?.label} · {measurementText(zone.floor_area, "m²")}</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs ${scopeClass(zone.service_scope)}`}>{scopes[zone.service_scope]}</span></div><ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" /></summary><dl className="mt-5 grid gap-5 sm:grid-cols-2">{measurementFields.map(item => <SavedMeasurement key={item.key} label={item.label} value={zone[item.key]} unit={item.unit} />)}<SavedText label="Fixture type" value={zone.fixture_type} /><SavedText label="Zone reference" value={zone.reference} /><SavedText label="Main surface material" value={zone.material} /><SavedText label="Condition" value={zone.condition === "unknown" ? "Not confirmed" : zone.condition} /><SavedText label="Occupancy and use" value={zone.occupancy} /><SavedText label="Obstacles" value={zone.obstacles} /><SavedText label="Access restrictions" value={zone.access} /><SavedText label={zone.service_scope === "excluded" ? "Reason for exclusion" : "Retained exclusion note"} value={zone.exclusion_reason} /><SavedText label="Zone notes" value={zone.notes} /></dl></details>)}</div></details>;
  })}</div></section>;
}
function SavedMeasurement({ label, value, unit }: { label: string; value: Measurement; unit: string }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-2 space-y-2"><p className={`break-words text-sm font-medium ${value.state === "unknown" ? "text-amber-700 dark:text-amber-300" : ""}`}>{measurementText(value, unit)}</p>{value.source && <p className="text-xs text-slate-500">Source: {measurementSources.find(source => source.value === value.source)?.label ?? value.source}</p>}{value.note && <p className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-500">{value.state === "answered" ? "Note" : "Reason"}: {value.note}</p>}</dd></div>;
}
function SavedText({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{value || "Not recorded"}</dd></div>;
}
