# 个人网站项目规则

## 内容维护与发布

1. 以资料空间中的版本为主稿。在 Chatbox 或其他工具写作后，将文章存入资料空间。知识库条目、栏目介绍等网页内容也在资料空间维护。
2. 在本地构建网站时，Codex 读取本次选定发布的内容和配图。可以通过 Drive 同步，也可以手动导出或替换本地副本。草稿留在资料空间。
3. Codex 在本地维护导航、模板、样式和构建脚本。内容或结构有改动时，先在本地构建并预览网页。
4. Git 只跟踪网站架构、构建配置和项目规则。将本地内容目录、文章配图和构建输出加入 `.gitignore`。提交前检查暂存区，确保其中只包含应由 Git 管理的文件。
5. 在本机整理定稿并加密。ESG 工作流和银行年度对标看板只使用「站点发布/public/esg」中已加密的团队入口，访客登录主页后还须单独通过 ESG 验证。《技术方向转变的临界均衡》和配套阅读页可进入加密发布包。GitHub Release 保存密文，GitHub Pages 部署网站。仅更新内容时发布新的 `site-content-*` Release 即可。
6. 网站入口为 `https://cptln.github.io/euphonium/studio/`，仓库根网址引导至新版，旧 ESG 书签继续可用。页面、图片和登录均由 GitHub Pages 和访客浏览器完成，无需调用其他托管服务。

## 从 Writing 更新文章

文章主稿在 Writing 资料空间。此项目的 `content/writing/articles.json` 将每篇文章的 Page ID、网站栏目（`section`）、中文主标题、网站地址和已用配图一一对应。资料空间的页面标题和文章 Markdown 的一级标题使用「栏目｜主标题」，例如「随笔｜王宫之外」。网站阅读页使用文章主标题。文件固定为 `content/writing/<主标题>.md`。文章及映射保存在本机，Git 忽略该目录。

收到“同步文章并预览”时，按映射读取各 Page 的当前完整正文。把每次 read_page 返回的 content 对象（含 page_id、title、blocks）组成 JSON 数组，保存到一次性本地文件，运行 `python -B scripts/sync-writing.py "<JSON 文件>"`，完成后移除临时文件。定稿时也可仅同步本次修订的页面。如果出现新的资料空间配图，读取对应附件，保存到 `content/writing/media/<主标题>/` 内与网页相对路径一致的位置，并在映射的 images 中登记该附件与相对路径。文章改标题时先核对原 Page ID 并保留已有网页地址。

双击项目根目录的 `预览网站文章.cmd` 可从固定 Markdown 生成整站并打开本机预览。在聊天中执行时，运行 `python -B scripts/writing-site.py`，将输出目录的 essays.html 和相关正文链接交给用户。预览以 `releases/knowledge-preview` 为整站底稿，保留站内现有导航、图片与阅读器。网站其他栏目发生变化后，应先使用更新过的整站底稿再预览。

用户核对预览后，可双击 `发布网站文章.cmd`。该入口使用最后一次预览、现有网站账号密码和 GitHub CLI 登录，加密后发布 site-content Release，由既有 Pages 工作流部署。仅请求预览时停在本机。

