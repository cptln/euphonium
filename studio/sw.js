const base = new URL(self.registration.scope);
const types = {html:"text/html; charset=utf-8",css:"text/css; charset=utf-8",js:"text/javascript; charset=utf-8",svg:"image/svg+xml",png:"image/png",webp:"image/webp",jpg:"image/jpeg",jpeg:"image/jpeg",ico:"image/x-icon",pdf:"application/pdf",woff:"font/woff",woff2:"font/woff2",txt:"text/plain; charset=utf-8"};
const encoder = new TextEncoder();
let active;
let dbPromise;
function database() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open("euphonium-studio-session", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("session");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function stored(action, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("session", action === "get" ? "readonly" : "readwrite");
    const store = tx.objectStore("session");
    const req = action === "get" ? store.get("visitor") : action === "put" ? store.put(value,"visitor") : store.delete("visitor");
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
async function getFile(file) {
  const r = await fetch(new URL(file, base), {cache:"no-store",credentials:"omit"});
  if (!r.ok) throw Error("File unavailable");
  return r;
}
async function decrypt(key, name, bytes) {
  const data = new Uint8Array(bytes);
  const gzip = await crypto.subtle.decrypt({name:"AES-GCM",iv:data.subarray(0,12),additionalData:encoder.encode(name)},key,data.subarray(12));
  return new Blob([gzip]).stream().pipeThrough(new DecompressionStream("gzip"));
}
async function loadManifest(state, meta) {
  if (state.expires <= Date.now() || state.salt !== meta.salt) return null;
  const encrypted = await (await getFile("manifest.bin?v=" + encodeURIComponent(meta.salt))).arrayBuffer();
  const manifest = await new Response(await decrypt(state.key, "manifest", encrypted)).json();
  return {...state, manifest};
}
async function session(checkRelease) {
  if (active?.expires > Date.now() && !checkRelease) return active;
  const previous = active || await stored("get");
  if (!previous) return null;
  const meta = await (await getFile("meta.json")).json();
  if (previous.expires <= Date.now() || previous.salt !== meta.salt) {
    active = null; await stored("delete"); return null;
  }
  if (!active) active = await loadManifest(previous, meta);
  return active;
}
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("message", event => {
  const port = event.ports[0];
  if (!port || !event.source?.url?.startsWith(base.href)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === "status") { port.postMessage(Boolean(await session(true))); return; }
      if (event.data.type !== "unlock") return;
      const state = {key:event.data.key,salt:event.data.salt,expires:Date.now()+8*60*60*1000};
      const meta = await (await getFile("meta.json")).json();
      const candidate = await loadManifest(state,meta);
      if (!candidate) { port.postMessage("retry"); return; }
      await stored("put",state); active = candidate; port.postMessage("ok");
    } catch (err) { port.postMessage(event.data.type === "status" ? false : err.name === "OperationError" ? "invalid" : "retry"); }
  })());
});
async function serve(request, url, relative) {
  const state = await session(request.mode === "navigate");
  if (!state) {
    if (request.mode === "navigate") return new Response((await getFile("shell.html")).body,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
    return new Response(null,{status:401});
  }
  const name = relative.endsWith("/") || !relative ? relative + "index.html" : relative;
  if (!Object.hasOwn(state.manifest,name)) {
    if (Object.hasOwn(state.manifest,name+"/index.html")) return Response.redirect(url.origin+url.pathname+"/"+url.search,302);
    return new Response("页面不存在",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8"}});
  }
  const headers = {"Content-Type":types[name.split(".").pop()] || "application/octet-stream","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin"};
  if (request.method === "HEAD") return new Response(null,{headers});
  const bytes = await (await getFile("objects/"+state.manifest[name]+".bin")).arrayBuffer();
  return new Response(await decrypt(state.key,name,bytes),{headers});
}
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || !["GET","HEAD"].includes(event.request.method)) return;
  let relative;
  try {relative = decodeURIComponent(url.pathname.slice(base.pathname.length));} catch {return;}
  if (["meta.json","manifest.bin","shell.html","login.js","sw.js"].includes(relative) || relative.startsWith("objects/")) return;
  event.respondWith(serve(event.request,url,relative).catch(()=>new Response("暂时无法读取页面，请刷新重试。",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}})));
});
