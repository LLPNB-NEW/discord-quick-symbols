/**
 * build-userscript.mjs — 把 QuickSymbols.plugin.js 打包成篡改猴（Tampermonkey /
 * Violentmonkey）用户脚本 QuickSymbols.user.js。
 *
 * 做法：插件源码一行不改，前面套一层 BdApi 兼容层（存储 / 样式 / Webpack / React
 * 内部实例 / toast / 日志），后面补一段启动与设置入口。插件更新后重新跑一次即可。
 *
 * 用法：
 *   node build-userscript.mjs            生成 QuickSymbols.user.js
 *   node build-userscript.mjs --check    只做语法检查，不写文件
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_FILE = join(here, "QuickSymbols.plugin.js");
const OUTPUT_FILE = join(here, "QuickSymbols.user.js");

// 统一成 LF：Git 在 Windows 上可能把工作区文件换成 CRLF，直接拼进去会让产物随
// 检出配置漂移（同样的源码在不同机器上生成不同字节），diff 里也全是行尾噪声。
const pluginSource = readFileSync(PLUGIN_FILE, "utf8").replace(/\r\n?/g, "\n");

function metaOf(source, field) {
  const match = source.match(new RegExp("\\*\\s*@" + field + "\\s+(.+)"));
  return match ? match[1].trim() : "";
}

const name = metaOf(pluginSource, "name") || "QuickSymbols";
const author = metaOf(pluginSource, "author") || "小鲸娘";
const description = metaOf(pluginSource, "description") || "Discord 快捷符号按钮";
const version = (pluginSource.match(/const PLUGIN_VERSION = "([^"]+)"/) || [])[1] || "1.0.0";

const HEADER = `// ==UserScript==
// @name         ${name} — Discord 快捷符号
// @namespace    https://github.com/quick-symbols
// @version      ${version}
// @description  ${description}
// @author       ${author}
// @license      GPL-3.0-or-later
// @homepageURL  https://github.com/LLPNB-NEW/discord-quick-symbols
// @match        https://discord.com/*
// @match        https://ptb.discord.com/*
// @match        https://canary.discord.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// ==/UserScript==
`;

/*
 * BdApi 兼容层。只实现插件真正用到的那些面：
 *   Data.load / save / delete（外加旧版 loadData / saveData）
 *   DOM.addStyle / removeStyle（外加旧版 injectCSS / clearCSS）
 *   Webpack.getByKeys / getModule / getByStrings
 *   ReactUtils.getInternalInstance
 *   UI.showToast
 *   Logger.log / info / warn / error / debug
 */
