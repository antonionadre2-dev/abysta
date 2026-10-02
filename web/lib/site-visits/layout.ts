/** Building identities are reusable. Measurements belong only to a saved visit. */
export type Measurement = {
  state: "unanswered" | "answered" | "unknown" | "not_applicable";
  value: number | null;
  source: "" | "measured" | "client" | "plan" | "estimated" | "document";
  note: string;
};
export type Floor = { id: string; name: string; reference: string; level: string };
export type ZoneKind = "reception" | "office" | "washroom" | "kitchen" | "stairs" | "corridor" | "storage" | "plant_room" | "external" | "other";
export type ZoneStructure = { id: string; floor_id: string; name: string; reference: string; kind: ZoneKind };
export type Zone = ZoneStructure & {
  service_scope: "included" | "excluded" | "undecided";
  material: string; condition: "unknown" | "good" | "fair" | "poor";
  occupancy: string; obstacles: string; access: string; exclusion_reason: string; notes: string;
  floor_area: Measurement; glass_area: Measurement; edge_length: Measurement;
  fixture_count: Measurement; fixture_type: string;
};
export type BuildingStructure = { floors: Floor[]; zones: ZoneStructure[] };
export type SiteInventory = { version: number; structure: BuildingStructure };
export type VisitLayout = { schema_version: 1; inventory_version: number; gross_floor_area: Measurement; floors: Floor[]; zones: Zone[] };
export const MAX_VISIT_PAYLOAD_BYTES = 512000;
export const MAX_FLOORS = 50;
export const MAX_ZONES = 300;
export const zoneKinds: { value: ZoneKind; label: string }[] = [
  { value: "reception", label: "Reception" }, { value: "office", label: "Office" },
  { value: "washroom", label: "Washroom" }, { value: "kitchen", label: "Kitchen" },
  { value: "stairs", label: "Stairs" }, { value: "corridor", label: "Corridor" },
  { value: "storage", label: "Storage" }, { value: "plant_room", label: "Plant room" },
  { value: "external", label: "External" }, { value: "other", label: "Other" },
];
export const measurementSources: { value: Measurement["source"]; label: string }[] = [
  { value: "measured", label: "Measured on site" }, { value: "client", label: "Client supplied" },
  { value: "plan", label: "Floor plan" }, { value: "estimated", label: "Estimated" },
  { value: "document", label: "Document" },
];
export function emptyMeasurement(): Measurement { return { state: "unanswered", value: null, source: "", note: "" }; }
export function emptyZone(id: string, floorId: string, name = "", kind: ZoneKind = "office"): Zone {
  return { id, floor_id: floorId, name, reference: "", kind, service_scope: "undecided", material: "", condition: "unknown", occupancy: "", obstacles: "", access: "", exclusion_reason: "", notes: "", floor_area: emptyMeasurement(), glass_area: emptyMeasurement(), edge_length: emptyMeasurement(), fixture_count: emptyMeasurement(), fixture_type: "" };
}
export function emptyLayout(inventory?: SiteInventory): VisitLayout {
  return { schema_version: 1, inventory_version: inventory?.version ?? 0, gross_floor_area: emptyMeasurement(), floors: inventory?.structure.floors.map(f => ({ ...f })) ?? [], zones: inventory?.structure.zones.map(z => ({ ...emptyZone(z.id, z.floor_id), ...z })) ?? [] };
}
/** Call only after explicit user review. Historical revisions are never passed back for mutation. */
export function reconcileLayout(layout: VisitLayout, inventory: SiteInventory): VisitLayout {
  const previous = new Map(layout.zones.map(z => [z.id, z]));
  return { ...layout, gross_floor_area: structuredClone(layout.gross_floor_area), inventory_version: inventory.version, floors: inventory.structure.floors.map(f => ({ ...f })), zones: inventory.structure.zones.map(z => ({ ...structuredClone(previous.get(z.id) ?? emptyZone(z.id, z.floor_id)), ...z })) };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const singleControl = /[\u0000-\u001f\u007f]/;
const multiControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const measureFields = ["floor_area", "glass_area", "edge_length", "fixture_count"] as const;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
const floorFields = ["id", "name", "reference", "level"];
const zoneTextFields: Record<string, [number, number, boolean?]> = {
  name: [1, 100], reference: [0, 40], material: [0, 100], occupancy: [0, 200], fixture_type: [0, 100],
  obstacles: [0, 1000, true], access: [0, 1000, true], exclusion_reason: [0, 1000, true], notes: [0, 1000, true],
};
const zoneFields = ["id", "floor_id", "kind", "service_scope", "condition", ...Object.keys(zoneTextFields), ...measureFields];
export function validateLayout(raw: unknown): { ok: true; data: VisitLayout } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!object(raw) || !exactKeys(raw, ["schema_version", "inventory_version", "gross_floor_area", "floors", "zones"]) || raw.schema_version !== 1 || !Number.isSafeInteger(raw.inventory_version) || (raw.inventory_version as number) < 0 || (raw.inventory_version as number) >= Number.MAX_SAFE_INTEGER || !Array.isArray(raw.floors) || !Array.isArray(raw.zones) || raw.floors.length > MAX_FLOORS || raw.zones.length > MAX_ZONES) {
    return { ok: false, errors: { layout: "Check the building structure. Each building supports up to 50 floors and 300 zones in this release." } };
  }
  const text = (value: unknown, key: string, label: string, min: number, max: number, multi = false): string => {
    if (typeof value !== "string") { errors[key] = `${label}: enter text.`; return ""; }
    const normalized = value.trim();
    if ([...normalized].length < min || [...normalized].length > max || (multi ? multiControl : singleControl).test(normalized)) errors[key] = `${label}: use ${min ? `${min}–${max}` : `no more than ${max}`} characters.`;
    return normalized;
  };
  const enumValue = (value: unknown, options: string[], key: string, label: string) => {
    const v = typeof value === "string" ? value.trim() : "";
    if (!options.includes(v)) errors[key] = `${label}: choose one of the available options.`;
    return v;
  };
  function measurement(value: unknown, key: string, label: string, integer = false): Measurement {
    if (!object(value) || !exactKeys(value, ["state", "value", "source", "note"]) || typeof value.state !== "string" || typeof value.source !== "string" || typeof value.note !== "string") {
      errors[key] = `${label}: check the measurement details.`; return emptyMeasurement();
    }
    const state = value.state.trim(), source = value.source.trim(), note = text(value.note, key, `${label} note`, 0, 500, true);
    if (state === "answered") {
      if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0 || value.value > 10000000 || (integer ? !Number.isInteger(value.value) : Number(value.value.toFixed(2)) !== value.value)) errors[key] = `${label}: enter ${integer ? "a whole number" : "a number with up to 2 decimal places"} from 0 to 10,000,000.`;
      if (!measurementSources.some(s => s.value === source)) errors[key] = `${label}: choose where this measurement came from.`;
    } else if (state === "unanswered") {
      if (value.value !== null || source !== "" || note !== "") errors[key] = `${label}: an unrecorded measurement cannot contain a value, source or note.`;
    } else if (state === "unknown" || state === "not_applicable") {
      if (value.value !== null || source !== "" || !note) errors[key] = `${label}: give a reason and leave the value and source empty.`;
    } else errors[key] = `${label}: choose a measurement state.`;
    return { state, value: value.value, source, note } as Measurement;
  }
  const allIds = new Set<string>(), floorIds = new Set<string>();
  const identifier = (value: unknown, key: string) => {
    const id = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!uuid.test(id) || allIds.has(id)) errors[key] = "Each floor and zone needs its own valid identity. Remove the duplicate and add it again.";
    allIds.add(id); return id;
  };
  const floors: Floor[] = raw.floors.map((f, index) => {
    if (!object(f) || !exactKeys(f, floorFields)) { errors.layout = `Floor ${index + 1}: check the structure fields.`; return { id: "", name: "", reference: "", level: "" }; }
    const id = identifier(f.id, "layout"), key = `layout.floors.${id}`; floorIds.add(id);
    return { id, name: text(f.name, `${key}.name`, `Floor ${index + 1} name`, 1, 100), reference: text(f.reference, `${key}.reference`, `Floor ${index + 1} reference`, 0, 40), level: text(f.level, `${key}.level`, `Floor ${index + 1} level`, 0, 20) };
  });
  const zones: Zone[] = raw.zones.map((z, index) => {
    if (!object(z) || !exactKeys(z, zoneFields)) { errors.layout = `Zone ${index + 1}: check the structure fields.`; return emptyZone("", ""); }
    const id = identifier(z.id, "layout"), key = `layout.zones.${id}`;
    const floorId = typeof z.floor_id === "string" ? z.floor_id.trim().toLowerCase() : "";
    if (!floorIds.has(floorId)) errors[`${key}.floor_id`] = `Zone ${index + 1}: choose a floor in this building.`;
    const normalized: Record<string, unknown> = { id, floor_id: floorId };
    for (const [field, [min, max, multi]] of Object.entries(zoneTextFields)) normalized[field] = text(z[field], `${key}.${field}`, `Zone ${index + 1} ${field.replaceAll("_", " ")}`, min, max, multi);
    normalized.kind = enumValue(z.kind, zoneKinds.map(x => x.value), `${key}.kind`, `Zone ${index + 1} type`);
    normalized.service_scope = enumValue(z.service_scope, ["included", "excluded", "undecided"], `${key}.service_scope`, `Zone ${index + 1} service scope`);
    normalized.condition = enumValue(z.condition, ["unknown", "good", "fair", "poor"], `${key}.condition`, `Zone ${index + 1} condition`);
    for (const field of measureFields) normalized[field] = measurement(z[field], `${key}.${field}`, `${normalized.name || `Zone ${index + 1}`} · ${field.replaceAll("_", " ")}`, field === "fixture_count");
    if (normalized.service_scope === "excluded" && !normalized.exclusion_reason) errors[`${key}.exclusion_reason`] = `${normalized.name || `Zone ${index + 1}`}: explain why this zone is excluded.`;
    if ((normalized.fixture_count as Measurement).state === "answered" && !normalized.fixture_type) errors[`${key}.fixture_type`] = `${normalized.name || `Zone ${index + 1}`}: describe what has been counted (for example, washbasins).`;
    return normalized as Zone;
  });
  const grossFloorArea = measurement(raw.gross_floor_area, "layout.gross_floor_area", "Gross / reference floor area");
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { schema_version: 1, inventory_version: raw.inventory_version as number, gross_floor_area: grossFloorArea, floors, zones } };
}

