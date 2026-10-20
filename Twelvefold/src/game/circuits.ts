import { MACHINES } from "../domain/content.ts";
import { OPERATION_ARITY, operate } from "../domain/operations.ts";
import { takeLayer, takeSlot, type Color, type Piece } from "../domain/shape.ts";
import { game, boolItem, boolValue, inputPin, type Engine } from "./api.ts";

import { registerBuilding } from "./buildings.ts";
import { BUILDINGS, NODES, type NodeSpec } from "./catalog.ts";
import { setRolePorts } from "./components.ts";
export { NODES } from "./catalog.ts";

import { progress } from "./state.ts";
import { shapeItem, itemShape, colorCode } from "./shapes.ts";
import { ScalarItem, scalar, integerValue } from "./signals.ts";
interface OrderSnapshot { id: number; key: string; required: number; delivered: number; remaining: number }
export class CircuitComponent extends game.Component {
    kind = "compare";
    constant: Engine = null;
    memory: Engine = null;
    previous = false;
    order = "";
    static getId(): string { return "TwelvefoldCircuit" }
    static getSchema(): Engine { return { kind: game.types.string, constant: game.types.nullable(game.typeItemSingleton), memory: game.types.nullable(game.typeItemSingleton), previous: game.types.bool, order: game.types.string } }
    clear(): void { this.memory = null; this.previous = false; this.order = "" }
    copyAdditionalStateTo(copy: CircuitComponent): void { copy.kind = this.kind; copy.constant = this.constant; copy.clear() }
}
const byKind = new Map(NODES.map(spec => [spec.kind, spec]));
export function circuitOf(entity: Engine): CircuitComponent | null { return entity.components.TwelvefoldCircuit ?? null }
function typed(item: Engine): boolean { return !!item && (itemShape(item) !== null || boolValue(item) !== null || item instanceof ScalarItem) }
function same(item: Engine, other: Engine): boolean | null { return !typed(item) || !typed(other) || item.getItemType() !== other.getItemType() ? null : item.equals(other) }
const orderValues = (root: Engine, snapshot: OrderSnapshot | null): Engine[] => snapshot ? [boolItem(true), scalar("integer", snapshot.id), root.shapeDefinitionMgr.getShapeItemFromShortKey(snapshot.key), scalar("integer", snapshot.required), scalar("integer", snapshot.delivered), scalar("integer", snapshot.remaining)] : [boolItem(false), null, null, null, null, null];
export class CircuitSystem extends game.GameSystemWithFilter {
    constructor(root: Engine) { super(root, [CircuitComponent, game.WiredPinsComponent]) }
    update(): void {
        for (const entity of this.allEntities as Engine[]) {
            const circuit = circuitOf(entity)!, spec = byKind.get(circuit.kind); if (!spec) throw new Error("Unknown Twelvefold circuit");
            const outputs = progress(this.root).unlocked(spec.stage, spec.research) ? this.evaluate(entity, circuit, spec) : Array<null>(spec.outputs.length).fill(null);
            const pins = entity.components.WiredPins.slots;
            outputs.forEach((item, i) => { pins[spec.inputs.length + i].value = item });
        }
    }
    private evaluate(entity: Engine, circuit: CircuitComponent, spec: NodeSpec): Engine[] {
        const values = spec.inputs.map((_, i) => inputPin(entity, i));
        const a = values[0], b = values[1], left = integerValue(a), right = integerValue(b), boolean = boolValue(a);
        if (spec.constant) return [circuit.constant];
        if (spec.kind.startsWith("virtual.")) {
            const machine = MACHINES.find(item => item.id === spec.kind.slice(8))!, [count] = OPERATION_ARITY[machine.operation];
            const dyeSignal = values[count];
            const color = dyeSignal instanceof ScalarItem && dyeSignal.kind === "color" ? dyeSignal.value : dyeSignal?.getItemType() === "color" ? colorCode(dyeSignal.color) : null;
            const result = operate(machine.operation, { shapes: values.slice(0, count).map(itemShape), dye: color === "r" || color === "g" || color === "b" ? color : null,
                steps: integerValue(values[count]), template: machine.operation === "cutSignal" ? itemShape(values[count]) : null }, progress(this.root).cap);
            return [boolItem(result.valid), boolItem(result.canProcess), ...result.products.flatMap(product => [boolItem(result.canProcess && !!product), result.canProcess && product ? shapeItem(this.root, product) : null])];
        }
        switch (spec.kind) {
            case "compare": { const equal = same(a, b); return [equal === null ? null : boolItem(equal)] }
            case "and": case "or": { const other = boolValue(b); return [boolean === null || other === null ? null : boolItem(spec.kind === "and" ? boolean && other : boolean || other)] }
            case "not": return [boolean === null ? null : boolItem(!boolean)];
            case "sensor": {
                const tile = entity.components.StaticMapEntity.origin, belt = this.root.map.getTileContent(tile, "regular")?.components.Belt;
                if (!belt?.assignedPath) return [null];
                const path = belt.assignedPath, indices: Engine[] = path.items ?? [];
                let position = path.spacingToFirstItem;
                for (const pair of indices) {
                    const location = path.computePositionFromProgress(position);
                    if (Math.floor(location.x) === tile.x && Math.floor(location.y) === tile.y) {
                        const item = pair[1];
                        return [item.getItemType() === "color" ? scalar("color", colorCode(item.color)) : item];
                    }
                    position += pair[0];
                }
                return [null];
            }
            case "display": circuit.memory = typed(a) ? a : null; return [];
            case "layerCount": { const shape = itemShape(a); return [shape ? scalar("integer", shape.layers.length) : null] }
            case "takeLayer": { const shape = itemShape(a), level = integerValue(b), result = shape && level !== null ? takeLayer(shape, level) : null; return [result ? shapeItem(this.root, result) : null] }
            case "takeSlot": {
                const shape = itemShape(a), level = integerValue(b), slot = integerValue(values[2]);
                if (!shape || level === null || slot === null) return [boolItem(false), null, null, null, null, null, null];
                const info = takeSlot(shape, level, slot);
                return [boolItem(info.valid), boolItem(info.occupied), scalar("piece", info.piece), scalar("color", info.color), boolItem(info.previous), boolItem(info.next), info.shape ? shapeItem(this.root, info.shape) : null];
            }
            case "less": case "greater": return [left === null || right === null ? null : boolItem(spec.kind === "less" ? left < right : left > right)];
            case "add": case "subtract": case "multiply": case "divide": case "modulo": {
                if (left === null || right === null || ((spec.kind === "divide" || spec.kind === "modulo") && right === 0)) return [null];
                const result = spec.kind === "add" ? left + right : spec.kind === "subtract" ? left - right : spec.kind === "multiply" ? left * right : spec.kind === "divide" ? Math.trunc(left / right) : left % right;
                return [Number.isSafeInteger(result) ? scalar("integer", result) : null];
            }
            case "select": return [boolean === null ? null : typed(values[boolean ? 1 : 2]) ? values[boolean ? 1 : 2] : null];
            case "register": if (boolValue(values[2]) === true) circuit.memory = null; else if (boolValue(b) === true) circuit.memory = typed(a) ? a : null; return [circuit.memory];
            case "rising": { const rising = boolean === null ? null : boolItem(boolean && !circuit.previous); circuit.previous = boolean === true; return [rising] }
            case "orderSource": {
                const order = progress(this.root).order;
                return orderValues(this.root, order ? { id: order.id, key: order.key, required: order.required, delivered: order.delivered, remaining: order.required - order.delivered } : null);
            }
            case "orderRegister": {
                if (boolValue(b) === true) circuit.order = "";
                else if (boolean === true) {
                    if (boolValue(values[2]) === false) circuit.order = "";
                    else {
                        const id = integerValue(values[3]), shape = itemShape(values[4]), required = integerValue(values[5]), delivered = integerValue(values[6]), remaining = integerValue(values[7]);
                        if (boolValue(values[2]) === true && id !== null && id > 0 && shape && required !== null && delivered !== null && remaining !== null && required > 0 && delivered >= 0 && remaining >= 0 && delivered + remaining === required) {
                            circuit.order = JSON.stringify({ id, key: shape.key, required, delivered, remaining } satisfies OrderSnapshot);
                        }
                    }
                }
                return orderValues(this.root, circuit.order ? JSON.parse(circuit.order) as OrderSnapshot : null);
            }
            default: throw new Error("Unsupported Twelvefold circuit");
        }
    }
    drawChunk(parameters: Engine, chunk: Engine): void {
        for (const entity of chunk.containedEntitiesByLayer.wires as Engine[]) {
            const circuit = circuitOf(entity); if (circuit?.kind !== "display" || !circuit.memory) continue;
            const pos = entity.components.StaticMapEntity.origin;
            circuit.memory.drawItemCenteredClipped((pos.x + .5) * 32, (pos.y + .5) * 32, parameters, 22);
        }
    }
}
export function setConstant(entity: Engine, kind: string, value: string): boolean {
    const circuit = circuitOf(entity); if (!circuit || !byKind.get(kind)?.constant) return false;
    if (kind === "shapeConstant") {
        if (!game.ShapeDefinition.isValidShortKey(value) || value.split(":")[0]?.length !== 24) return false;
        circuit.constant = entity.root.shapeDefinitionMgr.getShapeItemFromShortKey(value);
    } else if (kind === "boolConstant") {
        if (value !== "true" && value !== "false") return false; circuit.constant = boolItem(value === "true");
    } else if (kind === "integerConstant") {
        if (!/^-?(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) return false; circuit.constant = scalar("integer", Number(value));
    } else if (kind === "colorConstant") {
        try { circuit.constant = scalar("color", value as Color) } catch { return false }
    } else if (kind === "pieceConstant") {
        try { circuit.constant = scalar("piece", value as Piece) } catch { return false }
    }
    return true;
}
export function installCircuits(mod: Engine): void {
    mod.modInterface.registerComponent(CircuitComponent);
    for (const entry of BUILDINGS.filter(entry => entry.kind === "circuit")) {
        const spec = entry.node!;
        registerBuilding(mod, entry, entity => {
            entity.addComponent(new CircuitComponent());
            entity.addComponent(new game.WiredPinsComponent({ slots: [] }));
        }, (entity, mirror) => {
            const circuit = circuitOf(entity)!; circuit.kind = spec.kind;
            setRolePorts(entity, entry, mirror);
            if (spec.kind === "boolConstant") circuit.constant = boolItem(true);
            if (spec.kind === "integerConstant") circuit.constant = scalar("integer", 1);
            if (spec.kind === "colorConstant") circuit.constant = scalar("color", "r");
            if (spec.kind === "pieceConstant") circuit.constant = scalar("piece", "E");
        });
    }
    mod.modInterface.registerGameSystem({ id: "twelvefoldCircuits", systemClass: CircuitSystem, before: "logicGate", drawHooks: ["staticAfter"] });
    mod.signals.gameInitialized.add((root: Engine) => {
        root.signals.entityManuallyPlaced.add((entity: Engine) => { const circuit = circuitOf(entity); if (circuit && byKind.get(circuit.kind)?.constant) root.hud.parts.shop.editNode(entity) });
    });
}