const SHIM = String.raw`
/* ================================================================== *
 * BdApi 兼容层（网页版没有 BetterDiscord，这里补一个最小实现）
 * ================================================================== */

var __QSB_PAGE__ = (typeof unsafeWindow !== "undefined" && unsafeWindow) || window;
var __QSB_PREFIX__ = "QuickSymbols.";

function __qsbRead(key) {
  try {
    var raw;
    if (typeof GM_getValue === "function") raw = GM_getValue(key, null);
    else raw = window.localStorage.getItem("qsb." + key);
    if (raw === null || raw === undefined || raw === "") return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    return null;
  }
}

function __qsbWrite(key, value) {
  try {
    var raw = JSON.stringify(value);
    if (typeof GM_setValue === "function") GM_setValue(key, raw);
    else window.localStorage.setItem("qsb." + key, raw);
  } catch (err) {
    console.warn("[QuickSymbols] 设置保存失败", err);
  }
}

function __qsbRemove(key) {
  try {
    if (typeof GM_deleteValue === "function") GM_deleteValue(key);
    else window.localStorage.removeItem("qsb." + key);
  } catch (err) {
    /* 忽略 */
  }
}

/* ---------- Webpack ---------- */

var __qsbRequire = null;

function __qsbGetRequire() {
  if (__qsbRequire) return __qsbRequire;
  try {
    var chunk = __QSB_PAGE__.webpackChunkdiscord_app;
    if (!chunk || typeof chunk.push !== "function") return null;
    var id = "qsb_" + Math.random().toString(36).slice(2);
    chunk.push([[id], {}, function (req) { __qsbRequire = req; }]);
  } catch (err) {
    return null;
  }
  return __qsbRequire;
}

function __qsbExports() {
  var req = __qsbGetRequire();
  var out = [];
  if (!req || !req.c) return out;
  for (var key in req.c) {
    if (!Object.prototype.hasOwnProperty.call(req.c, key)) continue;
    var mod = req.c[key];
    if (mod && mod.exports) out.push(mod.exports);
  }
  return out;
}

function __qsbHasKeys(exp, keys) {
  if (!exp || (typeof exp !== "object" && typeof exp !== "function")) return false;
  for (var i = 0; i < keys.length; i++) {
    if (exp[keys[i]] === undefined) return false;
  }
  return true;
}

function __qsbCandidates() {
  var list = __qsbExports();
  var extra = [];
  for (var i = 0; i < list.length; i++) {
    var exp = list[i];
    if (exp && typeof exp === "object" && exp.default) extra.push(exp.default);
  }
  return list.concat(extra);
}

function __qsbGetByKeys() {
  var keys = Array.prototype.slice.call(arguments);
  if (keys.length === 1 && Array.isArray(keys[0])) keys = keys[0];
  var list = __qsbCandidates();
  for (var i = 0; i < list.length; i++) {
    if (__qsbHasKeys(list[i], keys)) return list[i];
  }
  return null;
}

function __qsbGetModule(filter, options) {
  if (typeof filter !== "function") return null;
  var list = __qsbCandidates();
  for (var i = 0; i < list.length; i++) {
    try {
      if (filter(list[i])) return list[i];
    } catch (err) {
      /* 这个模块不合适，继续找 */
    }
  }
  return null;
}

function __qsbSourceOf(exp) {
  if (typeof exp === "function") return Function.prototype.toString.call(exp);
  if (!exp || typeof exp !== "object") return "";
  var src = "";
  for (var key in exp) {
    try {
      if (typeof exp[key] === "function") src += Function.prototype.toString.call(exp[key]);
    } catch (err) {
      /* 忽略 */
    }
  }
  return src;
}

function __qsbGetByStrings(strings) {
  var wanted = Array.isArray(strings) ? strings : [strings];
  var list = __qsbCandidates();
  for (var i = 0; i < list.length; i++) {
    var src = __qsbSourceOf(list[i]);
    if (!src) continue;
    var ok = true;
    for (var j = 0; j < wanted.length; j++) {
      if (typeof wanted[j] === "string" && wanted[j] && src.indexOf(wanted[j]) < 0) { ok = false; break; }
    }
    if (ok) return list[i];
  }
  return null;
}

/* ---------- 样式 / 日志 / toast ---------- */

var __qsbStyles = {};

function __qsbAddStyle(id, css) {
  __qsbRemoveStyle(id);
  var style = document.createElement("style");
  style.id = "bd-" + id;
  style.textContent = css;
  document.head.appendChild(style);
  __qsbStyles[id] = style;
  return style;
}

function __qsbRemoveStyle(id) {
  var node = __qsbStyles[id] || document.getElementById("bd-" + id) || document.getElementById(id);
  if (node && node.parentNode) node.parentNode.removeChild(node);
  delete __qsbStyles[id];
}

function __qsbLogger(level) {
  return function () {
    var args = Array.prototype.slice.call(arguments);
    var fn = console[level] || console.log;
    try {
      fn.apply(console, ["[QuickSymbols]"].concat(args));
    } catch (err) {
      /* 忽略 */
    }
  };
}

var __qsbToastTimer = null;

function __qsbToast(content, options) {
  try {
    var el = document.createElement("div");
    el.className = "qsb-us-toast";
    el.textContent = String(content);
    el.style.cssText = "position:fixed;left:50%;bottom:88px;transform:translateX(-50%);" +
      "z-index:2147483001;max-width:420px;padding:10px 16px;border-radius:8px;" +
      "background:#111214;color:#f2f3f5;font-size:14px;line-height:1.45;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.45);pointer-events:none;opacity:0;" +
      "transition:opacity .18s ease;";
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = "1"; });
    var timeout = (options && options.timeout) || 3000;
    clearTimeout(__qsbToastTimer);
    __qsbToastTimer = setTimeout(function () {
      el.style.opacity = "0";
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 220);
    }, timeout);
  } catch (err) {
    /* 忽略 */
  }
}

function __qsbFiber(node) {
  if (!node) return null;
  var keys = Object.keys(node);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.indexOf("__reactFiber$") === 0 || key.indexOf("__reactInternalInstance$") === 0) {
      return node[key] || null;
    }
  }
  return null;
}

window.BdApi = {
  Data: {
    load: function (pluginName, key) { return __qsbRead(pluginName + "." + key); },
    save: function (pluginName, key, data) { __qsbWrite(pluginName + "." + key, data); },
    delete: function (pluginName, key) { __qsbRemove(pluginName + "." + key); }
  },
  loadData: function (pluginName, key) { return __qsbRead(pluginName + "." + key); },
  saveData: function (pluginName, key, data) { __qsbWrite(pluginName + "." + key, data); },
  DOM: {
    addStyle: __qsbAddStyle,
    removeStyle: __qsbRemoveStyle
  },
  injectCSS: function (css) { __qsbAddStyle("qsb-legacy", css); },
  clearCSS: function () { __qsbRemoveStyle("qsb-legacy"); },
  Webpack: {
    getByKeys: __qsbGetByKeys,
    getModule: __qsbGetModule,
    getByStrings: __qsbGetByStrings
  },
  ReactUtils: {
    getInternalInstance: __qsbFiber
  },
  UI: {
    showToast: __qsbToast
  },
  Logger: {
    log: __qsbLogger("log"),
    info: __qsbLogger("info"),
    warn: __qsbLogger("warn"),
    error: __qsbLogger("error"),
    debug: __qsbLogger("debug")
  }
};
`;

