import { Shape, RAW_SHAPES, emptyLayer, type Slot } from "../domain/shape.ts";
import { Random } from "../domain/orders.ts";
import { game, patch, vector, direction, type Engine } from "./api.ts";
import { MachineComponent, machineOf, ejectItem } from "./components.ts";
import { progress } from "./state.ts";
import { shapeItem } from "./shapes.ts";
import { BASE_BELT_SPEED } from "./machine-system.ts";
/** 杂矿各象限取原料家族的对应三槽；缺象限后仍保留至少两种家族。 */
function messy(random: Random, distance: number): Shape {
    const missing = distance >= 18 ? random.int(3) : distance >= 12 ? random.int(2) : 0;
    const quadrants = [0, 1, 2, 3];
    for (let n = 0; n < missing; n++) quadrants.splice(random.int(quadrants.length), 1);
    const families = quadrants.map(() => random.int(4));
    if (families.every(family => family === families[0])) families[1] = (families[0]! + 1 + random.int(3)) % 4;
    const layer = emptyLayer();
    quadrants.forEach((quadrant, index) => {
        const raw = RAW_SHAPES[families[index]!]!.layers[0]!, start = quadrant * 3;
        const additional = random.next() < .25 ? 1 + random.int(2) : -1;
        for (let i = 0; i < 3; i++) layer[start + i] = { ...raw[start + i]!, seam: i === 0 || i === additional } satisfies Slot;
    });
    return new Shape([layer]);
}
/** 预览实体没有 root 和地图组件，只补齐缓存与空输入；真实开采器按研究配置链式入口。 */
function prepareMiner(entity: Engine, root: Engine): void {
    if (!machineOf(entity)) {
        const machine = new MachineComponent(); machine.configure("miner", 1, 0);
        if (root && entity.registered) machine.progress = Math.min(1, Math.max(0, root.time.now() - entity.components.Miner.lastMiningTime) * root.hubGoals.getMinerBaseSpeed());
        entity.addComponent(machine);
    }
    if (!entity.components.ItemAcceptor) entity.addComponent(new game.ItemAcceptorComponent({ slots: [] }));
    if (!root) return;
    const chained = progress(root).purchased.has("chainMiner");
    if (entity.components.Miner.chainable !== chained || entity.components.ItemAcceptor.slots.length !== Number(chained)) {
        entity.components.Miner.chainable = chained;
        entity.components.ItemAcceptor.setSlots(chained ? [{ pos: vector(0, 0), direction: direction.bottom, filter: null }] : []);
        const staticMap = entity.components.StaticMapEntity;
        if (staticMap) {
            const meta = game.gMetaBuildingRegistry.findByClass(game.MetaMinerBuilding);
            staticMap.code = game.getCodeFromBuildingData(meta, chained ? "chainable" : "default", 0);
        }
        if (entity.registered) root.signals.entityChanged.dispatch(entity);
    }
}
export function installWorld(mod: Engine): void {
    patch(mod, game.MapChunk, "generateLowerLayer", function () {
        const random = new Random(`${this.root.map.seed}|${this.x}|${this.y}|twelvefold-1`), size = game.globalConfig.mapChunkSize;
        const guarantees: Record<string, Engine> = {
            "1,0": shapeItem(this.root, RAW_SHAPES[0]), "-1,0": shapeItem(this.root, RAW_SHAPES[1]),
            "0,1": game.COLOR_ITEM_SINGLETONS.red, "0,-1": game.COLOR_ITEM_SINGLETONS.green, "1,1": game.COLOR_ITEM_SINGLETONS.blue,
            "3,0": shapeItem(this.root, RAW_SHAPES[2]), "0,3": shapeItem(this.root, RAW_SHAPES[3]),
        };
        const forced = guarantees[`${this.x},${this.y}`];
        const distance = Math.hypot(this.x, this.y);
        if (this.x === 0 && this.y === 0) return;
        const item = forced ?? (random.next() < .2 ? game.COLOR_ITEM_SINGLETONS[random.pick(["red", "green", "blue"])] : shapeItem(this.root,
            distance >= 7 && random.next() < Math.min(.5, .2 + .075 * (distance - 7)) ? messy(random, distance) : random.pick(distance < 3 ? RAW_SHAPES.slice(0, 2) : RAW_SHAPES)));
        if (!forced && random.next() > .48) return;
        const rng = new game.RandomNumberGenerator(`${this.root.map.seed}|${this.x}|${this.y}|patch`);
        this.internalGeneratePatch(rng, forced ? 3 : 2 + random.int(3), item, forced ? Math.floor(size / 2) : null, forced ? Math.floor(size / 2) : null);
    });
    patch(mod, game.MetaMinerBuilding, "setupEntityComponents", function (original, args) { original(...args); prepareMiner(args[0], args[0].root) });
    patch(mod, game.MetaMinerBuilding, "updateVariants", function (original, args) { original(...args); prepareMiner(args[0], args[0].root) });
    patch(mod, game.MinerSystem, "update", function () {
        const state = progress(this.root), delta = this.root.dynamicTickrate.deltaSeconds, rate = BASE_BELT_SPEED * state.multiplier("belt");
        for (const entity of this.allEntities as Engine[]) {
            prepareMiner(entity, this.root);
            const machine = machineOf(entity)!, miner = entity.components.Miner, ejector = entity.components.ItemEjector;
            machine.transportCredit = Math.min(1, machine.transportCredit + delta * rate);
            if (ejector.slots[0].item) continue;
            const transit = machine.inputs[0] ?? miner.itemChainBuffer[0];
            if (transit) {
                if (machine.transportCredit >= 1 && ejectItem(entity, 0, transit)) { if (machine.inputs[0]) machine.inputs[0] = null; else miner.itemChainBuffer.shift(); machine.transportCredit-- }
                continue;
            }
            const tile = entity.components.StaticMapEntity.origin;
            miner.cachedMinedItem ??= this.root.map.getLowerLayerContentXY(tile.x, tile.y);
            const ore = miner.cachedMinedItem;
            if (!ore || (ore.getItemType() === "color" && state.stage < 4)) continue;
            if (machine.progress < 1) machine.progress += delta * BASE_BELT_SPEED / 4 * state.multiplier("mining");
            if (machine.progress >= 1 && (!miner.chainable || machine.transportCredit >= 1) && ejectItem(entity, 0, ore)) {
                machine.progress -= 1; if (miner.chainable) machine.transportCredit--; miner.lastMiningTime = this.root.time.now(); this.root.signals.itemProduced.dispatch(ore);
            }
        }
    });
}
