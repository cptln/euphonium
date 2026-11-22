(() => {
  const topic = document.currentScript.dataset.topic;
  if (topic) {
    location.replace("knowledge.html#" + topic + (location.hash && location.hash !== "#top" ? "-" + location.hash.slice(1) : ""));
    return;
  }

  const list = document.querySelector(".knowledge-tabs");
  const tabs = Array.from(list.querySelectorAll("a"));
  const panels = tabs.map(tab => document.getElementById(tab.hash.slice(1)));
  list.setAttribute("role", "tablist");
  tabs.forEach((tab, index) => {
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panels[index].id);
    panels[index].setAttribute("role", "tabpanel");
    panels[index].tabIndex = 0;
  });

  function select(index) {
    tabs.forEach((tab, position) => {
      tab.setAttribute("aria-selected", String(position === index));
      tab.tabIndex = position === index ? 0 : -1;
      panels[position].hidden = position !== index;
    });
  }

  function followHash() {
    const target = document.getElementById(location.hash.slice(1));
    const index = panels.findIndex(panel => panel.contains(target));
    select(index < 0 ? 0 : index);
    if (index >= 0 && panels[index] !== target) target.scrollIntoView();
  }

  function activate(index) {
    if (location.hash !== tabs[index].hash) history.pushState(null, "", tabs[index].hash);
    select(index);
    tabs[index].focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      activate(index);
    });
    tab.addEventListener("keydown", event => {
      switch (event.key) {
        case "ArrowRight": activate((index + 1) % tabs.length); break;
        case "ArrowLeft": activate((index + tabs.length - 1) % tabs.length); break;
        case "Home": activate(0); break;
        case "End": activate(tabs.length - 1); break;
        case " ": activate(index); break;
        default: return;
      }
      event.preventDefault();
    });
  });
  window.addEventListener("hashchange", followHash);
  followHash();
})();
