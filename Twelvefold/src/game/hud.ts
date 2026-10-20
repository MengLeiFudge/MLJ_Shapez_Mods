import { BLUEPRINTS, MILESTONES, RESEARCH, type Goal, type Research } from "../domain/content.ts";
import { tierRequirement, type Progress, type ProgressEvent } from "../domain/progress.ts";
import { Shape } from "../domain/shape.ts";
import { game, type Engine } from "./api.ts";
import { progress } from "./state.ts";
import { toDefinition } from "./shapes.ts";
import { NODES, circuitOf, setConstant } from "./circuits.ts";
import { ScalarItem } from "./signals.ts";
import { text, language } from "../i18n/index.ts";
const tabs = ["main", "sides", "research", "blueprints", "representatives", "orders", "help"] as const;
type Tab = (typeof tabs)[number];
const SHAPE_CACHE_LIMIT = 128;
export const formatPoints = (tenths: bigint): string => `${tenths / 10n}.${tenths % 10n}`;
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: Node, label?: string, className?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag); if (label !== undefined) node.textContent = label; if (className) node.className = className; parent.appendChild(node); return node;
};
export const CSS = `
.twelvefold-status{position:absolute;top:10px;left:210px;right:180px;z-index:120;box-sizing:border-box;border:1px solid var(--tf-border);border-radius:9px;padding:8px;pointer-events:auto;box-shadow:0 3px 12px #0004}
.twelvefold-summary-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.twelvefold-summary-head>div:last-child{color:var(--tf-muted)}
.twelvefold-goals{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin:5px 0}.twelvefold-goals[data-freeplay=true]{grid-template-columns:1fr}
.twelvefold-status .twelvefold-goal{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;padding:3px;font-size:.9em}.twelvefold-goal canvas{width:36px;height:36px}.twelvefold-goal span{direction:ltr;unicode-bidi:isolate;overflow-wrap:anywhere}.twelvefold-goal[data-completed=true]{background:var(--tf-active)}
.twelvefold-capability{margin:4px 0;color:var(--tf-muted)}.twelvefold-guide{display:flex;align-items:center;gap:8px;border-top:1px solid var(--tf-border);padding-top:5px;max-height:90px;overflow:auto}.twelvefold-guide span{flex:1}.twelvefold-guide button{flex:none;font-size:.9em}.twelvefold-summary-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
.twelvefold-panel button:disabled{opacity:.45;cursor:default}.twelvefold-panel{position:absolute;z-index:210;inset:10% 12% 12%;border:2px solid var(--tf-border);border-radius:12px;pointer-events:auto;display:flex;flex-direction:column;padding:14px;box-shadow:0 10px 40px #0009}
.twelvefold-header{display:flex;align-items:center;justify-content:space-between}.twelvefold-header h2{margin:3px}.twelvefold-tabs{display:flex;flex-wrap:wrap;gap:4px}.twelvefold-content{overflow:auto;flex:1;padding:8px}.twelvefold-row{display:flex;align-items:center;gap:12px;padding:6px;border-bottom:1px solid var(--tf-border)}.twelvefold-row span{flex:1;white-space:pre-line}.twelvefold-shape{width:70px;height:70px;border:0!important;background:transparent!important;padding:0!important}.twelvefold-shape canvas{width:64px;height:64px}.twelvefold-code{direction:ltr;unicode-bidi:isolate;font:12px monospace;word-break:break-all}.twelvefold-content p{line-height:1.6}.twelvefold-toast{position:absolute;right:15px;bottom:110px;z-index:200;background:var(--tf-surface);border:1px solid var(--tf-border);padding:12px;border-radius:7px;max-width:380px;white-space:pre-line;pointer-events:none}.twelvefold-panel input{min-width:260px;direction:ltr}.twelvefold-panel ol{direction:ltr}
`;
/** 替换原版研究面板，同时提供常驻进度入口；DOM 内容全部取当前游戏语言。 */
export class WorkshopHUD extends game.BaseHUDPart {
    private status!: HTMLElement;
    private summaryGoal!: HTMLElement;
    private summaryBalances!: HTMLElement;
    private goals!: HTMLElement;
    private capability!: HTMLElement;
    private guide!: HTMLElement;
    private guideMessage!: HTMLElement;
    private summaryActions!: HTMLElement;
    private summaryLayout = "";
    private summaryUpdates: Array<() => void> = [];
    private panel!: HTMLElement;
    private content!: HTMLElement;
    private title!: HTMLElement;
    private navigation!: HTMLElement;
    private toast!: HTMLElement;
    private currentTab: Tab = "main";
    private visible = false;
    private armed = false;
    private node: Engine = null;
    private revision = -1;
    private summaryState: Progress | null = null;
    private panelState: Progress | null = null;
    private panelLayout = "";
    private panelUpdates: Array<() => void> = [];
    /** 每个 HUD 缓存有限数量的图形底图；显示节点复制像素，多个相同图形可同时显示。 */
    private shapeCanvases = new Map<string, HTMLCanvasElement>();
    private nextUpdate = 0;
    private toastUntil = 0;
    private notifications: ProgressEvent[] = [];
    constructor(root: Engine) { super(root) }
    createElements(parent: DocumentFragment): void {
        this.status = element("div", parent, undefined, "twelvefold-status");
        const summaryHeader = element("div", this.status, undefined, "twelvefold-summary-head");
        this.summaryGoal = element("div", summaryHeader); this.summaryBalances = element("div", summaryHeader);
        this.goals = element("div", this.status, undefined, "twelvefold-goals");
        this.capability = element("p", this.status, undefined, "twelvefold-capability");
        this.guide = element("div", this.status, undefined, "twelvefold-guide"); this.guideMessage = element("span", this.guide);
        this.button(this.guide, "guide.dismiss", () => { const state = progress(this.root); state.guideDismissed = true; state.revision++; this.renderSummary() });
        this.summaryActions = element("div", this.status, undefined, "twelvefold-summary-actions");
        this.panel = element("section", parent, undefined, "twelvefold-panel"); this.panel.hidden = true;
        const header = element("div", this.panel, undefined, "twelvefold-header"); this.title = element("h2", header);
        const close = element("button", header, text(this.root, "ui.close")); close.onclick = () => this.close();
        this.navigation = element("nav", this.panel, undefined, "twelvefold-tabs"); this.content = element("div", this.panel, undefined, "twelvefold-content");
        this.toast = element("div", parent, undefined, "twelvefold-toast"); this.toast.hidden = true;
        const dir = language(this.root) === "he" ? "rtl" : "ltr"; this.panel.dir = dir; this.status.dir = dir; this.toast.dir = dir;
        for (const container of [this.status, this.panel]) for (const event of ["mousedown", "mouseup", "wheel", "contextmenu"]) container.addEventListener(event, event => event.stopPropagation());
    }
    initialize(): void {
        this.root.keyMapper.getBinding(game.KEYMAPPINGS.ingame.menuOpenShop).add(() => { this.visible ? this.close() : this.show(); return game.STOP_PROPAGATION });
        const dismiss = (): Engine => { if (this.visible || this.armed) { this.close(); return game.STOP_PROPAGATION } };
        this.root.keyMapper.getBinding(game.KEYMAPPINGS.general.back).addToTop(dismiss);
        this.root.keyMapper.getBinding(game.KEYMAPPINGS.ingame.menuClose).addToTop(dismiss);
        this.root.camera.downPreHandler.add((position: Engine, button: Engine) => {
            if (!this.armed || button !== game.enumMouseButton.left) return;
            const tile = this.root.camera.screenToWorld(position).toTileSpace(), entity = this.root.map.getTileContent(tile, "wires");
            if (entity && circuitOf(entity)) { this.armed = false; this.editNode(entity) }
            return game.STOP_PROPAGATION;
        });
        this.button(this.summaryActions, "ui.main", () => this.show("main"));
        this.button(this.summaryActions, "ui.research", () => this.show());
        this.button(this.summaryActions, "ui.configure", () => { this.close(); this.armed = true; this.toast.textContent = text(this.root, "ui.pickNode"); this.toast.hidden = false; this.toastUntil = performance.now() + 10000 });
        this.renderSummary();
    }
    show(tab: Tab = "research"): void { this.visible = true; this.panel.hidden = false; this.node = null; this.currentTab = tab; progress(this.root).observeGuide(5); this.renderPanel() }
    close(): void { this.visible = false; this.panel.hidden = true; this.node = null; this.armed = false }
    isBlockingOverlay(): boolean { return this.visible }
    shouldPauseGame(): boolean { return false }
    cleanup(): void {
        this.panelUpdates = []; this.summaryUpdates = []; this.shapeCanvases.clear(); this.panelState = this.summaryState = null;
        this.status.remove(); this.panel.remove(); this.toast.remove();
    }
    update(): void {
        const now = performance.now(), state = progress(this.root);
        if (now >= this.toastUntil) this.toast.hidden = true;
        this.notifications.push(...state.events.splice(0));
        if (now >= this.toastUntil && this.notifications.length) {
            const event = this.notifications.shift()!;
            const research = event.kind === "purchase" ? RESEARCH.find(item => item.id === event.id) : null;
            const parts = event.id.split(".");
            const detail = research ? this.researchName(research) : event.kind === "side" ? `${parts[0]!.slice(1)} · ${text(this.root, "ui.group")} ${Number(parts[1]) + 1} · ${Number(parts[2]) + 1}` : event.id;
            const category = event.kind === "milestone" ? "milestone" : event.kind === "side" ? "sides" : event.kind === "tier" ? "tier" : event.kind === "order" ? "orders" : "research";
            const capability = event.kind === "milestone" ? `\n${text(this.root, `guide.m${Number(event.id) + 1}`)}` : "";
            this.toast.textContent = `${text(this.root, "ui.completed")} · ${text(this.root, `ui.${category}`)} ${detail}${event.reward ? ` · +${event.reward} ${text(this.root, "ui.science")}` : ""}${capability}`;
            this.toast.hidden = false; this.toastUntil = now + 3500;
        }
        if (now < this.nextUpdate) return;
        this.nextUpdate = now + 250;
        this.positionStatus();
        if (this.summaryState !== state || this.revision !== state.revision || this.summaryLayout !== this.summaryLayoutKey(state)) {
            this.renderSummary(); if (this.visible && !this.node) this.refreshPanel();
        }
    }
    private button(parent: HTMLElement, key: string, click: () => void): HTMLButtonElement { const button = element("button", parent, text(this.root, key)); button.onclick = click; return button }
    private summaryLayoutKey(state: Progress): string { return `${language(this.root)}:${game.THEME.items.circleBackground}:${state.stage}:${state.order?.id ?? 0}` }
    /** 五目标按钮只在换阶段、换订单或主题变化时重建，交付量原地更新。 */
    private renderSummary(): void {
        const state = progress(this.root), layout = this.summaryLayoutKey(state);
        if (this.summaryState !== state || this.summaryLayout !== layout) {
            this.goals.replaceChildren(); this.summaryUpdates = []; this.summaryLayout = layout;
            this.goals.dataset.freeplay = String(state.freeplay);
            const goals = state.freeplay ? [{ shape: Shape.parse(state.order!.key), required: state.order!.required }] : MILESTONES[state.stage - 1]!.goals;
            goals.forEach((goal, i) => {
                const button = this.shape(this.goals, goal.shape, true), count = element("span", button);
                const label = state.freeplay ? `${text(this.root, "ui.orderId")} ${state.order!.id}` : `${state.stage}.${i + 1}`;
                button.title = `${label} · ${goal.shape.key}`; button.setAttribute("aria-label", button.title);
                this.summaryUpdates.push(() => {
                    const delivered = state.freeplay ? state.order!.delivered : state.main[state.stage - 1]![i]!;
                    const value = `${delivered}/${goal.required}`;
                    if (count.textContent !== value) count.textContent = value;
                    button.dataset.completed = String(delivered >= goal.required);
                });
            });
        }
        this.summaryState = state; this.revision = state.revision; this.summaryUpdates.forEach(update => update());
        const completed = state.freeplay ? 0 : MILESTONES[state.stage - 1]!.goals.filter((goal, i) => state.main[state.stage - 1]![i]! >= goal.required).length;
        this.summaryGoal.textContent = state.freeplay ? `${text(this.root, "ui.freeplay")} ${state.order!.id}` : `${text(this.root, "ui.milestone")} ${state.stage} · ${completed}/5`;
        this.summaryBalances.textContent = `${text(this.root, "ui.science")}: ${state.science} · ${text(this.root, "ui.points")}: ${formatPoints(state.blueprintTenths)}`;
        this.capability.textContent = text(this.root, `guide.m${state.stage}`);
        const step = state.guideSteps.findIndex(done => !done), keys = ["miner", "belt", "cut", "rotate", "detail", "workshop"];
        this.guide.hidden = state.guideDismissed;
        this.guideMessage.textContent = step < 0 ? `6/6 · ${text(this.root, "guide.done")}` : `${step + 1}/6 · ${text(this.root, `guide.${keys[step]}`)}`;
    }
    /** 已核对原版 CSS：菜单顶右、键位顶左、固定图形左侧；空间不足时在它们下方显示。 */
    private positionStatus(): void {
        const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1, gap = 10 * scale;
        const bounds = (id: string): DOMRect | undefined => {
            const element = document.getElementById(id), rect = element?.getBoundingClientRect();
            return rect?.width && rect.height ? rect : undefined;
        };
        const keys = bounds("ingame_HUD_KeybindingOverlay"), menu = bounds("ingame_HUD_GameMenu"), pins = bounds("ingame_HUD_PinnedShapes");
        let left = Math.max(gap, keys ? keys.right + gap : gap, pins ? pins.right + gap : gap), right = menu ? window.innerWidth - menu.left + gap : gap;
        let top = gap;
        if (window.innerWidth - left - right < 340 * scale) {
            left = right = gap; top = Math.max(keys?.bottom ?? 0, menu?.bottom ?? 0, pins?.bottom ?? 0) + gap;
        }
        // 原版蓝图费用和色盲提示位于顶部中央；保留五目标可见，不覆盖这些在用的提示。
        for (const id of ["ingame_HUD_BlueprintPlacer", "ingame_HUD_ColorBlindBelowTileHelper"]) {
            const popup = bounds(id);
            if (popup) top = Math.max(top, popup.bottom + gap);
        }
        const width = Math.min(660 * scale, window.innerWidth - left - right);
        this.status.style.left = `${left + Math.max(0, (window.innerWidth - left - right - width) / 2)}px`;
        this.status.style.right = "auto"; this.status.style.width = `${Math.max(0, width)}px`; this.status.style.top = `${top}px`;
    }
    /** 结构键只包含当前标签的行集合；交付量、余额和购买状态由现有节点显示。 */
    private panelLayoutKey(state: Progress): string {
        const key = `${language(this.root)}:${game.THEME.items.circleBackground}:${this.currentTab}`;
        switch (this.currentTab) {
            case "main": return `${key}:${state.stage}:${state.order?.id ?? 0}:${state.order?.key ?? ""}`;
            case "orders": return `${key}:${state.history.length}:${state.order?.key ?? ""}`;
            case "sides": case "blueprints": case "representatives": return `${key}:${state.stage}`;
            default: return key;
        }
    }
    /** 保留按钮身份与滚动位置；恢复账本或行集合变化时才重建当前标签。 */
    private refreshPanel(): void {
        const state = progress(this.root);
        if (this.panelState !== state || this.panelLayout !== this.panelLayoutKey(state)) this.renderPanel();
        else this.panelUpdates.forEach(update => update());
    }
    /** 动态文字绑定到当前标签的节点，未变化的文字保留原 DOM。 */
    private bindText(node: HTMLElement, value: () => string): void {
        const update = (): void => { const label = value(); if (node.textContent !== label) node.textContent = label };
        this.panelUpdates.push(update); update();
    }
    private shape(parent: HTMLElement, shape: Shape, compact = false): HTMLButtonElement {
        const button = element("button", parent, undefined, compact ? "twelvefold-goal" : "twelvefold-shape"); button.title = shape.key;
        const definition = toDefinition(shape), key = `${game.THEME.items.circleBackground}:${shape.key}`;
        let image = this.shapeCanvases.get(key);
        if (!image) {
            image = definition.generateAsCanvas(64) as HTMLCanvasElement;
            if (this.shapeCanvases.size >= SHAPE_CACHE_LIMIT) this.shapeCanvases.delete(this.shapeCanvases.keys().next().value!);
            this.shapeCanvases.set(key, image);
        }
        const canvas = element("canvas", button); canvas.width = canvas.height = 64; canvas.getContext("2d")!.drawImage(image, 0, 0);
        button.onclick = () => this.root.hud.signals.viewShapeDetailsRequested.dispatch(definition);
        return button;
    }
    private researchName(research: Research): string {
        return research.speed ? `${text(this.root, `ui.${research.speed}`)} ${text(this.root, "ui.speed")} ${research.level} · ×${1 + .5 * research.level!}` : text(this.root, `machine.${research.id}`);
    }
    private goal(goal: Goal, delivered: () => number, label: string, locked: () => boolean = () => false): void {
        const row = element("div", this.content, undefined, "twelvefold-row"); this.shape(row, goal.shape);
        const name = goal.name.startsWith("goal.") ? text(this.root, goal.name) : goal.name.startsWith("side.") ? "" : goal.name;
        this.bindText(element("span", row), () => {
            const count = delivered();
            return `${label}${name ? ` · ${name}` : ""}\n${text(this.root, "ui.delivered")}: ${count}/${goal.required}${count >= goal.required ? ` · ${text(this.root, "ui.completed")}` : locked() ? ` · ${text(this.root, "ui.locked")}` : ""}${goal.reward ? ` · ${text(this.root, "ui.reward")}: ${goal.reward}` : ""}`;
        });
        element("code", row, goal.shape.key, "twelvefold-code");
    }
    private renderPanel(): void {
        const oldScroll = this.content.scrollTop; this.content.replaceChildren(); this.navigation.replaceChildren(); this.title.textContent = `Twelvefold · ${text(this.root, `ui.${this.currentTab}`)}`;
        for (const tab of tabs) { const button = this.button(this.navigation, `ui.${tab}`, () => { this.currentTab = tab; this.node = null; this.content.scrollTop = 0; this.renderPanel() }); button.dataset.active = String(tab === this.currentTab) }
        const state = progress(this.root);
        this.panelUpdates = []; this.panelState = state; this.panelLayout = this.panelLayoutKey(state);
        switch (this.currentTab) {
            case "main":
                if (state.freeplay) this.renderOrder(state);
                else MILESTONES[state.stage - 1]!.goals.forEach((goal, i) => this.goal(goal, () => state.main[state.stage - 1]![i]!, `${state.stage}.${i + 1}`));
                break;
            case "sides":
                for (const milestone of MILESTONES.filter(item => item.stage <= state.stage)) milestone.sides.forEach((group, index) => {
                    element("h3", this.content, `${text(this.root, "ui.milestone")} ${milestone.stage} · ${text(this.root, "ui.group")} ${index + 1}`);
                    group.forEach((goal, i) => this.goal(goal, () => state.sides[goal.id] ?? 0, `${text(this.root, "ui.sides")} ${i + 1}`, () => group.slice(0, i).some(previous => (state.sides[previous.id] ?? 0) < previous.required)));
                });
                break;
            case "research":
                for (const research of RESEARCH) {
                    const row = element("div", this.content, undefined, "twelvefold-row");
                    const name = this.researchName(research);
                    element("span", row, `${name}\n${text(this.root, "ui.science")}: ${research.price} · ${research.stage <= 6 ? `${text(this.root, "ui.milestone")} ${research.stage}` : text(this.root, "ui.freeplay")}`);
                    const buy = this.button(row, "ui.buy", () => { if (state.buy(research.id)) { this.renderSummary(); this.refreshPanel() } });
                    const update = (): void => {
                        const owned = state.purchased.has(research.id), available = state.available(research);
                        const label = text(this.root, owned ? "ui.owned" : available ? "ui.buy" : "ui.locked");
                        if (buy.textContent !== label) buy.textContent = label;
                        buy.disabled = owned || !available || state.science < BigInt(research.price);
                    };
                    this.panelUpdates.push(update); update();
                }
                break;
            case "blueprints":
                this.bindText(element("p", this.content), () => `${text(this.root, "ui.points")}: ${formatPoints(state.blueprintTenths)} · 0.5 / ◼`);
                for (const blueprint of BLUEPRINTS.filter(item => item.stage <= state.stage)) {
                    const row = element("div", this.content, undefined, "twelvefold-row"); this.shape(row, blueprint.shape); element("span", row, `${blueprint.id} · +${blueprint.value} ${text(this.root, "ui.points")}`);
                }
                break;
            case "representatives":
                for (const m of MILESTONES.filter(item => item.stage < state.stage)) {
                    const row = element("div", this.content, undefined, "twelvefold-row"); this.shape(row, m.representative);
                    this.bindText(element("span", row), () => {
                        const tier = state.tiers[m.stage - 1]!;
                        return `M${m.stage} · ${text(this.root, "ui.tier")}: ${tier.level}\n${tier.delivered}/${tierRequirement(m.stage, tier.level)} · +${m.tierReward} ${text(this.root, "ui.science")}`;
                    });
                }
                break;
            case "orders": this.renderOrder(state); for (let i = state.history.length - 2; i >= 0; i--) {
                const row = element("div", this.content, undefined, "twelvefold-row"); this.shape(row, Shape.parse(state.history[i]!)); element("span", row, `${text(this.root, "ui.orderId")}: ${i + 1} · ${text(this.root, "ui.completed")}`);
            } break;
            case "help": for (const key of ["geometry", "processing", "center", "progress", "circuits", "hyperlink"]) element("p", this.content, text(this.root, `help.${key}`)); break;
        }
        this.content.scrollTop = oldScroll;
    }
    private renderOrder(state: Progress): void {
        const order = state.order;
        if (!order) { element("p", this.content, `${text(this.root, "ui.hasOrder")}: false · M6`); return }
        const row = element("div", this.content, undefined, "twelvefold-row"); this.shape(row, Shape.parse(order.key));
        this.bindText(element("span", row), () => `${text(this.root, "ui.orderId")}: ${order.id}\n${order.delivered}/${order.required} · ${text(this.root, "ui.remaining")}: ${order.required - order.delivered}\n${text(this.root, "ui.reward")}: ${order.reward}`);
        element("code", row, order.key, "twelvefold-code");
    }
    editNode(entity: Engine): void {
        const circuit = circuitOf(entity), spec = circuit && NODES.find(node => node.kind === circuit.kind); if (!circuit || !spec) return;
        this.node = entity; this.visible = true; this.panel.hidden = false; this.panelUpdates = []; this.panelState = null; this.navigation.replaceChildren(); this.content.replaceChildren();
        this.title.textContent = text(this.root, spec.kind.startsWith("virtual.") ? `machine.${spec.kind.slice(8)}` : `node.${spec.kind}`);
        element("p", this.content, text(this.root, "help.circuits"));
        for (const [side, labels] of [["input", spec.inputs], ["output", spec.outputs]] as const) {
            element("h3", this.content, `${text(this.root, `ui.${side}`)} · ${text(this.root, "ui.ports")}`);
            const list = element("ol", this.content);
            labels.forEach(label => element("li", list, text(this.root, `ui.${label === "value" ? side : label}`)));
        }
        if (!spec.constant) return;
        let input: HTMLInputElement | HTMLSelectElement;
        if (spec.kind === "boolConstant" || spec.kind === "colorConstant" || spec.kind === "pieceConstant") {
            input = element("select", this.content);
            const options = spec.kind === "boolConstant" ? ["true", "false"] : spec.kind === "pieceConstant" ? ["E", "N", "D", "A"] : ["r", "o", "y", "l", "g", "m", "c", "h", "b", "z", "p", "i", "w", "k", "u"];
            for (const value of options) { const option = element("option", input, spec.kind === "colorConstant" ? text(this.root, `color.${value}`) : value); option.value = value }
        } else { input = element("input", this.content); input.type = "text"; input.spellcheck = false }
        const item = circuit.constant;
        input.value = item instanceof ScalarItem ? String(item.value) : item?.getItemType() === "boolean" ? String(!!item.value) : item?.getAsCopyableKey() ?? "";
        const message = element("p", this.content);
        this.button(this.content, "ui.apply", () => { message.textContent = setConstant(entity, circuit.kind, input.value.trim()) ? text(this.root, "ui.completed") : text(this.root, "ui.invalid") });
    }
}
