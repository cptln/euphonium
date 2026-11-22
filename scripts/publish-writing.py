"""Publish the verified local preview using the site's existing encrypted release workflow."""
from datetime import datetime, timezone
from getpass import getpass
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
REPO = "cptln/euphonium"


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def gh_cli():
    gh = shutil.which("gh")
    if gh:
        return gh
    import os
    for base in [os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")]:
        if base:
            for folder in ["GitHub CLI", "Programs/GitHub CLI", "Microsoft/WinGet/Links"]:
                exe = Path(base) / folder / "gh.exe"
                if exe.is_file():
                    return str(exe)
    raise SystemExit("发布需要 GitHub CLI。请安装 GitHub CLI（winget install --id GitHub.cli -e），然后再点发布。")


def main():
    preview_cmd = [sys.executable, str(ROOT/"scripts/writing-site.py"), "--verified-path"]
    preview = Path(run(preview_cmd, capture_output=True, text=True).stdout.strip())
    gh = gh_cli()
    if subprocess.run([gh, "auth", "status", "--active", "--hostname", "github.com"], capture_output=True).returncode:
        run([gh, "auth", "login", "--hostname", "github.com", "--web"])
    print("将发布已预览的整站：", preview, flush=True)
    pair = [input("现有网站账号："), getpass("现有网站密码：")]
    encoded = (json.dumps(pair, ensure_ascii=False, separators=(",",":"))+"\n").encode()
    # Verify the existing site login before generating a release with these credentials.
    verify = """
const {createDecipheriv,pbkdf2Sync}=require('node:crypto');
(async()=>{
  const base='https://cptln.github.io/euphonium/studio/';
  const [m,b]=await Promise.all(['meta.json','manifest.bin'].map(n=>fetch(base+n,{cache:'no-store'})));
  if(!m.ok||!b.ok) throw Error('无法读取线上版本的登录信息');
  const meta=await m.json(), bytes=Buffer.from(await b.arrayBuffer());
  const pair=JSON.stringify(JSON.parse(require('node:fs').readFileSync(0,'utf8')));
  const key=pbkdf2Sync(pair,Buffer.from(meta.salt,'base64'),meta.iterations,32,'sha256');
  const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
  d.setAAD(Buffer.from('manifest')); d.setAuthTag(bytes.subarray(-16));
  d.update(bytes.subarray(12,-16)); d.final();
})().catch(()=>{console.error('无法用此账号密码验证线上版本，请检查网络及输入。');process.exitCode=1});
"""
    run(["node","-e",verify], input=encoded)
    esg = ROOT.parent / "ESG workflow" / "ESG management"
    sealed = run(["node", str(ROOT/"scripts/encrypt-site.mjs"),str(preview),str(esg)],
                 input=encoded, stdout=subprocess.PIPE).stdout.decode("utf-8").splitlines()
    folder = Path(sealed[-2]).resolve()
    if folder.parent != (ROOT/"releases").resolve() or not folder.name.startswith("pages-"):
        raise ValueError("未取得加密目录")
    tag = "site-content-"+datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")+"-"+uuid4().hex[:6]
    with tempfile.TemporaryDirectory() as work:
        archive = Path(work)/"encrypted-site.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            for name in ["meta.json","manifest.bin","objects"]:
                tar.add(folder/name, arcname=name)
        checked = Path(run(preview_cmd, capture_output=True, text=True).stdout.strip())
        if checked != preview:
            raise ValueError("已选择其他预览，请重新发布")
        run([gh,"release","create",tag,str(archive),"--repo",REPO,"--target","main",
             "--title",tag,"--notes","更新已预览并加密的网站内容。"])
    print("加密包已上传，GitHub Pages 的部署进度见 https://github.com/"+REPO+"/actions/workflows/pages.yml")


if __name__ == "__main__":
    main()
