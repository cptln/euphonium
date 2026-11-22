"""Apply a fresh Pages export to the website's stable Markdown sources."""
import hashlib
import json
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content/writing"
STATE = ROOT / "releases/writing-synced.json"


def atomic(path, content):
    with NamedTemporaryFile(dir=path.parent, delete=False) as f:
        f.write(content.encode("utf-8"))
    Path(f.name).replace(path)


def fingerprint(text):
    return hashlib.sha256(text.replace("\r\n", "\n").rstrip().encode()).hexdigest()


def export(entry, page):
    title = entry["title"]
    display_title = f"{entry['section']}｜{title}" if entry.get("section") else title
    if page["title"] not in (title, display_title):
        raise ValueError(f"页面标题与固定映射不同：{title}")
    blocks = [b["markdown"] for b in page["blocks"] if b["kind"] == "markdown"]
    heading = next((i for i, block in enumerate(blocks) if block in ("# " + title, "# " + display_title)), None)
    if heading is not None:
        lines = ["# " + display_title, *blocks[heading + 1:]]
    elif entry["route"] == "articles/critical-equilibrium.html":
        # The paper uses its Page title plus a separate Chinese subtitle above the English title.
        subtitle = blocks[0].strip("* ")
        lines = ["# "+display_title+"："+subtitle]
        for block in blocks[1:]:
            if block.startswith("[") and "](library-file:" in block and (".md]" in block or ".pdf]" in block):
                continue
            lines.append(block)
    else:
        raise ValueError(f"找不到文章一级标题：{title}")
    text = "\n\n".join(lines).strip() + "\n"
    for ref, local in entry.get("images", {}).items():
        text = text.replace(ref, local)
    if "library-file:" in text:
        raise ValueError(f"{title} 有新附件。请先将配图保存到该文的 media 目录并更新 articles.json 中的图片映射。")
    return text


def main():
    entries = {r["page_id"]:r for r in json.loads((CONTENT/"articles.json").read_text(encoding="utf-8-sig"))}
    pages = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    changed = {}
    seen = set()
    for p in pages:
        pid = p["page_id"]
        if pid in seen:
            raise ValueError("输入页面重复")
        seen.add(pid)
        e = entries[pid]
        target = CONTENT / (e["title"]+".md")
        source = export(e,p)
        fresh = fingerprint(source)
        current = fingerprint(target.read_text(encoding="utf-8-sig")) if target.exists() else None
        if current != fresh:
            if state.get(pid) == fresh and current is not None:
                continue
            if current is not None and current != state.get(pid):
                raise ValueError(f"资料空间与本地均有修订，需核对：{target.name}")
            changed[target] = source
        state[pid] = fresh
    for target, source in changed.items():
        atomic(target, source)
    atomic(STATE, json.dumps(state, indent=2))
    print(f"已核对 {len(pages)} 篇，覆盖 {len(changed)} 篇。")


if __name__ == "__main__":
    main()
