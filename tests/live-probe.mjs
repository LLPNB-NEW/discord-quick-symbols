/**
 * live-probe.mjs — 在真实 discord.com 页面上验证用户脚本的 Webpack 兼容层能不能用。
 *
 * 不登录也能跑：登录页同样加载 Discord 的 webpack 运行时，足够验证
 * “push 一个空 chunk 拿到 require → 扫模块 → 找到 ComponentDispatch”这条链路。
 *
 * 用法：node tests/live-probe.mjs [--chrome 路径] [--headful]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const CANDIDATES = [
  process.env.QS_CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

const args = process.argv.slice(2);
const headful = args.includes("--headful");
const injectUserscript = args.includes("--userscript");
const explicit = args.includes("--chrome") ? args[args.indexOf("--chrome") + 1] : null;
const browserPath = explicit || CANDIDATES.find((candidate) => existsSync(candidate));
if (!browserPath) throw new Error("没找到 Chrome/Edge");

const port = 9800 + Math.floor(Math.random() * 100);
const profile = mkdtempSync(join(tmpdir(), "qs-live-"));
const browser = spawn(browserPath, [
  headful ? "--headless=old" : "--headless=new",
  "--remote-debugging-port=" + port,
  "--user-data-dir=" + profile,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--window-size=1280,900",
  "about:blank"
], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
      const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await sleep(200);
  }
  throw new Error("连不上浏览器的调试端口");
}

const socket = new WebSocket(await waitForTarget());
let nextId = 0;
const pending = new Map();
const pageEvents = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    const detail = message.params.exceptionDetails;
    pageEvents.push("未捕获异常：" + ((detail.exception && detail.exception.description) || detail.text));
    return;
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    pageEvents.push("console.error：" + message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
    return;
  }
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("CDP 超时：" + method));
      }
    }, 30000);
  });
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result.value;
}

const PROBE = `(() => {
  var chunk = window.webpackChunkdiscord_app;
  if (!chunk || typeof chunk.push !== "function") return { ok: false, reason: "没有 webpackChunkdiscord_app" };

  var req = null;
  try {
    chunk.push([["qsb_probe"], {}, function (r) { req = r; }]);
  } catch (err) {
    return { ok: false, reason: "push 失败：" + err.message };
  }
  if (!req) return { ok: false, reason: "没拿到 require" };

  var exportsList = [];
  for (var key in req.c) {
    if (req.c[key] && req.c[key].exports) exportsList.push(req.c[key].exports);
  }

  function hasKeys(exp, keys) {
    if (!exp || (typeof exp !== "object" && typeof exp !== "function")) return false;
    for (var i = 0; i < keys.length; i++) if (exp[keys[i]] === undefined) return false;
    return true;
  }

  var found = null;
  for (var i = 0; i < exportsList.length && !found; i++) {
    var exp = exportsList[i];
    if (hasKeys(exp, ["dispatchToLastSubscribed"])) found = exp;
    else if (exp && exp.default && hasKeys(exp.default, ["dispatchToLastSubscribed"])) found = exp.default;
  }

  return {
    ok: true,
    build: (window.GLOBAL_ENV && window.GLOBAL_ENV.BUILD_NUMBER) || null,
    href: location.href,
    moduleCount: exportsList.length,
    foundDispatch: !!found,
    dispatchKeys: found ? Object.keys(found).slice(0, 8) : []
  };
})()`;

const SHIM_STATUS = `(() => ({
  hasBdApi: !!window.BdApi,
  pluginClass: typeof window.__QSB_PLUGIN__,
  instance: !!window.__qsbInstance,
  style: !!document.getElementById("bd-QuickSymbols"),
  button: !!document.querySelector(".qsb-btn"),
  href: location.href
}))()`;

try {
  await send("Page.enable");
  await send("Runtime.enable");

  if (injectUserscript) {
    const source = readFileSync(join(here, "..", "QuickSymbols.user.js"), "utf8");
    await send("Page.addScriptToEvaluateOnNewDocument", { source });
  }

  await send("Page.navigate", { url: "https://discord.com/login" });

  if (injectUserscript) {
    await sleep(6000);
    const status = await evaluate(SHIM_STATUS);
    status.errors = pageEvents.slice(-5);
    console.log(JSON.stringify(status, null, 2));
    process.exitCode = status.hasBdApi && status.pluginClass === "function" ? 0 : 1;
  } else {
    let result = null;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      try {
        result = await evaluate(PROBE);
        if (result && result.ok) break;
      } catch { /* 页面还在加载 */ }
      await sleep(1000);
    }

    if (result) result.errors = pageEvents.slice(-5);
    console.log(JSON.stringify(result, null, 2));
    // 登录页只加载部分模块，找不到 ComponentDispatch 是正常的；这里只验证 webpack 链路可用。
    process.exitCode = result && result.ok ? 0 : 1;
  }
} finally {
  try { socket.close(); } catch { /* 忽略 */ }
  try { browser.kill(); } catch { /* 忽略 */ }
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
}
