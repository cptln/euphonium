import {createCipheriv, pbkdf2Sync, randomBytes} from "node:crypto";
import {gzipSync} from "node:zlib";
import {mkdir, mkdtemp, readdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const [prepared, workflow] = process.argv.slice(2);
if (!prepared || !workflow) throw Error("Pass the prepared website directory and the ESG management source directory.");
const releases = fileURLToPath(new URL("../releases/", import.meta.url));
const output = await mkdtemp(path.join(releases, "pages-"));
await mkdir(path.join(output, "objects"));
const replacements = new Map([
  ["esg/index.html", path.join(workflow, "ESG工作流_人工与AI分工.html")],
  ["esg/银行年度对标看板.html", path.join(workflow, "银行年度对标看板.html")]
]);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
console.log("Ready for the login pair on hidden stdin.");
let line = "";
for await (const chunk of process.stdin) { line += chunk; if (/[\r\n]/.test(line)) break; }
const pair = JSON.parse(line);
if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(s => typeof s === "string" && s.length)) throw Error("Both fields are required");
const salt = randomBytes(16);
const iterations = 1200000;
const key = pbkdf2Sync(JSON.stringify(pair), salt, iterations, 32, "sha256");
const manifest = {};

async function seal(name, bytes, file) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(name));
  const ciphertext = Buffer.concat([iv, cipher.update(gzipSync(bytes)), cipher.final(), cipher.getAuthTag()]);
  await writeFile(path.join(output, file), ciphertext, {flag:"wx"});
}
async function walk(folder) {
  for (const entry of await readdir(folder, {withFileTypes:true})) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) { await walk(file); continue; }
    if (!entry.isFile()) throw Error("Unexpected release entry");
    const name = path.relative(prepared, file).split(path.sep).join("/");
    const id = randomBytes(18).toString("hex");
    await seal(name, await readFile(replacements.get(name) || file), "objects/" + id + ".bin");
    manifest[name] = id;
  }
}
await walk(prepared);
for (const name of ["index.html", ...replacements.keys()]) if (!manifest[name]) throw Error("Missing " + name);
await seal("manifest", Buffer.from(JSON.stringify(manifest)), "manifest.bin");
await writeFile(path.join(output, "meta.json"), JSON.stringify({salt:salt.toString("base64"), iterations}));
console.log(output);
console.log(Object.keys(manifest).length + " encrypted files.");
