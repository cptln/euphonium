import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildKnowledgeLibrary } from "./build-knowledge-library.mjs";
import { buildColumns } from "./build-columns.mjs";
import { removeNotionLinks } from "./remove-notion-links.mjs";

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

// This reading copy is excluded from source control and approved for the encrypted site.
const paper = "articles/critical-equilibrium.html";
const paperIndex = await readFile(path.join(source, paper), "utf8");
const reader = paperIndex.match(/data-directory="(pages\/critical-equilibrium)"\s+data-pages="([1-9]\d*)"/);
if (!reader) throw new Error("Missing critical-equilibrium reader page list.");
paths.add(paper);
for (let page = 1; page <= Number(reader[2]); page++) {
  paths.add("articles/" + reader[1] + "/" + page + ".webp");
}

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
await buildKnowledgeLibrary(destination, paths);
if (paths.has("research.html")) await buildColumns(destination, paths);
await removeNotionLinks(destination, paths);
console.log(destination);
