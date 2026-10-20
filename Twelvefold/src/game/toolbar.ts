import { game, patch, type Engine } from "./api.ts";
import { BUILDING_BY_ID, CATEGORIES, catalogEntry, type BuildingEntry, type BuildingCategory } from "./catalog.ts";
import { artwork } from "./artwork.ts";
import { progress } from "./state.ts";
import { buildingName, buildingDescription, text } from "../i18n/index.ts";

export const TOOLBAR_CSS = `
.twelvefold-toolbar{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);z-index:115;pointer-events:auto;font:var(--tf-font);color:var(--tf-fg)}
.twelvefold-toolbar[hidden],.twelvefold-subtoolbar[hidden]{display:none}
.twelvefold-categories,.twelvefold-subtoolbar{display:flex;gap:5px;padding:6px;background:var(--tf-bg);border:1px solid var(--tf-border);border-radius:10px;box-shadow:0 3px 12px #0005}
.twelvefold-subtoolbar{position:fixed;bottom:82px;transform:translateX(-50%);max-width:94vw;overflow-x:auto}
.twelvefold-tool{position:relative;width:48px;height:48px;flex:none;padding:3px;border:1px solid transparent;border-radius:6px;background:transparent;cursor:pointer;color:inherit}
.twelvefold-tool:hover{background:var(--tf-active)}.twelvefold-tool[data-selected=true]{background:var(--tf-active);border-color:var(--tf-border);box-shadow:inset 0 0 0 1px var(--tf-border)}
.twelvefold-tool img{width:100%;height:100%;object-fit:contain;pointer-events:none}.twelvefold-tool .tf-key{position:absolute;bottom:0;right:2px;font-weight:bold;padding:0 3px;border-radius:4px;background:var(--tf-bg)}
.twelvefold-tool .tf-new{position:absolute;top:-3px;right:-3px;background:#a73558;color:white;font:10px sans-serif;padding:2px 3px;border-radius:5px;pointer-events:none}
`;
const keyId = (digit: number): string => `twelvefold_category_${digit}`;
function metaFor(root: Engine, entry: BuildingEntry): Engine {
    const meta = game.gMetaBuildingRegistry.findById(entry.metaId);
    if (!meta) throw new Error(`Missing catalog registration: ${entry.id}`);
    return meta;
}
/** 替换两层原版栏；只传选中的 meta + variant，实际放置和吸管继续使用原版组件。 */
export class CategorizedToolbar extends game.BaseHUDPart {
    private element!: HTMLElement;
    private categories!: HTMLElement;
    private sub!: HTMLElement;
    private active: string | null = null;
    private last = new Map<string, string>();
    private layout = "";
    private buttons = new Map<string, HTMLButtonElement>();
    private categoryButtons = new Map<string, HTMLButtonElement>();
    constructor(root: Engine) { super(root) }
    createElements(parent: DocumentFragment): void {
        this.element = document.createElement("nav"); this.element.className = "twelvefold-toolbar"; parent.appendChild(this.element);
        this.categories = document.createElement("div"); this.categories.className = "twelvefold-categories"; this.element.appendChild(this.categories);
        this.sub = document.createElement("div"); this.sub.className = "twelvefold-subtoolbar"; this.element.appendChild(this.sub); this.sub.hidden = true;
        for (const name of ["mousedown", "mouseup", "contextmenu", "wheel"]) this.element.addEventListener(name, event => {
            event.stopPropagation();
            if (name === "contextmenu") { event.preventDefault(); this.cancel() }
        });
    }
    initialize(): void {
        this.root.keyMapper.getBinding(game.KEYMAPPINGS.general.back).addToTop(() => this.cancel());
        this.root.keyMapper.getBinding(game.KEYMAPPINGS.placement.cycleBuildings).addToTop(() => this.nextCategory());
        this.root.camera.downPreHandler.addToTop((_position: Engine, button: Engine) => button === game.enumMouseButton.right ? this.cancel() : undefined);
    }
    private available(category: BuildingCategory): BuildingEntry[] {
        const state = progress(this.root);
        return category.buildings.map(id => BUILDING_BY_ID.get(id)!).filter(entry => state.unlocked(entry.stage, entry.research) && metaFor(this.root, entry).getIsUnlocked(this.root));
    }
    private current(): BuildingEntry | undefined {
        const placer = this.root.hud.parts.buildingPlacer, meta = placer.currentMetaBuilding?.get();
        return meta ? catalogEntry(meta.getId(), placer.currentVariant.get()) : undefined;
    }
    private nextCategory(): Engine {
        if (this.root.hud.hasBlockingOverlayOpen() || this.root.camera.getIsMapOverlayActive()) return;
        const categories = CATEGORIES.filter(category => category.layer === this.root.currentLayer && this.available(category).length);
        if (!categories.length) return;
        const index = categories.findIndex(category => category.id === (this.current()?.category ?? this.active));
        return this.chooseDigit(categories[(index + 1) % categories.length]!.digit);
    }
    chooseDigit(digit: number): Engine {
        if (this.root.hud.hasBlockingOverlayOpen() || this.root.camera.getIsMapOverlayActive()) return;
        const category = CATEGORIES.find(category => category.layer === this.root.currentLayer && category.digit === digit);
        if (!category || !this.available(category).length) return game.STOP_PROPAGATION;
        if (this.active === category.id && this.current()?.category === category.id) return this.cycle();
        this.active = category.id;
        const entries = this.available(category), selected = entries.find(entry => entry.id === this.last.get(category.id)) ?? entries[0]!;
        this.select(selected); return game.STOP_PROPAGATION;
    }
    cycle(): Engine {
        if (this.root.hud.hasBlockingOverlayOpen()) return;
        const current = this.current(), category = CATEGORIES.find(category => category.id === (current?.category ?? this.active) && category.layer === this.root.currentLayer);
        if (!category) return;
        const entries = this.available(category); if (!entries.length) return;
        const index = entries.findIndex(entry => entry.id === current?.id);
        this.active = category.id; this.select(entries[(index + 1) % entries.length]!); return game.STOP_PROPAGATION;
    }
    select(entry: BuildingEntry): void {
        const placer = this.root.hud.parts.buildingPlacer, meta = metaFor(this.root, entry);
        // 矿机购买后由原位升级提供链式能力，工具栏始终只占一格。
        const variant = entry.id === "miner" && progress(this.root).purchased.has("chainMiner") ? "chainable" : entry.variant;
        placer.preferredVariants[entry.metaId] = variant;
        this.active = entry.category; this.last.set(entry.category, entry.id);
        this.root.hud.signals.buildingSelectedForPlacement.dispatch(meta);
        // 原版 TrackedState 在 meta 相同时不通知；同一 meta 的隧道/平衡器仍须显式切换 variant。
        if (placer.currentVariant.get() !== variant) { placer.currentVariant.set(variant); placer.onSelectedMetaBuildingChanged(meta) }
        progress(this.root).markBuildingSeen(entry.id); this.layout = "";
    }
    cancel(): Engine {
        const placer = this.root.hud.parts.buildingPlacer;
        if (!this.active && !placer.currentMetaBuilding?.get()) return;
        if (this.root.hud.hasBlockingOverlayOpen()) return;
        placer.abortPlacement(); this.active = null; this.sub.hidden = true; this.layout = ""; return game.STOP_PROPAGATION;
    }
    private keyLabel(digit: number): string { return this.root.keyMapper.getBindingById(keyId(digit)).getKeyCodeString() }
    private button(parent: HTMLElement, entry: BuildingEntry, label: string, handler: () => void): HTMLButtonElement {
        const button = document.createElement("button"); button.type = "button"; button.className = "twelvefold-tool"; button.title = label; button.setAttribute("aria-label", label);
        const image = document.createElement("img"); image.src = artwork(entry, false, 0, true); image.alt = ""; button.appendChild(image);
        button.onclick = handler; parent.appendChild(button); return button;
    }
    private badge(button: HTMLButtonElement, fresh: boolean): void {
        let badge = button.querySelector<HTMLElement>(".tf-new");
        if (fresh && !badge) { badge = document.createElement("span"); badge.className = "tf-new"; badge.textContent = text(this.root, "toolbar.new"); button.appendChild(badge) }
        if (!fresh) badge?.remove();
    }
    update(): void {
        this.element.hidden = this.root.camera.getIsMapOverlayActive();
        const state = progress(this.root), selected = this.current();
        if (selected) { this.active = selected.category; this.last.set(selected.category, selected.id); state.markBuildingSeen(selected.id) }
        // 未选中建筑时收起小类行；不把 TrackedState 对象本身当成选择状态。
        else this.active = null;
        const byCategory = new Map(CATEGORIES.filter(category => category.layer === this.root.currentLayer).map(category => [category.id, this.available(category)]));
        const categories = CATEGORIES.filter(category => category.layer === this.root.currentLayer && byCategory.get(category.id)!.length);
        const layout = `${this.root.currentLayer}|${this.active}|${categories.map(category => `${category.id}:${byCategory.get(category.id)!.map(entry => entry.id).join(",")}`).join(";")}`;
        if (layout !== this.layout) {
            this.layout = layout; this.categories.replaceChildren(); this.sub.replaceChildren(); this.buttons.clear(); this.categoryButtons.clear();
            for (const category of categories) {
                const entries = byCategory.get(category.id)!, entry = entries.find(entry => entry.id === this.last.get(category.id)) ?? entries[0]!;
                const label = entries.length === 1 ? buildingName(this.root, entry) : text(this.root, `toolbar.${category.id}`);
                const button = this.button(this.categories, entry, `${label} [${this.keyLabel(category.digit)}] — ${buildingDescription(this.root, entry)}`, () => this.chooseDigit(category.digit));
                const key = document.createElement("span"); key.className = "tf-key"; key.textContent = this.keyLabel(category.digit); button.appendChild(key); this.categoryButtons.set(category.id, button);
            }
            const category = categories.find(category => category.id === this.active), entries = category ? byCategory.get(category.id)! : [];
            this.sub.hidden = entries.length < 2;
            if (category && entries.length > 1) for (const entry of entries) this.buttons.set(entry.id, this.button(this.sub, entry, `${buildingName(this.root, entry)} [${this.keyLabel(category.digit)} / ${this.root.keyMapper.getBindingById("twelvefold_cycle").getKeyCodeString()}] — ${buildingDescription(this.root, entry)}`, () => this.select(entry)));
        }
        for (const category of categories) {
            const button = this.categoryButtons.get(category.id)!; button.dataset.selected = String(category.id === selected?.category);
            this.badge(button, byCategory.get(category.id)!.some(entry => !state.seenBuildings.has(entry.id)));
        }
        for (const [id, button] of this.buttons) { button.dataset.selected = String(selected?.id === id); this.badge(button, !state.seenBuildings.has(id)) }
        if (!this.sub.hidden) {
            const bounds = this.categoryButtons.get(this.active!)!.getBoundingClientRect(), half = this.sub.offsetWidth / 2;
            // fixed 元素仍在 transform 容器内；换算成工具栏本地坐标后再限制屏幕边界。
            const toolbar = this.element.getBoundingClientRect();
            this.sub.style.left = `${Math.max(half + 8, Math.min(window.innerWidth - half - 8, bounds.left + bounds.width / 2)) - toolbar.left}px`;
        }
    }
    cleanup(): void { this.element.remove() }
}
export function installToolbar(mod: Engine): void {
    mod.modInterface.registerCss(TOOLBAR_CSS);
    for (let digit = 0; digit <= 9; digit++) mod.modInterface.registerIngameKeybinding({ id: keyId(digit), keyCode: 48 + digit, translation: `Twelvefold ${digit}`, handler: (root: Engine) => root.hud.parts.buildingsToolbar instanceof CategorizedToolbar ? root.hud.parts.buildingsToolbar.chooseDigit(digit) : undefined });
    mod.modInterface.registerIngameKeybinding({ id: "twelvefold_cycle", keyCode: 84, translation: text(null, "toolbar.cycle"), handler: (root: Engine) => root.hud.parts.buildingsToolbar instanceof CategorizedToolbar ? root.hud.parts.buildingsToolbar.cycle() : undefined });
    mod.signals.gameStarted.add((root: Engine) => {
        // KeyActionMapper 按登记顺序派发同键；优先本模组绑定，STOP_PROPAGATION 才能保留空闲 V 的原版行为。
        const bindings = root.keyMapper.keybindings, own = Object.fromEntries(Object.entries(bindings).filter(([id]) => id.startsWith("twelvefold_")));
        root.keyMapper.keybindings = { ...own, ...bindings };
    });
    mod.signals.hudInitializer.add((root: Engine) => {
        if (!(root.gameMode instanceof game.RegularGameMode)) return;
        root.hud.parts.buildingsToolbar = new CategorizedToolbar(root);
        delete root.hud.parts.wiresToolbar;
    });
    patch(mod, game.HUDBuildingPlacerLogic, "cycleVariants", function (original, args) {
        return this.root.hud.parts.buildingsToolbar instanceof CategorizedToolbar ? this.root.hud.parts.buildingsToolbar.cycle() : original(...args);
    });
}
