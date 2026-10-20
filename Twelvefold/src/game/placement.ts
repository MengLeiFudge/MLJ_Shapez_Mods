import { game, patch, type Engine } from "./api.ts";
import { catalogEntry, hasMirror, mirrorChangesPorts, type BuildingEntry } from "./catalog.ts";
import { setRolePorts } from "./components.ts";
import { text } from "../i18n/index.ts";

function placementEntry(placer: Engine): BuildingEntry | undefined {
    const meta = placer.currentMetaBuilding?.get();
    return meta ? catalogEntry(meta.getId(), placer.currentVariant.get()) : undefined;
}
function syncPreview(placer: Engine): void {
    const entry = placementEntry(placer), entity = placer.fakeEntity;
    if (!entry || !hasMirror(entry) || !entity?.components.StaticMapEntity) return;
    const mirror = mirrorChangesPorts(entry) ? placer.twelvefoldMirror ?? 0 : 0;
    const meta = placer.currentMetaBuilding.get(), variant = placer.currentVariant.get();
    meta.updateVariants(entity, mirror, variant);
    entity.components.StaticMapEntity.code = game.getCodeFromBuildingData(meta, variant, mirror);
    entity.components.StaticMapEntity.rotation = placer.currentBaseRotation;
}
function flip(root: Engine, vertical: boolean): Engine {
    if (!(root.gameMode instanceof game.RegularGameMode) || root.hud.hasBlockingOverlayOpen()) return;
    const placer = root.hud.parts.buildingPlacer, entry = placementEntry(placer);
    if (!entry) return; // 空闲 V 继续传给 pasteLastBlueprint；谜题 H 也不接管。
    if (hasMirror(entry) && mirrorChangesPorts(entry)) placer.twelvefoldMirror = 1 - (placer.twelvefoldMirror ?? 0);
    if (vertical) placer.currentBaseRotation = (placer.currentBaseRotation + 180) % 360;
    syncPreview(placer); return game.STOP_PROPAGATION;
}
/** 把原版 inverse code 归为同一建筑的镜像态；草案不提供旧档迁移。 */
function installBalancerMirrors(mod: Engine): void {
    const owner = game.MetaBalancerBuilding;
    mod.modInterface.extendObject(owner, ({ $old }: Engine) => ({
        getAllVariantCombinations(): Engine[] {
            return $old.getAllVariantCombinations.call(this).map((combination: Engine) => combination.variant?.endsWith("-inverse") ? { ...combination, variant: combination.variant.replace("-inverse", ""), rotationVariant: 1 } : combination);
        },
    }));
    for (const combination of owner.getAllVariantCombinations()) game.registerBuildingVariant(combination.internalId, owner, combination.variant, combination.rotationVariant ?? 0);
    patch(mod, owner, "getAvailableVariants", function (original, args) { return original(...args).filter((variant: string) => !variant.endsWith("-inverse")) });
    patch(mod, owner, "updateVariants", function (original, args) {
        const [entity, mirror, variant] = args, entry = catalogEntry(this.getId(), variant);
        const result = original(entity, 0, mirror && ["merger", "splitter"].includes(variant) ? `${variant}-inverse` : variant);
        if (entry && ["merger", "splitter"].includes(entry.id)) setRolePorts(entity, entry, mirror);
        return result;
    });
    for (const method of ["getSprite", "getPreviewSprite", "getBlueprintSprite"]) patch(mod, owner, method, function (original, args) {
        const [mirror, variant] = args;
        return original(0, mirror && ["merger", "splitter"].includes(variant) ? `${variant}-inverse` : variant);
    });
    patch(mod, owner, "getSpecialOverlayRenderMatrix", function (original, args) {
        const [rotation, mirror, variant, entity] = args;
        return original(rotation, 0, mirror && ["merger", "splitter"].includes(variant) ? `${variant}-inverse` : variant, entity);
    });
    patch(mod, owner, "computeOptimalDirectionAndRotationVariantAtTile", function (original, args) {
        const result = original(...args), { root, variant } = args[0];
        if (["merger", "splitter"].includes(variant)) result.rotationVariant = root.hud.parts.buildingPlacer.twelvefoldMirror ?? 0;
        return result;
    });
}
export function installPlacement(mod: Engine): void {
    installBalancerMirrors(mod);
    for (const [suffix, code, vertical, key] of [["h", 72, false, "horizontal"], ["v", 86, true, "vertical"]] as const) {
        mod.modInterface.registerIngameKeybinding({ id: `twelvefold_flip_${suffix}`, keyCode: code, translation: text(null, `toolbar.${key}`), handler: (root: Engine) => flip(root, vertical) });
    }
    patch(mod, game.HUDBuildingPlacerLogic, "onSelectedMetaBuildingChanged", function (original, args) {
        const result = original(...args); syncPreview(this); return result;
    });
    patch(mod, game.HUDBuildingPlacerLogic, "startPipette", function (original, args) {
        const root = this.root, position = root.app.mousePosition;
        if (!(root.gameMode instanceof game.RegularGameMode) || !position || root.camera.getIsMapOverlayActive()) return original(...args);
        const tile = root.camera.screenToWorld(position).toTileSpace(), entity = root.map.getTileContent(tile, root.currentLayer);
        const data = entity?.components.StaticMapEntity ? game.getBuildingDataFromCode(entity.components.StaticMapEntity.code) : null;
        const entry = data ? catalogEntry(data.metaInstance.getId(), data.variant) : undefined;
        if (!entry || !hasMirror(entry)) return original(...args);
        const mirror = data.rotationVariant ?? 0;
        if (this.currentMetaBuilding.get()?.getId() === entry.metaId && this.currentVariant.get() === entry.variant && (mirrorChangesPorts(entry) ? this.twelvefoldMirror ?? 0 : 0) === mirror) { this.abortPlacement(); return }
        this.twelvefoldMirror = mirror;
        this.preferredVariants[entry.metaId] = entry.variant;
        root.hud.signals.buildingSelectedForPlacement.dispatch(data.metaInstance);
        this.currentVariant.set(entry.variant); this.currentBaseRotation = entity.components.StaticMapEntity.rotation;
        syncPreview(this);
    });
}
