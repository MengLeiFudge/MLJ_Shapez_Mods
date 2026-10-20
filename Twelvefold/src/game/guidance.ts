import { game, type Engine } from "./api.ts";
import { machineOf } from "./components.ts";
import { circuitOf } from "./circuits.ts";
import { itemShape, toDefinition } from "./shapes.ts";
import { progress } from "./state.ts";
import type { Shape } from "../domain/shape.ts";

/** 读取鼠标所在格的实际物料；不把选择建筑或空缓存算作完成操作。 */
function hoveredShape(root: Engine, tile: Engine): Shape | null {
    const entity = root.map.getTileContent(tile, root.currentLayer), components = entity?.components;
    const path = components?.Belt?.assignedPath;
    if (path) {
        let position = path.spacingToFirstItem;
        for (const [spacing, item] of path.items as Array<[number, Engine]>) {
            const location = path.computePositionFromProgress(position);
            if (Math.floor(location.x) === tile.x && Math.floor(location.y) === tile.y) return itemShape(item);
            position += spacing;
        }
    }
    const machine = entity && machineOf(entity), circuit = entity && circuitOf(entity);
    const candidates = [
        ...(machine?.outputs ?? []), ...(components?.ItemEjector?.slots ?? []).map((slot: Engine) => slot.item ?? slot.lastItem),
        ...(machine?.inputs ?? []), components?.Storage?.storedItem, components?.Miner?.cachedMinedItem,
        circuit?.constant, circuit?.memory, ...(components?.WiredPins?.slots ?? []).map((pin: Engine) => pin.value ?? pin.linkedNetwork?.currentValue), root.map.getLowerLayerContentXY(tile.x, tile.y),
    ];
    for (const item of candidates) { const shape = itemShape(item); if (shape) return shape }
    return null;
}

/** 引导只观察游戏事件；Alt 使用原版可配置的查看键打开十二槽分层详情。 */
export function installGuidance(mod: Engine): void {
    mod.signals.gameInitialized.add((root: Engine) => {
        if (!(root.gameMode instanceof game.RegularGameMode)) return;
        root.signals.entityManuallyPlaced.add((entity: Engine) => {
            if (!entity.components.Miner) return;
            const tile = entity.components.StaticMapEntity.origin, resource = root.map.getLowerLayerContentXY(tile.x, tile.y);
            if (itemShape(resource)) progress(root).observeGuide(0);
        });
        root.keyMapper.getBinding(game.KEYMAPPINGS.ingame.showShapeTooltip).addToTop(() => {
            const parts = root.hud.parts, position = root.app.mousePosition;
            if (!position || root.hud.hasBlockingOverlayOpen() || root.camera.getIsMapOverlayActive()
                || parts.buildingPlacer.currentMetaBuilding.get() || parts.blueprintPlacer.currentBlueprint.get()
                || parts.massSelector.currentSelectionStartWorld || parts.massSelector.selectedUids.size) return;
            const shape = hoveredShape(root, root.camera.screenToWorld(position.copy()).toTileSpace());
            if (!shape) return;
            root.hud.signals.viewShapeDetailsRequested.dispatch(toDefinition(shape));
            return game.STOP_PROPAGATION;
        });
    });
}
