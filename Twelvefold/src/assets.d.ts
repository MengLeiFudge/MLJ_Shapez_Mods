declare module "*.png" {
    /** esbuild 将 PNG 原字节内嵌成 data URL，不产生外部资源请求。 */
    const dataUrl: string;
    export default dataUrl;
}
