import { game, vector, direction, type Engine } from "./api.ts";
import { mirrorPort, type BuildingEntry } from "./catalog.ts";
/** 保存加工中物料与逐件锁定的路由；蓝图复制仅复制配置，不复制库存。 */
export class MachineComponent extends game.Component {
    kind = "cut";
    inputs: Engine[] = [];
    outputs: Engine[] = [];
    progress = 0;
    route = -1;
    cursor = 0;
    transportCredit = 0;
    channelCredits = [0, 0, 0];
    template: Engine = null;
    static getId(): string { return "TwelvefoldMachine" }
    static getSchema(): Engine {
        return { kind: game.types.string, inputs: game.types.array(game.types.nullable(game.typeItemSingleton)), outputs: game.types.array(game.types.nullable(game.typeItemSingleton)),
            progress: game.types.ufloat, route: game.types.int, cursor: game.types.uint, transportCredit: game.types.ufloat,
            channelCredits: game.types.array(game.types.ufloat), template: game.types.nullable(game.typeItemSingleton) };
    }
    configure(kind: string, inputs: number, outputs: number): void {
        this.kind = kind; this.inputs = Array<null>(inputs).fill(null); this.outputs = Array<null>(outputs).fill(null); this.clear();
    }
    clear(): void {
        this.inputs.fill(null); this.outputs.fill(null); this.progress = 0; this.route = -1; this.cursor = 0;
        this.transportCredit = 0; this.channelCredits = [0, 0, 0]; this.template = null;
    }
    copyAdditionalStateTo(copy: MachineComponent): void { copy.configure(this.kind, this.inputs.length, this.outputs.length) }
}
export interface Port { x: number; y: number; direction: Engine; filter?: string }
export function setPorts(entity: Engine, inputs: readonly Port[], outputs: readonly Port[], signal = false): void {
    entity.components.ItemAcceptor.setSlots(inputs.map(port => ({ pos: vector(port.x, port.y), direction: port.direction, filter: port.filter ?? null })));
    entity.components.ItemEjector.setSlots(outputs.map(port => ({ pos: vector(port.x, port.y), direction: port.direction })));
    if (entity.components.WiredPins) entity.components.WiredPins.setSlots(signal ? [{ pos: vector(0, 0), direction: direction.left, type: game.enumPinSlotType.logicalAcceptor }] : []);
}
/** 物料槽与信号槽保持目录顺序，使加工结果始终从对应角色输出。 */
export function setRolePorts(entity: Engine, entry: BuildingEntry, mirror: number): void {
    const convert = (port: import("./catalog.ts").RolePort): Port => {
        const mapped = mirrorPort(port, entry.width, mirror);
        return { x: mapped.x, y: mapped.y, direction: direction[mapped.side], ...(mapped.filter ? { filter: mapped.filter } : {}) };
    };
    setPorts(entity, entry.inputs.map(convert), entry.outputs.map(convert));
    if (entity.components.WiredPins) entity.components.WiredPins.setSlots(entry.signals.map(port => {
        const mapped = mirrorPort(port, entry.width, mirror);
        return { pos: vector(mapped.x, mapped.y), direction: direction[mapped.side], type: entry.kind === "circuit" && port.side === "top" ? game.enumPinSlotType.logicalEjector : game.enumPinSlotType.logicalAcceptor };
    }));
}

export function addMachineComponents(entity: Engine, signal = false): void {
    entity.addComponent(new MachineComponent()); entity.addComponent(new game.ItemAcceptorComponent({ slots: [] })); entity.addComponent(new game.ItemEjectorComponent({ slots: [] }));
    if (signal) entity.addComponent(new game.WiredPinsComponent({ slots: [] }));
}
export const machineOf = (entity: Engine): MachineComponent | null => entity.components.TwelvefoldMachine ?? null;

/** 本模组已按操作或运输预算计时，出口只负责转移与背压，避免叠加原版运输动画延迟。 */
export function ejectItem(entity: Engine, index: number, item: Engine): boolean {
    const ejector = entity.components.ItemEjector;
    if (!ejector.tryEject(index, item)) return false;
    ejector.slots[index].progress = 1;
    return true;
}
