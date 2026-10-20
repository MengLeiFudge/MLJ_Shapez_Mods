import { Shape } from "./shape.ts";
import { MILESTONES, BLUEPRINTS, RESEARCH, SPEED_CATEGORIES, type Goal, type Research, type SpeedCategory } from "./content.ts";
import { generateOrder, type Order } from "./orders.ts";
export const SAVE_VERSION = 2;
export interface Tier { level: number; delivered: bigint }
export interface ProgressEvent { kind: "milestone" | "side" | "tier" | "order" | "purchase"; id: string; reward: number }
export interface ProgressSave {
    version: number; seed: number; stage: number; science: string; blueprintTenths: string;
    main: number[][]; sides: Record<string, number>; tiers: { level: number; delivered: string }[];
    purchased: string[]; speeds: Record<SpeedCategory, number>; order: Order | null; history: string[];
    seenBuildings: string[]; guideSteps: boolean[]; guideDismissed: boolean;
}
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error("Invalid saved integer");
    return value;
};
const natural = (value: unknown): bigint => {
    if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Invalid saved balance");
    return BigInt(value);
};
/** 档位严格从未取整基数计算，避免逐档取整和浮点漂移。 */
export function tierRequirement(stage: number, level: number): bigint {
    const base = BigInt(MILESTONES[stage - 1]!.tierBase), exponent = BigInt(level - 1);
    const numerator = base * 3n ** exponent, denominator = 50n * 2n ** exponent;
    return ((numerator + denominator - 1n) / denominator) * 50n;
}
/** 一份存档的实时账本；每次交付在入口转移前同步结算。 */
export class Progress {
    readonly seed: number;
    stage = 1;
    science = 0n;
    blueprintTenths = 0n;
    main = MILESTONES.map(m => m.goals.map(() => 0));
    sides: Record<string, number> = {};
    tiers: Tier[] = MILESTONES.map(() => ({ level: 1, delivered: 0n }));
    purchased = new Set<string>();
    speeds: Record<SpeedCategory, number> = { belt: 0, mining: 0, processing: 0, painting: 0 };
    order: Order | null = null;
    history: string[] = [];
    seenBuildings = new Set<string>();
    guideSteps = Array<boolean>(6).fill(false);
    guideDismissed = false;
    /** 观察已发生的操作；已完成步骤不再增加账本版本。 */
    observeGuide(step: number): void { if (!this.guideSteps[step]) { this.guideSteps[step] = true; this.revision++ } }
    markBuildingSeen(id: string): void { if (!this.seenBuildings.has(id)) { this.seenBuildings.add(id); this.revision++ } }
    revision = 0;
    readonly events: ProgressEvent[] = [];
    private historyKeys = new Set<string>();
    constructor(seed: number) { this.seed = integer(seed, 0, 0xffffffff) }
    get cap(): number { return this.stage >= 6 ? 3 : this.stage >= 3 ? 2 : 1 }
    get freeplay(): boolean { return this.stage === 7 }
    multiplier(category: SpeedCategory): number { return 1 + .5 * this.speeds[category] }
    unlocked(stage: number, research?: string): boolean { return this.stage >= stage && (!research || this.purchased.has(research)) }
    activeSides(): Goal[] {
        return MILESTONES.filter(m => m.stage <= this.stage).flatMap(m => m.sides.flatMap(group => {
            const active = group.find(goal => (this.sides[goal.id] ?? 0) < goal.required); return active ? [active] : [];
        }));
    }
    canDeliver(shape: Shape): boolean {
        const key = shape.canonical;
        return BLUEPRINTS.some(b => b.stage <= this.stage && b.shape.canonical === key)
            || MILESTONES.some(m => m.stage < this.stage && m.representative.canonical === key)
            || (!this.freeplay && MILESTONES[this.stage - 1]!.goals.some(goal => goal.shape.canonical === key))
            || this.activeSides().some(goal => goal.shape.canonical === key)
            || this.historyKeys.has(key);
    }
    deliver(shape: Shape): boolean {
        if (!this.canDeliver(shape)) return false;
        const key = shape.canonical, stage = this.stage, oldOrder = this.order;
        const sideSnapshot = this.activeSides();
        for (const blueprint of BLUEPRINTS) if (blueprint.stage <= stage && blueprint.shape.canonical === key) this.blueprintTenths += BigInt(blueprint.value * 10);
        for (const m of MILESTONES) if (m.stage < stage && m.representative.canonical === key) {
            const tier = this.tiers[m.stage - 1]!; tier.delivered++;
            while (tier.delivered >= tierRequirement(m.stage, tier.level)) {
                tier.delivered -= tierRequirement(m.stage, tier.level); tier.level++; this.science += BigInt(m.tierReward);
                this.events.push({ kind: "tier", id: String(m.stage), reward: m.tierReward });
            }
        }
        for (const goal of sideSnapshot) if (goal.shape.canonical === key) {
            const count = (this.sides[goal.id] ?? 0) + 1; this.sides[goal.id] = count;
            if (count === goal.required) { this.science += BigInt(goal.reward); this.events.push({ kind: "side", id: goal.id, reward: goal.reward }) }
        }
        if (stage <= 6) {
            const m = MILESTONES[stage - 1]!;
            m.goals.forEach((goal, i) => { if (goal.shape.canonical === key) this.main[stage - 1]![i] = Math.min(goal.required, this.main[stage - 1]![i]! + 1) });
            if (m.goals.every((goal, i) => this.main[stage - 1]![i]! >= goal.required)) {
                this.stage++; this.events.push({ kind: "milestone", id: String(stage), reward: 0 });
                if (this.freeplay) this.publishOrder(1, null);
            }
        }
        if (oldOrder && this.order === oldOrder && Shape.parse(oldOrder.key).canonical === key) {
            oldOrder.delivered++;
            if (oldOrder.delivered >= oldOrder.required) {
                this.science += BigInt(oldOrder.reward); this.events.push({ kind: "order", id: String(oldOrder.id), reward: oldOrder.reward });
                this.publishOrder(oldOrder.id + 1, Shape.parse(oldOrder.key));
            }
        }
        this.revision++; return true;
    }
    private publishOrder(id: number, previous: Shape | null): void {
        this.order = generateOrder(this.seed, id, previous);
        this.history.push(this.order.key); this.historyKeys.add(Shape.parse(this.order.key).canonical);
    }
    available(research: Research): boolean {
        return this.stage >= research.stage && !this.purchased.has(research.id)
            && (!research.speed || this.speeds[research.speed] + 1 === research.level);
    }
    buy(id: string): boolean {
        const research = RESEARCH.find(item => item.id === id);
        if (!research || !this.available(research) || this.science < BigInt(research.price)) return false;
        this.science -= BigInt(research.price); this.purchased.add(id);
        if (research.speed) this.speeds[research.speed] = research.level!;
        this.events.push({ kind: "purchase", id, reward: 0 }); this.revision++; return true;
    }
    spendBlueprint(tenths: bigint): boolean {
        if (tenths < 0n || this.blueprintTenths < tenths) return false;
        this.blueprintTenths -= tenths; this.revision++; return true;
    }
    serialize(): ProgressSave {
        return { version: SAVE_VERSION, seed: this.seed, stage: this.stage, science: this.science.toString(), blueprintTenths: this.blueprintTenths.toString(),
            main: this.main.map(values => [...values]), sides: { ...this.sides }, tiers: this.tiers.map(tier => ({ level: tier.level, delivered: tier.delivered.toString() })),
            purchased: [...this.purchased], speeds: { ...this.speeds }, order: this.order && { ...this.order }, history: [...this.history],
            seenBuildings: [...this.seenBuildings], guideSteps: [...this.guideSteps], guideDismissed: this.guideDismissed };
    }
    static restore(value: unknown): Progress {
        if (!value || typeof value !== "object") throw new Error("Missing Twelvefold save data");
        const data = value as Partial<ProgressSave>;
        if (data.version !== SAVE_VERSION) throw new Error("Unsupported Twelvefold save version");
        const result = new Progress(integer(data.seed, 0, 0xffffffff));
        result.stage = integer(data.stage, 1, 7); result.science = natural(data.science); result.blueprintTenths = natural(data.blueprintTenths);
        if (!Array.isArray(data.seenBuildings) || data.seenBuildings.length > 512 || data.seenBuildings.some(id => typeof id !== "string" || !/^[A-Za-z][A-Za-z0-9.]*$/.test(id)) || !Array.isArray(data.guideSteps) || data.guideSteps.length !== 6 || data.guideSteps.some(step => typeof step !== "boolean") || typeof data.guideDismissed !== "boolean") throw new Error("Invalid saved guide state");
        result.seenBuildings = new Set(data.seenBuildings); result.guideSteps = [...data.guideSteps]; result.guideDismissed = data.guideDismissed;
        if (!Array.isArray(data.main) || data.main.length !== 6 || !Array.isArray(data.tiers) || data.tiers.length !== 6 || !data.sides || typeof data.sides !== "object") throw new Error("Invalid saved goals");
        result.main = MILESTONES.map((m, index) => {
            const row = data.main![index]; if (!Array.isArray(row) || row.length !== 5) throw new Error("Invalid saved milestone");
            return m.goals.map((goal, i) => integer(row[i], 0, goal.required));
        });
        for (const m of MILESTONES) for (const group of m.sides) for (const goal of group) result.sides[goal.id] = integer(data.sides[goal.id] ?? 0, 0, goal.required);
        result.tiers = data.tiers.map(tier => ({ level: integer(tier.level, 1), delivered: natural(tier.delivered) }));
        if (!Array.isArray(data.purchased) || !data.speeds || typeof data.speeds !== "object" || !Array.isArray(data.history)) throw new Error("Invalid saved research");
        for (const id of data.purchased) { if (typeof id !== "string" || !RESEARCH.some(item => item.id === id)) throw new Error("Unknown saved research"); result.purchased.add(id) }
        for (const category of SPEED_CATEGORIES) result.speeds[category] = integer(data.speeds[category], 0, 10);
        result.history = data.history.map(key => Shape.parse(key).key); result.historyKeys = new Set(result.history.map(key => Shape.parse(key).canonical));
        if (data.order) {
            const order = data.order;
            result.order = { id: integer(order.id, 1), key: Shape.parse(order.key).key, required: integer(order.required, 1), delivered: integer(order.delivered, 0, order.required), reward: integer(order.reward, 0), generator: integer(order.generator, 1) };
            if (result.order.id !== result.history.length || result.history[result.history.length - 1] !== result.order.key || result.order.delivered >= result.order.required) throw new Error("Inconsistent published order history");
        }
        if (result.freeplay !== !!result.order || (!result.freeplay && result.history.length)) throw new Error("Inconsistent saved order state");
        for (const m of MILESTONES) {
            const counts = result.main[m.stage - 1]!;
            if (m.stage < result.stage && !m.goals.every((goal, i) => counts[i] === goal.required)) throw new Error("Incomplete saved milestone");
            if (m.stage > result.stage && counts.some(Boolean)) throw new Error("Locked milestone contains deliveries");
            const tier = result.tiers[m.stage - 1]!;
            if (tier.delivered >= tierRequirement(m.stage, tier.level) || (m.stage >= result.stage && (tier.level !== 1 || tier.delivered !== 0n))) throw new Error("Inconsistent representative tier");
            for (const group of m.sides) {
                let blocked = m.stage > result.stage;
                for (const goal of group) {
                    const count = result.sides[goal.id]!;
                    if (blocked && count) throw new Error("Locked side goal contains deliveries");
                    if (count < goal.required) blocked = true;
                }
            }
        }
        for (const research of RESEARCH) {
            const purchased = result.purchased.has(research.id);
            if (purchased && research.stage > result.stage) throw new Error("Locked research has been purchased");
            if (research.speed && purchased !== (research.level! <= result.speeds[research.speed])) throw new Error("Inconsistent saved speed upgrades");
        }
        return result;
    }
}
