(() => {
  const button = document.querySelector(".language-switch");
  const entries = Array.from(document.querySelectorAll("[data-en]"), element => ({
    element, zh: element.textContent, en: element.dataset.en
  }));
  const key = "euphonium-language";
  const chineseTitle = document.title;
  const description = document.querySelector('meta[name="description"]');
  const chineseDescription = description.content;
  const englishDescription = document.querySelector(".lede")?.dataset.en ||
    "Interactive tools for investor relations, impact projects and AI governance.";
  function apply(language) {
    const english = language === "en";
    document.documentElement.lang = english ? "en" : "zh-CN";
    for (const entry of entries) entry.element.textContent = english ? entry.en : entry.zh;
    document.title = english ? (document.querySelector("title").dataset.en ?? chineseTitle.replace("ESG信息披露", "ESG Disclosure")) : chineseTitle;
    description.content = english ? englishDescription : chineseDescription;
    const nav = document.querySelector("header nav");
    nav.setAttribute("aria-label", english ? "Main navigation" : "主导航");
    document.querySelector(".overview")?.setAttribute("aria-label", english ? "At a glance" : "内容概览");
    document.querySelector(".tools")?.setAttribute("aria-label", english ? "Interactive tools" : "交互工具");
    document.querySelector(".profile-avatar")?.setAttribute("alt", english ? "Illustrated portrait of Elaine Shen" : "Elaine Shen 的动漫头像");
    button.textContent = english ? "中文" : "EN";
    button.lang = english ? "zh-CN" : "en";
    button.setAttribute("aria-label", english ? "切换到中文" : "Switch to English");
    button.hidden = false;
  }
  function restore() {
    let lang = "zh";
    try { lang = localStorage.getItem(key) || lang; } catch {}
    apply(lang);
  }
  button.addEventListener("click", () => {
    const lang = document.documentElement.lang === "en" ? "zh" : "en";
    try { localStorage.setItem(key, lang); } catch {}
    apply(lang);
  });
  restore();
  window.addEventListener("pageshow", event => { if (event.persisted) restore(); });
  window.addEventListener("storage", event => { if (event.key === key) restore(); });
})();
