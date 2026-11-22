# Euphonium

个人网站在 [GitHub Pages](https://cptln.github.io/euphonium/studio/) 上运行。ESG 工作流和银行年度对标看板是其中的栏目。[旧 ESG 入口](https://cptln.github.io/euphonium/esg/) 仍可使用。

## 从本机发布内容

1. 运行 `node scripts/prepare-release.mjs "<本地网站目录>"`，取得整理好的发布目录。脚本按本地 Git 忽略规则排除草稿和私人阅读副本。
2. 运行 `node scripts/encrypt-site.mjs "<发布目录>" "<ESG management 目录>"`。在隐藏输入提示下输入一行 JSON 数组 `["账号","密码"]`。脚本从本机读取两个 ESG 原件，用 PBKDF2-SHA-256 和 AES-256-GCM 加密所有页面和资源，输出一个新的密文目录。
3. 运行 `tar -czf encrypted-site.tar.gz -C "<密文目录>" meta.json manifest.bin objects`。在本仓库新建标签以 `site-content-` 开头的 Release，将该压缩包作为资产上传并发布。
4. 「Publish Euphonium」工作流从最新内容 Release 部署网站。访客在浏览器本地解锁，当前浏览器可在八小时内继续阅读。源码仓库维护模板、解锁程序和部署流程。
