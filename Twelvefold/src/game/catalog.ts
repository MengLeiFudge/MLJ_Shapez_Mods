import { MACHINES, type MachineSpec } from "../domain/content.ts";
import { OPERATION_ARITY } from "../domain/operations.ts";

export type Side = "top" | "right" | "bottom" | "left";
/** 顺序就是加工/信号索引；镜像只移动坐标和方向，不重排角色。 */
export interface RolePort { role: string; x: number; y: number; side: Side; filter?: string }
export interface NodeSpec { kind: string; stage: number; inputs: readonly string[]; outputs: readonly string[]; label: string; constant?: boolean; research?: string }
export interface LogisticsSpec { kind: string; research: string; stage: number; inputs: readonly RolePort[]; outputs: readonly RolePort[]; height?: number; signal?: boolean; label: string }
export interface BuildingEntry {
    id: string; metaId: string; variant: string; layer: "regular" | "wires"; category: string;
    kind: "native" | "machine" | "logistics" | "circuit"; key: string; tip: string; label: string;
    width: number; height: number; stage: number; research?: string;
    inputs: readonly RolePort[]; outputs: readonly RolePort[]; signals: readonly RolePort[];
    machine?: MachineSpec; logistics?: LogisticsSpec; node?: NodeSpec;
}
export interface BuildingCategory { id: string; layer: "regular" | "wires"; digit: number; accent: string; buildings: readonly string[] }
const port = (role: string, side: Side, x = 0, y = 0, filter?: string): RolePort => ({ role, side, x, y, ...(filter ? { filter } : {}) });
export const LOGISTICS: readonly LogisticsSpec[] = [
    { kind: "merge", research: "merge", stage: 2, inputs: [port("main", "bottom"), port("sideA", "left"), port("sideB", "right")], outputs: [port("product", "top")], label: "3→1" },
    { kind: "split", research: "split", stage: 2, inputs: [port("main", "bottom")], outputs: [port("straight", "top"), port("sideA", "left"), port("sideB", "right")], label: "1→3" },
    { kind: "priority", research: "priority", stage: 3, inputs: [port("main", "bottom"), port("backup", "left")], outputs: [port("product", "top")], label: "!" },
    { kind: "filter", research: "filter", stage: 3, inputs: [port("main", "bottom")], outputs: [port("match", "left"), port("other", "right")], signal: true, label: "◇?" },
    { kind: "crossing", research: "crossing", stage: 6, inputs: [port("A", "bottom"), port("B", "left")], outputs: [port("A", "top"), port("B", "right")], label: "╳" },
    { kind: "smartTunnelIn", research: "smartTunnel", stage: 6, inputs: [port("main", "bottom"), port("sideA", "left"), port("sideB", "right")], outputs: [], label: "3↓" },
    { kind: "smartTunnelOut", research: "smartTunnel", stage: 6, inputs: [], outputs: [port("straight", "top"), port("sideA", "left"), port("sideB", "right")], label: "↑3" },
    { kind: "hyperline", research: "hyperlink", stage: 6, inputs: [], outputs: [], label: "⇔" },
    { kind: "hyperIn", research: "hyperlink", stage: 6, inputs: [port("main", "bottom", 0, 1), port("sideA", "left", 0, 1), port("sideB", "right", 0, 1)], outputs: [], height: 2, label: "3⇒" },
    { kind: "hyperOut", research: "hyperlink", stage: 6, inputs: [], outputs: [port("straight", "top"), port("sideA", "left"), port("sideB", "right")], height: 2, label: "⇒3" },
];
const orderOutputs = ["hasOrder", "orderId", "shape", "required", "delivered", "remaining"];
export const NODES: readonly NodeSpec[] = [
    { kind: "shapeConstant", stage: 3, inputs: [], outputs: ["shape"], label: "◇", constant: true },
    { kind: "boolConstant", stage: 3, inputs: [], outputs: ["boolean"], label: "0/1", constant: true },
    { kind: "compare", stage: 3, inputs: ["value", "value"], outputs: ["boolean"], label: "=" },
    { kind: "and", stage: 3, inputs: ["boolean", "boolean"], outputs: ["boolean"], label: "∧" },
    { kind: "or", stage: 3, inputs: ["boolean", "boolean"], outputs: ["boolean"], label: "∨" },
    { kind: "not", stage: 3, inputs: ["boolean"], outputs: ["boolean"], label: "¬" },
    { kind: "sensor", stage: 3, inputs: [], outputs: ["value"], label: "⊙" },
    { kind: "display", stage: 3, inputs: ["value"], outputs: [], label: "▣" },
    { kind: "integerConstant", stage: 6, inputs: [], outputs: ["integer"], label: "123", constant: true },
    { kind: "colorConstant", stage: 6, inputs: [], outputs: ["color"], label: "RGB", constant: true },
    { kind: "pieceConstant", stage: 6, inputs: [], outputs: ["piece"], label: "ENDA", constant: true },
    { kind: "layerCount", stage: 6, inputs: ["shape"], outputs: ["integer"], label: "#L" },
    { kind: "takeLayer", stage: 6, inputs: ["shape", "layer"], outputs: ["shape"], label: "L[i]" },
    { kind: "takeSlot", stage: 6, inputs: ["shape", "layer", "slot"], outputs: ["valid", "occupied", "piece", "color", "previous", "next", "shape"], label: "S[i]" },
    { kind: "add", stage: 6, inputs: ["integer", "integer"], outputs: ["integer"], label: "+" },
    { kind: "subtract", stage: 6, inputs: ["integer", "integer"], outputs: ["integer"], label: "−" },
    { kind: "multiply", stage: 6, inputs: ["integer", "integer"], outputs: ["integer"], label: "×" },
    { kind: "divide", stage: 6, inputs: ["integer", "integer"], outputs: ["integer"], label: "÷" },
    { kind: "modulo", stage: 6, inputs: ["integer", "integer"], outputs: ["integer"], label: "%" },
    { kind: "less", stage: 6, inputs: ["integer", "integer"], outputs: ["boolean"], label: "<" },
    { kind: "greater", stage: 6, inputs: ["integer", "integer"], outputs: ["boolean"], label: ">" },
    { kind: "select", stage: 6, inputs: ["boolean", "value", "value"], outputs: ["value"], label: "?:" },
    { kind: "register", stage: 6, inputs: ["value", "write", "clear"], outputs: ["value"], label: "R" },
    { kind: "rising", stage: 6, inputs: ["boolean"], outputs: ["boolean"], label: "↑" },
    { kind: "orderSource", stage: 6, inputs: [], outputs: orderOutputs, label: "MAM" },
    { kind: "orderRegister", stage: 6, inputs: ["write", "clear", ...orderOutputs], outputs: orderOutputs, label: "MAM R" },
    ...MACHINES.filter(spec => spec.id === "rotate" || spec.operation !== "rotate").map(spec => {
        const [count, outputs] = OPERATION_ARITY[spec.operation];
        const inputs = [...Array<string>(count).fill("shape")];
        if (spec.operation === "rotate") inputs.push("steps");
        if (spec.category === "painting") inputs.push("color");
        if (spec.operation === "cutSignal") inputs.push("template");
        return { kind: `virtual.${spec.id}`, stage: 6, inputs, outputs: ["valid", "canProcess", ...Array.from({ length: outputs }, () => ["hasProduct", "shape"]).flat()], label: "◇", ...(spec.research ? { research: spec.research } : {}) };
    }),
];
export const CATEGORIES: readonly BuildingCategory[] = [
    { id: "belt", layer: "regular", digit: 1, accent: "#659fa6", buildings: ["belt"] },
    { id: "flow", layer: "regular", digit: 2, accent: "#60ac95", buildings: ["balancer", "merger", "splitter", "merge", "split", "priority", "filter", "crossing"] },
    { id: "tunnel", layer: "regular", digit: 3, accent: "#a48bc1", buildings: ["tunnel1", "tunnel2", "smartTunnelIn", "smartTunnelOut", "hyperline", "hyperIn", "hyperOut"] },
    { id: "storage", layer: "regular", digit: 4, accent: "#829eae", buildings: ["storage"] },
    { id: "mining", layer: "regular", digit: 5, accent: "#c6a569", buildings: ["miner"] },
    { id: "cutting", layer: "regular", digit: 6, accent: "#c38578", buildings: ["cut", "sector1", "sector2", "sector3", "cut3", "cut4", "cutSignal"] },
    { id: "rotation", layer: "regular", digit: 7, accent: "#639abd", buildings: ["rotate", "rotateCCW", "rotate2", "rotateMinus2", "rotate3", "rotateMinus3", "rotate6"] },
    { id: "flipping", layer: "regular", digit: 8, accent: "#ba8baf", buildings: ["flipBlock", "mirror"] },
    { id: "combining", layer: "regular", digit: 9, accent: "#a8aa69", buildings: ["swap", "swapMirror", "stack", "stack3", "delayer"] },
    { id: "coloring", layer: "regular", digit: 0, accent: "#c68da4", buildings: ["paint", "paint2", "smelt"] },
    { id: "wire", layer: "wires", digit: 1, accent: "#659fa6", buildings: ["wire", "wireTunnel"] },
    { id: "constants", layer: "wires", digit: 2, accent: "#c6a569", buildings: ["shapeConstant", "boolConstant", "integerConstant", "colorConstant", "pieceConstant"] },
    { id: "sensing", layer: "wires", digit: 3, accent: "#829eae", buildings: ["sensor", "display"] },
    { id: "logic", layer: "wires", digit: 4, accent: "#60ac95", buildings: ["and", "or", "not", "compare", "select"] },
    { id: "arithmetic", layer: "wires", digit: 5, accent: "#639abd", buildings: ["add", "subtract", "multiply", "divide", "modulo", "less", "greater"] },
    { id: "analysis", layer: "wires", digit: 6, accent: "#ba8baf", buildings: ["layerCount", "takeLayer", "takeSlot"] },
    { id: "timing", layer: "wires", digit: 7, accent: "#a48bc1", buildings: ["register", "rising"] },
    { id: "orders", layer: "wires", digit: 8, accent: "#a8aa69", buildings: ["orderSource", "orderRegister"] },
    { id: "virtual", layer: "wires", digit: 9, accent: "#c38578", buildings: NODES.filter(node => node.kind.startsWith("virtual.")).map(node => node.kind) },
];
const labels: Record<string, string> = { cut: "½", rotate: "+30°", rotateCCW: "−30°", rotate2: "+60°", rotateMinus2: "−60°", rotate3: "+90°", rotateMinus3: "−90°", rotate6: "180°", swap: "⇆", swapMirror: "⇄", stack: "1+2", stack3: "1+2+3", delayer: "2→1", paint: "●", paint2: "●●", smelt: "∪", flipBlock: "↔", mirror: "⟷", sector1: "30°", sector2: "60°", sector3: "90°", cut3: "⅓", cut4: "¼", cutSignal: "½◇" };
const categoryOf = (id: string): string => {
    const category = CATEGORIES.find(category => category.buildings.includes(id));
    if (!category) throw new Error(`Uncategorized building: ${id}`);
    return category.id;
};
const native = (id: string, metaId: string, variant = "default", width = 1, stage = 1): BuildingEntry => ({ id, metaId, variant, width, height: 1, stage, category: categoryOf(id), layer: ["wire", "wireTunnel"].includes(id) ? "wires" : "regular", kind: "native", key: `native.${id}`, tip: "tip.native", label: id === "tunnel2" ? "II" : id === "merger" ? "2→1" : id === "splitter" ? "1→2" : "", inputs: id === "balancer" ? [port("A", "bottom"), port("B", "bottom", 1)] : id === "merger" ? [port("main", "bottom"), port("sideA", "right")] : [port("main", "bottom")], outputs: id === "balancer" ? [port("A", "top"), port("B", "top", 1)] : id === "splitter" ? [port("straight", "top"), port("sideA", "right")] : [port("product", "top")], signals: [] });
const machine = (spec: MachineSpec): BuildingEntry => {
    const [count, outputs] = OPERATION_ARITY[spec.operation], dye = spec.category === "painting";
    const inputRoles = spec.operation.startsWith("stack") ? ["base", "middle", "top"] : count > 1 ? ["A", "B", "C"] : ["main"];
    const outputRoles = spec.operation === "cut" ? ["rightHalf", "leftHalf"] : spec.operation.startsWith("sector") ? [`0–${Number(spec.operation.slice(-1)) - 1}`, `${Number(spec.operation.slice(-1))}–11`] : spec.operation === "cut3" ? ["0–3", "4–7", "8–11"] : spec.operation === "cut4" ? ["0–2", "3–5", "6–8", "9–11"] : spec.operation === "delayer" ? ["topLayer", "remainingLayers"] : spec.operation === "cutSignal" ? ["match", "other"] : ["A", "B", "C", "D"];
    return { id: spec.id, metaId: `tf_machine_${spec.id}`, variant: "default", kind: "machine", machine: spec, layer: "regular", category: categoryOf(spec.id), key: `machine.${spec.id}`, tip: `tip.${spec.operation}`, label: labels[spec.id]!, width: spec.width, height: 1, stage: spec.stage, ...(spec.research ? { research: spec.research } : {}),
        inputs: [...Array.from({ length: count }, (_, i) => port(inputRoles[i]!, "bottom", i, 0, "shape")), ...(dye ? [port("dye", "bottom", count, 0, "color")] : [])],
        outputs: Array.from({ length: outputs }, (_, i) => port(outputRoles[i]!, "top", i)), signals: spec.operation === "cutSignal" ? [port("template", "left")] : [] };
};
/** 工具栏、注册、端口、解锁和资源均只消费这份目录。原版建筑的实际组件仍归游戏所有。 */
export const BUILDINGS: readonly BuildingEntry[] = [
    native("belt", "belt"), native("balancer", "balancer", "default", 2), native("merger", "balancer", "merger"), native("splitter", "balancer", "splitter"),
    native("tunnel1", "underground_belt"), native("tunnel2", "underground_belt", "tier2", 1, 2), native("storage", "storage"), native("miner", "miner"),
    native("wire", "wire", "default", 1, 3), native("wireTunnel", "wire_tunnel", "default", 1, 3),
    ...MACHINES.map(machine),
    ...LOGISTICS.map(spec => ({ id: spec.kind, metaId: `tf_logistics_${spec.kind}`, variant: "default", kind: "logistics" as const, logistics: spec, layer: "regular" as const, category: categoryOf(spec.kind), key: `machine.${spec.kind}`, tip: `tip.${spec.kind}`, label: spec.label, width: 1, height: spec.height ?? 1, stage: spec.stage, research: spec.research, inputs: spec.inputs, outputs: spec.outputs, signals: spec.signal ? [port("template", "left")] : [] })),
    ...NODES.map(spec => ({ id: spec.kind, metaId: `tf_node_${spec.kind.replace(".", "_")}`, variant: "default", kind: "circuit" as const, node: spec, layer: "wires" as const, category: categoryOf(spec.kind), key: spec.kind.startsWith("virtual.") ? `machine.${spec.kind.slice(8)}` : `node.${spec.kind}`, tip: spec.kind.startsWith("virtual.") ? "tip.virtual" : "tip.circuits", label: spec.label, width: Math.max(1, spec.inputs.length, spec.outputs.length), height: 1, stage: spec.stage, ...(spec.research ? { research: spec.research } : {}), inputs: [], outputs: [], signals: [...spec.inputs.map((role, i) => port(role, "bottom", i)), ...spec.outputs.map((role, i) => port(role, "top", i))] })),
];
export const BUILDING_BY_ID = new Map(BUILDINGS.map(entry => [entry.id, entry]));
export function catalogEntry(metaId: string, variant: string): BuildingEntry | undefined {
    if (metaId === "miner") variant = "default";
    if (metaId === "balancer") variant = variant.replace("-inverse", "");
    return BUILDINGS.find(entry => entry.metaId === metaId && entry.variant === variant);
}
export function mirrorPort(port: RolePort, width: number, mirror: number): RolePort {
    return mirror ? { ...port, x: width - 1 - port.x, side: port.side === "left" ? "right" : port.side === "right" ? "left" : port.side } : port;
}
export function hasMirror(entry: BuildingEntry): boolean { return entry.kind !== "native" || ["merger", "splitter"].includes(entry.id) }
export function mirrorChangesPorts(entry: BuildingEntry): boolean {
    return [...entry.inputs, ...entry.outputs, ...entry.signals].some(port => { const mapped = mirrorPort(port, entry.width, 1); return mapped.x !== port.x || mapped.side !== port.side });
}
