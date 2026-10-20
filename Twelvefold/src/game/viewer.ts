import { Shape } from "../domain/shape.ts";
import { text, language } from "../i18n/index.ts";
import { game, patch, type Engine } from "./api.ts";
import { fromDefinition, drawShape } from "./shapes.ts";
import { progress } from "./state.ts";

/** 原版详情按四象限填空层，十二槽图形使用自己的分层与逐槽列表。 */
export function installViewer(mod: Engine): void {
    mod.modInterface.registerCss(`
#ingame_HUD_ShapeViewer{z-index:320}
#ingame_HUD_ShapeViewer .dialogInner{max-width:90vw}
#ingame_HUD_ShapeViewer .content[data-layers]{width:auto;max-width:88vw}
#ingame_HUD_ShapeViewer .content .renderArea.tf-layers{display:flex;align-items:stretch;gap:16px;max-height:65vh;overflow:auto;max-width:84vw;padding:10px}
#ingame_HUD_ShapeViewer .tf-layer{display:flex;flex-direction:column;align-items:center;min-width:230px;gap:8px;background:var(--tf-surface);color:var(--tf-fg);border:1px solid var(--tf-border);border-radius:8px;padding:12px}
#ingame_HUD_ShapeViewer .tf-layer canvas{width:160px;height:160px;flex-shrink:0}
#ingame_HUD_ShapeViewer .tf-layer table{font:inherit;border-collapse:collapse;width:100%;background:var(--tf-bg);color:var(--tf-fg)}
#ingame_HUD_ShapeViewer .tf-layer th,#ingame_HUD_ShapeViewer .tf-layer td{padding:3px 5px;border-bottom:1px solid var(--tf-border);text-align:center;color:var(--tf-fg)}
#ingame_HUD_ShapeViewer .tf-layer th{background:var(--tf-active)}
#ingame_HUD_ShapeViewer .tf-layer strong{color:var(--tf-fg)}
#ingame_HUD_ShapeViewer .tf-layer code{direction:ltr;unicode-bidi:isolate;font:12px monospace;word-break:break-all;max-width:230px;background:var(--tf-bg);color:var(--tf-muted);padding:4px}
`);
    patch(mod, game.HUDShapeViewer, "renderForShape", function (original, args) {
        const shape = fromDefinition(args[0]);
        if (!shape) { this.renderArea.classList.remove("tf-layers"); return original(...args) }
        this.visible = true; this.root.app.inputMgr.makeSureAttachedAndOnTop(this.inputReciever);
        progress(this.root).observeGuide(4);
        this.currentShapeKey = shape.key; this.renderArea.replaceChildren(); this.renderArea.classList.add("tf-layers");
        this.contentDiv.setAttribute("data-layers", String(shape.layers.length));
        for (let level = shape.layers.length - 1; level >= 0; level--) {
            const panel = document.createElement("section"); panel.className = "tf-layer"; panel.dir = language(this.root) === "he" ? "rtl" : "ltr";
            const label = document.createElement("strong"); label.textContent = `${text(this.root, "ui.layer")} ${level}`; panel.appendChild(label);
            const canvas = document.createElement("canvas"); canvas.width = canvas.height = 160;
            drawShape(new Shape([shape.layers[level]!]), canvas.getContext("2d")!, 160, 160, 1, level); panel.appendChild(canvas);
            const table = document.createElement("table"), head = table.createTHead().insertRow();
            for (const key of ["slot", "piece", "color", "previous"]) { const cell = document.createElement("th"); cell.textContent = text(this.root, `ui.${key}`); head.appendChild(cell) }
            const body = table.createTBody();
            shape.layers[level]!.forEach((slot, index) => {
                const row = body.insertRow();
                for (const value of [String(index), slot?.piece ?? "--", slot ? text(this.root, `color.${slot.color}`) : "--", slot && !slot.seam ? "✓" : "—"]) row.insertCell().textContent = value;
            });
            panel.appendChild(table);
            const code = document.createElement("code"); code.textContent = new Shape([shape.layers[level]!]).key; panel.appendChild(code);
            this.renderArea.appendChild(panel);
        }
    });
}
