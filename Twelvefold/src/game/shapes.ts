import { Shape, COLORS, COLOR_HEX, blocks, cut, rangeMask, paint, stack, type Color, type Piece, type Slot } from "../domain/shape.ts";
import { game, patch, type Engine } from "./api.ts";
const definitions = new WeakMap<object, Shape>();
const stockColors: Partial<Record<Color, string>> = { r: "red", g: "green", b: "blue", y: "yellow", c: "cyan", p: "purple", w: "white", u: "uncolored" };
export const engineColor = (color: Color): string => stockColors[color] ?? `tf_${color}`;
export const colorCode = (color: string): Color | null => COLORS.find(code => engineColor(code) === color) ?? null;
export function fromDefinition(definition: Engine): Shape | null {
    if (!definition || !Array.isArray(definition.layers) || definition.layers[0]?.length !== 12) return null;
    const cached = definitions.get(definition); if (cached) return cached;
    const shape = new Shape(definition.layers.map((layer: Engine[]) => layer.map((slot: Engine): Slot | null => slot ? {
        piece: String(slot.subShape).slice(-1) as Piece, color: colorCode(slot.color)!, seam: slot.seam,
    } : null)));
    definitions.set(definition, shape); return shape;
}
export function toDefinition(shape: Shape): Engine {
    const definition = new game.ShapeDefinition({ layers: shape.layers.map(layer => layer.map(slot => slot && { subShape: `tf${slot.piece}`, color: engineColor(slot.color), seam: slot.seam })) });
    definition.cachedHash = shape.key; definitions.set(definition, shape); return definition;
}
export function shapeItem(root: Engine, shape: Shape): Engine { return root.shapeDefinitionMgr.getShapeItemFromDefinition(toDefinition(shape)) }
export function itemShape(item: Engine): Shape | null { return item?.getItemType() === "shape" ? fromDefinition(item.definition) : null }
const radii = (piece: Piece): readonly [number, number] => {
    const low = 1 / Math.sqrt(3);
    return piece === "E" ? [1, 1] : piece === "N" ? [low, low] : piece === "D" ? [1, low] : [low, 1];
};
/** 几何轮廓与切缝分开绘制；显示缩放不改变领域模型的片型。 */
export function drawShape(shape: Shape, context: CanvasRenderingContext2D, width: number, height = width, dpi = 1, displayLevel = 0): void {
    context.save(); context.translate(width * dpi / 2, height * dpi / 2); context.scale(width * dpi / 2, height * dpi / 2);
    context.beginPath(); context.arc(0, 0, 1, 0, Math.PI * 2); context.fillStyle = game.THEME.items.circleBackground; context.fill();
    shape.layers.forEach((layer, level) => {
        const scale = .9 * [1, .75, .5][level + displayLevel]!; context.save(); context.scale(scale, scale);
        const point = (angle: number, radius: number): [number, number] => [Math.sin(angle) * radius, -Math.cos(angle) * radius];
        const boundary = (i: number, slot: Slot, fill = false): void => {
            const [start, end] = radii(slot.piece), a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6;
            if (fill) context.lineTo(...point(a, start)); else context.moveTo(...point(a, start));
            if (slot.piece === "E" || slot.piece === "N") context.arc(0, 0, start, a - Math.PI / 2, b - Math.PI / 2);
            else context.lineTo(...point(b, end));
        };
        // 连续块的同色段共用外轮廓；跨第 11/0 槽继续递增角度，整环从颜色变化处起笔。
        for (const block of blocks(layer)) {
            let start = block[0]!;
            if (block.length === 12 && !layer[start]!.seam) start = block.find(i => layer[i]!.color !== layer[(i + 11) % 12]!.color) ?? start;
            let offset = 0;
            while (offset < block.length) {
                const color = layer[(start + offset) % 12]!.color;
                let end = offset + 1;
                while (end < block.length && layer[(start + end) % 12]!.color === color) end++;
                context.beginPath(); context.moveTo(0, 0);
                for (let n = offset; n < end; n++) boundary(start + n, layer[(start + n) % 12]!, true);
                context.closePath(); context.fillStyle = COLOR_HEX[color]; context.fill();
                // 同色细描边覆盖不同色段共边处的抗锯齿空隙，随后用原有黑线标示真实轮廓与切缝。
                context.strokeStyle = COLOR_HEX[color]; context.lineWidth = .025 / scale; context.lineJoin = "round"; context.stroke();
                offset = end;
            }
        }
        context.strokeStyle = "#383c50"; context.lineWidth = .025 / scale; context.lineJoin = "round";
        layer.forEach((slot, i) => {
            if (!slot) return;
            context.beginPath(); boundary(i, slot);
            const angle = i * Math.PI / 6, nextAngle = (i + 1) * Math.PI / 6, [start, end] = radii(slot.piece);
            const previous = layer[(i + 11) % 12], next = layer[(i + 1) % 12];
            if (slot.seam || !previous) { context.moveTo(0, 0); context.lineTo(...point(angle, start)) }
            else if (radii(previous.piece)[1] !== start) { context.moveTo(...point(angle, radii(previous.piece)[1])); context.lineTo(...point(angle, start)) }
            if (!next) { context.moveTo(0, 0); context.lineTo(...point(nextAngle, end)) }
            context.stroke();
        });
        context.restore();
    });
    context.restore();
}
export function installShapes(mod: Engine): void {
    // 原版显示器按 enumColors 名称加载固定图片，额外材料色只扩展短码和色值映射。
    for (const color of COLORS) {
        const name = engineColor(color); game.enumColorsToHexCode[name] = COLOR_HEX[color];
        game.enumColorToShortcode[name] = color; game.enumShortcodeToColor[color] = name;
    }
    for (const piece of ["E", "N", "D", "A"]) {
        game.enumSubShapeToShortcode[`tf${piece}`] = piece; game.enumShortcodeToSubShape[piece] = `tf${piece}`;
    }
    const oldParser = game.ShapeDefinition.fromShortKey.bind(game.ShapeDefinition);
    game.ShapeDefinition.fromShortKey = (key: string): Engine => key.split(":")[0]?.length === 24 ? toDefinition(Shape.parse(key)) : oldParser(key);
    const oldValidator = game.ShapeDefinition.isValidShortKey.bind(game.ShapeDefinition);
    game.ShapeDefinition.isValidShortKey = (key: string): boolean => {
        if (typeof key !== "string") return false;
        if (key.split(":")[0]?.length !== 24) return oldValidator(key);
        try { Shape.parse(key); return true } catch { return false }
    };
    patch(mod, game.ShapeDefinition, "getHash", function (original, args) { return fromDefinition(this)?.key ?? original(...args) });
    patch(mod, game.ShapeDefinition, "internalGenerateShapeBuffer", function (original, args) {
        const shape = fromDefinition(this); if (!shape) return original(...args);
        drawShape(shape, args[1], args[2], args[3], args[4]);
    });
    patch(mod, game.ShapeDefinition, "deserialize", function (original, args) {
        if (typeof args[0] !== "string" || args[0].split(":")[0]?.length !== 24) return original(...args);
        try { const shape = Shape.parse(args[0]); this.layers = toDefinition(shape).layers; this.cachedHash = shape.key; definitions.set(this, shape) } catch (error) { return String(error) }
    });
    const unary: Record<string, (shape: Shape) => Shape> = { cloneRotateCW: shape => shape.rotate(1), cloneRotateCCW: shape => shape.rotate(-1), cloneRotate180: shape => shape.rotate(6) };
    for (const [method, action] of Object.entries(unary)) patch(mod, game.ShapeDefinition, method, function (original, args) { const shape = fromDefinition(this); return shape ? toDefinition(action(shape)) : original(...args) });
    patch(mod, game.ShapeDefinition, "cloneFilteredByQuadrants", function (original, args) {
        const shape = fromDefinition(this); if (!shape) return original(...args);
        const mask = new Set<number>((args[0] as number[]).flatMap(quadrant => [...rangeMask(quadrant * 3, 3)]));
        const product = cut(shape, [mask])[0]; return product ? toDefinition(product) : new game.ShapeDefinition({ layers: [] });
    });
    patch(mod, game.ShapeDefinition, "cloneAndPaintWith", function (original, args) {
        const shape = fromDefinition(this), color = colorCode(args[0]);
        return shape && (color === "r" || color === "g" || color === "b") ? toDefinition(paint(shape, color)) : original(...args);
    });
    patch(mod, game.ShapeDefinition, "cloneAndStackWith", function (original, args) {
        const bottom = fromDefinition(this), top = fromDefinition(args[0]); if (!bottom || !top) return original(...args);
        const product = stack(bottom, top, 3); if (!product) throw new Error("Twelvefold layer limit"); return toDefinition(product);
    });
}
