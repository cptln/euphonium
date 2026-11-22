import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const notionLink = /<a\b[^>]*\bhref=["']https?:\/\/(?:[\w-]+\.)*notion\.(?:com|so|site)(?:[/?#]|["'])[^>]*>([^]*?)<\/a>/gi;

export async function removeNotionLinks(directory, paths) {
  for (const name of paths) {
    if (!name.endsWith(".html")) continue;
    const file = path.join(directory, name);
    const html = await readFile(file, "utf8");
    const updated = html
      .replace(/(?:<hr\s*\/?>\s*)?<p><em>本篇整理自欧洲旅行讨论：((?:(?!<\/p>)[\s\S])*?)<\/em><\/p>/g,
        (block, note) => {
          if (!/https?:\/\/(?:[\w-]+\.)*notion\.(?:com|so|site)\//i.test(note)) return block;
          const references = note.indexOf("史实参考：");
          return references < 0 ? "" : "<hr>\n<p><em>" + note.slice(references) + "</em></p>";
        })
      .replace(notionLink, "$1");
    if (updated !== html) await writeFile(file, updated);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const directory = process.argv[2];
  if (!directory) throw new Error("Pass the generated preview directory.");
  await removeNotionLinks(directory, await readdir(directory, { recursive: true }));
}
