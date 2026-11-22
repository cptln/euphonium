"""Build the Writing articles into a complete local preview of Euphonium."""
import argparse
import hashlib
import html
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content" / "writing"
RELEASES = ROOT / "releases"
BASE = RELEASES / "knowledge-preview"
RECEIPT = RELEASES / "writing-last-preview.json"
LINK_FILTER = ROOT / "scripts/remove-notion-links.mjs"


def digest(tree):
    result = hashlib.sha256()
    for item in sorted(tree.rglob("*")):
        if item.is_symlink():
            raise ValueError(f"预览来源包含链接：{item}")
        if item.is_file():
            result.update(item.relative_to(tree).as_posix().encode() + b"\0")
            result.update(hashlib.sha256(item.read_bytes()).digest())
    return result.hexdigest()


def receipt():
    data = json.loads(RECEIPT.read_text(encoding="utf-8"))
    path = Path(data["preview"]).resolve()
    if path.parent != RELEASES.resolve() or not path.name.startswith("writing-site-"):
        raise ValueError("预览目录无效，请重新生成。")
    return data, path


def body_html(text, allow_html):
    mode = "markdown+raw_html-markdown_in_html_blocks" if allow_html else "markdown-raw_html"
    return subprocess.run(["pandoc", "-f", mode, "-t", "html5", "--wrap=none"],
                          input=text, encoding="utf-8", capture_output=True, check=True).stdout


class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        if tag == "img" and dict(attrs).get("src"):
            self.sources.append(dict(attrs)["src"])


def coffee_layout(body, template):
    # Take the images from the existing layout and the wording from the current Markdown.
    cards = re.search(r'<div class="certification-cards".*?</div>', template, re.S)
    if cards:
        images = dict(re.findall(r'<h2>([^<]+)</h2>\s*(<img\b[^>]+>)', cards[0]))
        def card(match):
            title, description = match.groups()
            if title not in images:
                return match[0]
            return (f'<section class="certification-card"><h2>{title}</h2>'
                    f'{images[title]}<p>{description}</p></section>')
        body = re.sub(r'<p><strong>([^<]+)</strong>((?:(?!</p>).)*)</p>', card, body, flags=re.S)
        body = re.sub(r'(?:<section class="certification-card">.*?</section>\s*)+',
                      lambda m: '<div class="certification-cards" id="certifications">'+m[0]+'</div>\n',
                      body, flags=re.S)
    figure = re.search(r'<figure\b[^>]*id="coffee-esg".*?</figure>', template, re.S)
    if figure and "coffee-esg-elements.png" not in body:
        body += figure[0]
    return body


def render(entry, destination):
    title = entry["title"]
    source = (CONTENT / (title + ".md")).read_text(encoding="utf-8-sig")
    heading = re.search(r'^# (.+)$', source, re.M)
    headline = heading[1].strip() if heading else ""
    if entry.get("section"):
        headline = headline.removeprefix(entry["section"] + "｜")
    if headline != title and not headline.startswith(title + "："):
        raise ValueError(f"{title}.md 缺少对应的一级标题")
    text = source[heading.end():].strip()
    if not text or "library-file:" in text:
        raise ValueError(f"{title} 正文为空或含有尚未同步的资料空间附件")
    page = destination / entry["route"]
    template = page.read_text(encoding="utf-8")
    if entry["route"].startswith("articles/"):
        # Keep existing links to numbered PDF pages. Identify that edition separately.
        reader = re.search(r'<details class="pdf-reader".*?</details>', template, re.S)
        if not reader:
            raise ValueError("缺少论文阅读器模板")
        caption = re.search(r'<p class="summary-note">.*?</p>', template, re.S)
        edition = re.search(r'理论论述稿\s*v[\d.]+', caption[0]) if caption else None
        label = html.escape(edition[0] if edition else "网站所附版本")
        pdf = reader[0].replace("<summary>", f"<summary>{label} · ", 1)
        body = "<h1>"+html.escape(headline)+"</h1>\n"+pdf+"\n"+body_html(text, False)
        result, count = re.subn(r'(?<=<main><article>).*?(?=</article></main>)',
                                lambda _: "\n"+body+"\n", template, flags=re.S)
    else:
        subtitle = re.match(r'^\*([^*\n]+)\*(?:\n|$)', text)
        if subtitle:
            text = text[subtitle.end():].lstrip()
            template = re.sub(r'(<p class="essay-subtitle">).*?(</p>)',
                              lambda m: m[1]+html.escape(subtitle[1])+m[2], template, count=1)
        is_utmb = "/utmb-nature-and-conservation/" in entry["route"]
        if is_utmb:
            text = re.sub(r'(<img src=")https://upload\.wikimedia\.org/[^"]*UTMB[^"]*', r'\1./utmb_assets/utmb-logo.svg', text, flags=re.I)
            text = re.sub(r'(<img src=")https://environment\.ec\.europa\.eu/[^"]*natura[^"]*', r'\1./utmb_assets/natura-2000.jpg', text, flags=re.I)
        body = body_html(text, is_utmb).replace("<figure>", '<figure class="essay-illustration">')
        if "/coffee-and-sustainability/" in entry["route"]:
            body = coffee_layout(body, template)
        result, count = re.subn(r'(<article class="essay-text".*?</header>).*?(<footer>)',
                                lambda m: m[1]+"\n"+body+"\n      "+m[2], template, flags=re.S)
    if count != 1:
        raise ValueError(f"无法识别 {entry['route']} 的文章模板")
    images = Images()
    images.feed(result)
    for src in images.sources:
        if src.startswith(("https://", "http://", "data:")):
            continue
        image = (page.parent / src).resolve()
        if not image.is_relative_to(destination.resolve()):
            raise ValueError(f"配图超出预览范围：{src}")
        if not image.is_file():
            raise FileNotFoundError(f"{title} 缺少配图：{src}")
    page.write_text(result, encoding="utf-8")


