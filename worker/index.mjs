const encoder = new TextEncoder();
const cookieName = "__Host-euphonium";
const lifetime = 8 * 60 * 60;
const types = {
  html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml",
  ico: "image/x-icon", pdf: "application/pdf", woff: "font/woff", woff2: "font/woff2", txt: "text/plain; charset=utf-8"
};

function response(body, status, headers = {}) {
  return new Response(body, {status, headers: {
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin", "X-Robots-Tag": "noindex, nofollow", ...headers
  }});
}

function login(failed = false) {
  return response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>登录 · Euphonium</title><style>*{box-sizing:border-box}body{margin:0;background:#fafbf9;color:#242f4a;font:1rem/1.55 system-ui,sans-serif;min-height:100svh;display:grid;place-items:center}
main{width:min(25rem,90vw);padding:2rem 0}h1{font:2.7rem Georgia,serif;margin:0 0 1.6rem}label{display:block;margin:.9rem 0 .25rem}
input,button{width:100%;padding:.65rem .8rem;font:inherit;border-radius:.3rem;border:1px solid #74818a}button{margin-top:1.3rem;background:#275d61;color:white;cursor:pointer}p{color:#8b2c28}</style>
<main><h1>Euphonium</h1><form method="post"><label for="username">账号</label><input id="username" name="username" autocomplete="username" required>
<label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required>
${failed ? '<p role="alert">账号或密码有误，请重新输入。</p>' : ''}<button>登录</button></form></main></html>`, 401,
    {"Content-Type":"text/html; charset=utf-8", "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"});
}

async function equalSecret(left, right) {
  if (!left || !right) return false;
  const [a, b] = await Promise.all([left, right].map(s => crypto.subtle.digest("SHA-256", encoder.encode(s))));
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function sessionKey(env) {
  return crypto.subtle.importKey("raw", encoder.encode(env.SESSION_KEY), {name:"HMAC", hash:"SHA-256"}, false, ["sign","verify"]);
}

async function authenticated(request, env) {
  const cookie = (request.headers.get("Cookie") || "").split(/;\s*/).find(c => c.startsWith(cookieName + "="));
  const match = cookie?.slice(cookieName.length + 1).match(/^(\d{10})\.([a-f0-9]{64})$/);
  if (!match || Number(match[1]) <= Date.now() / 1000) return false;
  const sig = Uint8Array.from(match[2].match(/../g), byte => parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", await sessionKey(env), sig, encoder.encode(match[1]));
}

function safePath(name) {
  return name.length < 1000 && !/[\\\x00-\x1f]/.test(name) && name.split("/").every(p => p && !/^[._]/.test(p))
    && Object.hasOwn(types, name.split(".").pop().toLowerCase());
}

async function publish(request, env, path) {
  if (!env.PUBLISH_KEY || !await equalSecret(request.headers.get("X-Publish-Key"), env.PUBLISH_KEY)) return response(null, 403);
  const [, version, name] = path.match(/^\/_publish\/([a-f0-9-]{36})(?:\/(.+))?$/) || [];
  if (!version) return response(null, 400);
  if (request.method === "PUT" && name && safePath(name)) {
    await env.BUCKET.put(version + "/" + name, request.body);
    return response(null, 204);
  }
  if (request.method === "POST" && !name && await env.BUCKET.head(version + "/index.html")) {
    await env.BUCKET.put("active", version);
    return response(null, 204);
  }
  return response(null, 400);
}

export default {async fetch(request, env) {
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return response(null, 400); }
  if (path.startsWith("/_publish/")) return publish(request, env, path);
  if (!env.SITE_LOGIN || !env.SESSION_KEY) return response("Service unavailable", 503);
  if (request.method === "POST") {
    if (request.headers.get("Origin") !== url.origin || !request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded")) return response(null, 403);
    if (Number(request.headers.get("Content-Length")) > 4096) return response(null, 413);
    const form = new URLSearchParams(await request.text());
    const user = form.get("username") || "";
    if (!user || user.includes(":") || !await equalSecret(user + ":" + form.get("password"), env.SITE_LOGIN)) return login(true);
    const expires = String(Math.floor(Date.now()/1000) + lifetime);
    const sig = await crypto.subtle.sign("HMAC", await sessionKey(env), encoder.encode(expires));
    const hex = Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
    return response(null, 303, {"Location": url.href, "Set-Cookie": cookieName + "=" + expires + "." + hex + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=" + lifetime});
  }
  if (!["GET","HEAD"].includes(request.method)) return response(null, 405);
  if (!await authenticated(request, env)) return login();
  const name = path.slice(1) + (path.endsWith("/") ? "index.html" : "");
  if (!safePath(name)) return response(null, 404);
  const pointer = await env.BUCKET.get("active");
  if (!pointer) return response("Preparing website", 503);
  const key = (await pointer.text()) + "/" + name;
  const data = request.method === "HEAD" ? await env.BUCKET.head(key) : await env.BUCKET.get(key);
  if (!data) return response(null, 404);
  return response(data.body ?? null, 200, {"Content-Type": types[name.split(".").pop().toLowerCase()], "Content-Length": String(data.size)});
}};
