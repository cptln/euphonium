import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceArgument = process.argv[2];
if (!sourceArgument) throw new Error("Pass the local Euphonium website directory.");
const source = await realpath(sourceArgument);
const releases = fileURLToPath(new URL("../releases/", import.meta.url));
const candidates = execFileSync("git", [
  "-C", source, "ls-files", "--cached", "--others", "--exclude-standard", "-z"
], { encoding: "utf8" }).split("\0").filter(Boolean);

const asset = /^(?:articles|assets|esg|lab|writing)\/.+\.(?:html|css|js|webp|png|jpe?g|svg|ico|woff2?|pdf)$/i;
const rootPage = /^[^/]+\.html$/i;
const paths = new Set(candidates.filter(name =>
  !name.split("/").some(part => part.startsWith(".") || part.startsWith("_")) &&
  (rootPage.test(name) || asset.test(name) || name === "site.css" || name === "robots.txt")
));
if (!paths.has("index.html") || !paths.has("site.css")) throw new Error("Missing website entry files.");

await mkdir(releases, { recursive: true });
const destination = await mkdtemp(path.join(releases, "euphonium-"));
for (const name of paths) {
  const from = path.join(source, name);
  if (path.relative(source, await realpath(from)).split(path.sep).join("/") !== name) {
    throw new Error("Unexpected link in website: " + name);
  }
  const to = path.join(destination, name);
  await mkdir(path.dirname(to), { recursive: true });
  if (name === "research.html") {
    // The local research index also lists reading copies excluded from publication.
    const html = await readFile(from, "utf8");
    const published = html.replace(/<section\b[^>]*>(?:(?!<\/?section\b)[\s\S])*?<\/section>/gi, section => {
      const link = section.match(/<h2>\s*<a href="(articles\/[^"#]+\.html)"/i);
      return link && !paths.has(link[1]) ? "" : section;
    });
    await writeFile(to, published);
  } else {
    await copyFile(from, to);
  }
}
console.log(destination);
