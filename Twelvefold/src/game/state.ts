import { Progress } from "../domain/progress.ts";
import { MILESTONES } from "../domain/content.ts";
import { game, patch, type Engine } from "./api.ts";
import { text } from "../i18n/index.ts";
import { toDefinition } from "./shapes.ts";
export const MOD_ID = "mlj-twelvefold";
const states = new WeakMap<object, Progress>();
export function progress(root: Engine): Progress {
    let state = states.get(root);
    if (!state) { state = new Progress(root.map?.seed ?? 0); states.set(root, state) }
    return state;
}
/** 原版单目标字段只作兼容显示，记账由 Progress 完成。 */
export function refreshGoal(root: Engine, goals: Engine = root.hubGoals): void {
    if (!goals || !root.shapeDefinitionMgr) return;
    const state = progress(root), previousKey = goals.currentGoal?.definition?.getHash();
    const milestone = MILESTONES[Math.min(state.stage, 6) - 1]!;
    const index = milestone.goals.findIndex((goal, i) => state.main[milestone.stage - 1]![i]! < goal.required);
    const goal = milestone.goals[Math.max(0, index)]!;
    goals.level = state.stage;
    goals.currentGoal = { definition: state.order ? game.ShapeDefinition.fromShortKey(state.order.key) : toDefinition(goal.shape), required: state.order?.required ?? goal.required, reward: game.enumHubGoalRewards.no_reward, throughputOnly: false };
    if (previousKey !== goals.currentGoal.definition.getHash()) root.hud?.parts?.pinnedShapes?.rerenderFull();
}
export function installPersistence(mod: Engine): void {
    patch(mod, game.GameCore, "initNewGame", function (original, args) {
        const result = original(...args);
        states.set(this.root, new Progress(this.root.map.seed)); refreshGoal(this.root); return result;
    });
    mod.signals.gameSerialized.add((root: Engine, data: Engine) => { data.modExtraData[MOD_ID] = progress(root).serialize() });
    mod.signals.gameDeserialized.add((root: Engine, data: Engine) => {
        const saved = data.modExtraData?.[MOD_ID];
        if (!saved) throw new Error(text(root, "ui.newSave"));
        try { states.set(root, Progress.restore(saved)) }
        catch (error) { throw Object.assign(new Error(text(root, "ui.newSave")), { cause: error }) }
        refreshGoal(root);
    });
    mod.signals.gameInitialized.add((root: Engine) => { progress(root); refreshGoal(root) });
}
