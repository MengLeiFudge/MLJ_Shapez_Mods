import { isColor, PIECES, COLOR_HEX, type Color, type Piece } from "../domain/shape.ts";
import { game, type Engine } from "./api.ts";
export type ScalarKind = "integer" | "color" | "piece";
/** 电路标量不是实体物料；类型与值共同决定身份，负整数可序列化。 */
export class ScalarItem extends game.BaseItem {
    kind: ScalarKind;
    value: number | Color | Piece;
    constructor(kind: ScalarKind = "integer", value: number | Color | Piece = 0) {
        super(); this.kind = kind; this.value = value; this._type = this.getItemType(); this.validate();
    }
    static getId(): string { return "twelvefold_scalar" }
    static getSchema(): Engine { return game.types.string }
    private validate(): void {
        const valid = this.kind === "integer" ? Number.isSafeInteger(this.value) : this.kind === "color" ? isColor(this.value) : this.kind === "piece" && (PIECES as readonly unknown[]).includes(this.value);
        if (!valid) throw new Error("Invalid Twelvefold scalar signal");
    }
    getItemType(): string { return `tf_${this.kind}` }
    getAsCopyableKey(): string { return `${this.kind}:${this.value}` }
    equalsImpl(other: ScalarItem): boolean { return this.kind === other.kind && this.value === other.value }
    serialize(): string { return this.getAsCopyableKey() }
    deserialize(data: string): string | undefined {
        try {
            const parts = data.split(":");
            if (parts.length !== 2 || (parts[0] === "integer" && !/^-?(0|[1-9][0-9]*)$/.test(parts[1]!))) throw new Error("Invalid serialized scalar");
            const [kind, text] = parts;
            this.kind = kind as ScalarKind; this.value = kind === "integer" ? Number(text) : text as Color | Piece; this.validate(); this._type = this.getItemType();
        } catch (error) { return String(error) }
    }
    drawFullSizeOnCanvas(context: CanvasRenderingContext2D, size: number): void {
        context.save(); context.fillStyle = this.kind === "color" ? COLOR_HEX[this.value as Color] : "#364959";
        context.beginPath(); context.arc(size / 2, size / 2, size * .4, 0, Math.PI * 2); context.fill();
        context.fillStyle = this.kind === "color" ? "#212939" : "#f5f2df"; context.font = `${Math.max(8, size / Math.max(3, String(this.value).length))}px sans-serif`;
        context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(String(this.value), size / 2, size / 2); context.restore();
    }
    drawItemCenteredImpl(x: number, y: number, parameters: Engine, size: number): void {
        parameters.context.save(); parameters.context.translate(x - size / 2, y - size / 2); this.drawFullSizeOnCanvas(parameters.context, size); parameters.context.restore();
    }
    getBackgroundColorAsResource(): string { return "#364959" }
}
export function scalar(kind: ScalarKind, value: number | Color | Piece | null): ScalarItem | null { return value === null ? null : new ScalarItem(kind, value) }
export function integerValue(item: Engine): number | null { return item instanceof ScalarItem && item.kind === "integer" ? item.value as number : null }
export function installScalars(mod: Engine): void {
    mod.modInterface.registerItem(ScalarItem, (data: string) => { const item = new ScalarItem(); const error = item.deserialize(data); if (error) throw new Error(error); return item });
}
