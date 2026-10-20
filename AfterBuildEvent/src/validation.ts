import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

/** 发布信息唯一来自各模组 mod.json，同时作为游戏内元数据嵌入。 */
export interface ModMetadata extends Record<string, unknown> {
    id: string; name: string; version: string; author: string; description: string;
    minimumGameVersion: string; doesNotAffectSavegame: boolean;
}
export interface ModProject { name: string; directory: string; metadata: ModMetadata }
export interface Localization { gameVersion: string; languages: string[]; keys: number; groups: Record<string, string[]>; catalogs: Record<string, Record<string, string[]>>; installation: Record<string, string> }

export async function readJson(filename: string): Promise<unknown> {
    try { return JSON.parse(await readFile(filename, "utf8")) as unknown }
    catch (error) { throw Object.assign(new Error(`无法读取 JSON：${filename}`), { cause: error }) }
}
function object(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
    return value as Record<string, unknown>;
}
export async function discoverMods(root: string): Promise<ModProject[]> {
    const result: ModProject[] = [], ids = new Set<string>();
    for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory() || entry.name.startsWith(".") || ["node_modules", "AfterBuildEvent", "ModZips", "build"].includes(entry.name)) continue;
        const directory = path.join(root, entry.name), filename = path.join(directory, "mod.json");
        try { await stat(filename) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error }
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(entry.name)) throw new Error(`模组目录名不适合产物命名：${entry.name}`);
        const metadata = object(await readJson(filename), filename);
        for (const key of ["id", "name", "version", "author", "description", "minimumGameVersion"]) {
            if (typeof metadata[key] !== "string" || !metadata[key].trim()) throw new Error(`${filename} 缺少有效 ${key}`);
        }
        if (!/^[a-z][a-z0-9-]*$/.test(String(metadata.id)) || ids.has(String(metadata.id))) throw new Error(`${filename} 的 ID 无效或重复`);
        if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(metadata.version))) throw new Error(`${filename} 的版本必须是语义版本`);
        if (typeof metadata.doesNotAffectSavegame !== "boolean") throw new Error(`${filename} 必须明确声明存档影响`);
        ids.add(String(metadata.id));
        await stat(path.join(directory, "src", "main.ts"));
        result.push({ name: entry.name, directory, metadata: metadata as ModMetadata });
    }
    if (!result.length) throw new Error("没有发现包含 mod.json 的模组目录");
    return result;
}

/** 只创建 TypeScript Program 并读取诊断，不执行模组源码。 */
export function checkTypes(root: string, mods: readonly ModProject[]): void {
    const filename = path.join(root, "tsconfig.json"), config = ts.readConfigFile(filename, ts.sys.readFile);
    const host: ts.FormatDiagnosticsHost = { getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => "\n" };
    if (config.error) throw new Error(ts.formatDiagnosticsWithColorAndContext([config.error], host));
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, { noEmit: true }, filename);
    if (parsed.errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, host));
    const selected = parsed.fileNames.filter(file => file.startsWith(path.join(root, "AfterBuildEvent") + path.sep) || mods.some(mod => file.startsWith(mod.directory + path.sep)));
    const program = ts.createProgram([...new Set([...selected, ...mods.map(mod => path.join(mod.directory, "src", "main.ts"))])], parsed.options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
}
const placeholders = (value: string): string => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]).sort().join(",");

/** 本地化是数据合同：各语言严格共用键顺序、分组、非空译文与占位符。 */
export async function checkLocalization(mod: ModProject): Promise<Localization | null> {
    const directory = path.join(mod.directory, "src", "i18n"), filename = path.join(directory, "schema.json");
    try { await stat(filename) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
    const schema = object(await readJson(filename), filename), catalogs = object(await readJson(path.join(directory, "catalogs.json")), "catalogs.json");
    if (typeof schema.gameVersion !== "string" || !Array.isArray(schema.languages) || !schema.languages.length || !schema.languages.every(value => typeof value === "string" && /^[a-z]{2,3}(?:-[A-Z]{2}|-419)?$/.test(value))) throw new Error(`${filename} 的游戏版本或语言清单无效`);
    const languages = schema.languages as string[], groups = object(schema.groups, "语言分组");
    // 可选体验资源随模组内嵌；合并后仍用同一覆盖、键数和占位符合同校验。
    const experienceFile = path.join(directory, "experience.json");
    let hasExperience = true;
    try { await stat(experienceFile) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") hasExperience = false; else throw error }
    if (hasExperience) {
        const extra = object(await readJson(experienceFile), experienceFile), extraGroups = object(extra.groups, "体验文案分组"), extraCatalogs = object(extra.catalogs, "体验译文");
        if (Object.keys(extraCatalogs).sort().join() !== [...languages].sort().join()) throw new Error(`${mod.name} 的体验译文语言覆盖不一致`);
        for (const [group, keys] of Object.entries(extraGroups)) {
            if (group in groups) throw new Error(`体验文案分组重复：${group}`);
            groups[group] = keys;
        }
        for (const language of languages) {
            const row = object(catalogs[language], language), additions = object(extraCatalogs[language], `${language} 体验文案`);
            if (Object.keys(additions).sort().join() !== Object.keys(extraGroups).sort().join()) throw new Error(`${language} 的体验分组不完整`);
            Object.assign(row, additions);
        }
    }
    if (!languages.includes("en") || new Set(languages).size !== languages.length || Object.keys(catalogs).sort().join() !== [...languages].sort().join()) throw new Error(`${mod.name} 的语言清单与译文覆盖不一致`);
    const english = object(catalogs.en, "英文基准"), groupNames = Object.keys(groups).sort().join();
    let keys = 0;
    for (const [group, value] of Object.entries(groups)) {
        if (!Array.isArray(value) || !value.length || !value.every(key => typeof key === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(key)) || new Set(value).size !== value.length) throw new Error(`文案分组 ${group} 的键无效或重复`);
        keys += value.length;
    }
    for (const language of languages) {
        const catalog = object(catalogs[language], language);
        if (Object.keys(catalog).sort().join() !== groupNames) throw new Error(`${language} 的文案分组缺失或多余`);
        for (const [group, value] of Object.entries(groups)) {
            const names = value as string[], row = catalog[group], baseline = english[group];
            if (!Array.isArray(row) || row.length !== names.length || !Array.isArray(baseline)) throw new Error(`${language}.${group} 的文案数量不正确`);
            row.forEach((text, index) => {
                if (typeof text !== "string" || !text.trim()) throw new Error(`${language}.${group}.${names[index]} 没有译文`);
                if (placeholders(text) !== placeholders(String(baseline[index]))) throw new Error(`${language}.${group}.${names[index]} 占位符不一致`);
            });
        }
    }
    const installation = object(await readJson(path.join(directory, "install.json")), "安装说明");
    if (Object.keys(installation).sort().join() !== [...languages].sort().join() || languages.some(code => typeof installation[code] !== "string" || !(installation[code] as string).trim())) throw new Error(`${mod.name} 的安装说明语言覆盖不完整`);
    return { gameVersion: schema.gameVersion, languages, keys, groups: groups as Record<string, string[]>, catalogs: catalogs as Record<string, Record<string, string[]>>, installation: installation as Record<string, string> };
}