def build():
    if not (BASE / "essays.html").is_file():
        raise FileNotFoundError(f"缺少带随笔目录的整站预览：{BASE}")
    inputs = {"content": digest(CONTENT), "base": digest(BASE),
              "renderer": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "link_filter": hashlib.sha256(LINK_FILTER.read_bytes()).hexdigest()}
    if RECEIPT.exists():
        old, previous = receipt()
        if previous.is_dir() and old["inputs"] == inputs and digest(previous) == old["digest"]:
            return previous
    destination = Path(tempfile.mkdtemp(prefix="writing-site-", dir=RELEASES))
    try:
        shutil.copytree(BASE, destination, dirs_exist_ok=True)
        entries = json.loads((CONTENT / "articles.json").read_text(encoding="utf-8-sig"))
        for entry in entries:
            route = Path(entry["route"])
            if not (destination / route).resolve().is_relative_to(destination) or Path(entry["title"]).name != entry["title"]:
                raise ValueError("文章路径无效")
            # Optional article-specific media mirrors paths relative to its website page.
            assets = CONTENT / "media" / entry["title"]
            if assets.is_dir():
                for image in assets.rglob("*"):
                    if image.is_file():
                        if image.suffix.lower() not in {".webp", ".png", ".jpg", ".jpeg", ".svg", ".gif", ".avif"}:
                            raise ValueError(f"不支持的文章图片：{image}")
                        target = (destination / route).parent / image.relative_to(assets)
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(image, target)
            render(entry, destination)
        subprocess.run(["node", str(LINK_FILTER), str(destination)], check=True)
        if any(f.suffix.lower() not in {".html",".js",".css",".txt",".jpg",".jpeg",".png",".webp",".svg",".gif",".ico",".woff",".woff2",".avif",".pdf"}
               for f in destination.rglob("*") if f.is_file()):
            raise ValueError("整站预览包含发布流程不支持的文件")
        if inputs["base"] != digest(BASE) or inputs["content"] != digest(CONTENT):
            raise ValueError("构建期间输入已改动，请再次预览")
        saved = {"preview": str(destination), "digest": digest(destination), "inputs": inputs}
        with tempfile.NamedTemporaryFile(dir=RELEASES, delete=False, mode="w", encoding="utf-8") as f:
            json.dump(saved, f, ensure_ascii=False)
        Path(f.name).replace(RECEIPT)
    except Exception:
        shutil.rmtree(destination)
        raise
    return destination


def verified_preview():
    data, folder = receipt()
    if (not folder.is_dir() or digest(folder) != data["digest"] or digest(CONTENT) != data["inputs"]["content"]
            or digest(BASE) != data["inputs"]["base"] or data["inputs"].get("link_filter") != hashlib.sha256(LINK_FILTER.read_bytes()).hexdigest()
            or data["inputs"]["renderer"] != hashlib.sha256(Path(__file__).read_bytes()).hexdigest()):
        raise ValueError("文章、整站底稿或预览已变化，请重新预览后发布")
    return folder


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--open", action="store_true")
    parser.add_argument("--verified-path", action="store_true")
    args = parser.parse_args()
    if args.verified_path:
        print(verified_preview())
    else:
        preview = build()
        print(preview, flush=True)
        if args.open:
            with ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(preview))) as server:
                url = f"http://127.0.0.1:{server.server_port}/essays.html"
                print(url, flush=True)
                webbrowser.open(url)
                server.serve_forever()
