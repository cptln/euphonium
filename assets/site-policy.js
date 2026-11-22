for (const name of ["copy", "cut", "dragstart"]) {
  document.addEventListener(name, event => event.preventDefault(), true);
}
document.addEventListener("contextmenu", event => {
  if (event.target.closest?.(".page-viewport")) event.preventDefault();
}, true);
