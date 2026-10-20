import { game, registerMod, metadata } from "./game/api.ts";
import { installShapes } from "./game/shapes.ts";
import { installScalars } from "./game/signals.ts";
import { installMachineSystem } from "./game/machine-system.ts";
import { installMachines } from "./game/buildings.ts";
import { installLogistics } from "./game/logistics.ts";
import { installWorld } from "./game/world.ts";
import { installItemTransfer } from "./game/item-transfer.ts";
import { installCircuits } from "./game/circuits.ts";
import { installIntegration } from "./game/integration.ts";
import { installToolbar } from "./game/toolbar.ts";
import { installPlacement } from "./game/placement.ts";
import { installTutorials } from "./game/tutorials.ts";
import { installViewer } from "./game/viewer.ts";
import { installTheme } from "./game/theme.ts";
import { installGuidance } from "./game/guidance.ts";
import { installTranslations } from "./i18n/index.ts";
import { installPersistence } from "./game/state.ts";

/** 独立的一代 shapez 模组；每份存档的账本、工厂缓存和电路状态由各自 root 保存。 */
class Twelvefold extends game.Mod {
    init(): void {
        installShapes(this);
        installScalars(this);
        installMachineSystem(this);
        installMachines(this);
        installLogistics(this);
        installWorld(this);
        installItemTransfer(this);
        installCircuits(this);
        installTheme(this);
        installIntegration(this);
        installToolbar(this);
        installPlacement(this);
        installTutorials(this);
        installViewer(this);
        installGuidance(this);
        installTranslations(this);
        installPersistence(this);
    }
}

registerMod(Twelvefold, metadata);
