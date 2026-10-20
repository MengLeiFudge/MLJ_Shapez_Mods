export const SLOT_COUNT = 12;
export const PIECES = ["E", "N", "D", "A"] as const;
export type Piece = (typeof PIECES)[number];
export const COLORS = ["r", "o", "y", "l", "g", "m", "c", "h", "b", "z", "p", "i", "w", "k", "u"] as const;
export type Color = (typeof COLORS)[number];
export type Dye = "r" | "g" | "b";
/** seam 表示本槽与逆时针前槽之间的切缝；空槽不是材料。 */
export interface Slot { readonly piece: Piece; readonly color: Color; readonly seam: boolean }
export type Layer = readonly (Slot | null)[];
export const RGB: Partial<Record<Color, readonly [number, number, number]>> = {
    r: [6, 0, 0], o: [4, 2, 0], y: [3, 3, 0], l: [2, 4, 0], g: [0, 6, 0], m: [0, 4, 2],
    c: [0, 3, 3], h: [0, 2, 4], b: [0, 0, 6], z: [2, 0, 4], p: [3, 0, 3], i: [4, 0, 2], w: [2, 2, 2],
};
export const COLOR_HEX: Record<Color, string> = {
    r: "#f34d55", o: "#ed923c", y: "#eee052", l: "#a5d64b", g: "#57c75b", m: "#46cf9d", c: "#46cbd3",
    h: "#60a9e8", b: "#527de4", z: "#815ad7", p: "#ba5dcf", i: "#e76b9c", w: "#f2f0e7", k: "#353540", u: "#aaaeb9",
};
export const mod12 = (n: number): number => ((n % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
export const emptyLayer = (): (Slot | null)[] => Array<Slot | null>(SLOT_COUNT).fill(null);
export const occupied = (layer: Layer): boolean => layer.some(Boolean);
const isPiece = (value: string): value is Piece => (PIECES as readonly string[]).includes(value);
export const isColor = (value: unknown): value is Color => typeof value === "string" && (COLORS as readonly string[]).includes(value);
export const isDye = (value: unknown): value is Dye => value === "r" || value === "g" || value === "b";

/** 不可变图形；短码保持绝对朝向，canonical 仅用于交付用途索引。 */
export class Shape {
    readonly layers: readonly Layer[];
    readonly key: string;
    private canonicalKey?: string;
    constructor(layers: readonly Layer[]) {
        if (!layers.length || layers.length > 3) throw new Error("Invalid layer count");
        this.layers = Object.freeze(layers.map(layer => {
            if (layer.length !== SLOT_COUNT || !occupied(layer)) throw new Error("Invalid twelve-slot layer");
            return Object.freeze(layer.map((slot, i) => {
                if (!slot) return null;
                if (!isPiece(slot.piece) || !isColor(slot.color) || typeof slot.seam !== "boolean") throw new Error("Invalid material");
                if (!slot.seam && !layer[mod12(i - 1)]) throw new Error("Connection to an empty slot");
                return Object.freeze({ ...slot });
            }));
        }));
        this.key = this.layers.map(layer => layer.map(slot => slot ? (slot.seam ? slot.piece : slot.piece.toLowerCase()) + slot.color : "--").join("")).join(":");
    }
    static parse(key: string): Shape {
        if (typeof key !== "string" || key.length > 74) throw new Error("Invalid shape code");
        const layers = key.split(":").map(text => {
            if (text.length !== 24) throw new Error("Expected twelve slots");
            return Array.from({ length: SLOT_COUNT }, (_, i): Slot | null => {
                const code = text.slice(i * 2, i * 2 + 2);
                if (code === "--") return null;
                const letter = code[0]!;
                const piece = letter.toUpperCase();
                const color = code[1]!;
                if (!isPiece(piece) || !isColor(color) || !/[ENDAenda]/.test(letter)) throw new Error("Invalid shape code");
                return { piece, color, seam: letter === piece };
            });
        });
        return new Shape(layers);
    }
    rotate(steps: number): Shape {
        if (!Number.isSafeInteger(steps)) throw new Error("Rotation must be an integer");
        const shift = mod12(steps);
        if (!shift) return this;
        return new Shape(this.layers.map(layer => Array.from({ length: SLOT_COUNT }, (_, i) => layer[mod12(i - shift)]!)));
    }
    get canonical(): string {
        return this.canonicalKey ??= Array.from({ length: SLOT_COUNT }, (_, i) => this.rotate(i).key).sort()[0]!;
    }
    equivalent(other: Shape): boolean { return this.canonical === other.canonical }
}

/** 返回环上的最大连续块，块内索引依顺时针排列。 */
export function blocks(layer: Layer): number[][] {
    const starts = layer.flatMap((slot, i) => slot && (slot.seam || !layer[mod12(i - 1)]) ? [i] : []);
    if (!starts.length) return occupied(layer) ? [Array.from({ length: SLOT_COUNT }, (_, i) => i)] : [];
    return starts.map(start => {
        const result = [start];
        for (let n = 1; n < SLOT_COUNT; n++) {
            const next = mod12(start + n), slot = layer[next];
            if (!slot || slot.seam) break;
            result.push(next);
        }
        return result;
    });
}

/** 各层由下向上结算；下落块在接触处保留切缝，不把不同块焊接。 */
function settledLayers(layers: readonly Layer[]): Layer[] {
    const result = layers.map(() => emptyLayer());
    for (let level = 0; level < layers.length; level++) {
        const source = layers[level]!;
        for (const block of blocks(source)) {
            let target = level;
            while (target > 0 && !block.some(i => result[target - 1]![i])) target--;
            const dest = result[target]!;
            for (const i of block) {
                if (dest[i]) throw new Error("Overlapping material while settling");
                dest[i] = { ...source[i]! };
            }
            const first = block[0]!, last = block[block.length - 1]!;
            if (block.length !== SLOT_COUNT || source[first]!.seam) {
                dest[first] = { ...dest[first]!, seam: true };
                const next = mod12(last + 1);
                if (dest[next]) dest[next] = { ...dest[next]!, seam: true };
            }
        }
    }
    return result.filter(occupied);
}
export function settle(layers: readonly Layer[]): Shape | null {
    const result = settledLayers(layers);
    return result.length ? new Shape(result) : null;
}

/** 掩码只在被截断的连接处新增切缝；保留原有切缝。 */
export function maskedLayers(shape: Shape, mask: ReadonlySet<number>): Layer[] {
    return shape.layers.map(layer => layer.map((slot, i) => !slot || !mask.has(i) ? null : {
        ...slot, seam: slot.seam || !mask.has(mod12(i - 1)) || !layer[mod12(i - 1)],
    }));
}
export function cut(shape: Shape, masks: readonly ReadonlySet<number>[]): (Shape | null)[] {
    return masks.map(mask => settle(maskedLayers(shape, mask)));
}
export const rangeMask = (start: number, count: number): Set<number> => new Set(Array.from({ length: count }, (_, i) => mod12(start + i)));
export function stack(bottom: Shape, top: Shape, cap: number): Shape | null {
    const result = settledLayers([...bottom.layers, ...top.layers]);
    return result.length && result.length <= cap ? new Shape(result) : null;
}
export function swap(a: Shape, b: Shape, right = false): (Shape | null)[] {
    const exchange = rangeMask(right ? 0 : 6, 6), keep = rangeMask(right ? 6 : 0, 6);
    const aKeep = maskedLayers(a, keep), aExchange = maskedLayers(a, exchange);
    const bKeep = maskedLayers(b, keep), bExchange = maskedLayers(b, exchange);
    const join = (left: Layer[], other: Layer[]): Shape | null => settle(Array.from({ length: Math.max(left.length, other.length) }, (_, level) =>
        Array.from({ length: SLOT_COUNT }, (_, i) => left[level]?.[i] ?? other[level]?.[i] ?? null)));
    return [join(aKeep, bExchange), join(bKeep, aExchange)];
}
export function paint(shape: Shape, dye: Dye): Shape {
    return new Shape(shape.layers.map((layer, level) => level === shape.layers.length - 1 ? layer.map(slot => slot && { ...slot, color: dye }) : layer));
}
export function mixedColor(slots: readonly Slot[]): Color {
    if (slots.some(slot => slot.color === "k")) return "k";
    if (slots.some(slot => slot.color === "u")) return "u";
    const total = [0, 0, 0];
    for (const slot of slots) RGB[slot.color]!.forEach((value, i) => { total[i] = total[i]! + value });
    return COLORS.find(color => RGB[color]?.every((value, i) => value * slots.length === total[i])) ?? "k";
}
export function smelt(shape: Shape): Shape {
    return new Shape(shape.layers.map(layer => {
        const dest = layer.map((slot, i) => slot && { ...slot, seam: !layer[mod12(i - 1)] });
        for (const block of blocks(dest)) {
            const color = mixedColor(block.map(i => dest[i]!));
            for (const i of block) dest[i] = { ...dest[i]!, color };
        }
        return dest;
    }));
}
const mirrorPiece = (piece: Piece): Piece => piece === "D" ? "A" : piece === "A" ? "D" : piece;
export function mirror(shape: Shape): Shape {
    return new Shape(shape.layers.map(layer => Array.from({ length: SLOT_COUNT }, (_, i) => {
        const source = SLOT_COUNT - 1 - i, slot = layer[source];
        return slot ? { ...slot, piece: mirrorPiece(slot.piece), seam: !layer[mod12(source + 1)] || layer[mod12(source + 1)]!.seam } : null;
    })));
}
export function flipBlock(shape: Shape): Shape {
    return new Shape(shape.layers.map(layer => {
        if (!layer[0] || layer.every(slot => slot && !slot.seam)) return layer;
        const indices = blocks(layer).find(block => block.includes(0))!;
        const dest = [...layer];
        indices.forEach((index, offset) => {
            const slot = layer[indices[indices.length - 1 - offset]!]!;
            dest[index] = { ...slot, piece: mirrorPiece(slot.piece), seam: offset === 0 };
        });
        return dest;
    }));
}
export function takeLayer(shape: Shape, level: number): Shape | null {
    return Number.isInteger(level) && shape.layers[level] ? new Shape([shape.layers[level]!]) : null;
}
export interface SlotInfo { valid: boolean; occupied: boolean; piece: Piece | null; color: Color | null; previous: boolean; next: boolean; shape: Shape | null }
export function takeSlot(shape: Shape, level: number, index: number): SlotInfo {
    const layer = shape.layers[level];
    if (!Number.isInteger(level) || !Number.isInteger(index) || !layer || index < 0 || index >= SLOT_COUNT) return { valid: false, occupied: false, piece: null, color: null, previous: false, next: false, shape: null };
    const slot = layer[index];
    if (!slot) return { valid: true, occupied: false, piece: null, color: null, previous: false, next: false, shape: null };
    const isolated = emptyLayer(); isolated[index] = { ...slot, seam: true };
    return { valid: true, occupied: true, piece: slot.piece, color: slot.color, previous: !slot.seam, next: !!layer[mod12(index + 1)] && !layer[mod12(index + 1)]!.seam, shape: new Shape([isolated]) };
}

/** 内容表中的块记号：| 新块，- 空槽；原矿用 ring 建立首尾连接。 */
export function pattern(text: string, color: Color = "u"): Layer {
    const layer = emptyLayer(); let index = 0, seam = true;
    for (const letter of text) {
        if (letter === "|") { seam = true; continue }
        if (index >= SLOT_COUNT) throw new Error("Pattern too long");
        if (letter === "-") { index++; seam = true; continue }
        if (!isPiece(letter)) throw new Error("Invalid pattern");
        layer[index++] = { piece: letter, color, seam }; seam = false;
    }
    return layer;
}
export function ring(period: string, color: Color = "u"): Shape {
    if (!period.length || SLOT_COUNT % period.length !== 0) throw new Error("Invalid raw period");
    const layer = pattern(period.repeat(SLOT_COUNT / period.length), color).map(slot => ({ ...slot!, seam: false }));
    return new Shape([layer]);
}
export const RAW_SHAPES = [ring("E"), ring("DNNA"), ring("ENE"), ring("DA")] as const;
