import { copyFile, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url);
await mkdir(new URL("dist/server/", root), {recursive:true});
await copyFile(new URL("worker/index.mjs", root), new URL("dist/server/index.js", root));
