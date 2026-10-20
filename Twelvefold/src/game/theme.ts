import type { Engine } from "./api.ts";

/** 原版在 html 上维护主题；自有 HUD 共用同一套有明确对比度的颜色与正文字号。 */
export function installTheme(mod: Engine): void {
    mod.modInterface.registerCss(`
html{--tf-bg:#f0f3f4;--tf-surface:#ffffff;--tf-fg:#243743;--tf-muted:#435d6e;--tf-border:#8296a3;--tf-active:#c4e4d9;--tf-accent:#286c55;--tf-font:calc(14px * var(--ui-scale,1))/1.4 GameFont,sans-serif}
html[data-theme=dark]{--tf-bg:#263340;--tf-surface:#334554;--tf-fg:#f0f5f7;--tf-muted:#c1d7e5;--tf-border:#829dad;--tf-active:#426d62;--tf-accent:#ade5cc}
.twelvefold-status,.twelvefold-panel,.twelvefold-toolbar,.twelvefold-toast,#ingame_HUD_ShapeViewer .dialogInner{font:var(--tf-font);color:var(--tf-fg)}
.twelvefold-status,.twelvefold-panel,#ingame_HUD_ShapeViewer .dialogInner{background:var(--tf-bg);border-color:var(--tf-border)}
.twelvefold-status button,.twelvefold-panel button,.twelvefold-panel select,.twelvefold-panel input,#ingame_HUD_ShapeViewer .infoArea button{font:inherit;color:var(--tf-fg);background:var(--tf-surface);border:1px solid var(--tf-border);border-radius:5px;padding:5px 9px;cursor:pointer}
.twelvefold-status button:hover,.twelvefold-panel button:hover,.twelvefold-tabs button[data-active=true]{background:var(--tf-active)}
.twelvefold-status [hidden],.twelvefold-panel[hidden],.twelvefold-toast[hidden]{display:none}
.twelvefold-panel h2,#ingame_HUD_ShapeViewer .dialogInner .title{font-size:calc(18px * var(--ui-scale,1));color:var(--tf-fg)}
.twelvefold-panel h3{font-size:1em;color:var(--tf-fg)}
.twelvefold-code{color:var(--tf-muted)}
`);
}
