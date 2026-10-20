import { CATEGORIES, mirrorPort, type BuildingEntry, type RolePort } from "./catalog.ts";
import { BORROWED } from "./borrowed-assets.ts";

const escape = (value: string): string => value.replace(/[<>&"]/g, "");
const uri = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const cache = new Map<string, string>();
/** 图标也从同一目录的端口与类别生成，避免资源与实际角色脱节。 */
export function artwork(entry: BuildingEntry, blueprint = false, mirror = 0, icon = false): string {
    const key = `${entry.id}:${Number(blueprint)}:${mirror}:${Number(icon)}`, cached = cache.get(key);
    if (cached) return cached;
    const w = (icon ? 1 : entry.width) * 192, h = (icon ? 1 : entry.height) * 192;
    const accent = blueprint ? "#9cdbff" : CATEGORIES.find(category => category.id === entry.category)!.accent;
    const ports = (roles: readonly RolePort[], output: boolean): string => roles.map((source, index) => {
        const p = mirrorPort(source, entry.width, mirror), cx = (p.x + .5) * 192, cy = (p.y + .5) * 192;
        const x = p.side === "left" ? p.x * 192 + 8 : p.side === "right" ? (p.x + 1) * 192 - 8 : cx;
        const y = p.side === "top" ? p.y * 192 + 8 : p.side === "bottom" ? (p.y + 1) * 192 - 8 : cy;
        const angle = { top: 0, right: 90, bottom: 180, left: 270 }[p.side] + (output ? 0 : 180);
        const labelX = x + (p.side === "left" ? 32 : p.side === "right" ? -32 : 0), labelY = y + (p.side === "top" ? 35 : p.side === "bottom" ? -27 : 6);
        return `<g transform="translate(${x} ${y}) rotate(${angle})"><rect x="-23" y="-12" width="46" height="32" rx="5" fill="${blueprint ? "#629bce" : "#59636a"}"/><path d="M-10 12 L0 0 L10 12 M0 1 V22" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round"/></g><text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" fill="${blueprint ? "#e3f5ff" : "#263946"}">${index + 1}</text>`;
    }).join("");
    const reused = BORROWED[entry.id], borrowed = blueprint ? reused?.blueprint : reused?.building;
    if (borrowed && (!icon || (entry.width === 1 && entry.height === 1))) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g ${mirror ? `transform="translate(${w} 0) scale(-1 1)"` : ""}><image href="${borrowed}" width="${w}" height="${h}"/></g>${icon ? "" : ports(entry.inputs, false) + ports(entry.outputs, true)}</svg>`;
        const value = uri(svg); cache.set(key, value); return value;
    }
    const cx = w / 2, cy = h / 2, r = Math.min(58, h * .31), operation = entry.machine?.operation ?? entry.id;
    const segment = (i: number): string => {
        const start = (i * 30 - 90) * Math.PI / 180, end = start + Math.PI / 6;
        const x = (angle: number): number => cx + Math.cos(angle) * r, y = (angle: number): number => cy + Math.sin(angle) * r;
        const cutSize = operation === "cut" ? 6 : operation === "cut3" ? 4 : operation === "cut4" ? 3 : operation === "cutSignal" ? 3 : operation.startsWith("sector") ? Number(operation.slice(-1)) : 12;
        const fill = i < cutSize ? accent : blueprint ? "#5585b6" : "#c6cdd0";
        return `<path d="M${cx} ${cy} L${x(start)} ${y(start)} A${r} ${r} 0 0 1 ${x(end)} ${y(end)} Z" fill="${fill}" stroke="${blueprint ? "#c0e8ff" : "#626e76"}" stroke-width="2"/>`;
    };
    let action = "";
    if (operation.startsWith("cut") || operation.startsWith("sector")) action = `<path d="M${cx} ${cy - r - 14} V${cy + r + 14}" stroke="#394954" stroke-width="8"/><path d="M${cx - 22} ${cy - r - 6} L${cx + 22} ${cy - r + 6}" stroke="#f5e7b5" stroke-width="6"/>`;
    else if (operation === "rotate") action = `<path d="M${cx - r - 7} ${cy + 15} A${r + 14} ${r + 14} 0 1 1 ${cx + r + 4} ${cy + 28} L${cx + r - 16} ${cy + 14} M${cx + r + 4} ${cy + 28} L${cx + r + 14} ${cy + 4}" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>`;
    else if (operation === "flipBlock" || operation === "mirror") action = `<path d="M${cx} ${cy - r - 12} V${cy + r + 12}" stroke="#fafaff" stroke-width="6" stroke-dasharray="10 7"/><path d="M${cx - 42} ${cy} H${cx + 42} M${cx - 28} ${cy - 14} L${cx - 42} ${cy} L${cx - 28} ${cy + 14} M${cx + 28} ${cy - 14} L${cx + 42} ${cy} L${cx + 28} ${cy + 14}" fill="none" stroke="#394954" stroke-width="6"/>`;
    else if (operation.startsWith("stack") || operation === "delayer") action = `<rect x="${cx - 38}" y="${cy - 28}" width="76" height="38" rx="10" fill="${accent}" stroke="#394954" stroke-width="5"/><rect x="${cx - 31}" y="${cy - 6}" width="62" height="38" rx="10" fill="#dce1e3" stroke="#394954" stroke-width="5"/>`;
    else if (operation.startsWith("swap")) action = `<path d="M${cx - 45} ${cy - 15} H${cx + 45} L${cx + 26} ${cy - 32} M${cx + 45} ${cy + 15} H${cx - 45} L${cx - 26} ${cy + 32}" fill="none" stroke="#394954" stroke-width="8" stroke-linecap="round"/>`;
    else if (operation.startsWith("paint") || operation === "smelt") action = `<path d="M${cx} ${cy - 38} Q${cx - 47} ${cy + 9} ${cx - 21} ${cy + 33} Q${cx + 21} ${cy + 55} ${cx + 26} ${cy + 19} Q${cx + 26} ${cy + 1} ${cx} ${cy - 38}" fill="${operation === "smelt" ? "#eaad69" : "#cd658b"}" stroke="#394954" stroke-width="6"/>`;
    const signals = entry.kind === "circuit" ? entry.signals.filter(p => p.side === "bottom") : entry.signals;
    const outputSignals = entry.kind === "circuit" ? entry.signals.filter(p => p.side === "top") : [];
    if (operation === "rotate" && (entry.machine?.steps ?? 0) < 0) action = `<g transform="translate(${w} 0) scale(-1 1)">${action}</g>`;
    if (operation === "cut3" || operation === "cut4") {
        const count = operation === "cut3" ? 3 : 4;
        action = Array.from({ length: count }, (_, i) => `<path d="M${cx} ${cy} V${cy - r - 10}" transform="rotate(${360 * i / count} ${cx} ${cy})" stroke="#394954" stroke-width="7"/>`).join("");
    }
    if (entry.kind === "native") action = entry.id === "storage" ? `<rect x="${cx - 40}" y="${cy - 40}" width="80" height="80" rx="10" fill="#bcc8cc" stroke="#394954" stroke-width="6"/><path d="M${cx - 26} ${cy - 18} H${cx + 26} M${cx - 26} ${cy} H${cx + 26} M${cx - 26} ${cy + 18} H${cx + 26}" stroke="${accent}" stroke-width="8"/>` : entry.id === "miner" ? `<path d="M${cx - 32} ${cy + 40} L${cx + 22} ${cy - 35} M${cx - 38} ${cy - 32} Q${cx} ${cy - 62} ${cx + 44} ${cy - 9}" fill="none" stroke="#394954" stroke-width="12" stroke-linecap="round"/>` : `<path d="M${cx} ${cy + 43} V${cy - 40} M${cx - 18} ${cy - 18} L${cx} ${cy - 40} L${cx + 18} ${cy - 18}" fill="none" stroke="#394954" stroke-width="10" stroke-linecap="round"/>`;
    const label = escape(entry.label);
    // 仅动作示意随镜像，角度与标记保持正读；接口按实际镜像坐标绘制。
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="9" y="12" width="${w - 18}" height="${h - 20}" rx="22" fill="${blueprint ? "#3474af" : "#69747c"}" opacity="${blueprint ? ".7" : ".3"}"/><rect x="10" y="8" width="${w - 20}" height="${h - 20}" rx="22" fill="${blueprint ? "#568abb" : "#e1e5e5"}" stroke="${blueprint ? "#bbdfff" : "#3c4c58"}" stroke-width="8" opacity="${blueprint ? ".8" : "1"}"/><path d="M30 31 H${w - 30}" stroke="${accent}" stroke-width="8" stroke-linecap="round"/><g ${mirror ? `transform="translate(${w} 0) scale(-1 1)"` : ""}>${Array.from({ length: 12 }, (_, i) => segment(i)).join("")}${action}</g>${icon ? "" : ports(entry.inputs, false) + ports(entry.outputs, true) + ports(signals, false) + ports(outputSignals, true)}${label ? `<rect x="${cx - 57}" y="${h - 54}" width="114" height="30" rx="9" fill="${blueprint ? "#426c96" : "#f5f6f3"}"/><text x="${cx}" y="${h - 32}" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="22" fill="${blueprint ? "#e1f4ff" : "#344550"}">${label}</text>` : ""}</svg>`;
    const value = uri(svg); cache.set(key, value); return value;
}
