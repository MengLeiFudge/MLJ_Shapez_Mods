import { fileURLToPath } from "node:url";
import path from "node:path";
import { stat } from "node:fs/promises";
import { discoverMods, checkTypes, checkLocalization, readJson } from "./validation.ts";
import { buildMod, packageMod } from "./artifacts.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const usage = `共用 shapez 一代模组工具\n  npm run check -- [--mod Twelvefold | --all]\n  npm run build -- [--mod Twelvefold | --all]\n  npm run pack -- [--mod Twelvefold | --all] [--output ModZips]\n默认选择全部模组；pack 先检查并重新构建，输出 ZIP 与独立 JS，并按本机配置复制 JS 到游戏模组目录。`;
interface Options { command: "check" | "build" | "pack" | "list"; mod?: string; output?: string }
function options(args: string[]): Options | null {
    if (args.includes("--help") || args.includes("-h")) { console.log(usage); return null }
    const command = args.shift();
    if (command !== "check" && command !== "build" && command !== "pack" && command !== "list") throw new Error(usage);
    const result: Options = { command };
    let all = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        if (arg === "--all" && !all) { all = true; continue }
        if ((arg === "--mod" && !result.mod) || (arg === "--output" && !result.output)) {
            const value = args[++i]; if (!value || value.startsWith("--")) throw new Error(`${arg} 需要一个值`);
            if (arg === "--mod") result.mod = value; else result.output = value;
        } else throw new Error(`未知或重复参数：${arg}`);
    }
    if (all && result.mod) throw new Error("--all 与 --mod 不能同时使用");
    if (result.output && command !== "pack") throw new Error("--output 只用于 pack");
    return result;
}
/** 解析产物和游戏模组目录；支持在 WSL 使用用户指定的 Windows 盘符路径。 */
function outputPath(value: string): string {
    if (process.platform !== "win32" && /^[A-Za-z]:[\\/]/.test(value)) return `/mnt/${value[0]!.toLowerCase()}/${value.slice(3).replace(/\\/g, "/")}`;
    return path.resolve(root, value);
}
/** 读取打包与可选的游戏安装目录；--output 只覆盖打包目录。 */
async function packagePaths(override: string | undefined): Promise<{ output: string; modsDirectory?: string }> {
    const filename = path.join(root, "DefaultPath.json");
    let config: { packageOutput?: unknown; modsDirectory?: unknown } = { packageOutput: "ModZips" };
    try { await stat(filename); config = await readJson(filename) as typeof config }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("DefaultPath.json 必须是对象");
    const output = override ?? config.packageOutput;
    if (typeof output !== "string" || !output.trim()) throw new Error("DefaultPath.json 必须包含非空 packageOutput");
    if (config.modsDirectory !== undefined && (typeof config.modsDirectory !== "string" || !config.modsDirectory.trim())) throw new Error("DefaultPath.json 的 modsDirectory 必须是非空路径");
    return { output: outputPath(output), modsDirectory: typeof config.modsDirectory === "string" ? outputPath(config.modsDirectory) : undefined };
}
async function main(): Promise<void> {
    const selected = options(process.argv.slice(2)); if (!selected) return;
    const projects = await discoverMods(root), mods = selected.mod ? projects.filter(project => project.name === selected.mod) : projects;
    if (!mods.length) throw new Error(`模组不存在：${selected.mod}；可选：${projects.map(project => project.name).join(", ")}`);
    if (selected.command === "list") { mods.forEach(mod => console.log(`${mod.name} ${mod.metadata.version} (${mod.metadata.id})`)); return }
    checkTypes(root, mods);
    const locales = new Map<string, Awaited<ReturnType<typeof checkLocalization>>>();
    for (const mod of mods) {
        const locale = await checkLocalization(mod); locales.set(mod.name, locale);
        console.log(`静态检查通过：${mod.name}${locale ? `；${locale.languages.length} 种语言，每种 ${locale.keys} 个基础文案及安装说明` : ""}`);
    }
    if (selected.command === "check") return;
    const paths = selected.command === "pack" ? await packagePaths(selected.output) : null;
    for (const mod of mods) {
        const built = await buildMod(root, mod, locales.get(mod.name) ?? null);
        if (paths) await packageMod(built, paths.output, paths.modsDirectory);
    }
}
try { await main() }
catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : null;
    if (cause) console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
}
