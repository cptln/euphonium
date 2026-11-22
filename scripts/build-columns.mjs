import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const subjects = [
  ["disclosure", "信息披露", "Disclosure"],
  ["finance", "资本市场", "Capital Markets"],
  ["climate", "治理", "Governance"],
  ["ai", "人工智能", "Artificial Intelligence"]
];
const projects = [
  ["esg", "esg-disclosure", "disclosure"],
  ["climate-action", "climate-action", "climate"],
  ["sustainable-finance", "sustainable-finance", "finance"],
  ["sustainable-society", "sustainable-society", "climate"]
];
const articleTags = {
  "critical-equilibrium": ["climate"],
  "visible-and-invisible": ["disclosure", "finance"],
  "sustainability-reporting": ["disclosure"],
  "capital-returns": ["finance"],
  "climate-governance": ["climate", "finance"],
  "ai-governance": ["ai"],
  "issa-5000": ["disclosure"],
  "ai-green-finance": ["ai", "finance"]
};
const escape = value => value.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
const equilibrium = "articles/critical-equilibrium.html";
const shortenEquilibriumTitle = html => html
  .replaceAll("技术方向转变的临界均衡：碳预算约束、政策时序与中国制度特征", "清洁技术方向转变的临界均衡")
  .replaceAll("The Critical Equilibrium of Directed Technical Change: Carbon Budget Constraints, Policy Timing, and Chinese Institutional Features",
    "The Critical Equilibrium of Directed Clean Technological Change");

