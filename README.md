# Euphonium

个人网站在 [GitHub Pages](https://cptln.github.io/euphonium/studio/) 上运行。ESG 工作流和银行年度对标看板是其中的栏目。[旧 ESG 入口](https://cptln.github.io/euphonium/esg/) 仍可使用。

## 从本机发布内容

1. 运行 `node scripts/prepare-release.mjs "<本地网站目录>"`，取得整理好的发布目录。脚本按本地 Git 忽略规则排除草稿和私人阅读副本。
2. 运行 `node scripts/encrypt-site.mjs "<发布目录>" "<ESG management 目录>"`。在隐藏输入提示下输入一行 JSON 数组 `["账号","密码"]`。脚本读取并校验 ESG 工作流、银行年度对标看板和「应对气候变化」栏目下的碳排放测算工作流这三个团队加密入口，再用 PBKDF2-SHA-256 和 AES-256-GCM 加密整站。三个入口均使用现有 ESG 团队账号。
3. 运行 `tar -czf encrypted-site.tar.gz -C "<密文目录>" meta.json manifest.bin objects`。在本仓库新建标签以 `site-content-` 开头的 Release，将该压缩包作为资产上传并发布。
4. 「Publish Euphonium」工作流从最新内容 Release 部署网站。访客在浏览器本地解锁，当前浏览器可在八小时内继续阅读。源码仓库维护模板、解锁程序和部署流程。
