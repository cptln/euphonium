import { randomUUID, createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const [directory, origin] = process.argv.slice(2);
if (!directory || !origin || new URL(origin).origin !== origin || !origin.startsWith("https://")) {
  throw new Error("Pass the prepared release directory and the site's HTTPS origin.");
}
const paths = [];
async function walk(folder) {
  for (const entry of await readdir(folder, {withFileTypes:true})) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile()) paths.push(path.relative(directory, file).split(path.sep).join("/"));
    else throw new Error("Unexpected release entry: " + file);
  }
}
await walk(directory);
if (!paths.includes("index.html")) throw new Error("Missing release index");

// Read credentials from hidden stdin. Never persist them in files or arguments.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
console.log("Ready for credentials on hidden stdin.");
let input = "";
for await (const piece of process.stdin) {
  input += piece;
  if (/[\r\n]/.test(input)) break;
}
const {publisherKey, username, password, verifyOnly} = JSON.parse(input);
const options = {redirect:"manual"};
const encodePath = name => name.split("/").map(encodeURIComponent).join("/");
const checksum = data => createHash("sha256").update(data).digest("hex");
function matchesRelease(name, local, remote) {
  if (checksum(remote) === checksum(local)) return true;
  if (!name.endsWith(".html")) return false;
  // The hosting edge can insert its browser check immediately before </body>.
  // Compare every original byte, and allow only that single identified script.
  const closing = local.lastIndexOf(Buffer.from("</body>"));
  const extra = remote.length - local.length;
  if (closing < 0 || extra < 1 || extra > 4096 ||
      !remote.subarray(0, closing).equals(local.subarray(0, closing)) ||
      !remote.subarray(closing + extra).equals(local.subarray(closing))) return false;
  const script = remote.subarray(closing, closing + extra).toString("utf8");
  return /^<script>(?:(?!<\/script>)[\s\S])*<\/script>$/.test(script) &&
    script.includes("window.__CF$cv$params=") && script.includes("/cdn-cgi/challenge-platform/");
}
async function check(response, status, operation) {
  if (response.status !== status) throw new Error(operation + " returned " + response.status);
}
async function readLive(url, cookie) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {...options, headers:{Cookie:cookie}, signal:AbortSignal.timeout(45000)});
      await check(response, 200, "Verify " + new URL(url).pathname);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
}
async function parallel(fn) {
  const queue = paths.values();
  await Promise.all(Array.from({length:6}, async () => {
    for (const name of queue) await fn(name);
  }));
}
const login = secret => fetch(origin + "/", {...options, method:"POST", headers:{Origin:origin},
  body:new URLSearchParams({username, password:secret})});
const samples = ["/", "/" + encodePath(paths.find(n => n.startsWith("articles/") && n.endsWith(".html"))),
  "/" + encodePath(paths.find(n => n.endsWith(".webp")))];
for (const route of samples) {
  const r = await fetch(origin + route, options);
  await check(r, 401, "Anonymous GET " + route);
  if (!(await r.text()).includes('autocomplete="current-password"')) throw new Error("Unexpected login page");
}
await check(await login(randomUUID()), 401, "Wrong password");
const session = await login(password);
await check(session, 303, "Visitor login");
const cookie = session.headers.getSetCookie().find(c => c.startsWith("__Host-euphonium="))?.split(";")[0];
if (!cookie) throw new Error("Missing session cookie");
console.log("Anonymous entry, deep links, incorrect password and visitor login verified.");
if (!verifyOnly) {
  const batch = randomUUID();
  const target = origin + "/_publish/" + batch;
  const headers = {"X-Publish-Key":publisherKey};
  await parallel(async name => {
    const data = await readFile(path.join(directory, name));
    const url = target + "/" + encodePath(name);
    for (let attempt=0; ; attempt++) {
      try {
        const r = await fetch(url, {...options, method:"PUT", headers, body:data});
        await check(r, 204, "Upload " + name);
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  });
  await check(await fetch(target, {...options, method:"POST", headers}), 204, "Activate release");
  console.log("Activated the complete release.");
}
await parallel(async name => {
  const remote = await readLive(origin + "/" + encodePath(name), cookie);
  if (!matchesRelease(name, await readFile(path.join(directory, name)), remote)) {
    throw new Error("Content mismatch: " + name);
  }
});
const home = await readLive(origin + "/", cookie);
if (!matchesRelease("index.html", await readFile(path.join(directory, "index.html")), home)) throw new Error("Homepage mismatch");
console.log("Verified homepage and " + paths.length + " authenticated files against the local release.");
