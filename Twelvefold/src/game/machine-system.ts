import { MACHINES } from "../domain/content.ts";
import { operate, OPERATION_ARITY } from "../domain/operations.ts";
import { game, inputPin, boolValue, type Engine } from "./api.ts";
import { MachineComponent, machineOf, ejectItem } from "./components.ts";
import { itemShape, shapeItem, colorCode } from "./shapes.ts";
import { progress } from "./state.ts";
export const BASE_BELT_SPEED = 2;
/** 加工进度只属于当前批次；待发产物全部交给出口后才允许下一批。 */
export class MachineSystem extends game.GameSystemWithFilter {
    constructor(root: Engine) { super(root, [MachineComponent]) }
    update(): void {
        const state = progress(this.root), delta = this.root.dynamicTickrate.deltaSeconds;
        for (const entity of this.allEntities as Engine[]) {
            const machine = machineOf(entity)!, spec = MACHINES.find(item => item.id === machine.kind);
            if (!spec || !state.unlocked(spec.stage, spec.research)) continue;
            const ejector = entity.components.ItemEjector;
            if (!machine.outputs.some(Boolean)) {
                if (ejector.slots.some((slot: Engine) => slot.item)) continue;
                const [shapeCount] = OPERATION_ARITY[spec.operation];
                const template = spec.operation === "cutSignal" ? itemShape(inputPin(entity, 0)) : null;
                const color = spec.category === "painting" ? colorCode(machine.inputs[shapeCount]?.color) : null;
                const result = operate(spec.operation, { shapes: machine.inputs.slice(0, shapeCount).map(itemShape), dye: color === "r" || color === "g" || color === "b" ? color : null, steps: spec.steps, template }, state.cap);
                if (!result.canProcess) { machine.progress = 0; continue }
                machine.template = template ? shapeItem(this.root, template) : null;
                machine.inputs.fill(null); machine.outputs = result.products.map(product => product ? shapeItem(this.root, product) : null);
                machine.progress = Math.max(0, machine.progress - 1);
            }
            if (machine.progress < 1) machine.progress += delta * BASE_BELT_SPEED * spec.ratio * state.multiplier(spec.category);
            if (machine.progress >= 1) machine.outputs.forEach((item, i) => {
                if (item && ejectItem(entity, i, item)) {
                    machine.outputs[i] = null; this.root.signals.itemProduced.dispatch(item);
                    if (spec.operation === "cut") state.observeGuide(2);
                    if (spec.operation === "rotate" && spec.steps === 1) state.observeGuide(3);
                }
            });
        }
    }
    canAccept(entity: Engine, index: number, item: Engine): boolean {
        const machine = machineOf(entity); if (!machine || index < 0 || index >= machine.inputs.length || machine.inputs[index]) return false;
        const spec = MACHINES.find(value => value.id === machine.kind);
        if (!spec || !progress(this.root).unlocked(spec.stage, spec.research)) return false;
        if (spec.operation === "cutSignal" && !itemShape(inputPin(entity, 0))) return false;
        const [shapes] = OPERATION_ARITY[spec.operation];
        if (index < shapes) return !!itemShape(item);
        const color = item?.getItemType() === "color" ? colorCode(item.color) : null;
        return color === "r" || color === "g" || color === "b";
    }
}
/** 接收时判定并锁定筛选出口；无信号从不解释成 false。 */
export function filterRoute(entity: Engine, item: Engine): number | null {
    const signal = inputPin(entity, 0), boolean = boolValue(signal);
    if (boolean !== null) return boolean ? 0 : 1;
    const template = itemShape(signal), shape = itemShape(item);
    if (!template) return null;
    return shape && template.equivalent(shape) ? 0 : 1;
}
export function installMachineSystem(mod: Engine): void {
    mod.modInterface.registerComponent(MachineComponent);
    mod.modInterface.registerGameSystem({ id: "twelvefoldMachines", systemClass: MachineSystem, before: "belt" });
}
