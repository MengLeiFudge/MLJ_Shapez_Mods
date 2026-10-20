import { Shape, pattern, ring, COLOR_HEX } from "../domain/shape.ts";
import { OPERATION_ARITY, operate } from "../domain/operations.ts";
import { BUILDINGS, type BuildingEntry } from "./catalog.ts";
import { drawShape } from "./shapes.ts";
import { type Engine } from "./api.ts";

/** 教程使用真实领域运算和图形绘制；数字与箭头对应逻辑角色，不含固定方位。 */
function tutorial(entry: BuildingEntry): string | null {
    const spec = entry.machine!, [count] = OPERATION_ARITY[spec.operation];
    const circle = ring("E"), asymmetric = new Shape([pattern("EEE|DNN")]);
    const shapes = Array.from({ length: count }, (_, i) => i === 0 ? circle : new Shape([pattern(i === 1 ? "EEE" : "NNN", i === 1 ? "g" : "b")]));
    if (spec.operation === "rotate" || spec.operation === "flipBlock" || spec.operation === "mirror") shapes[0] = asymmetric;
    if (spec.operation === "swap" || spec.operation === "swapMirror") shapes[1] = ring("DNNA", "g");
    if (spec.operation === "delayer") shapes[0] = new Shape([...circle.layers, ...ring("N", "g").layers]);
    if (spec.operation === "smelt") shapes[0] = new Shape([Array.from({ length: 12 }, (_, i) => ({ piece: "E", color: i < 6 ? "r" : "g", seam: i % 3 === 0 }))]);
    const template = new Shape([pattern("EEE")]);
    const result = operate(spec.operation, { shapes, dye: "r", steps: spec.steps ?? 1, template }, 3);
    if (!result.valid || !result.canProcess) { console.warn(`Twelvefold: skipped invalid tutorial recipe ${entry.id}`); return null }
    const extras = Number(spec.category === "painting") + Number(spec.operation === "cutSignal"), cells = count + extras + 1 + result.products.length;
    const canvas = document.createElement("canvas"); canvas.width = cells * 104; canvas.height = 148;
    const context = canvas.getContext("2d")!; context.fillStyle = "#edf1f1"; context.fillRect(0, 0, canvas.width, canvas.height);
    const draw = (shape: Shape | null, index: number, role: string): void => {
        if (shape) { context.save(); context.translate(index * 104 + 6, 28); drawShape(shape, context, 92, 92, 1); context.restore() }
        context.fillStyle = "#283d49"; context.font = "bold 17px sans-serif"; context.textAlign = "center"; context.fillText(role, index * 104 + 52, 139);
        if (!shape) { context.font = "22px sans-serif"; context.fillText("∅", index * 104 + 52, 79) }
    };
    shapes.forEach((shape, i) => draw(shape, i, `${i + 1}`));
    let index = count;
    if (spec.category === "painting") { context.fillStyle = COLOR_HEX.r; context.beginPath(); context.arc(index * 104 + 52, 74, 25, 0, Math.PI * 2); context.fill(); context.fillStyle = "#283d49"; context.fillText(`${index + 1}`, index * 104 + 52, 139); index++ }
    if (spec.operation === "cutSignal") draw(template, index++, "◇");
    context.fillStyle = "#283d49"; context.font = "38px sans-serif"; context.fillText("→", index++ * 104 + 52, 89);
    result.products.forEach((shape, i) => draw(shape, index + i, `${i + 1}`));
    return canvas.toDataURL("image/png");
}
export function installTutorials(mod: Engine): void {
    for (const entry of BUILDINGS.filter(entry => entry.kind === "machine")) {
        const image = tutorial(entry);
        if (image) mod.modInterface.setBuildingTutorialImage(entry.metaId, entry.variant, image);
    }
}
