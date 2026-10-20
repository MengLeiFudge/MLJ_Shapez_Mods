import { MACHINES } from "../domain/content.ts";
import { game, patch, type Engine } from "./api.ts";
import { machineOf } from "./components.ts";
import type { MachineSystem } from "./machine-system.ts";
import type { LogisticsSystem } from "./logistics.ts";
import { itemShape } from "./shapes.ts";
import { progress } from "./state.ts";

/** 所有物料入口共用按实体类型接收的规则；返回 false 时物料继续留在上游。 */
function acceptItem(root: Engine, entity: Engine, index: number, item: Engine): boolean {
    // 中心入口同步判定并记账，拒收的物料不进入原版加工队列。
    if (entity.components.Hub) return !!itemShape(item) && !!root.hubGoals.handleDefinitionDelivered(item.definition);
    const machine = machineOf(entity)!;
    if (entity.components.Miner) {
        if (!entity.components.Miner.chainable || index !== 0 || machine.inputs[0]) return false;
        machine.inputs[0] = item; return true;
    }
    if (MACHINES.some(spec => spec.id === machine.kind)) {
        const system: MachineSystem = root.systemMgr.systems.twelvefoldMachines;
        if (!system.canAccept(entity, index, item)) return false;
        machine.inputs[index] = item; return true;
    }
    return (root.systemMgr.systems.twelvefoldLogistics as LogisticsSystem).accept(entity, index, item);
}

/** 传送带末端独立于 ItemEjector，两个入口均保留原版端口过滤和接收动画。 */
export function installItemTransfer(mod: Engine): void {
    patch(mod, game.BeltPath, "computePassOverFunctionWithoutBelts", function (original, args) {
        const [entity, index] = args;
        if (!entity.components.Hub && !machineOf(entity)) return original(...args);
        return (item: Engine): boolean => {
            const accepted = acceptItem(this.root, entity, index, item);
            if (accepted && entity.components.Hub) progress(this.root).observeGuide(1);
            return accepted;
        };
    });
    patch(mod, game.ItemEjectorSystem, "tryPassOverItem", function (original, args) {
        const [item, entity, index] = args;
        return entity.components.Hub || machineOf(entity) ? acceptItem(this.root, entity, index, item) : original(...args);
    });
}