const BOOT = String.raw`
/* ================================================================== *
 * 启动与设置入口
 * ================================================================== */

window.__QSB_PLUGIN__ = QuickSymbols;

function __qsbBoot() {
  if (window.__qsbInstance) return;
  var instance;
  try {
    instance = new QuickSymbols({
      name: PLUGIN_NAME,
      version: PLUGIN_VERSION,
      author: "__QSB_AUTHOR__",
      description: "在聊天输入框的发送键左边加一个符号按钮"
    });
    instance.start();
    window.__qsbInstance = instance;
  } catch (err) {
    console.error("[QuickSymbols] 启动失败", err);
  }
}

/* 网页版没有“设置 → 插件”，所以用右键点击符号按钮打开设置。 */
function __qsbOpenSettings() {
  var instance = window.__qsbInstance;
  if (!instance || typeof instance.getSettingsPanel !== "function") return;

  var opened = document.querySelector(".qsb-us-modal");
  if (opened) {
    opened.remove();
    if (typeof instance.saveNow === "function") instance.saveNow();
    return;
  }

  var panel;
  try {
    panel = instance.getSettingsPanel();
  } catch (err) {
    console.error("[QuickSymbols] 设置面板打不开", err);
    return;
  }
  if (!panel) return;

  var overlay = document.createElement("div");
  overlay.className = "qsb-us-modal";
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483002;" +
    "background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:24px;";

  var card = document.createElement("div");
  card.style.cssText = "width:min(560px,100%);max-height:82vh;overflow:auto;" +
    "background:#313338;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.5);padding:20px 22px;";
  card.appendChild(panel);
  overlay.appendChild(card);

  overlay.addEventListener("mousedown", function (event) {
    if (event.target === overlay) {
      overlay.remove();
      if (typeof instance.saveNow === "function") instance.saveNow();
    }
  });

  document.body.appendChild(overlay);
}

document.addEventListener("contextmenu", function (event) {
  var target = event.target;
  if (target && target.closest && target.closest(".qsb-btn")) {
    event.preventDefault();
    __qsbOpenSettings();
  }
}, true);

/* 手机/平板没有右键：长按按钮 600ms 也算打开设置。
   轻点仍然是「插入 / 开菜单」，长按时把随后那一下 click 吃掉，免得顺手插一对符号。 */
var __qsbPressTimer = null;
var __qsbPressX = 0;
var __qsbPressY = 0;
var __qsbSwallowClick = false;

function __qsbCancelPress() {
  if (__qsbPressTimer !== null) {
    clearTimeout(__qsbPressTimer);
    __qsbPressTimer = null;
  }
}

document.addEventListener("pointerdown", function (event) {
  var target = event.target;
  var btn = target && target.closest && target.closest(".qsb-btn");
  if (!btn) return;
  if (event.pointerType === "mouse") return;
  __qsbPressX = event.clientX;
  __qsbPressY = event.clientY;
  __qsbCancelPress();
  __qsbPressTimer = setTimeout(function () {
    __qsbPressTimer = null;
    __qsbSwallowClick = true;
    setTimeout(function () { __qsbSwallowClick = false; }, 800);
    if (navigator.vibrate) {
      try { navigator.vibrate(12); } catch (err) { /* 有些浏览器不给震 */ }
    }
    __qsbOpenSettings();
  }, 600);
}, true);

document.addEventListener("pointermove", function (event) {
  if (__qsbPressTimer === null) return;
  if (Math.abs(event.clientX - __qsbPressX) > 10 || Math.abs(event.clientY - __qsbPressY) > 10) {
    __qsbCancelPress();
  }
}, true);

document.addEventListener("pointerup", __qsbCancelPress, true);
document.addEventListener("pointercancel", __qsbCancelPress, true);

document.addEventListener("click", function (event) {
  if (!__qsbSwallowClick) return;
  __qsbSwallowClick = false;
  event.preventDefault();
  event.stopPropagation();
}, true);

document.addEventListener("keydown", function (event) {
  if (event.key !== "Escape") return;
  var modal = document.querySelector(".qsb-us-modal");
  if (!modal) return;
  modal.remove();
  if (window.__qsbInstance && typeof window.__qsbInstance.saveNow === "function") {
    window.__qsbInstance.saveNow();
  }
}, true);

/* 等 Discord 把聊天输入框渲染出来再启动。登录页也会跑脚本，所以不设总时限：
   未登录时先等着，登录进频道后输入框一出现就启动。 */
if (!window.__QSB_MANUAL_BOOT__) {
  var __qsbTries = 0;
  (function __qsbWaitApp() {
    if (window.__qsbInstance) return;
    __qsbTries++;
    var ready = document.querySelector('[contenteditable="true"][role="textbox"], [data-slate-editor="true"]');
    if (ready) {
      setTimeout(__qsbBoot, 700);
      return;
    }
    setTimeout(__qsbWaitApp, __qsbTries < 60 ? 500 : 2000);
  })();
}
`;

const OUTPUT = HEADER + "\n" + "(function () {\n" + '"use strict";\n' + SHIM + "\n" + pluginSource + "\n" + BOOT.replace("__QSB_AUTHOR__", author) + "\n})();\n";

// 只编译、不执行：语法错会在这里抛出来。
try {
  new vm.Script(OUTPUT, { filename: "QuickSymbols.user.js" });
} catch (err) {
  console.error("生成结果有语法错误：" + err.message);
  process.exit(1);
}

if (process.argv.includes("--check")) {
  console.log("语法检查通过（未写文件），版本 " + version + "，约 " + OUTPUT.length + " 字节");
  process.exit(0);
}

writeFileSync(OUTPUT_FILE, OUTPUT, "utf8");
console.log("已生成 " + OUTPUT_FILE);
console.log("  版本 " + version + "，作者 " + author + "，共 " + OUTPUT.length + " 字节");
