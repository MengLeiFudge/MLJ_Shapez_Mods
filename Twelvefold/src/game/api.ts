/** shapez 1.5.6 的 Mod API 在运行时注入；动态类型仅限此接入层。领域层不依赖游戏对象。 */
export type Engine = any;
declare const shapez: Engine;
declare const $shapez_registerMod: (modClass: Engine, metadata: Engine) => void;
declare const __MOD_METADATA__: Engine;
export const game: Engine = shapez;
export const registerMod = $shapez_registerMod;
export const metadata = __MOD_METADATA__;
export type Override = (this: Engine, original: (...args: Engine[]) => Engine, args: Engine[]) => Engine;
export function patch(mod: Engine, owner: Engine, method: string, override: Override): void {
    if (!owner || typeof owner.prototype?.[method] !== "function") throw new Error(`Twelvefold: unsupported game API ${owner?.name ?? "?"}.${method}`);
    mod.modInterface.replaceMethod(owner, method, override);
}
export const vector = (x: number, y: number): Engine => new game.Vector(x, y);
export const direction = { top: game.enumDirection.top, right: game.enumDirection.right, bottom: game.enumDirection.bottom, left: game.enumDirection.left };
export function inputPin(entity: Engine, index: number): Engine {
    const network = entity.components.WiredPins?.slots[index]?.linkedNetwork;
    return network?.hasValue() ? network.currentValue : null;
}
export function boolItem(value: boolean): Engine { return value ? game.BOOL_TRUE_SINGLETON : game.BOOL_FALSE_SINGLETON }
export function boolValue(item: Engine): boolean | null { return item?.getItemType() === "boolean" ? !!item.value : null }
