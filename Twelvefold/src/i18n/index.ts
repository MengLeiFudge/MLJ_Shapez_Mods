import schema from "./schema.json";
import source from "./catalogs.json";
import experience from "./experience.json";
import { game, type Engine } from "../game/api.ts";
import { BUILDINGS, CATEGORIES, type BuildingEntry, type RolePort } from "../game/catalog.ts";
export const SUPPORTED_LANGUAGES = schema.languages;
export type Catalog = Record<string, string>;
const catalogs: Record<string, Catalog> = {};
const aliases: Record<string, readonly [string, string]> = {
    rotateCCW: ["rotate", "↶30°"], rotate2: ["rotate", "↷60°"], rotateMinus2: ["rotate", "↶60°"], rotate3: ["rotate", "↷90°"], rotateMinus3: ["rotate", "↶90°"], rotate6: ["rotate", "180°"],
    sector1: ["cut", "30°"], sector2: ["cut", "60°"], sector3: ["cut", "90°"], cut3: ["cut", "×3"], cut4: ["cut", "×4"], cutSignal: ["cut", "◇"], swapMirror: ["swap", "⇄"], stack3: ["stack", "×3"],
    smartTunnelIn: ["smartTunnel", "↓"], smartTunnelOut: ["smartTunnel", "↑"], hyperlink: ["hyperline", "⇔"],
};
const helpKeys: Record<string, string> = { virtual: "circuits", cut: "processing", sector1: "processing", sector2: "processing", sector3: "processing", cut3: "processing", cut4: "processing", cutSignal: "circuits", rotate: "processing", swap: "processing", swapMirror: "processing", stack: "processing", stack3: "processing", delayer: "processing", paint: "processing", paint2: "processing", smelt: "processing", flipBlock: "geometry", mirror: "geometry", chainMiner: "processing", merge: "center", split: "center", priority: "center", filter: "center", crossing: "center", smartTunnel: "center" };
for (const language of SUPPORTED_LANGUAGES) {
    const rows = (source as Record<string, Record<string, string[]>>)[language]!, catalog: Catalog = {};
    for (const [group, keys] of Object.entries(schema.groups)) keys.forEach((key, i) => { catalog[`${group}.${key}`] = rows[group]![i]! });
    for (const [key, [base, detail]] of Object.entries(aliases)) catalog[`machine.${key}`] = `${catalog[`machine.${base}`]} ${detail}`;
    const extra = (experience.catalogs as Record<string, Record<string, string[]>>)[language]!;
    for (const [group, keys] of Object.entries(experience.groups)) keys.forEach((key, i) => { catalog[`${group}.${key}`] = extra[group]![i]! });
    for (const entry of BUILDINGS) catalog[entry.tip] = catalog[`tip.${entry.kind === "circuit" ? "circuits" : entry.kind === "machine" ? "machine" : "logistics"}`]!;
    // 原帮助第一句使用固定方位；只保留之后的玩法说明，并用角色语义替换该句。
    for (const [help, tip] of [["processing", "machine"], ["circuits", "circuits"]]) {
        const value = catalog[`help.${help}`]!, sentence = value.search(/[。.]/);
        if (sentence < 0) throw new Error(`Missing help sentence: ${language}.${help}`);
        catalog[`help.${help}`] = `${catalog[`tip.${tip}`]} ${value.slice(sentence + 1).trim()}`;
    }
    catalog["ui.ports"] = catalog["tip.circuits"]!;
    for (const [key, base] of Object.entries(helpKeys)) catalog[`help.${key}`] = catalog[`help.${base}`]!;
    catalogs[language] = catalog;
}
export function language(root: Engine): string {
    const selected = root?.app?.settings?.getLanguage?.();
    if (typeof selected === "string" && catalogs[selected]) return selected;
    const current = game.T.twelvefold;
    return SUPPORTED_LANGUAGES.find(code => catalogs[code]!["ui.main"] === current?.["ui.main"]) ?? "en";
}
export function text(root: Engine, key: string): string {
    const translated = catalogs[language(root)]![key];
    if (translated === undefined) throw new Error(`Missing Twelvefold text key: ${key}`);
    return translated;
}


export function buildingName(root: Engine, entry: BuildingEntry): string {
    return entry.kind === "native" ? (game.T.buildings[entry.metaId]?.[entry.variant]?.name ?? game.T.buildings[entry.metaId]?.default?.name ?? entry.id).replace(/<[^>]*>/g, "") : text(root, entry.key);
}
function roleName(catalog: Catalog, port: RolePort): string {
    const range: Record<string, string> = { rightHalf: "0–5", leftHalf: "6–11", sector: "0…n−1", remainder: "n…11", base: "1", middle: "2", top: "3", topLayer: "N", remainingLayers: "1…N−1" };
    if (range[port.role]) return `${catalog[port.role === "rightHalf" || port.role === "leftHalf" || port.role === "sector" || port.role === "remainder" ? "ui.slot" : "ui.layer"]} / ${range[port.role]}`;
    if (/^\d+–\d+$/.test(port.role)) return `${catalog["ui.slot"]} / ${port.role}`;
    const key = port.role === "dye" ? "color" : port.role === "main" || port.role === "value" ? "input" : port.role === "product" || port.role === "straight" ? "output" : port.role === "match" ? "valid" : port.role === "other" ? "remaining" : port.role;
    return catalog[`ui.${key}`] ?? (port.role.startsWith("side") ? port.role.slice(-1) : port.role === "backup" ? "B" : port.role);
}
function describe(catalog: Catalog, entry: BuildingEntry): string {
    const rows = (ports: readonly RolePort[]): string => ports.map((port, i) => `${i + 1}: ${roleName(catalog, port)}`).join(" / ");
    const input = entry.kind === "circuit" ? entry.signals.filter(port => port.side === "bottom") : entry.inputs;
    const output = entry.kind === "circuit" ? entry.signals.filter(port => port.side === "top") : entry.outputs;
    return `${catalog[entry.tip]} ${catalog["ui.input"]} [${rows(input)}]; ${catalog["ui.output"]} [${rows(output)}]${entry.kind !== "circuit" && entry.signals.length ? `; ◇ [${rows(entry.signals)}]` : ""}`;
}
export function buildingDescription(root: Engine, entry: BuildingEntry): string { return describe(catalogs[language(root)]!, entry) }

export function installTranslations(mod: Engine): void {
    for (const code of SUPPORTED_LANGUAGES) {
        const catalog = catalogs[code]!;
        const buildings: Record<string, Engine> = {};
        for (const entry of BUILDINGS.filter(entry => entry.kind !== "native")) {
            const name = catalog[entry.key], description = describe(catalog, entry);
            if (!name || !description) throw new Error(`Missing ${code}: ${entry.key}/${entry.tip}`);
            buildings[entry.metaId] ??= {}; buildings[entry.metaId][entry.variant] = { name, description };
        }
        const mappings: Record<string, string> = { twelvefold_cycle: catalog["toolbar.cycle"]!, twelvefold_flip_h: catalog["toolbar.horizontal"]!, twelvefold_flip_v: catalog["toolbar.vertical"]! };
        for (const category of CATEGORIES) {
            const id = `twelvefold_category_${category.digit}`, label = `${category.digit}: ${catalog[`toolbar.${category.id}`]}`;
            mappings[id] = mappings[id] ? `${mappings[id]} / ${label}` : label;
        }
        mod.modInterface.registerTranslations(code, { twelvefold: catalog, buildings, keybindings: { mappings } });
    }
}
