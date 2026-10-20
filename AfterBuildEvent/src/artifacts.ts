import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { build } from "esbuild";
import { zipSync, type Zippable } from "fflate";
import type { Localization, ModProject } from "./validation.ts";

/** 只写构建产物；通过临时文件替换，构建失败时保留此前的完整文件。 */
export async function writeAtomic(filename: string, content: Uint8Array | string): Promise<void> {
    await mkdir(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${process.pid}.tmp`;
    await writeFile(temporary, content); await rename(temporary, filename);
}
export const sha256 = (content: Uint8Array): string => createHash("sha256").update(content).digest("hex");
export interface Artifact { filename: string; bytes: number; sha256: string }
export interface BuiltMod { project: ModProject; files: Map<string, Uint8Array>; directory: string; manifest: Record<string, unknown> }
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

export async function buildMod(root: string, project: ModProject, locale: Localization | null): Promise<BuiltMod> {
    const filename = `${project.name}.js`, directory = path.join(project.directory, "dist");
    const result = await build({
        entryPoints: [path.join(project.directory, "src", "main.ts")], absWorkingDir: root,
        bundle: true, format: "iife", platform: "browser", target: ["chrome96"], charset: "utf8",
        outfile: path.join(directory, filename), write: false, metafile: true,
        loader: { ".png": "dataurl" },
        define: { __MOD_METADATA__: JSON.stringify(project.metadata) },
        banner: { js: `// ${project.metadata.name} ${project.metadata.version} | ${project.metadata.id} | shapez 1\n// Generated from TypeScript. Source: ${project.name}/src/main.ts` },
        legalComments: "inline", logLevel: "silent",
    });
    const outputs = Object.values(result.metafile!.outputs);
    if (result.outputFiles.length !== 1 || outputs.some(output => output.imports.length)) throw new Error(`${project.name} 必须构建为无外部依赖的单文件 JavaScript`);
    const files = new Map<string, Uint8Array>([[filename, result.outputFiles[0]!.contents], ["mod.json", bytes(JSON.stringify(project.metadata, null, 2) + "\n")]]);
    for (const document of ["README.md", "CHANGELOG.md"]) files.set(document, new Uint8Array(await readFile(path.join(project.directory, document))));
    try { files.set("CREDITS.md", new Uint8Array(await readFile(path.join(project.directory, "assets", "SOURCES.md")))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    if (locale) files.set("INSTALL.txt", bytes(locale.languages.map(code => `[${code}]\n${locale.installation[code]}`).join("\n\n") + "\n"));
    const artifacts: Artifact[] = [...files].map(([filename, content]) => ({ filename, bytes: content.byteLength, sha256: sha256(content) }));
    const manifest = { format: 1, mod: project.metadata.id, name: project.metadata.name, version: project.metadata.version,
        game: "shapez", gameVersion: locale?.gameVersion ?? project.metadata.minimumGameVersion,
        languages: locale?.languages ?? [], textKeysPerLanguage: locale?.keys ?? 0,
        validation: "TypeScript + localization data + single-file build; gameplay and UI have not been run", artifacts };
    files.set("manifest.json", bytes(JSON.stringify(manifest, null, 2) + "\n"));
    for (const [name, content] of files) await writeAtomic(path.join(directory, name), content);
    await writeAtomic(path.join(root, "build", `${project.name}.metafile.json`), JSON.stringify(result.metafile, null, 2) + "\n");
    console.log(`构建完成：${path.join(directory, filename)} (${result.outputFiles[0]!.contents.byteLength} 字节)`);
    return { project, files, directory, manifest };
}

/** 输出本次构建的 ZIP 与独立 JS；配置游戏模组目录时同步复制同一份 JS。 */
export async function packageMod(built: BuiltMod, output: string, modsDirectory?: string): Promise<Artifact> {
    const scriptName = `${built.project.name}.js`, script = built.files.get(scriptName);
    if (!script) throw new Error(`${built.project.name} 缺少本次构建的 JavaScript`);
    const contents: Zippable = {};
    for (const [name, content] of built.files) contents[name] = [content, { mtime: new Date(1980, 0, 1), level: 9 }];
    const zip = zipSync(contents), filename = path.join(output, `${built.project.name}-${built.project.metadata.version}.zip`), digest = sha256(zip);
    await writeAtomic(filename, zip);
    await writeAtomic(`${filename}.sha256`, `${digest}  ${path.basename(filename)}\n`);
    const artifact = { filename, bytes: zip.byteLength, sha256: digest };
    await writeAtomic(`${filename}.manifest.json`, JSON.stringify({ ...built.manifest, package: artifact }, null, 2) + "\n");
    const scriptPath = path.join(output, scriptName);
    await writeAtomic(scriptPath, script);
    console.log(`打包完成：${filename} (${zip.byteLength} 字节)\nSHA-256：${digest}\n独立 JS：${scriptPath}`);
    if (modsDirectory) {
        const installed = path.join(modsDirectory, scriptName);
        await writeAtomic(installed, script);
        console.log(`模组已复制：${installed}`);
    }
    return artifact;
}
