import { game, vector, type Engine } from "./api.ts";
import { addMachineComponents, setRolePorts } from "./components.ts";
import { BUILDINGS, mirrorChangesPorts, type BuildingEntry } from "./catalog.ts";
import { artwork } from "./artwork.ts";
import { progress } from "./state.ts";

export function spritePath(entry: BuildingEntry, mirror = 0, blueprint = false): string {
    return `sprites/${blueprint ? "blueprints" : "buildings"}/${entry.metaId}${mirror ? "-1" : ""}.png`;
}
/** 每个目录建筑独立注册，镜像只占 code 中的 rotationVariant，不占工具栏格子。 */
export function registerBuilding(mod: Engine, entry: BuildingEntry, setup: (entity: Engine) => void, update: (entity: Engine, mirror: number) => void): void {
    class MetaCatalogBuilding extends game.ModMetaBuilding {
        constructor() { super(entry.metaId) }
        static getAllVariantCombinations(): Engine[] {
            return [0, 1].map(rotationVariant => ({ variant: "default", rotationVariant, name: entry.key, description: entry.tip }));
        }
        getLayer(): string { return entry.layer }
        getDimensions(): Engine { return vector(entry.width, entry.height) }
        getIsUnlocked(root: Engine): boolean { return progress(root).unlocked(entry.stage, entry.research) }
        getAvailableVariants(root: Engine): string[] { return this.getIsUnlocked(root) ? ["default"] : [] }
        getSilhouetteColor(): string { return entry.layer === "wires" ? "#81aac8" : "#b6c4df" }
        getSprite(mirror = 0): Engine { return game.Loader.getSprite(spritePath(entry, mirror)) }
        getPreviewSprite(mirror = 0): Engine { return this.getSprite(mirror) }
        getBlueprintSprite(mirror = 0): Engine { return game.Loader.getSprite(spritePath(entry, mirror, true)) }
        computeOptimalDirectionAndRotationVariantAtTile({ root, rotation }: Engine): Engine {
            return { rotation, rotationVariant: mirrorChangesPorts(entry) ? root.hud.parts.buildingPlacer.twelvefoldMirror ?? 0 : 0 };
        }
        setupEntityComponents(entity: Engine): void { setup(entity) }
        updateVariants(entity: Engine, mirror: number): void { update(entity, mirror) }
    }
    mod.modInterface.registerNewBuilding({ metaClass: MetaCatalogBuilding, buildingIconBase64: artwork(entry, false, 0, true) });
    for (const mirror of [0, 1]) {
        mod.modInterface.registerSprite(spritePath(entry, mirror), artwork(entry, false, mirror));
        mod.modInterface.registerSprite(spritePath(entry, mirror, true), artwork(entry, true, mirror));
    }
}
export function installMachines(mod: Engine): void {
    for (const entry of BUILDINGS.filter(entry => entry.kind === "machine")) {
        registerBuilding(mod, entry, entity => addMachineComponents(entity, entry.signals.length > 0), (entity, mirror) => {
            entity.components.TwelvefoldMachine.configure(entry.id, entry.inputs.length, entry.outputs.length);
            setRolePorts(entity, entry, mirror);
        });
    }
}
