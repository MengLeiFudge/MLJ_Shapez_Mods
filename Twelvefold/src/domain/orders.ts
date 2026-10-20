import { Shape, RAW_SHAPES, isDye } from "./shape.ts";
import { operate, type Operation, type OperationInputs } from "./operations.ts";
export const GENERATOR_VERSION = 1;
/** 固定算法的局部伪随机数，不依赖浏览器或全局随机状态。 */
export class Random {
    private state: number;
    constructor(seed: string | number) {
        let hash = 2166136261;
        for (const char of String(seed)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) }
        this.state = hash >>> 0;
    }
    next(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let value = this.state; value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }
    int(limit: number): number { return Math.floor(this.next() * limit) }
    pick<T>(values: readonly T[]): T { if (!values.length) throw new Error("Empty random selection"); return values[this.int(values.length)]! }
}
export interface Order { id: number; key: string; required: number; delivered: number; reward: number; generator: number }
/** 候选只来自合法主要加工，有限尝试后也使用经过同一加工入口的保底。 */
export function generateOrder(seed: number, id: number, previous: Shape | null): Order {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid order id");
    const random = new Random(`${seed}:${id}:${GENERATOR_VERSION}`);
    const cap = id <= 10 ? 2 : 3;
    const palette = id <= 10 ? "urgb" : id <= 30 ? "urgbycpw" : "roy lgmchbzpiwku".replace(/ /g, "");
    const operators: Operation[] = id <= 10 ? ["cut", "rotate", "swap", "stack", "paint"] : ["cut", "rotate", "swap", "stack", "paint", "smelt"];
    let target: Shape | null = null;
    for (let attempt = 0; attempt < 40 && !target; attempt++) {
        const pool: Shape[] = [...RAW_SHAPES];
        for (let step = 0; step < 20 + Math.min(id, 24); step++) {
            const operation = random.pick(operators);
            const input: OperationInputs = { shapes: [random.pick(pool), random.pick(pool)], dye: random.pick(["r", "g", "b"] as const), steps: random.int(12) };
            const result = operate(operation, input, cap);
            for (const product of result.canProcess ? result.products : []) {
                if (product && product.layers.every(layer => layer.every(slot => !slot || palette.includes(slot.color)))) {
                    pool.push(product); if (pool.length > 36) pool.splice(4, 1);
                }
            }
        }
        const candidates = pool.slice(4).filter(shape => !previous || !shape.equivalent(previous));
        if (candidates.length) target = random.pick(candidates);
    }
    if (!target) {
        for (const dye of ["r", "g", "b"] as const) {
            if (!isDye(dye)) continue;
            const candidate = operate("paint", { shapes: [RAW_SHAPES[0]], dye }, cap).products[0]!;
            if (!previous || !candidate.equivalent(previous)) { target = candidate; break }
        }
    }
    if (!target) throw new Error("Unable to generate a distinct legal order");
    return { id, key: target.key, required: Math.min(1000 + 100 * (id - 1), 4000), delivered: 0, reward: Math.min(20 + 2 * Math.floor((id - 1) / 5), 40), generator: GENERATOR_VERSION };
}
