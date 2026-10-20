import { BLUEPRINTS, MILESTONES, RESEARCH, type SpeedCategory } from "../domain/content.ts";
import { game, patch, type Engine } from "./api.ts";
import { progress, refreshGoal } from "./state.ts";
import { fromDefinition } from "./shapes.ts";
import { BASE_BELT_SPEED } from "./machine-system.ts";
import { WorkshopHUD, CSS } from "./hud.ts";
const speedKeys: Record<string, SpeedCategory> = { belt: "belt", miner: "mining", processors: "processing", painting: "painting" };
const startingRewards = new Set(["reward_cutter_and_trash", "reward_rotater", "reward_balancer", "reward_tunnel", "reward_storage", "reward_merger", "reward_splitter", "reward_blueprints"]);
const wiresRewards = new Set(["reward_wires_painter_and_levers", "reward_display", "reward_constant_signal", "reward_logic_gates", "reward_belt_reader"]);
export function installIntegration(mod: Engine): void {
    mod.modInterface.registerCss(CSS);
    patch(mod, game.RegularGameMode, "getLevelDefinitions", function () {
        return MILESTONES.map(m => ({ shape: m.goals[0]!.shape.key, required: m.goals[0]!.required, reward: game.enumHubGoalRewards.no_reward, throughputOnly: false }));
    });
    patch(mod, game.RegularGameMode, "getUpgrades", function () {
        // shapez 1.5.6 的 GameCore.initializeRoot 先构造 HubGoals，再调用 hud.initialize。
        // HubGoals 构造时同步调用 getUpgrades（参考 bundle.js:41599），HUD 随后才读取清单（41700）。
        this.additionalHudParts.shop = WorkshopHUD;
        for (const part of ["tutorialHints", "interactiveTutorial", "tutorialVideoOffer", "unlockNotification"]) delete this.additionalHudParts[part];
        return { belt: [], miner: [], processors: [], painting: [] };
    });
    patch(mod, game.RegularGameMode, "hasAchievements", function () { return false });
    patch(mod, game.GameMode, "getBlueprintShapeKey", function () { return BLUEPRINTS[0]!.shape.key });
    patch(mod, game.HubGoals, "computeNextGoal", function () { refreshGoal(this.root, this) });
    patch(mod, game.HubGoals, "isFreePlay", function () { return progress(this.root).freeplay });
    patch(mod, game.HubGoals, "isRewardUnlocked", function (_original, args) {
        const reward = args[0], state = progress(this.root);
        if (startingRewards.has(reward)) return true;
        if (wiresRewards.has(reward)) return state.stage >= 3;
        if (reward === "reward_underground_belt_tier_2") return state.stage >= 2;
        if (reward === "reward_miner_chainable") return state.purchased.has("chainMiner");
        if (reward === "reward_stacker") return state.stage >= 3;
        if (reward === "reward_painter") return state.stage >= 4;
        if (reward === "reward_virtual_processing") return state.stage >= 6;
        if (reward === "reward_freeplay") return state.freeplay;
        return false;
    });
    patch(mod, game.HubGoals, "getBeltBaseSpeed", function () { return BASE_BELT_SPEED * progress(this.root).multiplier("belt") });
    patch(mod, game.HubGoals, "getUndergroundBeltBaseSpeed", function () { return BASE_BELT_SPEED * progress(this.root).multiplier("belt") });
    patch(mod, game.HubGoals, "getMinerBaseSpeed", function () { return BASE_BELT_SPEED / 4 * progress(this.root).multiplier("mining") });
    patch(mod, game.HubGoals, "getProcessorBaseSpeed", function (_original, args) {
        if (args[0] === game.enumItemProcessorTypes.balancer) return BASE_BELT_SPEED * progress(this.root).multiplier("belt");
        if (args[0] === game.enumItemProcessorTypes.hub) return 1e9;
        return BASE_BELT_SPEED * progress(this.root).multiplier("processing");
    });
    patch(mod, game.HubGoals, "getUpgradeLevel", function (_original, args) { return progress(this.root).speeds[speedKeys[args[0]] ?? "processing"] });
    patch(mod, game.HubGoals, "canUnlockUpgrade", function () { return false });
    patch(mod, game.HubGoals, "tryUnlockUpgrade", function () { return false });
    patch(mod, game.HubGoals, "getAvailableUpgradeCount", function () { const state = progress(this.root); return RESEARCH.filter(item => state.available(item) && state.science >= BigInt(item.price)).length });
    patch(mod, game.HubGoals, "handleDefinitionDelivered", function (_original, args) {
        const shape = fromDefinition(args[0]), state = progress(this.root);
        if (!shape || !state.deliver(shape)) return false;
        this.storedShapes[shape.key] = Math.min(Number.MAX_SAFE_INTEGER, (this.storedShapes[shape.key] ?? 0) + 1);
        this.root.signals.shapeDelivered.dispatch(args[0]); refreshGoal(this.root); return true;
    });
    patch(mod, game.HubGoals, "getCurrentGoalDelivered", function () {
        const state = progress(this.root);
        if (state.order) return state.order.delivered;
        const milestone = MILESTONES[state.stage - 1]!;
        const index = milestone.goals.findIndex(goal => goal.shape.key === this.currentGoal.definition.getHash());
        return state.main[state.stage - 1]![Math.max(0, index)];
    });
    patch(mod, game.HubGoals, "getShapesStoredByKey", function (original, args) {
        return args[0] === this.root.gameMode.getBlueprintShapeKey() ? Number(progress(this.root).blueprintTenths) / 10 : original(...args);
    });
    patch(mod, game.HubGoals, "getShapesStored", function (original, args) {
        return args[0].getHash() === this.root.gameMode.getBlueprintShapeKey() ? Number(progress(this.root).blueprintTenths) / 10 : original(...args);
    });
    patch(mod, game.Blueprint, "getCost", function () { return this.entities.length * .5 });
    patch(mod, game.Blueprint, "canAfford", function (_original, args) { return progress(args[0]).blueprintTenths >= BigInt(this.entities.length) * 5n });
    patch(mod, game.Blueprint, "tryPlace", function (original, args) {
        const state = progress(args[0]), fee = BigInt(this.entities.length) * 5n;
        if (!state.spendBlueprint(fee)) return false;
        let placed = false;
        try { placed = !!original(...args); return placed }
        finally { if (!placed) { state.blueprintTenths += fee; state.revision++ } }
    });
    // 原版放置界面在 tryPlace 成功后还调用此方法；费用已由上面的事务结算。
    patch(mod, game.HubGoals, "takeShapeByKey", function (original, args) { if (args[0] !== this.root.gameMode.getBlueprintShapeKey()) return original(...args) });
    const excluded = [game.MetaCutterBuilding, game.MetaRotaterBuilding, game.MetaStackerBuilding, game.MetaPainterBuilding, game.MetaMixerBuilding, game.MetaTrashBuilding,
        game.MetaFilterBuilding, game.MetaReaderBuilding, game.MetaLeverBuilding, game.MetaConstantSignalBuilding, game.MetaLogicGateBuilding, game.MetaComparatorBuilding,
        game.MetaTransistorBuilding, game.MetaDisplayBuilding, game.MetaVirtualProcessorBuilding, game.MetaAnalyzerBuilding];
    for (const meta of excluded) patch(mod, meta, "getIsUnlocked", function () { return false });
    mod.signals.hudElementInitialized.add((part: Engine) => {
        if (part.constructor.name === "HUDBuildingsToolbar" || part.constructor.name === "HUDWiresToolbar") {
            part.primaryBuildings = part.primaryBuildings.filter((meta: Engine) => !excluded.includes(meta));
            part.secondaryBuildings = part.secondaryBuildings.filter((meta: Engine) => !excluded.includes(meta));
        }
    });
}
