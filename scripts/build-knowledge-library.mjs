import { readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import path from "node:path";

const topics = [
  ["esg", "esg-disclosure", "ESG 信息披露", "ESG Disclosure"],
  ["climate-action", "climate-action", "应对气候变化", "Climate Action"],
  ["nature-biodiversity", "nature-biodiversity", "自然和生物多样性保护", "Nature and Biodiversity Conservation"],
  ["sustainable-finance", "sustainable-finance", "可持续金融", "Sustainable Finance"],
  ["sustainable-society", "sustainable-society", "可持续的经济与社会", "Sustainable Economy and Society"]
];

export async function buildKnowledgeLibrary(directory, publishedPaths = []) {
  const files = new Set(await readdir(directory));
  const activeTopics = topics.filter(([id]) => id !== "nature-biodiversity" || files.has(id + "-knowledge.html"));
  const filenames = activeTopics.map(([id]) => id + "-knowledge.html");
  const pages = await Promise.all(filenames.map(async name => {
    const page = await readFile(path.join(directory, name), "utf8");
    return page.replace(/^ *<script defer data-topic="[^"]+" src="assets\/knowledge-library\.js"><\/script>\r?\n/m, "");
  }));
  const tabs = [];
  const panels = [];
  for (const [index, [id, project, zh, en]] of activeTopics.entries()) {
    const page = pages[index];
    const opening = page.match(/<section class="opening"><div class="wrap">([\s\S]*?)<\/div><\/section>/)?.[1];
    const content = page.match(/<div class="wrap resource-library">([\s\S]*?)<\/div>\s*<\/main>/)?.[1];
    if (!opening || !content) throw new Error("Unexpected knowledge page layout: " + filenames[index]);
    const section = (opening.replace(/<h1\b[^>]*>[^<]*<\/h1>/, "") + content)
      .replace(/\b(id|aria-labelledby|aria-describedby)="([^"]+)"/g,
        (_, attribute, value) => attribute + '="' + value.split(/\s+/).map(token => id + "-" + token).join(" ") + '"')
      .replace(/href="#([^"]+)"/g, (_, fragment) => 'href="#' + id + "-" + fragment + '"');
    tabs.push('<a id="tab-' + id + '" href="#' + id + '" data-en="' + en + '">' + zh + '</a>');
    panels.push('<section class="knowledge-panel" id="' + id + '" aria-labelledby="tab-' + id + '">' +
      section + '<a class="knowledge-project" href="' + project + '.html" data-en="Back to project">返回项目</a></section>');
  }

  const description = "按主题查阅政策文件、披露标准和评估方法。";
  const script = '<script defer src="assets/knowledge-library.js"></script>';
  const main = `
  <main>
    <section class="opening knowledge-banner"><div class="wrap">
      <h1 id="knowledge-title" data-en="Knowledge Library">知识库</h1>
      <p class="lede" data-en="Browse policy documents, disclosure standards and assessment methods by topic.">${description}</p>
    </div></section>
    <div class="wrap resource-library knowledge-library">
      <nav class="knowledge-tabs" aria-labelledby="knowledge-title">
        ${tabs.join("\n        ")}
      </nav>
      ${panels.join("\n      ")}
    </div>
  </main>`;
  const html = pages[0]
    .replace(/<!--[^]*?-->/, "")
    .replace(/(<meta name="description" content=")[^"]+/, "$1" + description)
    .replace("</head>", '  <link rel="stylesheet" href="assets/knowledge-library.css">\n  ' + script + "\n</head>")
    .replace(/<a href="esg-disclosure\.html"[^>]*>[^<]+<\/a>/, '<a href="index.html" data-en="Home">首页</a>')
    .replace(/<main>[^]*?<\/main>/, () => main);
  await writeFile(path.join(directory, "knowledge.html"), html);
  const homePath = path.join(directory, "index.html");
  const home = await readFile(homePath, "utf8");
  if (!home.includes('href="knowledge.html"')) {
    await writeFile(homePath, home.replace(/(\s*)(<a href="#profile"[^>]*>)/,
      '$1<a href="knowledge.html" data-en="Knowledge Library">知识库</a>$1$2'));
  }
  await Promise.all(["knowledge-library.js", "knowledge-library.css"].map(name =>
    copyFile(new URL("../assets/" + name, import.meta.url), path.join(directory, "assets", name))));
  await Promise.all(pages.map((page, index) => writeFile(path.join(directory, filenames[index]),
    page.replace("</head>", "  " + script.replace(" defer", ' defer data-topic="' + activeTopics[index][0] + '"') + "\n</head>"))));

  const links = /href="((?:\.\.\/)*)(esg|climate-action|nature-biodiversity|sustainable-finance|sustainable-society)-knowledge\.html(?:#([^"]*))?"/g;
  for (const name of publishedPaths) {
    if (!/^(?:[^/]+|writing\/.+)\.html$/.test(name) || filenames.includes(name)) continue;
    const file = path.join(directory, name);
    const page = await readFile(file, "utf8");
    const updated = page.replace(links, (_, prefix, topic, fragment) =>
      'href="' + prefix + 'knowledge.html#' + topic + (fragment && fragment !== "top" ? "-" + fragment : "") + '"');
    if (updated !== page) await writeFile(file, updated);
  }
}
