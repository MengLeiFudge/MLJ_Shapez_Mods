import { Shape, pattern, ring, type Color, type Layer, type Slot } from "./shape.ts";
import type { Operation } from "./operations.ts";
export type SpeedCategory = "belt" | "mining" | "processing" | "painting";
/** 目标身份与稳定图形；主线只推进阶段，支线 reward 自动计入科研。 */
export interface Goal { id: string; name: string; shape: Shape; required: number; reward: number }
/** 五个并行主线与两组顺序支线；完成后 representative 开启独立科研档位。 */
export interface Milestone { stage: number; goals: readonly Goal[]; sides: readonly (readonly Goal[])[]; representative: Shape; tierBase: number; tierReward: number }
/** 辅助研究互不作为付费前置；带 speed 的项目必须先购买同类前一级。 */
export interface Research { id: string; stage: number; price: number; speed?: SpeedCategory; level?: number }
/** 进入对应阶段后永久开放的蓝图币形；value 是每件的蓝图点面值。 */
export interface BlueprintCurrency { id: string; stage: number; shape: Shape; value: number }
const single = (text: string, color: Color = "u"): Shape => new Shape([pattern(text, color)]);
const layers = (...items: (Shape | Layer)[]): Shape => new Shape(items.flatMap(item => item instanceof Shape ? item.layers : [item]));
const tinted = (shape: Shape, color: Color): Shape => new Shape(shape.layers.map(layer => layer.map(slot => slot && { ...slot, color })));
const multicolor = (...segments: readonly [string, Color][]): Shape => {
    const result: (Slot | null)[] = [];
    for (const [text, color] of segments) result.push(...pattern(text, color).slice(0, text.replace(/\|/g, "").length));
    while (result.length < 12) result.push(null);
    return new Shape([result]);
};
const circle = ring("E"), triangle = ring("DNNA");
const K = single("EEE---EEE"), Kr = tinted(K, "r");
const U = Shape.parse("nunuauDununuaudunuNuaudu");
const T = multicolor(["DNNADN", "b"], ["NADNNA", "g"]);
const C = multicolor(["EEEEEE", "r"], ["EEEEEE", "g"]);
const F = single("EEE|DNN|NNA|EEE");
const R = layers(single("EEE|DNN"), single("NNA"));
const L = layers(single("EEE|NAD"), single("ADN"));
const R4 = layers(multicolor(["EEE", "r"], ["DNN", "b"]), single("NNA", "g"));
const L4 = layers(multicolor(["EEE", "r"], ["NAD", "g"]), single("ADN", "b"));
const R5 = layers(single("EEEDNN", "p"), single("NNA", "g"));
const L5 = layers(single("EEENAD", "y"), single("ADN", "b"));
const R6 = layers(R5, single("EEEEEE", "w"));
const L6 = layers(L5, single("EEEEEE", "w"));
const main = (stage: number, shapes: readonly Shape[], amounts: readonly number[], names: readonly string[]): Goal[] => shapes.map((shape, i) => ({ id: `m${stage}.${i}`, name: names[i]!, shape, required: amounts[i]!, reward: 0 }));
const side = (stage: number, group: number, shapes: readonly Shape[], amounts: readonly number[], rewards: readonly number[]): Goal[] => shapes.map((shape, i) => ({ id: `s${stage}.${group}.${i}`, name: `side.${stage}.${group}`, shape, required: amounts[i]!, reward: rewards[i]! }));
const milestone = (stage: number, goals: Goal[], sides: Goal[][], tierBase: number, tierReward: number): Milestone => ({ stage, goals, sides, representative: goals[4]!.shape, tierBase, tierReward });
export const MILESTONES: readonly Milestone[] = [
    milestone(1, main(1, [single("EEEEEE"), single("E"), single("EN"), single("D"), single("DNNA")], [40, 60, 60, 60, 100], ["goal.half", "goal.sector", "goal.step", "goal.slope", "goal.representative"]), [
        side(1, 0, [single("N"), single("NN"), single("NNA")], [60, 90, 120], [2, 3, 5]),
        side(1, 1, [single("A"), single("DA"), single("ENE")], [60, 90, 120], [2, 3, 5]),
    ], 100, 2),
    milestone(2, main(2, [single("EEEEEE|DNNADN"), single("EEEEEE|NADNNA"), single("EEE|DNN"), single("NNA|EEE"), F], [100, 100, 150, 150, 200], ["T1", "T2", "P", "S", "goal.representative"]), [
        side(2, 0, [single("EEEEEE|ENEENE"), single("EEE|ENE"), single("EEE|ENE|EEE|ENE")], [120, 180, 240], [4, 6, 10]),
        side(2, 1, [single("EEEEEE|DADADA"), single("DA----DA"), single("DA--DA--DA")], [120, 180, 240], [4, 6, 10]),
    ], 200, 3),
    milestone(3, main(3, [K, layers(K, K), layers(K, U), R, L], [150, 150, 200, 250, 300], ["K", "K:K", "H", "R", "goal.representative"]), [
        side(3, 0, [layers(single("E"), single("DNNA")), layers(single("E-----E"), single("DNNA--DNNA")), layers(single("E---E---E"), single("DA--DA--DA"))], [180, 270, 360], [6, 10, 14]),
        side(3, 1, [layers(circle, triangle), layers(triangle, circle), layers(triangle, K)], [180, 270, 360], [6, 10, 14]),
    ], 300, 5),
    milestone(4, main(4, [ring("E", "r"), T, layers(Kr, U), layers(Kr, tinted(U, "b")), L4], [200, 250, 250, 300, 400], ["goal.red", "T", "Kᵣ:U", "Kᵣ:Uᵦ", "goal.representative"]), [
        side(4, 0, [C, multicolor(["EEE", "r"], ["EEE", "g"], ["EEE", "b"], ["EEE", "g"]), multicolor(["EE", "r"], ["EE", "g"], ["EE", "b"], ["EE", "r"], ["EE", "g"], ["EE", "b"])], [240, 360, 480], [8, 12, 20]),
        side(4, 1, [layers(C, K), layers(C, tinted(K, "b")), layers(C, tinted(K, "g"))], [240, 360, 480], [8, 12, 20]),
    ], 400, 8),
    milestone(5, main(5, [ring("EEEDNNNNAEEE"), ring("EEEDNNNNAEEE", "r"), ring("E", "o"), multicolor(["EE----", "y"], ["EEE---", "o"]), L5], [300, 300, 400, 400, 500], ["goal.grayRing", "goal.redRing", "goal.orange", "goal.twoBlocks", "goal.representative"]), [
        side(5, 0, [single("EE", "k"), single("ENA"), single("ENA", "k")], [300, 450, 600], [10, 15, 25]),
        side(5, 1, [ring("E", "w"), multicolor(["EEE---", "l"], ["EEE---", "h"]), multicolor(["EEE-", "m"], ["EEE-", "z"], ["EEE-", "i"])], [300, 450, 600], [10, 15, 25]),
    ], 500, 12),
    milestone(6, main(6, [layers(K, K, K), layers(Kr, tinted(K, "g"), tinted(K, "b")), layers(Kr, T.rotate(3), ring("E", "w")), R6, L6], [400, 400, 500, 600, 700], ["K:K:K", "Kᵣ:Kᵍ:Kᵦ", "J", "R6", "goal.representative"]), [
        side(6, 0, [layers(circle, K, ring("E", "c")), layers(single("EEEEEE"), single("EEE"), single("EEEEEE", "c")), layers(single("EEEEEE|EEEEEE"), K, single("EEEEEE|EEEEEE", "c"))], [360, 540, 720], [12, 18, 30]),
        side(6, 1, [layers(triangle, single("EEEE", "w"), single("DNNA", "c")), layers(triangle, single("EEEE", "c"), single("DNNA", "w")), layers(triangle, single("EEEE", "k"), single("DNNA", "w"))], [360, 540, 720], [12, 18, 30]),
    ], 700, 20),
];
export const BLUEPRINTS: readonly BlueprintCurrency[] = [
    { id: "DN", stage: 1, shape: single("DN"), value: 1 }, { id: "NA", stage: 1, shape: single("NA"), value: 1 },
    { id: "B", stage: 2, shape: single("ADN|EEE|EEE|NAD"), value: 3 }, { id: "R", stage: 3, shape: R, value: 5 },
    { id: "R4", stage: 4, shape: R4, value: 8 }, { id: "R5", stage: 5, shape: R5, value: 12 }, { id: "R6", stage: 6, shape: R6, value: 20 },
];
const auxiliary: readonly [string, number, number][] = [
    ["rotateCCW", 1, 4], ["sector1", 1, 6], ["swapMirror", 2, 4], ["sector2", 2, 6], ["sector3", 2, 6], ["merge", 2, 3], ["split", 2, 3],
    ["delayer", 3, 8], ["priority", 3, 4], ["filter", 3, 6], ["rotate2", 3, 3], ["rotateMinus2", 3, 3], ["rotate3", 3, 3], ["rotateMinus3", 3, 3], ["rotate6", 3, 4],
    ["paint2", 4, 10], ["flipBlock", 5, 6], ["mirror", 5, 6], ["cut3", 5, 6], ["cut4", 5, 6], ["chainMiner", 5, 8],
    ["stack3", 6, 8], ["hyperlink", 6, 12], ["cutSignal", 6, 8], ["crossing", 6, 4], ["smartTunnel", 6, 4],
];
export const SPEED_PRICES = [3, 5, 8, 12, 16, 20, 30, 40, 50, 60] as const;
export const SPEED_CATEGORIES: readonly SpeedCategory[] = ["belt", "mining", "processing", "painting"];
export const RESEARCH: readonly Research[] = [
    ...auxiliary.map(([id, stage, price]) => ({ id, stage, price })),
    ...SPEED_CATEGORIES.flatMap(speed => SPEED_PRICES.map((price, i) => ({ id: `${speed}.${i + 1}`, stage: i >= 6 ? 7 : speed === "painting" ? Math.max(4, i + 1) : i + 1, price, speed, level: i + 1 }))),
];
/** ratio 按每次完整操作计，相对于固定 B0，与出口数量及传送速度研究独立。 */
export interface MachineSpec { id: string; operation: Operation; stage: number; research?: string; width: number; ratio: number; category: SpeedCategory; steps?: number }
const machine = (id: string, operation: Operation, stage: number, width: number, ratio: number, research?: string, steps?: number): MachineSpec => ({ id, operation, stage, width, ratio, category: operation.startsWith("paint") ? "painting" : "processing", ...(research ? { research } : {}), ...(steps !== undefined ? { steps } : {}) });
export const MACHINES: readonly MachineSpec[] = [
    machine("cut", "cut", 1, 2, 1 / 4), machine("rotate", "rotate", 1, 1, 1, undefined, 1), machine("swap", "swap", 2, 2, 1 / 4),
    machine("stack", "stack", 3, 2, 1 / 8), machine("paint", "paint", 4, 2, 1 / 6), machine("smelt", "smelt", 5, 1, 1 / 6),
    machine("rotateCCW", "rotate", 1, 1, 1, "rotateCCW", -1), machine("rotate2", "rotate", 3, 1, 1, "rotate2", 2), machine("rotateMinus2", "rotate", 3, 1, 1, "rotateMinus2", -2),
    machine("rotate3", "rotate", 3, 1, 1, "rotate3", 3), machine("rotateMinus3", "rotate", 3, 1, 1, "rotateMinus3", -3), machine("rotate6", "rotate", 3, 1, 1, "rotate6", 6),
    machine("sector1", "sector1", 1, 2, 1 / 4, "sector1"), machine("sector2", "sector2", 2, 2, 1 / 4, "sector2"), machine("sector3", "sector3", 2, 2, 1 / 4, "sector3"),
    machine("swapMirror", "swapMirror", 2, 2, 1 / 4, "swapMirror"), machine("delayer", "delayer", 3, 2, 1 / 4, "delayer"), machine("paint2", "paint2", 4, 3, 1 / 6, "paint2"),
    machine("flipBlock", "flipBlock", 5, 1, 1 / 3, "flipBlock"), machine("mirror", "mirror", 5, 1, 1 / 3, "mirror"), machine("cut3", "cut3", 5, 3, 1 / 4, "cut3"), machine("cut4", "cut4", 5, 4, 1 / 4, "cut4"),
    machine("stack3", "stack3", 6, 3, 1 / 8, "stack3"), machine("cutSignal", "cutSignal", 6, 2, 1 / 4, "cutSignal"),
];
