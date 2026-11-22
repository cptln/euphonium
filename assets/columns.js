(() => {
  const filters = [...document.querySelectorAll("[data-column-filter]")];
  const entries = document.querySelectorAll("[data-column-tags]");
  function filter() {
    const hash = location.hash === "#assurance" ? "#disclosure" : location.hash;
    const selected = filters.find(link => link.hash === hash) ?? filters[0];
    for (const link of filters) {
      if (link === selected) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
    for (const entry of entries) {
      entry.hidden = selected.dataset.columnFilter !== "all" &&
        !entry.dataset.columnTags.split(" ").includes(selected.dataset.columnFilter);
    }
  }
  window.addEventListener("hashchange", filter);
  filter();
})();
