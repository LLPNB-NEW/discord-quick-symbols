/**
 * QuickSymbols 浏览器冒烟测试（CDP 驱动）
 *
 * 做法：起一个无头 Chrome/Edge，打开测试页（默认 tests/harness.html，里面搭了一个仿 Discord
 * 聊天栏的 DOM 和最小 BdApi 替身），在页面里跑测试套件，把结果取回来逐条打印。
 *
 * 用法：node tests/browser-check.mjs [--chrome 路径] [--headful]
 *                                  [--page 页面] [--suite 函数名]
 *   --page   tests/userscript-harness.html 可测网页版用户脚本
 *   --suite  页面里返回结果数组的全局函数名，默认 __runQuickSymbolsSuite
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const CANDIDATES = [
  process.env.QS_CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

function findBrowser(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error("指定的浏览器不存在：" + explicit);
    return explicit;
  }
  const found = CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("没找到 Chrome/Edge，可用 --chrome 指定路径");
  return found;
}

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const headful = args.includes("--headful");
const pageName = argValue("--page") || "harness.html";
const suiteName = argValue("--suite") || "__runQuickSymbolsSuite";
const pageUrl = /^https?:/i.test(pageName)
  ? pageName
  : pathToFileURL(
    pageName.includes("/") || pageName.includes("\\") ? join(here, "..", pageName) : join(here, pageName)
  ).href;
const browserPath = findBrowser(argValue("--chrome"));
const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), "qs-browser-"));

const browser = spawn(browserPath, [
  headful ? "--headless=old" : "--headless=new",
  "--remote-debugging-port=" + port,
  "--user-data-dir=" + profile,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--allow-file-access-from-files",
  "--ignore-certificate-errors",
  "--window-size=1280,900",
  "about:blank"
], { stdio: "ignore" });

const cleanup = () => {
  try { browser.kill(); } catch { /* 已经退出 */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 可能被占用，忽略 */ }
};
process.on("exit", cleanup);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugger() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/list");
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* 浏览器还没起来 */ }
    await sleep(120);
  }
  throw new Error("20 秒内没连上浏览器的调试端口 " + port);
}

class CDP {
  constructor(url) {
    this.nextId = 0;
    this.pending = new Map();
    this.socket = new WebSocket(url);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", () => reject(new Error("调试 WebSocket 连接失败")), { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (this.onEvent) this.onEvent(message);
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("CDP 超时：" + method));
        }
      }, 15000);
    });
  }

  close() {
    try { this.socket.close(); } catch { /* 忽略 */ }
  }
}

async function main() {
  const wsUrl = await waitForDebugger();
  const cdp = new CDP(wsUrl);
  await cdp.open();
  const pageLogs = [];
  cdp.onEvent = (message) => {
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      pageLogs.push("未捕获异常：" + ((detail.exception && detail.exception.description) || detail.text));
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      const text = message.params.args.map((arg) => (arg.value !== undefined ? arg.value : arg.description || "")).join(" ");
      pageLogs.push("console.error：" + text);
    }
  };
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: pageUrl });

  // 等页面脚本就绪（导航会重建执行上下文，所以失败就重试）
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const probe = await cdp.send("Runtime.evaluate", {
        expression: 'document.readyState === "complete" && typeof window[' + JSON.stringify(suiteName) + '] === "function"',
        returnByValue: true
      });
      if (probe.result && probe.result.value === true) { ready = true; break; }
    } catch { /* 上下文切换中 */ }
    await sleep(150);
  }
  if (!ready) {
    if (pageLogs.length) {
      console.log("页面里的报错（最近 10 条）：");
      for (const line of pageLogs.slice(-10)) console.log("  " + line);
    }
    throw new Error("页面没加载完成（检查 harness.html 的脚本路径）");
  }

  const response = await cdp.send("Runtime.evaluate", {
    expression: "window[" + JSON.stringify(suiteName) + "]()",
    awaitPromise: true,
    returnByValue: true,
    timeout: 30000
  });

  if (response.exceptionDetails) {
    const detail = response.exceptionDetails;
    throw new Error("页面里抛异常：" + (detail.exception ? detail.exception.description : detail.text));
  }

  const results = response.result.value;
  if (!Array.isArray(results)) throw new Error("测试套件没有返回结果数组");

  const failed = results.filter((item) => !item.ok);
  for (const item of results) {
    console.log((item.ok ? "  ok   " : "  FAIL ") + item.name + (item.ok ? "" : "\n         → " + item.detail));
  }
  console.log("\n" + (failed.length === 0 ? "全部通过" : "有失败") + "：" + (results.length - failed.length) + " / " + results.length);
  if (failed.length && pageLogs.length) {
    console.log("\n页面里的报错（最近 10 条）：");
    for (const line of pageLogs.slice(-10)) console.log("  " + line);
  }

  cdp.close();
  return failed.length === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("浏览器测试没跑成：" + (err && err.stack ? err.stack : err));
    process.exit(1);
  });
