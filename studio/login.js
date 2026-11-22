const base = "/euphonium/studio/";
const form = document.querySelector("form");
const button = form.querySelector("button");
const statusText = document.querySelector("#status");

function communicate(worker, message) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(Error("timeout")); }, 30000);
    channel.port1.onmessage = ({data}) => { clearTimeout(timer); channel.port1.close(); resolve(data); };
    worker.postMessage(message, [channel.port2]);
  });
}

async function start() {
  if (!location.pathname.startsWith(base)) {
    const link = document.createElement("a");
    link.href = base; link.textContent = "前往 Euphonium 首页";
    form.replaceWith(link); return;
  }
  if (!navigator.serviceWorker || !crypto.subtle || !window.DecompressionStream) throw Error("unsupported");
  await navigator.serviceWorker.register(base + "sw.js", {scope:base, updateViaCache:"none"});
  const {active} = await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise(resolve => {
      if (navigator.serviceWorker.controller) resolve();
      else navigator.serviceWorker.addEventListener("controllerchange", resolve, {once:true});
    });
  }
  if (await communicate(active, {type:"status"})) { location.reload(); return; }
  button.disabled = false;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true; statusText.textContent = "正在解锁…";
    try {
      const r = await fetch(base + "meta.json", {cache:"no-store"});
      if (!r.ok) throw Error("release unavailable");
      const meta = await r.json();
      const input = new TextEncoder().encode(JSON.stringify([form.querySelector("#user").value, form.querySelector("#pass").value]));
      const material = await crypto.subtle.importKey("raw", input, "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt:Uint8Array.from(atob(meta.salt), c=>c.charCodeAt(0)),iterations:meta.iterations}, material, {name:"AES-GCM",length:256}, false, ["decrypt"]);
      const result = await communicate(active,{type:"unlock", key, salt:meta.salt});
      if (result === "ok") { form.reset(); location.reload(); return; }
      statusText.textContent = result === "invalid" ? "账号或密码有误，请重新输入。" : "网站暂时无法加载，请重试。";
    } catch { statusText.textContent = "网站暂时无法加载，请重试。"; }
    button.disabled = false;
  });
}
start().catch(() => { statusText.textContent = "无法启用本地解锁。请使用支持 Service Worker 的新版浏览器，再刷新此页。"; });