export async function buildColumns(directory, publishedPaths) {
  const read = name => readFile(path.join(directory, name), "utf8");
  const write = (name, html) => writeFile(path.join(directory, name), html);
  const research = shortenEquilibriumTitle(await read("research.html"));
  if (publishedPaths.has(equilibrium)) await write(equilibrium, shortenEquilibriumTitle(await read(equilibrium)));
  const entries = new Map();
  for (const match of research.matchAll(/<section>\s*<h2>(<a href="([^"#]+)"[^>]*>[^]*?<\/a>)<\/h2>[^]*?<\/section>/g)) {
    if (!publishedPaths.has(match[2])) continue;
    const slug = path.basename(match[2], ".html");
    entries.set(match[2], { link: match[1], tags: articleTags[slug] ?? [] });
  }
  for (const [prefix, project, topic] of projects) {
    const filename = prefix + "-analysis.html";
    const source = await read("assets/" + prefix + "-notes.js");
    const json = source.match(/\bconst analysisNotes = (\[[^]*\]);\s*$/)?.[1];
    if (!json) throw new Error("Unexpected notes format: " + prefix);
    for (const note of JSON.parse(json)) {
      const target = note.url.split(/[?#]/, 1)[0];
      if (!publishedPaths.has(target)) continue;
      const tags = articleTags[path.basename(target, ".html")] ?? [topic];
      const link = '<a href="' + escape(note.url) + '" data-en="' + escape(note.title[1]) + '">' + escape(note.title[0]) + '</a>';
      const entry = entries.get(note.url);
      if (entry) {
        if (!entry.tags.includes(topic)) entry.tags = [...entry.tags, topic];
      } else {
        entries.set(note.url, { link, tags });
      }
    }
    const link = '<a href="research.html#' + topic + '" data-en="Browse columns by topic">按主题浏览专栏</a>';
    await write(filename, (await read(filename)).replaceAll("My analysis", "Columns").replaceAll("我的解读", "专栏")
      .replace(/ *<a href="research\.html#[^"]+" data-en="(?:All columns|Browse columns by topic)">[^<]+<\/a>\r?\n/, "")
      .replace('<button class="language-switch"', link + '\n      <button class="language-switch"'));
    await write(project + ".html", (await read(project + ".html"))
      .replaceAll("My analysis", "Columns").replaceAll("我的解读", "专栏")
      .replaceAll('data-en="Analysis and insights">解读与洞察', 'data-en="Columns and insights">专栏与洞察'));
  }

  const sorted = [...entries.values()];
  const available = subjects.filter(([tag]) => sorted.some(entry => entry.tags.includes(tag)));
  const tagLink = ([tag, zh, en]) => '<a href="research.html#' + tag + '" data-en="' + en + '">' + zh + '</a>';
  const filters = [["all", "全部", "All"], ...available].map(([tag, zh, en]) =>
    '<a href="#' + tag + '" data-column-filter="' + tag + '" data-en="' + en + '">' + zh + '</a>').join("\n        ");
  const cards = sorted.map(({ link, tags }) => {
    const badges = available.filter(([tag]) => tags.includes(tag)).map(tagLink).join("");
    return '<li data-column-tags="' + tags.join(" ") + '"><h2>' + link + '</h2><div class="column-tags">' + badges + '</div></li>';
  }).join("\n      ");
  const catalog = '    <div class="wrap column-index">\n      <nav class="library-nav" aria-label="专栏主题">\n        ' +
    filters + '\n      </nav>\n      <ul class="column-list">\n      ' + cards + '\n      </ul>\n    </div>';
  await write("research.html", research
    .replace(/(<meta name="description" content=")[^"]+/, "$1Elaine Shen 的专栏文章与项目笔记。")
    .replaceAll("Research papers", "Columns").replaceAll("研究文章", "专栏")
    .replace(/<p class="lede"[^>]*>[^<]*<\/p>/, '<p class="lede" data-en="Articles and project notes on disclosure, finance, climate and AI.">关于信息披露、金融、气候与 AI 的文章和项目笔记。</p>')
    .replace(/    <div class="wrap paper-list">[^]*?(?=  <\/main>)/, () => catalog + "\n")
    .replace("</head>", '  <link rel="stylesheet" href="assets/columns.css">\n  <script defer src="assets/columns.js"></script>\n</head>'));

  const home = await read("index.html");
  const groups = subjects.map(subject => {
    const rows = sorted.filter(entry => entry.tags[0] === subject[0])
      .map(entry => "<li>" + entry.link + "</li>").join("");
    return '<div class="draft column-group"><h3>' + tagLink(subject) + '</h3>' +
      (rows ? '<ul>' + rows + '</ul>' : '') + '</div>';
  }).join("\n        ");
  const section = '    <section id="articles" class="band writing" aria-labelledby="article-heading"><div class="wrap">\n' +
    '      <div class="research-heading"><h2 id="article-heading" data-en="Columns">专栏</h2>\n' +
    '        <a href="research.html" data-en="Read more">阅读更多</a></div>\n' +
    '      <div class="column-groups">\n        ' + groups + '\n      </div>\n' +
    '    </div></section>';
  await write("index.html", home.replace(/<dt data-en="(?:Research papers|Columns)">[^<]+<\/dt><dd>\d+/, '<dt data-en="Columns">专栏</dt><dd>' + sorted.length)
    .replace('data-en="Read the research">阅读文章', 'data-en="Browse columns">浏览专栏')
    .replace(/^[ \t]*<a href="#book-reviews"[^>]*>[^<]+<\/a>\r?\n(?=[^]*<section id="book-reviews"[^>]*>\s*<h2[^>]*>[^<]*<\/h2>\s*<p[^>]*>暂无书评。<\/p>)/m, "")
    .replace(/^[ \t]*<section id="book-reviews"[^>]*>\s*<h2[^>]*>[^<]*<\/h2>\s*<p[^>]*>暂无书评。<\/p>\s*<\/section>\r?\n/m, "")
    .replace(/    <section id="articles"[^]*?<\/section>/, () => section)
    .replace(/ *<link rel="stylesheet" href="assets\/columns\.css">\r?\n/, "")
    .replace("</head>", '  <link rel="stylesheet" href="assets/columns.css">\n</head>'));
  await Promise.all(["columns.css", "columns.js"].map(name =>
    copyFile(new URL("../assets/" + name, import.meta.url), path.join(directory, "assets", name))));
}
