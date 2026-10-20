import { game, vector, direction, type Engine } from "./api.ts";
import { addMachineComponents, MachineComponent, machineOf, setRolePorts, ejectItem } from "./components.ts";
import { BUILDINGS, LOGISTICS as specs, type LogisticsSpec } from "./catalog.ts";
import { registerBuilding } from "./buildings.ts";



import { progress } from "./state.ts";
import { itemShape } from "./shapes.ts";
import { BASE_BELT_SPEED, filterRoute, type MachineSystem } from "./machine-system.ts";
const byKind = new Map(specs.map(spec => [spec.kind, spec]));
const hyper = (kind: string): boolean => kind.startsWith("hyper");
/** 输出缓存空闲与下游可接受分开判断，轮询物流跳过已堵塞端口。 */
export function canOutput(root: Engine, entity: Engine, index: number, item: Engine): boolean {
    const slot = entity.components.ItemEjector?.slots[index];
    if (!slot || slot.item) return false;
    if (slot.cachedBeltPath) return slot.cachedBeltPath.spacingToFirstItem >= game.globalConfig.itemSpacingOnBelts;
    const target = slot.cachedTargetEntity, dest = slot.cachedDestSlot;
    if (!target || !dest || !target.components.ItemAcceptor.canAcceptItem(dest.index, item)) return false;
    if (target.components.Hub) { const shape = itemShape(item); return !!shape && progress(root).canDeliver(shape) }
    const machine = machineOf(target);
    if (target.components.Miner) return !!target.components.Miner.chainable && !!machine && !machine.inputs[0];
    if (machine) {
        const logistics: LogisticsSystem = root.systemMgr.systems.twelvefoldLogistics;
        return byKind.has(machine.kind) ? logistics.canAccept(target, dest.index, item) : (root.systemMgr.systems.twelvefoldMachines as MachineSystem).canAccept(target, dest.index, item);
    }
    if (target.components.Belt) return target.components.Belt.assignedPath.canAcceptItem();
    if (target.components.Storage) return target.components.Storage.canAcceptItem(item);
    if (target.components.UndergroundBelt) return target.components.UndergroundBelt.mode === game.enumUndergroundBeltMode.sender && target.components.UndergroundBelt.pendingItems.length === 0;
    const processor = target.components.ItemProcessor;
    return !!processor && !processor.inputSlots.has(dest.index) && root.systemMgr.systems.itemProcessor.checkRequirements(target, item, dest.index);
}
export class LogisticsSystem extends game.GameSystemWithFilter {
    private graph = new Map<number, Engine[]>();
    private dirty = true;
    private exitCursor = 0;
    constructor(root: Engine) {
        super(root, [MachineComponent]);
        const invalidate = (): void => { this.dirty = true };
        for (const signal of [root.signals.entityAdded, root.signals.entityChanged, root.signals.entityDestroyed, root.signals.postLoadHook]) signal.add(invalidate);
    }
    update(): void {
        const state = progress(this.root), rate = BASE_BELT_SPEED * state.multiplier("belt"), delta = this.root.dynamicTickrate.deltaSeconds;
        const entities = (this.allEntities as Engine[]).filter(entity => byKind.has(machineOf(entity)!.kind));
        for (const entity of entities) {
            const machine = machineOf(entity)!, spec = byKind.get(machine.kind)!;
            machine.transportCredit = Math.min(hyper(machine.kind) ? 3 : 1, machine.transportCredit + delta * rate * (hyper(machine.kind) ? 3 : 1));
            machine.channelCredits = machine.channelCredits.map(value => Math.min(1, value + delta * rate));
            if (!state.unlocked(spec.stage, spec.research)) continue;
            if (machine.kind === "hyperline" || machine.kind === "hyperIn") continue;
            if (machine.kind === "smartTunnelIn") { this.sendTunnel(entity); continue }
            if (machine.kind === "crossing") {
                for (let i = 0; i < 2; i++) if (machine.channelCredits[i]! >= 1 && machine.inputs[i] && canOutput(this.root, entity, i, machine.inputs[i]) && ejectItem(entity, i, machine.inputs[i])) {
                    machine.inputs[i] = null; machine.channelCredits[i]!--;
                }
                continue;
            }
            for (let attempt = 0; attempt < (machine.kind === "hyperOut" ? 3 : 1); attempt++) this.route(entity, spec);
        }
        if (this.dirty) this.rebuildGraph(entities);
        this.moveHyperlinks(entities);
    }
    private route(entity: Engine, spec: LogisticsSpec): void {
        const machine = machineOf(entity)!;
        if (machine.transportCredit < 1) return;
        const start = machine.kind === "priority" ? 0 : machine.cursor;
        const indices = Array.from({ length: machine.inputs.length }, (_, i) => machine.kind === "priority" ? i : (start + i) % machine.inputs.length);
        for (const input of indices) {
            const item = machine.inputs[input]; if (!item) continue;
            const outputs = machine.kind === "filter" ? [machine.route] : Array.from({ length: spec.outputs.length }, (_, i) => (machine.cursor + i) % spec.outputs.length);
            const output = outputs.find(index => index >= 0 && (!hyper(machine.kind) || machine.channelCredits[index]! >= 1) && canOutput(this.root, entity, index, item));
            if (output === undefined || !ejectItem(entity, output, item)) continue;
            machine.inputs[input] = null; machine.transportCredit--;
            if (hyper(machine.kind)) machine.channelCredits[output]!--;
            machine.cursor = machine.kind === "merge" ? (input + 1) % machine.inputs.length : (output + 1) % Math.max(1, spec.outputs.length);
            return;
        }
    }
    canAccept(entity: Engine, index: number, item: Engine): boolean {
        const machine = machineOf(entity), spec = machine && byKind.get(machine.kind);
        if (!machine || !spec || !progress(this.root).unlocked(spec.stage, spec.research) || index < 0 || index >= spec.inputs.length) return false;
        if (machine.kind === "filter") return !machine.inputs[0] && filterRoute(entity, item) !== null;
        if (machine.kind === "hyperIn") return machine.channelCredits[index]! >= 1 && machine.inputs.some(value => !value) && progress(this.root).blueprintTenths >= 1n;
        return !machine.inputs[index];
    }
    accept(entity: Engine, index: number, item: Engine): boolean {
        if (!this.canAccept(entity, index, item)) return false;
        const machine = machineOf(entity)!;
        if (machine.kind === "hyperIn") {
            if (!progress(this.root).spendBlueprint(1n)) return false;
            machine.inputs[machine.inputs.findIndex(value => !value)] = item; machine.channelCredits[index]!--;
        } else { machine.inputs[index] = item; if (machine.kind === "filter") machine.route = filterRoute(entity, item)! }
        return true;
    }
    private sendTunnel(entity: Engine): void {
        const machine = machineOf(entity)!; if (machine.transportCredit < 1) return;
        const staticMap = entity.components.StaticMapEntity, step = game.enumDirectionToVector[staticMap.localDirectionToWorld(direction.top)];
        let location = staticMap.origin;
        for (let distance = 0; distance < game.globalConfig.undergroundBeltMaxTilesByTier[1]; distance++) {
            location = location.add(step);
            const target = this.root.map.getTileContent(location, "regular");
            const other: MachineComponent | null = target ? machineOf(target) : null;
            if (!other || !other.kind.startsWith("smartTunnel") || target.components.StaticMapEntity.rotation !== staticMap.rotation) continue;
            if (other.kind !== "smartTunnelOut") return;
            const free = other.inputs.findIndex(value => !value); if (free < 0) return;
            for (let offset = 0; offset < machine.inputs.length; offset++) {
                const index = (machine.cursor + offset) % machine.inputs.length;
                if (machine.inputs[index]) { other.inputs[free] = machine.inputs[index]; machine.inputs[index] = null; machine.cursor = (index + 1) % machine.inputs.length; machine.transportCredit--; return }
            }
            return;
        }
    }
    private rebuildGraph(entities: Engine[]): void {
        this.graph.clear();
        for (const entity of entities.filter(value => hyper(machineOf(value)!.kind))) {
            const neighbors = new Set<Engine>(), staticMap = entity.components.StaticMapEntity, height = byKind.get(machineOf(entity)!.kind)!.height ?? 1;
            for (let y = 0; y < height; y++) {
                const tile = staticMap.localTileToWorld(vector(0, y));
                for (const offset of [vector(0, -1), vector(1, 0), vector(0, 1), vector(-1, 0)]) {
                    const neighbor = this.root.map.getTileContent(tile.add(offset), "regular");
                    if (neighbor && neighbor !== entity && hyper(machineOf(neighbor)?.kind ?? "")) neighbors.add(neighbor);
                }
            }
            this.graph.set(entity.uid, [...neighbors]);
        }
        this.dirty = false;
    }
    private path(source: Engine, target: Engine): Engine[] | null {
        const queue: Engine[][] = [[source]], visited = new Set<number>([source.uid]);
        for (let i = 0; i < queue.length; i++) {
            const route = queue[i]!, tail = route[route.length - 1]!;
            if (tail === target) return route;
            for (const neighbor of this.graph.get(tail.uid) ?? []) if (!visited.has(neighbor.uid)) {
                const kind = machineOf(neighbor)!.kind;
                if (kind === "hyperIn" || (kind === "hyperOut" && neighbor !== target)) continue;
                visited.add(neighbor.uid); queue.push([...route, neighbor]);
            }
        }
        return null;
    }
    /** 网络共享队列按可用出口分发；每条经过的线路格都扣同一次吞吐预算。 */
    private moveHyperlinks(entities: Engine[]): void {
        const exits = entities.filter(entity => machineOf(entity)!.kind === "hyperOut");
        if (!exits.length) return;
        for (const source of entities.filter(entity => machineOf(entity)!.kind === "hyperIn")) {
            const machine = machineOf(source)!;
            const start = machine.cursor;
            for (let offset = 0; offset < machine.inputs.length; offset++) {
                const index = (start + offset) % machine.inputs.length, item = machine.inputs[index]; if (!item) continue;
                for (let n = 0; n < exits.length; n++) {
                    const target = exits[(this.exitCursor + n) % exits.length]!, dest = machineOf(target)!, free = dest.inputs.findIndex(value => !value);
                    if (free < 0 || !target.components.ItemEjector.slots.some((_: Engine, output: number) => dest.channelCredits[output]! >= 1 && canOutput(this.root, target, output, item))) continue;
                    const route = this.path(source, target);
                    if (!route || route.slice(0, -1).some(node => machineOf(node)!.transportCredit < 1)) continue;
                    for (const node of route.slice(0, -1)) machineOf(node)!.transportCredit--;
                    dest.inputs[free] = item; machine.inputs[index] = null; machine.cursor = (index + 1) % machine.inputs.length;
                    this.exitCursor = (this.exitCursor + n + 1) % exits.length; break;
                }
            }
        }
    }
}
export function installLogistics(mod: Engine): void {
    for (const entry of BUILDINGS.filter(entry => entry.kind === "logistics")) {
        const spec = entry.logistics!;
        registerBuilding(mod, entry, entity => addMachineComponents(entity, !!spec.signal), (entity, mirror) => {
            entity.components.TwelvefoldMachine.configure(spec.kind, hyper(spec.kind) ? 6 : spec.kind === "smartTunnelOut" ? 3 : spec.inputs.length, spec.outputs.length);
            setRolePorts(entity, entry, mirror);
        });
    }
    mod.modInterface.registerGameSystem({ id: "twelvefoldLogistics", systemClass: LogisticsSystem, before: "itemEjector" });
}