function validQuantity(measurement: Measurement) {
  const v = measurement.value;
  return measurement.state === "answered" && typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10000000 && Number(v.toFixed(2)) === v;
}
/** Integer hundredths keep finite 2-decimal inputs exact without intermediate rounding. */
export function summarizeLayout(layout: VisitLayout) {
  const total = (field: "floor_area" | "glass_area" | "edge_length", scope?: Zone["service_scope"]) => layout.zones.reduce((sum, zone) => sum + (validQuantity(zone[field]) && (!scope || zone.service_scope === scope) ? Math.round(zone[field].value! * 100) : 0), 0) / 100;
  return {
    floorCount: layout.floors.length, zoneCount: layout.zones.length,
    emptyFloorCount: layout.floors.filter(f => !layout.zones.some(z => z.floor_id === f.id)).length,
    knownFloorArea: total("floor_area"), includedFloorArea: total("floor_area", "included"), excludedFloorArea: total("floor_area", "excluded"), undecidedFloorArea: total("floor_area", "undecided"),
    pendingFloorZones: layout.zones.filter(z => ["unanswered", "unknown"].includes(z.floor_area.state) || z.floor_area.state === "answered" && !validQuantity(z.floor_area)).length,
    naFloorZones: layout.zones.filter(z => z.floor_area.state === "not_applicable").length,
    estimatedFloorZones: layout.zones.filter(z => z.floor_area.state === "answered" && z.floor_area.source === "estimated").length,
    glassArea: total("glass_area"), edgeLength: total("edge_length"),
    pendingScopeZones: layout.zones.filter(z => z.service_scope === "undecided").length,
  };
}
