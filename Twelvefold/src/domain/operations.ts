import { Shape, cut, rangeMask, swap, stack, paint, smelt, flipBlock, mirror, isDye, takeLayer, type Dye } from "./shape.ts";
export type Operation = "cut" | "sector1" | "sector2" | "sector3" | "cut3" | "cut4" | "cutSignal" | "rotate" | "swap" | "swapMirror" | "stack" | "stack3" | "delayer" | "paint" | "paint2" | "smelt" | "flipBlock" | "mirror";
export interface OperationInputs { shapes: readonly (Shape | null)[]; dye?: Dye | null; steps?: number | null; template?: Shape | null }
export interface OperationResult { valid: boolean; canProcess: boolean; products: readonly (Shape | null)[]; reason: "missing" | "limit" | null }
export const OPERATION_ARITY: Record<Operation, readonly [number, number]> = {
    cut: [1, 2], sector1: [1, 2], sector2: [1, 2], sector3: [1, 2], cut3: [1, 3], cut4: [1, 4], cutSignal: [1, 2], rotate: [1, 1],
    swap: [2, 2], swapMirror: [2, 2], stack: [2, 1], stack3: [3, 1], delayer: [1, 2], paint: [1, 1], paint2: [2, 2],
    smelt: [1, 1], flipBlock: [1, 1], mirror: [1, 1],
};
/** 实体机器与虚拟节点唯一的加工入口；空产品与拒绝加工分别表达。 */
export function operate(operation: Operation, input: OperationInputs, cap: number): OperationResult {
    const [count, outputs] = OPERATION_ARITY[operation];
    const invalid = (): OperationResult => ({ valid: false, canProcess: false, products: Array<null>(outputs).fill(null), reason: "missing" });
    if (input.shapes.length < count || input.shapes.slice(0, count).some(shape => !(shape instanceof Shape))) return invalid();
    if ((operation === "paint" || operation === "paint2") && !isDye(input.dye)) return invalid();
    if (operation === "rotate" && !Number.isSafeInteger(input.steps)) return invalid();
    if (operation === "cutSignal" && !(input.template instanceof Shape)) return invalid();
    const a = input.shapes[0]!, b = input.shapes[1]!, c = input.shapes[2]!;
    let products: (Shape | null)[];
    switch (operation) {
        case "cut": products = cut(a, [rangeMask(0, 6), rangeMask(6, 6)]); break;
        case "sector1": case "sector2": case "sector3": {
            const width = Number(operation.slice(-1)); products = cut(a, [rangeMask(0, width), rangeMask(width, 12 - width)]); break;
        }
        case "cut3": products = cut(a, [rangeMask(0, 4), rangeMask(4, 4), rangeMask(8, 4)]); break;
        case "cut4": products = cut(a, [rangeMask(0, 3), rangeMask(3, 3), rangeMask(6, 3), rangeMask(9, 3)]); break;
        case "cutSignal": {
            const mask = new Set(input.template!.layers[0]!.flatMap((slot, i) => slot ? [i] : []));
            products = cut(a, [mask, new Set(Array.from({ length: 12 }, (_, i) => i).filter(i => !mask.has(i)))]); break;
        }
        case "rotate": products = [a.rotate(input.steps!)]; break;
        case "swap": products = swap(a, b); break;
        case "swapMirror": products = swap(a, b, true); break;
        case "stack": products = [stack(a, b, cap)]; break;
        case "stack3": {
            const intermediate = stack(a, b, cap); products = [intermediate && stack(intermediate, c, cap)]; break;
        }
        case "delayer": products = [takeLayer(a, a.layers.length - 1), a.layers.length > 1 ? new Shape(a.layers.slice(0, -1)) : null]; break;
        case "paint": products = [paint(a, input.dye!)]; break;
        case "paint2": products = [paint(a, input.dye!), paint(b, input.dye!)]; break;
        case "smelt": products = [smelt(a)]; break;
        case "flipBlock": products = [flipBlock(a)]; break;
        case "mirror": products = [mirror(a)]; break;
    }
    const limited = (operation === "stack" || operation === "stack3") && !products[0];
    return { valid: true, canProcess: !limited, products, reason: limited ? "limit" : null };
}
