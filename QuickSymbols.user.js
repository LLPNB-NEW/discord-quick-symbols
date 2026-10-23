// ==UserScript==
// @name         QuickSymbols — Discord 快捷符号
// @namespace    https://github.com/quick-symbols
// @version      1.0.3
// @description  在聊天输入框的发送键左边加一个“”按钮：点一下插入一对符号，光标落在符号中间；悬停或点按还能换用别的符号、调整光标落点。
// @author       LLP和小鲸娘
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

(function () {
"use strict";

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

/**
 * @name QuickSymbols
 * @author LLP和小鲸娘
 * @description 在聊天输入框的发送键左边加一个“”按钮：点一下插入一对符号，光标落在符号中间；悬停或点按还能换用别的符号、调整光标落点。
 * @version 1.0.3
 */

/*
 * QuickSymbols — Discord 快捷符号按钮（BetterDiscord 插件，单文件）
 *
 * 结构：
 *   1. 常量与默认设置
 *   2. 纯逻辑（不碰 DOM，可直接在 Node 里测试）
 *   3. DOM 小工具
 *   4. 样式（运行时用 BdApi.DOM.addStyle 注入）
 *   5. 插件类（挂载按钮、弹出菜单、设置面板、快捷键）
 *
 * 关键取舍：
 *   - 按钮挂在输入框图标栏里，优先塞到发送键左边；发送键只在有文字时才渲染，所以每次
 *     重挂都会用 planMountPosition() 重新规划落点。编辑器内部的 role="button"（@提及、
 *     表情）一律不算界面按钮，钩子绝不允许落进编辑器本体。
 *   - 插入文本优先直接调这个输入框自己的 TextArea 实例（真正写进 Slate 模型），再退
 *     ComponentDispatch 的 INSERT_TEXT 通道和 document.execCommand；每条都验文本有没有变。
 *   - 插入后光标由 placeCaretInside() 接管：等焦点回来、把光标挪进符号中间、必要时重试，
 *     否则接着打 @ 选人时提及会落在符号外面。
 *   - 所有“光标该停哪”的判断都在纯函数 planInsertion() 里完成，方便测试。
 *
 * 协议：GPL-3.0（见仓库根目录的 LICENSE）。
 */

"use strict";

/* ================================================================== *
 * 1. 常量与默认设置
 * ================================================================== */

const PLUGIN_NAME = "QuickSymbols";
const PLUGIN_VERSION = "1.0.3";
const CONFIG_KEY = "config";
const STYLE_ID = "QuickSymbols";
const LOG_PREFIX = "[QuickSymbols]";

const MAX_SYMBOL_LENGTH = 8;
const GLYPH_SCALE_MIN = 50;
const GLYPH_SCALE_MAX = 150;
const GLYPH_SCALE_DEFAULT = 82;
const MENU_MODES = ["auto", "tap", "hover"];

const CLS = {
  wrap: "qsb-wrap",
  btn: "qsb-btn",
  menu: "qsb-menu",
  open: "qsb-open",
  noAnim: "qsb-no-anim",
  item: "qsb-item",
  current: "qsb-current",
  sym: "qsb-sym",
  side: "qsb-side",
  sideOn: "qsb-side-on",
  sideOff: "qsb-side-off",
  pick: "qsb-pick",
  settings: "qsb-settings",
  head: "qsb-head",
  headTitle: "qsb-head-title",
  headSub: "qsb-head-sub",
  setting: "qsb-setting",
  settingText: "qsb-setting-text",
  settingLabel: "qsb-setting-label",
  settingHint: "qsb-setting-hint",
  check: "qsb-check",
  inline: "qsb-inline",
  range: "qsb-range",
  mono: "qsb-mono",
  select: "qsb-select",
  text: "qsb-text",
  hint: "qsb-hint",
  error: "qsb-error",
  section: "qsb-section",
  sectionTitle: "qsb-section-title",
  sectionHint: "qsb-section-hint",
  symbolList: "qsb-symbol-list",
  symbolRow: "qsb-symbol-row",
  dot: "qsb-dot",
  dotOn: "qsb-dot-on",
  symbolInput: "qsb-symbol-input",
  sideBtn: "qsb-side-btn",
  mini: "qsb-mini",
  primary: "qsb-primary",
  secondary: "qsb-secondary",
  addRow: "qsb-add-row",
  footer: "qsb-footer"
};

const DEFAULT_SYMBOLS = [
  { text: "“”", inner: true },
  { text: "「」", inner: true },
  { text: "（）", inner: true },
  { text: "《》", inner: true },
  { text: "【】", inner: true },
  { text: "\"\"", inner: true },
  { text: "''", inner: true },
  { text: "……", inner: false }
];

/** 每次调用都给一份全新的默认配置，避免调用方改到共享对象。 */
function defaultConfig() {
  return {
    symbol: "“”",
    symbols: DEFAULT_SYMBOLS.map(function (entry) {
      return { text: entry.text, inner: entry.inner };
    }),
    showButton: true,
    glyphScale: GLYPH_SCALE_DEFAULT,
    menuMode: "auto",
    animations: true,
    shortcut: "",
    wrapSelection: true
  };
}

/* ================================================================== *
 * 2. 纯逻辑
 * ================================================================== */

/** BdApi：在 Discord 里由页面注入为全局；Node 测试环境里为 null。 */
const BD = (function () {
  try {
    if (typeof BdApi !== "undefined" && BdApi) return BdApi;
    if (typeof window !== "undefined" && window.BdApi) return window.BdApi;
  } catch (err) {
    /* 忽略 */
  }
  return null;
})();

function bdLog(level, ...args) {
  try {
    if (BD && BD.Logger && typeof BD.Logger[level] === "function") {
      BD.Logger[level](PLUGIN_NAME, ...args);
      return;
    }
  } catch (err) {
    /* 落到 console */
  }
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  try {
    fn(LOG_PREFIX, ...args);
  } catch (err) {
    /* 忽略 */
  }
}

const log = (...args) => bdLog("info", ...args);
const warn = (...args) => bdLog("warn", ...args);
const error = (...args) => bdLog("error", ...args);

/* ---------------- 新旧 BetterDiscord 的兼容小垫片 ---------------- */

function loadSettings() {
  try {
    if (BD && BD.Data && typeof BD.Data.load === "function") return BD.Data.load(PLUGIN_NAME, CONFIG_KEY);
    if (BD && typeof BD.loadData === "function") return BD.loadData(PLUGIN_NAME, CONFIG_KEY);
  } catch (err) {
    error("读取设置失败", err);
  }
  return null;
}

function saveSettings(cfg) {
  try {
    if (BD && BD.Data && typeof BD.Data.save === "function") {
      BD.Data.save(PLUGIN_NAME, CONFIG_KEY, cfg);
      return;
    }
    if (BD && typeof BD.saveData === "function") BD.saveData(PLUGIN_NAME, CONFIG_KEY, cfg);
  } catch (err) {
    error("保存设置失败", err);
  }
}

function addStyleCompat(id, css) {
  if (BD && BD.DOM && typeof BD.DOM.addStyle === "function") {
    BD.DOM.addStyle(id, css);
    return true;
  }
  if (BD && typeof BD.injectCSS === "function") {
    BD.injectCSS(id, css);
    return true;
  }
  return false;
}

function removeStyleCompat(id) {
  try {
    if (BD && BD.DOM && typeof BD.DOM.removeStyle === "function") BD.DOM.removeStyle(id);
    else if (BD && typeof BD.clearCSS === "function") BD.clearCSS(id);
  } catch (err) {
    /* 忽略 */
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** 按码点切分，避免把 emoji / 组合字符拆坏。 */
function toCodePoints(value) {
  return Array.from(String(value == null ? "" : value));
}

/**
 * 把一段符号切成“前半个 / 后半个”。奇数长度时前半多一个字符，
 * 例如 "〈引〉" → { open: "〈引", close: "〉" }。
 */
function splitPair(symbol) {
  const chars = toCodePoints(symbol);
  if (chars.length < 2) return null;
  const mid = Math.ceil(chars.length / 2);
  return { open: chars.slice(0, mid).join(""), close: chars.slice(mid).join("") };
}

/** 至少两个字符才谈得上“光标停在中间”。 */
function canBeInner(symbol) {
  return toCodePoints(symbol).length >= 2;
}

/**
 * 开头字符 / 结尾字符属于这些标点的，才算“包裹型”符号：插入后光标停在中间，
 * 这样能立刻往引号里打字。省略号 "……"、破折号 "——" 虽然也能一切两半，
 * 但不是用来包内容的，新增时默认让光标跟在后头。
 */
const WRAP_OPENERS = new Set(["“", "‘", "「", "『", "（", "《", "【", "〈", "〔", "〖", "\"", "'", "`", "(", "[", "{", "<"]);
const WRAP_CLOSERS = new Set(["”", "’", "」", "』", "）", "》", "】", "〉", "〕", "〗", "\"", "'", "`", ")", "]", "}", ">"]);

/** 新加入列表的符号默认用「内」还是「外」。 */
function isWrappingPair(symbol) {
  const pair = splitPair(symbol);
  if (!pair) return false;
  const openChars = toCodePoints(pair.open);
  const closeChars = toCodePoints(pair.close);
  if (!openChars.length || !closeChars.length) return false;
  return WRAP_OPENERS.has(openChars[0]) && WRAP_CLOSERS.has(closeChars[closeChars.length - 1]);
}

/** 规整用户输入的符号文本；不合法返回 null。 */
function normalizeSymbolText(value) {
  if (typeof value !== "string") return null;
  if (/[\r\n]/.test(value)) return null;
  const text = value.trim();
  if (!text) return null;
  if (toCodePoints(text).length > MAX_SYMBOL_LENGTH) return null;
  return text;
}

/** 把任意来源的对象整理成一份能放心用的配置。 */
function normalizeConfig(raw) {
  const out = defaultConfig();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;

  if (Array.isArray(raw.symbols)) {
    const list = [];
    const seen = new Set();
    for (let i = 0; i < raw.symbols.length; i++) {
      const item = raw.symbols[i];
      let text = null;
      let inner = false;
      if (typeof item === "string") {
        text = normalizeSymbolText(item);
        inner = text ? isWrappingPair(text) : false;
      } else if (item && typeof item === "object") {
        text = normalizeSymbolText(item.text);
        inner = !!item.inner;
      }
      if (!text || seen.has(text)) continue;
      seen.add(text);
      list.push({ text, inner: canBeInner(text) && inner });
    }
    if (list.length) out.symbols = list;
  }

  const wanted = normalizeSymbolText(raw.symbol);
  if (wanted) {
    const existing = out.symbols.find(function (entry) { return entry.text === wanted; });
    if (existing) {
      out.symbol = existing.text;
    } else {
      out.symbols.push({ text: wanted, inner: isWrappingPair(wanted) });
      out.symbol = wanted;
    }
  } else {
    out.symbol = out.symbols[0].text;
  }

  if (typeof raw.showButton === "boolean") out.showButton = raw.showButton;
  if (typeof raw.animations === "boolean") out.animations = raw.animations;
  if (typeof raw.wrapSelection === "boolean") out.wrapSelection = raw.wrapSelection;

  const scale = Number(raw.glyphScale);
  if (Number.isFinite(scale)) out.glyphScale = clamp(Math.round(scale), GLYPH_SCALE_MIN, GLYPH_SCALE_MAX);

  if (MENU_MODES.indexOf(raw.menuMode) !== -1) out.menuMode = raw.menuMode;

  if (typeof raw.shortcut === "string") {
    const shortcut = parseShortcut(raw.shortcut);
    out.shortcut = shortcut ? formatShortcut(shortcut) : "";
  }

  return out;
}

/**
 * 决定一次点击到底做什么。state 来自输入框光标位置：
 *   { selected, before, after }
 * 返回：
 *   { kind: "skip",    moveForward }     光标正停在“前半个+后半个”中间 → 跳过结尾符号
 *   { kind: "replace", text }            有选中文字 → 用它替换
 *   { kind: "insert",  text, caretBack } 插入文本，并把光标往回挪 caretBack 个字符
 */
function planInsertion(cfg, entry, state) {
  const symbol = entry.text;
  const selected = (state && state.selected) || "";
  const before = (state && state.before) || "";
  const after = (state && state.after) || "";
  const pair = splitPair(symbol);
  const inner = !!(entry.inner && pair);

  if (selected) {
    if (cfg.wrapSelection && inner) {
      return { kind: "replace", text: pair.open + selected + pair.close, caretBack: 0 };
    }
    return { kind: "replace", text: symbol, caretBack: 0 };
  }

  if (inner) {
    if (before.endsWith(pair.open) && after.startsWith(pair.close)) {
      return { kind: "skip", moveForward: toCodePoints(pair.close).length, caretBack: 0 };
    }
    return { kind: "insert", text: symbol, caretBack: toCodePoints(pair.close).length };
  }

  return { kind: "insert", text: symbol, caretBack: 0 };
}

const MODIFIER_ALIASES = {
  ctrl: "ctrl",
  control: "ctrl",
  "⌃": "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  "⌥": "alt",
  shift: "shift",
  "⇧": "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  win: "meta",
  windows: "meta",
  super: "meta",
  "⌘": "meta",
  "⊞": "meta"
};

/** 解析 "Ctrl+Alt+Q" 这类快捷键；必须至少带一个 Ctrl / Alt / Cmd。 */
function parseShortcut(raw) {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/＋/g, "+").trim();
  if (!text) return null;
  const parts = text.split("+").map(function (part) { return part.trim(); }).filter(Boolean);
  if (parts.length < 2) return null;

  const shortcut = { ctrl: false, alt: false, shift: false, meta: false, key: null };
  for (let i = 0; i < parts.length; i++) {
    const lower = parts[i].toLowerCase();
    const modifier = MODIFIER_ALIASES[lower];
    if (modifier) {
      shortcut[modifier] = true;
      continue;
    }
    if (shortcut.key) return null; // 两个主键
    if (toCodePoints(parts[i]).length !== 1) return null;
    shortcut.key = lower;
  }
  if (!shortcut.key) return null;
  if (!shortcut.ctrl && !shortcut.alt && !shortcut.meta) return null;
  return shortcut;
}

/** 把解析结果排成固定顺序，方便显示和比较。 */
function formatShortcut(shortcut) {
  if (!shortcut || !shortcut.key) return "";
  const parts = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.meta) parts.push("Meta");
  parts.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return parts.join("+");
}

function matchesShortcut(event, shortcut) {
  if (!event || !shortcut || !shortcut.key) return false;
  if (!!event.ctrlKey !== !!shortcut.ctrl) return false;
  if (!!event.altKey !== !!shortcut.alt) return false;
  if (!!event.shiftKey !== !!shortcut.shift) return false;
  if (!!event.metaKey !== !!shortcut.meta) return false;
  const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
  return key === shortcut.key;
}

/** 菜单贴着按钮右对齐、整体不出屏幕。 */
function computeMenuPosition(input) {
  const button = input.button || { left: 0, right: 0, top: 0, bottom: 0 };
  const menu = input.menu || { width: 0, height: 0 };
  const viewport = input.viewport || { width: 0, height: 0 };
  const gap = typeof input.gap === "number" ? input.gap : 6;
  const margin = typeof input.margin === "number" ? input.margin : 8;

  const width = Math.min(menu.width, Math.max(0, viewport.width - margin * 2));
  let left = button.right - width;
  const maxLeft = Math.max(margin, viewport.width - width - margin);
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;

  let bottom = viewport.height - button.top + gap;
  const maxBottom = Math.max(margin, viewport.height - margin - 40);
  if (bottom > maxBottom) bottom = maxBottom;
  if (bottom < margin) bottom = margin;

  return { left, bottom, width };
}

/* ================================================================== *
 * 3. DOM 小工具
 * ================================================================== */

/**
 * 迷你元素工厂：el("div", { class: "a", text: "hi", onclick: fn }, [child])
 * 单独抽出来是为了能在 Node 里用假 document 测（见 check.mjs）。
 */
function el(tag, props, children, doc) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  if (!d) throw new Error("QuickSymbols: 没有可用的 document");
  const node = d.createElement(tag);
  const attrs = props || {};

  Object.keys(attrs).forEach(function (key) {
    const value = attrs[key];
    if (value === undefined || value === null || value === false) return;

    if (key === "class" || key === "className") {
      node.className = String(value);
      return;
    }
    if (key === "text") {
      node.textContent = String(value);
      return;
    }
    if (key === "html") {
      node.innerHTML = String(value);
      return;
    }
    if (key === "style" && typeof value === "object") {
      Object.keys(value).forEach(function (name) { node.style[name] = value[name]; });
      return;
    }
    if (key === "dataset" && typeof value === "object") {
      Object.keys(value).forEach(function (name) { node.dataset[name] = value[name]; });
      return;
    }
    if (key === "checked" || key === "disabled" || key === "value" || key === "selected") {
      node[key] = value;
      if (key === "checked" && value) node.setAttribute("checked", "");
      return;
    }
    if (key.slice(0, 2) === "on" && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
      return;
    }
    node.setAttribute(key, String(value));
  });

  const push = function (child) {
    if (child === undefined || child === null || child === false) return;
    if (typeof child === "string" || typeof child === "number") {
      node.appendChild(d.createTextNode(String(child)));
      return;
    }
    node.appendChild(child);
  };
  const list = children === undefined ? [] : (Array.isArray(children) ? children : [children]);
  list.forEach(function (child) {
    if (Array.isArray(child)) child.forEach(push);
    else push(child);
  });

  return node;
}

const EDITOR_SELECTOR = '[contenteditable="true"][role="textbox"], [data-slate-editor="true"]';

/**
 * 只有真正的聊天输入框才装按钮。
 * Discord 里还有别的 Slate 编辑框（频道标题上那个搜索框就是），它们的 aria-label
 * 是「搜索 …」，祖先里也没有 channelTextArea；不排掉就会在搜索栏旁边冒出一个符号按钮。
 */
function isComposerEditor(editor) {
  if (!editor || !editor.isConnected) return false;
  const aria = editor.getAttribute("aria-label") || "";
  if (/(搜索|查找|筛选|search|filter)/i.test(aria)) return false;
  try {
    if (editor.closest('[class*="channelTextArea"], [class*="channelBottomBarArea"], [class*="chatInput"]')) return true;
  } catch (err) {
    /* 继续用下面的兜底判断 */
  }
  return false;
}

function findComposer(editor) {
  // 输入框外层容器：不同版本/不同输入框（频道、私信、侧栏）类名不完全一样，
  // 从最贴近的往外找，实在没有就用 form 兜底。
  const selectors = [
    '[class*="channelTextArea"]',
    '[class*="chatInput"]',
    '[class*="channelBottomBar"]',
    "form"
  ];
  for (let i = 0; i < selectors.length; i++) {
    try {
      const found = editor.closest(selectors[i]);
      if (found) return found;
    } catch (err) {
      /* 继续试下一个 */
    }
  }
  return editor.parentElement || null;
}

function findEditors() {
  if (typeof document === "undefined") return [];
  const nodes = Array.prototype.slice.call(document.querySelectorAll(EDITOR_SELECTOR));
  return nodes.filter(function (node) {
    return isComposerEditor(node);
  });
}

/** 输入框右下角那排小图标（表情、贴纸……）的容器。 */
function findButtonsRow(composer) {
  if (!composer) return null;
  const rows = Array.prototype.slice.call(composer.querySelectorAll('[class*="buttons_"]'));
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].querySelector("." + CLS.wrap)) continue;
    if (visibleButtons(rows[i]).length) return rows[i];
  }
  return rows[0] || null;
}

const SEND_LABELS = /(发送消息|发送|send message|send|送信|보내기|enviar|envoyer|senden|invia|отправ|gönder|ส่ง|gửi)/i;
// 「发送礼物」也含「发送」，但它不是发送键。
const NOT_SEND_LABELS = /(礼物|礼物盒|gift|惊喜|surprise)/i;

function isVisible(node) {
  if (!node || !node.isConnected) return false;
  let rect = null;
  try { rect = node.getBoundingClientRect(); } catch (err) { return false; }
  return !!(rect && rect.width > 0 && rect.height > 0);
}

/**
 * 收集某一层里所有能看见的按钮。
 *
 * 必须排除「在输入框里面」的按钮：Discord 把 @提及、表情、频道引用都渲染成
 * `<span role="button">` 放在 Slate 编辑器内部，它们是消息内容，不是界面按钮。
 * 之前没排除，钩子就被塞进了提及标签里，人一点就变成了输入内容的一部分。
 */
function visibleButtons(scope) {
  if (!scope) return [];
  const nodes = Array.prototype.slice.call(scope.querySelectorAll('button, [role="button"]'));
  return nodes.filter(function (node) {
    if (!isVisible(node)) return false;
    try { return !node.closest(EDITOR_SELECTOR); } catch (err) { return false; }
  });
}

function isInsideEditor(node) {
  if (!node) return false;
  try { return !!node.closest(EDITOR_SELECTOR); } catch (err) { return false; }
}

const EMOJI_LABELS = /(表情|emoji|emote)/i;

/** 图标栏里那个笑脸键（发送键出现时就排在它右边）。 */
function findEmojiButton(scope) {
  if (!scope) return null;
  const buttons = visibleButtons(scope);
  for (let i = buttons.length - 1; i >= 0; i--) {
    const label = buttons[i].getAttribute("aria-label") || "";
    const cls = buttons[i].getAttribute("class") || "";
    if (EMOJI_LABELS.test(label) || /emojiButton/i.test(cls)) return buttons[i];
  }
  return null;
}

/**
 * 发送键：先认 aria-label / 类名 / data-testid / type=submit，
 * 都对不上时按位置猜——它永远在这一排的最右边（最靠右下）。
 * 注意从右往左找：图标栏里「发送礼物」排在真正的发送键左边，也含「发送」两个字。
 */
function pickSendButton(buttons) {
  if (!buttons || !buttons.length) return null;
  for (let i = buttons.length - 1; i >= 0; i--) {
    const label = buttons[i].getAttribute("aria-label") || "";
    if (SEND_LABELS.test(label) && !NOT_SEND_LABELS.test(label)) return buttons[i];
  }
  for (let i = buttons.length - 1; i >= 0; i--) {
    if (/sendbutton|buttonsubmit/i.test(String(buttons[i].className || ""))) return buttons[i];
  }
  for (let i = buttons.length - 1; i >= 0; i--) {
    const testid = buttons[i].getAttribute("data-testid") || buttons[i].getAttribute("data-test-id") || "";
    if (/send/i.test(testid) && !/gift/i.test(testid)) return buttons[i];
  }
  for (let i = buttons.length - 1; i >= 0; i--) {
    if (String(buttons[i].getAttribute("type") || "").toLowerCase() === "submit") return buttons[i];
  }

  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < buttons.length; i++) {
    let rect = null;
    try { rect = buttons[i].getBoundingClientRect(); } catch (err) { continue; }
    if (!rect || !rect.width || !rect.height) continue;
    const score = rect.right + rect.top;
    if (score > bestScore) {
      bestScore = score;
      best = buttons[i];
    }
  }
  return best;
}

/**
 * 发送键外面可能还包着一层 wrapper，找真正「一排图标」的那层，
 * 以及发送键在这层里的直接子节点（插到它前面才不会破坏布局）。
 */
function findRowSpot(send) {
  let child = send;
  let row = send.parentElement;
  for (let depth = 0; row && depth < 4; depth++) {
    const buttons = visibleButtons(row);
    if (buttons.length >= 2) break;
    child = row;
    row = row.parentElement;
  }
  if (!row) row = send.parentElement;
  if (!row) return null;
  return { row, child };
}

/**
 * 从输入框往外找一圈「带按钮」的容器，并从中挑出发送键。
 * 空输入框时 Discord 根本不放发送键，这时会退化成“最右下那颗按钮”，
 * 等真正发送键出现，isMisplaced() 会再挪一次位置。
 */
function locateSendTarget(editor, composer) {
  let scope = editor.parentElement;
  let buttons = [];
  for (let depth = 0; scope && depth < 8; depth++) {
    buttons = visibleButtons(scope);
    if (buttons.length) break;
    scope = scope.parentElement;
  }
  if (!buttons.length) {
    scope = composer || editor.parentElement;
    buttons = visibleButtons(scope);
  }

  let send = pickSendButton(buttons);
  if (!send && scope && scope.parentElement) {
    const wider = visibleButtons(scope.parentElement);
    const widerSend = pickSendButton(wider);
    if (widerSend) {
      scope = scope.parentElement;
      buttons = wider;
      send = widerSend;
    }
  }
  return { scope, buttons, send: send || null };
}

function getSelectionRangeInside(editor) {
  if (typeof window === "undefined" || !window.getSelection) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  if (!node) return null;
  if (node === editor || editor.contains(node)) return range;
  return null;
}

/** 光标前后各是什么文本；顺便去掉 Slate 用来撑开空行的零宽字符。 */
function textAround(editor, range) {
  try {
    const doc = editor.ownerDocument || document;
    const pre = doc.createRange();
    pre.selectNodeContents(editor);
    pre.setEnd(range.startContainer, range.startOffset);

    const post = doc.createRange();
    post.selectNodeContents(editor);
    post.setStart(range.endContainer, range.endOffset);

    const strip = function (value) { return value.replace(/[\u200B\uFEFF]/g, ""); };
    return {
      before: strip(pre.toString()),
      after: strip(post.toString()),
      selected: range.toString()
    };
  } catch (err) {
    warn("读取输入框文本失败", err);
    return null;
  }
}

function moveCaretBy(delta) {
  if (typeof window === "undefined" || !window.getSelection) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || typeof selection.modify !== "function") return;
  const direction = delta < 0 ? "backward" : "forward";
  const steps = Math.abs(delta);
  for (let i = 0; i < steps; i++) selection.modify("move", direction, "character");
}

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms || 0); });
}

/** 按文档顺序收集输入框里的文本节点。 */
function textNodesOf(root) {
  const nodes = [];
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
  } catch (err) {
    return nodes;
  }
  return nodes;
}

/**
 * 「闭合符号前面」那个点。Slate 会把文本拆进多个 span，所以从最后一个
 * 非空文本节点往回找 closeText；它不在那个节点里就返回 null，交给调用方兜底。
 */
function caretBeforeClosing(root, closeText) {
  if (!closeText) return null;
  const nodes = textNodesOf(root);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const raw = nodes[i].nodeValue || "";
    if (!raw) continue;
    let end = raw.length;
    while (end > 0 && /[\u200B\uFEFF]/.test(raw.charAt(end - 1))) end--;
    if (end >= closeText.length && raw.slice(end - closeText.length, end) === closeText) {
      return { node: nodes[i], offset: end - closeText.length };
    }
    return null;
  }
  return null;
}

function setCaretAt(point) {
  if (!point) return false;
  try {
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.setStart(point.node, point.offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  } catch (err) {
    return false;
  }
}

/** 光标当前所在的选区前后文本（只在光标位于输入框内时返回）。 */
function caretTextAround(root) {
  if (typeof window === "undefined" || !window.getSelection) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  if (!node) return null;
  if (node !== root && !root.contains(node)) return null;
  return textAround(root, range);
}

/** 光标是不是真的落在符号中间：用前后文本判断，比看 DOM 位置可靠。 */
function caretIsInside(root, openText, closeText) {
  const state = caretTextAround(root);
  if (!state) return false;
  const openOk = !openText || state.before.endsWith(openText);
  const closeOk = !closeText || state.after.startsWith(closeText);
  return openOk && closeOk;
}

/** 等输入框真的拿到焦点：Slate 只在聚焦时把 DOM 选区同步回自己的模型。 */
function waitForFocus(target, timeoutMs) {
  return new Promise(function (resolve) {
    const started = Date.now();
    const tick = function () {
      const active = document.activeElement;
      if (active && (active === target || target.contains(active))) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= (timeoutMs || 400)) {
        resolve(false);
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

function execInsertText(text) {
  try {
    return document.execCommand("insertText", false, text);
  } catch (err) {
    warn("execCommand 插入失败", err);
    return false;
  }
}

let componentDispatchCache = null;
let componentDispatchAttempts = 0;
let lastDispatchProbe = [];

function describeWebpackModule(mod) {
  if (!mod) return null;
  if (typeof mod !== "object" && typeof mod !== "function") return typeof mod;
  try {
    return {
      kind: typeof mod,
      keys: Object.keys(mod).slice(0, 12),
      hasDispatch: typeof mod.dispatchToLastSubscribed === "function"
    };
  } catch (err) {
    return "读不出导出键";
  }
}

/**
 * Discord 的 ComponentDispatch 在不同版本里挂的位置不一样：可能是模块本体的方法、
 * 可能在 default 上，也可能要按源码字符串搜。这里按顺序试，并把每一步记下来给诊断用。
 */
function probeComponentDispatch() {
  const strategies = [
    function () { return BD.Webpack.getByKeys("dispatchToLastSubscribed"); },
    function () {
      return BD.Webpack.getModule(function (mod) {
        return !!mod && typeof mod.dispatchToLastSubscribed === "function";
      }, { searchExports: true });
    },
    function () {
      const mod = BD.Webpack.getModule(function (candidate) {
        return !!candidate && !!candidate.default && typeof candidate.default.dispatchToLastSubscribed === "function";
      });
      return mod && mod.default;
    },
    function () { return BD.Webpack.getByStrings("dispatchToLastSubscribed", { searchExports: true }); }
  ];

  const tried = [];
  lastDispatchProbe = tried;
  for (let i = 0; i < strategies.length; i++) {
    try {
      const mod = strategies[i]();
      tried.push({ strategy: i, found: describeWebpackModule(mod) });
      if (mod && typeof mod.dispatchToLastSubscribed === "function") return mod;
    } catch (err) {
      tried.push({ strategy: i, error: String((err && err.message) || err) });
    }
  }
  return null;
}

function getComponentDispatch() {
  if (componentDispatchCache) return componentDispatchCache;
  if (componentDispatchAttempts >= 8) return null;
  componentDispatchAttempts += 1;
  try {
    if (!(BD && BD.Webpack)) return null;
    componentDispatchCache = probeComponentDispatch();
  } catch (err) {
    warn("查找 ComponentDispatch 失败", err);
  }
  return componentDispatchCache;
}

function dispatchInsertText(text) {
  const dispatch = getComponentDispatch();
  if (!dispatch) return false;
  try {
    dispatch.dispatchToLastSubscribed("INSERT_TEXT", { rawText: text, plainText: text });
    return true;
  } catch (err) {
    warn("INSERT_TEXT 插入失败", err);
    return false;
  }
}

/* ---------------- React fiber：直接找到这个输入框所属的 TextArea 实例 ---------------- */

function getFiberOf(node) {
  if (!node) return null;
  try {
    if (BD && BD.ReactUtils && typeof BD.ReactUtils.getInternalInstance === "function") {
      const fiber = BD.ReactUtils.getInternalInstance(node);
      if (fiber) return fiber;
    }
  } catch (err) { /* 用下面的兜底键名 */ }
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].indexOf("__reactFiber$") === 0 || keys[i].indexOf("__reactInternalInstance$") === 0) {
      return node[keys[i]];
    }
  }
  return null;
}

/**
 * Discord 的 TextArea 是 class 组件，实例上有 handleInsertText(payload)：
 * 它会把文本交给这个具体编辑器的 Slate，而不是“最后一个订阅者”。
 * 顺着 editor 的 fiber 往上找，找到最近的那个带了 handleInsertText 的实例。
 */
function findTextAreaInstance(editor) {
  let node = getFiberOf(editor);
  let guard = 0;
  while (node && guard < 60) {
    const state = node.stateNode;
    if (state && typeof state.handleInsertText === "function") return state;
    node = node.return;
    guard += 1;
  }
  return null;
}

let lastInstanceProbe = null;

function instanceInsertText(editor, text) {
  const instance = findTextAreaInstance(editor);
  lastInstanceProbe = instance ? { found: true, keys: Object.keys(instance).slice(0, 10) } : { found: false };
  if (!instance) return false;
  try {
    // 和 Discord 自己的表情/GIF 插入走同一个方法：appendText + focus。
    instance.handleInsertText({ plainText: text, rawText: text });
    return true;
  } catch (err) {
    warn("通过 TextArea 实例插入失败", err);
    lastInstanceProbe.error = String((err && err.message) || err);
    return false;
  }
}

/* ================================================================== *
 * 4. 样式
 * ================================================================== */

const CSS = `
/* ---------- 输入框里的按钮 ---------- */
.qsb-wrap{display:flex;align-items:center;justify-content:center;flex:0 0 auto;margin:0 2px}
.qsb-btn{width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--interactive-normal,#b9bbbe);font-family:inherit;font-size:calc(15px * var(--qsb-scale,.82));line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .12s ease,color .12s ease,transform .12s ease;outline:none;-webkit-tap-highlight-color:transparent}
.qsb-btn:hover{background:var(--background-modifier-hover,rgba(255,255,255,.06));color:var(--interactive-hover,#dcddde)}
.qsb-btn:active{transform:scale(.92)}
.qsb-btn:focus-visible{box-shadow:0 0 0 2px var(--focus-primary,#00a8fc)}

/* ---------- 弹出菜单 ---------- */
.qsb-menu{position:fixed;z-index:2147483000;display:flex;gap:4px;padding:6px;max-width:min(640px,calc(100vw - 16px));max-height:min(60vh,340px);overflow-x:auto;overflow-y:hidden;background:var(--background-floating,#18191c);border:1px solid var(--background-modifier-accent,rgba(255,255,255,.06));border-radius:8px;box-shadow:var(--elevation-high,0 8px 24px rgba(0,0,0,.45));opacity:0;transform:translateY(4px) scale(.97);transform-origin:bottom right;transition:opacity .12s ease,transform .12s ease;scrollbar-width:thin}
.qsb-menu.qsb-open{opacity:1;transform:none}
.qsb-menu:not(.qsb-open){pointer-events:none}
.qsb-menu.qsb-no-anim{transition:none}
.qsb-item{display:flex;flex:0 0 auto;flex-direction:column;align-items:center;gap:2px;padding:2px;border-radius:6px}
.qsb-item.qsb-current{background:var(--background-modifier-selected,rgba(255,255,255,.08))}
.qsb-sym{min-width:46px;height:36px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--text-normal,#dcddde);font-family:inherit;font-size:18px;line-height:1;cursor:pointer;transition:background-color .1s ease,transform .1s ease;-webkit-tap-highlight-color:transparent}
.qsb-sym:hover{background:var(--background-modifier-hover,rgba(255,255,255,.06))}
.qsb-sym.qsb-pick{animation:qsb-pop .24s ease}
@keyframes qsb-pop{0%{transform:scale(.86)}55%{transform:scale(1.12)}100%{transform:scale(1)}}
.qsb-side{padding:0 5px;border:0;border-radius:4px;background:transparent;color:var(--text-muted,#8e9297);font-family:inherit;font-size:10px;line-height:1.4;cursor:pointer;transition:color .1s ease,background-color .1s ease}
.qsb-side:hover{background:var(--background-modifier-hover,rgba(255,255,255,.06));color:var(--text-normal,#dcddde)}
.qsb-side.qsb-side-on{color:var(--text-link,#00a8fc)}
.qsb-side:disabled{opacity:.35;cursor:default;background:transparent}

/* ---------- 设置面板 ---------- */
.qsb-settings{display:flex;flex-direction:column;gap:14px;padding:4px 2px;font-size:14px;color:var(--text-normal,#dcddde)}
.qsb-head{display:flex;align-items:baseline;gap:8px}
.qsb-head-title{font-size:18px;font-weight:700}
.qsb-head-sub{font-size:12px;color:var(--text-muted,#8e9297)}
.qsb-setting{display:flex;align-items:center;justify-content:space-between;gap:16px}
.qsb-setting-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.qsb-setting-label{font-weight:500}
.qsb-setting-hint{font-size:12px;color:var(--text-muted,#8e9297);line-height:1.35}
.qsb-check{width:18px;height:18px;accent-color:var(--brand-experiment,#5865f2);cursor:pointer;flex:0 0 auto}
.qsb-inline{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.qsb-range{width:150px;accent-color:var(--brand-experiment,#5865f2)}
.qsb-mono{font-family:var(--font-code,Consolas,monospace);font-size:12px;min-width:38px;text-align:right}
.qsb-select{min-width:220px;padding:6px 8px;border-radius:4px;border:1px solid var(--background-modifier-accent,rgba(255,255,255,.1));background:var(--background-secondary,#2f3136);color:var(--text-normal,#dcddde);font-family:inherit;font-size:13px}
.qsb-text{width:220px;padding:6px 8px;border-radius:4px;border:1px solid var(--background-modifier-accent,rgba(255,255,255,.1));background:var(--background-secondary,#2f3136);color:var(--text-normal,#dcddde);font-family:inherit;font-size:13px;outline:none}
.qsb-text:focus{border-color:var(--focus-primary,#00a8fc)}
.qsb-hint{font-size:12px;color:var(--text-muted,#8e9297)}
.qsb-hint.qsb-error{color:var(--text-danger,#ed4245)}
.qsb-section{display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px solid var(--background-modifier-accent,rgba(255,255,255,.06))}
.qsb-section-title{font-size:12px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--header-secondary,#b9bbbe)}
.qsb-section-hint{font-size:12px;color:var(--text-muted,#8e9297);line-height:1.4}
.qsb-symbol-list{display:flex;flex-direction:column;gap:6px}
.qsb-symbol-row{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:6px;background:var(--background-secondary,#2f3136)}
.qsb-dot{width:22px;height:22px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--text-muted,#8e9297);font-size:12px;cursor:pointer;flex:0 0 auto}
.qsb-dot.qsb-dot-on{color:var(--text-link,#00a8fc)}
.qsb-symbol-input{flex:1 1 auto;min-width:0;padding:4px 6px;border:1px solid transparent;border-radius:4px;background:var(--background-tertiary,#202225);color:var(--text-normal,#dcddde);font-family:inherit;font-size:14px;outline:none}
.qsb-symbol-input:focus{border-color:var(--focus-primary,#00a8fc)}
.qsb-side-btn{min-width:30px;padding:2px 6px;border:1px solid var(--background-modifier-accent,rgba(255,255,255,.1));border-radius:4px;background:transparent;color:var(--text-muted,#8e9297);font-family:inherit;font-size:11px;cursor:pointer}
.qsb-side-btn.qsb-side-on{color:var(--text-link,#00a8fc);border-color:currentColor}
.qsb-side-btn.qsb-side-off{opacity:.35;cursor:default}
.qsb-mini{width:24px;height:24px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--text-muted,#8e9297);font-size:12px;cursor:pointer;flex:0 0 auto}
.qsb-mini:hover{background:var(--background-modifier-hover,rgba(255,255,255,.06));color:var(--text-normal,#dcddde)}
.qsb-primary{padding:6px 12px;border:0;border-radius:4px;background:var(--brand-experiment,#5865f2);color:#fff;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer}
.qsb-primary:hover{background:var(--brand-experiment-560,#4752c4)}
.qsb-secondary{padding:6px 12px;border:0;border-radius:4px;background:var(--background-modifier-accent,rgba(255,255,255,.08));color:var(--text-normal,#dcddde);font-family:inherit;font-size:13px;cursor:pointer}
.qsb-secondary:hover{background:var(--background-modifier-hover,rgba(255,255,255,.06))}
.qsb-add-row{width:100%}
.qsb-add-row .qsb-text{flex:1 1 auto;width:auto}
.qsb-footer{display:flex;gap:8px;padding-top:10px;border-top:1px solid var(--background-modifier-accent,rgba(255,255,255,.06))}
`;

/* ================================================================== *
 * 5. 插件
 * ================================================================== */

class QuickSymbols {
  constructor(meta) {
    this.meta = meta || {};
    this.cfg = null;
    this.mounts = new Map(); // editor 元素 -> mount
    this.menu = null;
    this.observer = null;
    this.lastEditor = null;
    this.panelEls = null;
    this.fallbackStyle = null;

    this.mountTimer = 0;
    this.openTimer = 0;
    this.closeTimer = 0;
    this.menuGCTimer = 0;
    this.saveTimer = 0;

    this._shortcutCache = null;
    this.diag = null; // 最近一次采集的 DOM / 插入诊断，存在插件配置的 diag 键里
    this._diagTimer = 0;
    this._mountDiagTimer = 0;
    this._lastDiagMountCount = -1;

    this.onMutations = this.onMutations.bind(this);
    this.onSelectionChange = this.onSelectionChange.bind(this);
    this.onFocusIn = this.onFocusIn.bind(this);
    this.onKeydown = this.onKeydown.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onWindowBlur = this.onWindowBlur.bind(this);
    this.onDocPointerDown = this.onDocPointerDown.bind(this);
  }

  /* ---------------- 生命周期 ---------------- */

  start() {
    try {
      this.cfg = normalizeConfig(loadSettings());
    } catch (err) {
      error("读取设置失败，先用默认设置", err);
      this.cfg = defaultConfig();
    }
    this._shortcutCache = null;
    this.injectStyles();
    this.attachDocumentListeners(true);
    this.observer = new MutationObserver(this.onMutations);
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
    this.mountAll();
    this.scheduleDiag();
    log("v" + PLUGIN_VERSION + " 已启用");
  }

  /** 等界面稳定后采一次 DOM 快照，写进配置的 diag 键。 */
  scheduleDiag(delay) {
    clearTimeout(this._diagTimer);
    this._diagTimer = setTimeout(() => {
      this._diagTimer = 0;
      this.captureDomDiag();
    }, delay || 1500);
  }

  stop() {
    try {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      this.attachDocumentListeners(false);
      clearTimeout(this.mountTimer);
      clearTimeout(this.openTimer);
      clearTimeout(this.closeTimer);
      clearTimeout(this.menuGCTimer);
      clearTimeout(this.saveTimer);
      clearTimeout(this._diagTimer);
      clearTimeout(this._mountDiagTimer);
      this.mountTimer = 0;
      this.openTimer = 0;
      this.closeTimer = 0;
      this.menuGCTimer = 0;
      this.saveTimer = 0;
      this._diagTimer = 0;
      this._mountDiagTimer = 0;

      this.closeMenu(true);
      this.removeStaleMenus();
      for (const mount of Array.from(this.mounts.values())) this.destroyMount(mount);
      this.mounts.clear();
      this.lastEditor = null;
      this.panelEls = null;

      if (this.fallbackStyle && this.fallbackStyle.parentNode) {
        this.fallbackStyle.parentNode.removeChild(this.fallbackStyle);
      }
      this.fallbackStyle = null;
      removeStyleCompat(STYLE_ID);
      log("已停用");
    } catch (err) {
      error("停用时出错", err);
    }
  }

  injectStyles() {
    try {
      if (addStyleCompat(STYLE_ID, CSS)) return;
    } catch (err) {
      warn("BdApi 注入样式失败，改用 <style>", err);
    }
    const style = document.createElement("style");
    style.id = "qsb-style";
    style.textContent = CSS;
    document.head.appendChild(style);
    this.fallbackStyle = style;
  }

  attachDocumentListeners(attach) {
    const method = attach ? "addEventListener" : "removeEventListener";
    document[method]("selectionchange", this.onSelectionChange, true);
    document[method]("focusin", this.onFocusIn, true);
    document[method]("keydown", this.onKeydown, true);
    window[method]("resize", this.onResize);
    window[method]("blur", this.onWindowBlur);
  }

  /* ---------------- 配置 ---------------- */

  updateConfig(patch, opts) {
    if (!this.cfg) return;
    this.cfg = normalizeConfig(Object.assign({}, this.cfg, patch));
    this._shortcutCache = null;
    this.queueSave();
    this.apply();
    if (!(opts && opts.silent)) this.refreshPanel();
  }

  queueSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = 0;
      this.saveNow();
    }, 300);
  }

  saveNow() {
    if (!this.cfg) return;
    saveSettings(this.cfg);
  }

  apply() {
    if (!this.cfg) return;
    for (const mount of this.mounts.values()) this.applyButton(mount);
    if (this.menu) {
      this.renderMenuInto(this.menu.el, this.menu.mount);
      this.positionMenu(this.menu.el, this.menu.mount.wrap);
    }
  }

  toast(message, type) {
    try {
      if (BD && BD.UI && typeof BD.UI.showToast === "function") {
        BD.UI.showToast(String(message), { type: type || "info", timeout: 3200 });
        return;
      }
    } catch (err) {
      /* 落到控制台 */
    }
    log(message);
  }

  /* ---------------- 挂载 / 卸载按钮 ---------------- */

  onMutations() {
    if (this.mountTimer) return;
    this.mountTimer = setTimeout(() => {
      this.mountTimer = 0;
      this.mountAll();
    }, 120);
  }

  mountAll() {
    if (!this.cfg) return;
    const editors = findEditors();
    const live = new Set(editors);

    for (const editor of editors) {
      let mount = this.mounts.get(editor);
      if (!mount) {
        mount = this.createMount(editor);
        this.mounts.set(editor, mount);
      }
      if (!mount.wrap.isConnected) this.attachButton(mount);
      else if (this.isMisplaced(mount)) this.attachButton(mount);
      this.applyButton(mount);
    }

    for (const entry of Array.from(this.mounts.entries())) {
      const editor = entry[0];
      const mount = entry[1];
      if (!live.has(editor) || !editor.isConnected) {
        this.destroyMount(mount);
        this.mounts.delete(editor);
      }
    }

    // 挂载数量变了说明按钮刚被插进/拔出 DOM，这时候采一份结构最有参考价值。
    if (this.mounts.size !== this._lastDiagMountCount) {
      this._lastDiagMountCount = this.mounts.size;
      clearTimeout(this._mountDiagTimer);
      this._mountDiagTimer = setTimeout(() => {
        this._mountDiagTimer = 0;
        this.captureDomDiag();
      }, 900);
    }
  }

  createMount(editor) {
    const wrap = el("div", { class: CLS.wrap });
    const button = el("button", { type: "button", class: CLS.btn, "aria-label": "插入符号", title: "插入符号" });
    wrap.appendChild(button);

    const mount = {
      editor,
      composer: null,
      row: null,
      sendButton: null,
      wrap,
      button,
      lastRange: null
    };

    // 关键：不让按钮抢走输入框的焦点和选区。
    button.addEventListener("mousedown", function (event) { event.preventDefault(); });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onButtonClick(mount);
    });
    wrap.addEventListener("mouseenter", () => {
      if (this.tapMode()) return;
      this.scheduleOpen(mount);
    });
    wrap.addEventListener("mouseleave", () => {
      if (this.tapMode()) return;
      this.scheduleClose();
    });

    return mount;
  }

  destroyMount(mount) {
    if (this.menu && this.menu.mount === mount) this.closeMenu(true);
    if (mount.wrap && mount.wrap.parentNode) mount.wrap.parentNode.removeChild(mount.wrap);
  }

  /** @returns {{row: Element, before: Element|null, send: Element|null, via: string}|null} */
  planMountPosition(editor, composer) {
    const target = locateSendTarget(editor, composer);
    if (target.send) {
      const spot = findRowSpot(target.send);
      if (spot && !isInsideEditor(spot.row)) {
        return { row: spot.row, before: spot.child, send: target.send, via: "send" };
      }
    }
    // 没有发送键（输入框为空）时，图标栏最右边那个是表情键，发送键出现的位置就在它右边。
    const emoji = findEmojiButton(target.scope || composer);
    if (emoji && emoji.parentElement && !isInsideEditor(emoji)) {
      return { row: emoji.parentElement, before: emoji.nextSibling, send: null, via: "emoji" };
    }
    const row = findButtonsRow(composer);
    if (row && !isInsideEditor(row)) return { row, before: null, send: null, via: "row" };
    if (composer) return { row: composer, before: null, send: null, via: "composer" };
    return null;
  }

  attachButton(mount) {
    const editor = mount.editor;
    const composer = findComposer(editor);
    mount.composer = composer;

    const wrap = mount.wrap;
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);

    const plan = this.planMountPosition(editor, composer);
    if (!plan) return false;

    mount.row = plan.row;
    mount.sendButton = plan.send || null;
    if (plan.before && plan.before.parentElement === plan.row) plan.row.insertBefore(wrap, plan.before);
    else plan.row.appendChild(wrap);
    if (plan.via === "composer") warn("没找到图标栏，按钮放在了输入框容器的末尾");
    return true;
  }

  /**
   * 发送键是“有文字才出现”的，挂载那一刻往往还不存在。
   * 每次 DOM 变动后重算一次：真正的发送键一出现，就把按钮挪到它左边。
   * 位置已经对了就不动，避免 insertBefore 自己触发自己。
   */
  isMisplaced(mount) {
    if (!mount.wrap || !mount.wrap.parentNode) return true;
    // 被塞进 Slate 编辑器里的钩子会变成消息内容，必须重挂。
    if (isInsideEditor(mount.wrap)) return true;
    const plan = this.planMountPosition(mount.editor, mount.composer || findComposer(mount.editor));
    if (!plan) return true;
    if (mount.wrap.parentNode !== plan.row) return true;
    if (plan.before) return mount.wrap.nextElementSibling !== plan.before;
    return false;
  }

  applyButton(mount) {
    const cfg = this.cfg;
    if (!cfg) return;
    const button = mount.button;
    button.textContent = cfg.symbol;
    button.title = "插入「" + cfg.symbol + "」";
    button.setAttribute("aria-label", "插入符号 " + cfg.symbol);
    button.style.setProperty("--qsb-scale", String(cfg.glyphScale / 100));
    mount.wrap.style.display = cfg.showButton ? "" : "none";
  }

  /* ---------------- 菜单 ---------------- */

  tapMode() {
    const mode = this.cfg ? this.cfg.menuMode : "auto";
    if (mode === "tap") return true;
    if (mode === "hover") return false;
    try {
      return !window.matchMedia("(hover: hover)").matches;
    } catch (err) {
      return false;
    }
  }

  scheduleOpen(mount) {
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => {
      this.openTimer = 0;
      this.openMenu(mount);
    }, 120);
  }

  scheduleClose() {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = 0;
      if (this.menu && this.menu.hovered) return;
      this.closeMenu();
    }, 200);
  }

  openMenu(mount) {
    if (!this.cfg || !this.cfg.symbols.length) return;
    if (!mount || !mount.wrap || !mount.wrap.isConnected) return;
    this.closeMenu(true);
    this.removeStaleMenus();

    const menu = this.buildMenu(mount);
    const state = { el: menu, mount, hovered: false };
    this.menu = state;
    document.body.appendChild(menu);
    this.positionMenu(menu, mount.wrap);

    menu.addEventListener("mouseenter", function () { state.hovered = true; });
    menu.addEventListener("mouseleave", () => {
      state.hovered = false;
      this.scheduleClose();
    });
    document.addEventListener("pointerdown", this.onDocPointerDown, true);

    requestAnimationFrame(() => {
      if (this.menu === state) menu.classList.add(CLS.open);
    });
  }

  closeMenu(immediate) {
    const state = this.menu;
    if (!state) return;
    this.menu = null;
    document.removeEventListener("pointerdown", this.onDocPointerDown, true);
    clearTimeout(this.closeTimer);
    this.closeTimer = 0;

    const node = state.el;
    node.classList.remove(CLS.open);
    const animate = !immediate && this.cfg && this.cfg.animations;
    if (!animate) {
      if (node.parentNode) node.parentNode.removeChild(node);
      return;
    }
    clearTimeout(this.menuGCTimer);
    this.menuGCTimer = setTimeout(() => {
      this.menuGCTimer = 0;
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 170);
  }

  /**
   * 带渐隐动画的关闭会把节点留到 170ms 后再删。如果这期间又开了新菜单或直接停用插件，
   * 就会剩下一个孤儿节点——这里统一扫掉（当前菜单除外）。
   */
  removeStaleMenus() {
    try {
      for (const node of Array.from(document.querySelectorAll("." + CLS.menu))) {
        if (!this.menu || node !== this.menu.el) node.remove();
      }
    } catch (err) {
      /* 忽略 */
    }
  }

  positionMenu(menu, wrap) {
    if (!menu || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    menu.style.visibility = "hidden";
    menu.style.left = "0px";
    menu.style.bottom = "0px";
    const menuRect = menu.getBoundingClientRect();
    const pos = computeMenuPosition({
      button: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      menu: { width: menuRect.width, height: menuRect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight }
    });
    menu.style.left = Math.round(pos.left) + "px";
    menu.style.bottom = Math.round(pos.bottom) + "px";
    menu.style.visibility = "";
  }

  buildMenu(mount) {
    const menu = el("div", {
      class: CLS.menu + (this.cfg.animations ? "" : " " + CLS.noAnim),
      role: "menu"
    });
    menu.addEventListener("mousedown", function (event) { event.preventDefault(); });
    this.renderMenuInto(menu, mount);
    return menu;
  }

  renderMenuInto(menu, mount) {
    menu.textContent = "";
    for (const entry of this.cfg.symbols) menu.appendChild(this.buildMenuItem(mount, entry));
  }

  buildMenuItem(mount, entry) {
    const isCurrent = entry.text === this.cfg.symbol;
    const item = el("div", { class: CLS.item + (isCurrent ? " " + CLS.current : ""), role: "none" });
    // 点菜单里的空白处也不该把焦点从输入框里抢走。
    item.addEventListener("mousedown", function (event) { event.preventDefault(); });

    const sym = el("button", {
      type: "button",
      class: CLS.sym,
      role: "menuitem",
      title: "插入「" + entry.text + "」" + (entry.inner ? "（光标停在中间）" : "（光标跟在后面）"),
      text: entry.text
    });
    sym.addEventListener("mousedown", function (event) { event.preventDefault(); });
    sym.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.cfg.animations) {
        sym.classList.add(CLS.pick);
        setTimeout(function () { sym.classList.remove(CLS.pick); }, 260);
      }
      this.setSymbol(entry.text);
      this.safeInsert(mount);
      this.closeMenu();
    });

    const inner = canBeInner(entry.text);
    const side = el("button", {
      type: "button",
      class: CLS.side + (entry.inner ? " " + CLS.sideOn : ""),
      title: inner
        ? (entry.inner ? "当前：光标停在符号中间——点一下改成符号外" : "当前：光标跟在符号后面——点一下改成符号内")
        : "单个字符没法停在中间，只能符号外",
      text: entry.inner ? "内" : "外"
    });
    if (!inner) {
      side.disabled = true;
      side.classList.add(CLS.sideOff);
    }
    side.addEventListener("mousedown", function (event) { event.preventDefault(); });
    side.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!inner) return;
      this.toggleInner(entry.text);
    });

    item.appendChild(sym);
    item.appendChild(side);
    return item;
  }

  /** insertCurrent 要等 Slate 渲染，是异步的；统一在这里吞掉异常并记进诊断。 */
  safeInsert(mount) {
    Promise.resolve()
      .then(() => this.insertCurrent(mount))
      .catch((err) => {
        warn("插入时出错", err);
        this.recordInsert({ at: new Date().toISOString(), error: String((err && err.message) || err) });
        this.toast("插入时出错了，诊断已记录", "error");
      });
  }

  onButtonClick(mount) {
    if (!this.cfg) return;
    // 抓一份“有文字时”的 DOM 快照：此时发送键才会出现，正好用来确认它到底在哪。
    this.captureDomDiag();
    if (this.tapMode()) {
      if (this.menu && this.menu.mount === mount) {
        this.safeInsert(mount);
        this.closeMenu();
        return;
      }
      this.openMenu(mount);
      return;
    }
    this.safeInsert(mount);
    if (this.menu) this.closeMenu();
  }

  onDocPointerDown(event) {
    const state = this.menu;
    if (!state) return;
    if (state.el.contains(event.target)) return;
    if (state.mount.wrap && state.mount.wrap.contains(event.target)) return;
    this.closeMenu();
  }

  /* ---------------- 全局事件 ---------------- */

  onSelectionChange() {
    if (!this.cfg || !this.mounts.size || typeof window === "undefined" || !window.getSelection) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer;
    if (!node) return;
    for (const mount of this.mounts.values()) {
      if (mount.editor === node || mount.editor.contains(node)) {
        mount.lastRange = range.cloneRange();
        this.lastEditor = mount.editor;
        return;
      }
    }
  }

  onFocusIn(event) {
    const target = event.target;
    if (!target) return;
    for (const editor of this.mounts.keys()) {
      if (editor === target || editor.contains(target)) {
        this.lastEditor = editor;
        return;
      }
    }
  }

  onKeydown(event) {
    if (event.key === "Escape" && this.menu) {
      this.closeMenu();
      event.preventDefault();
      return;
    }
    if (!this.cfg || !this.cfg.shortcut || event.repeat) return;
    const shortcut = this.parsedShortcut();
    if (!shortcut || !matchesShortcut(event, shortcut)) return;

    const target = event.target;
    const editable = !!(target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA"));
    if (editable && !this.isEditor(target)) return;

    const mount = this.activeMount();
    if (!mount) return;
    event.preventDefault();
    event.stopPropagation();
    this.safeInsert(mount);
  }

  onResize() {
    if (this.menu) this.positionMenu(this.menu.el, this.menu.mount.wrap);
  }

  onWindowBlur() {
    this.closeMenu();
  }

  parsedShortcut() {
    const raw = this.cfg ? this.cfg.shortcut : "";
    if (!raw) return null;
    if (this._shortcutCache && this._shortcutCache.raw === raw) return this._shortcutCache.value;
    const value = parseShortcut(raw);
    this._shortcutCache = { raw, value };
    return value;
  }

  isEditor(node) {
    for (const editor of this.mounts.keys()) {
      if (editor === node || editor.contains(node)) return true;
    }
    return false;
  }

  activeMount() {
    if (!this.mounts.size) return null;
    if (typeof window !== "undefined" && window.getSelection) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount) {
        const node = selection.getRangeAt(0).commonAncestorContainer;
        if (node) {
          for (const mount of this.mounts.values()) {
            if (mount.editor === node || mount.editor.contains(node)) return mount;
          }
        }
      }
    }
    if (this.lastEditor && this.mounts.has(this.lastEditor)) return this.mounts.get(this.lastEditor);
    return this.mounts.values().next().value || null;
  }

  /* ---------------- 插入 ---------------- */

  resolveRange(mount) {
    const editor = mount.editor;
    const inside = getSelectionRangeInside(editor);
    if (inside) return inside;

    try {
      editor.focus({ preventScroll: true });
    } catch (err) {
      try { editor.focus(); } catch (e) { /* 忽略 */ }
    }

    let range = null;
    const last = mount.lastRange;
    if (last && last.commonAncestorContainer && editor.contains(last.commonAncestorContainer)) {
      range = last.cloneRange();
    } else {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    const selection = window.getSelection();
    if (!selection) return null;
    selection.removeAllRanges();
    selection.addRange(range);
    return getSelectionRangeInside(editor) || range;
  }

  currentEntry() {
    const cfg = this.cfg;
    const found = cfg.symbols.find(function (entry) { return entry.text === cfg.symbol; });
    return found || { text: cfg.symbol, inner: canBeInner(cfg.symbol) };
  }

  async insertCurrent(mount) {
    const cfg = this.cfg;
    if (!cfg || !mount || !mount.editor) return false;
    const editor = mount.editor;
    if (!editor.isConnected) return false;

    const range = this.resolveRange(mount);
    if (!range) {
      warn("找不到可以插入的位置");
      this.recordInsert({ at: new Date().toISOString(), error: "没有可用的选区" });
      return false;
    }

    const state = textAround(editor, range);
    if (!state) return false;

    const entry = this.currentEntry();
    const plan = planInsertion(cfg, entry, state);
    if (plan.kind === "skip") {
      moveCaretBy(plan.moveForward);
      return true;
    }

    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);

    const beforeText = editor.textContent || "";
    const report = {
      at: new Date().toISOString(),
      kind: plan.kind,
      text: plan.text,
      beforeLength: beforeText.length,
      selectedLength: state.selected.length,
      hasDispatchModule: !!componentDispatchCache,
      dispatchAttempts: componentDispatchAttempts,
      instanceProbe: lastInstanceProbe,
      method: null,
      changed: false,
      afterLength: null,
      error: null
    };

    // 插入顺序：先直接调用这个输入框自己的 TextArea.handleInsertText（最准），
    // 再试 Discord 的 INSERT_TEXT 通道，最后才是 document.execCommand。
    // Slate 是受控组件，直接改 DOM 基本都会被它还原，所以每一步都要验文本有没有真的变。
    let method = null;
    if (instanceInsertText(editor, plan.text)) {
      if (await this.waitForTextChange(editor, beforeText, 320)) method = "TextArea.handleInsertText";
    }
    if (!method && dispatchInsertText(plan.text)) {
      if (await this.waitForTextChange(editor, beforeText, 260)) method = "INSERT_TEXT";
    }
    if (!method && execInsertText(plan.text)) {
      if (await this.waitForTextChange(editor, beforeText, 200)) method = "execCommand";
    }
    if (!method) {
      warn("插入失败：实例 / INSERT_TEXT / execCommand 都没让输入框发生变化");
      report.error = "三条插入通道都没生效";
      report.instanceProbe = lastInstanceProbe;
      this.recordInsert(report);
      this.toast("插入失败了，设置里的「输出诊断信息」能看到原因", "error");
      return false;
    }

    report.method = method;
    report.changed = true;
    report.afterLength = (editor.textContent || "").length;

    // 光标要靠 DOM 选区来放，但 Slate 只在输入框聚焦时才把 DOM 选区同步进模型，
    // 所以先等焦点、再放、再验证一遍（Slate 有时会用旧选区把光标弹回末尾）。
    if (plan.caretBack > 0) {
      const pair = splitPair(entry.text) || { open: entry.text, close: "" };
      report.caret = await this.placeCaretInside(editor, pair.open, pair.close);
    }
    report.dom = this.snapshotEditorDom(editor);
    this.recordInsert(report);
    return true;
  }

  /**
   * 插入后把光标放回符号中间。三步：等焦点 → 放光标 → 盯一会儿。
   * 盯的目的是抓住 Slate 用模型旧选区把光标弹回末尾的情况；
   * 用户一旦开始打字就立刻停手，绝不和用户抢光标。
   */
  async placeCaretInside(editor, openText, closeText) {
    const info = { focused: false, placed: false, inside: false, attempts: 0, resetBySlate: false };
    if (!closeText) {
      info.inside = true;
      return info;
    }

    info.focused = await waitForFocus(editor, 400);
    const expected = (editor.textContent || "").length;

    for (let attempt = 0; attempt < 4; attempt++) {
      if ((editor.textContent || "").length !== expected) {
        info.userTyped = true;
        break;
      }
      const point = caretBeforeClosing(editor, closeText);
      if (point) {
        setCaretAt(point);
        info.placed = true;
      } else {
        moveCaretBy(-closeText.length);
      }
      info.attempts = attempt + 1;
      await delay(attempt === 0 ? 40 : 140);
      if ((editor.textContent || "").length !== expected) {
        info.userTyped = true;
        break;
      }
      if (caretIsInside(editor, openText, closeText)) {
        info.inside = true;
        break;
      }
      info.resetBySlate = true;
    }

    if (!info.inside) {
      const state = caretTextAround(editor);
      info.landed = state ? { before: state.before.slice(-10), after: state.after.slice(0, 10) } : null;
    }
    return info;
  }

  /** 记录输入框结构，用来判断 Slate 是不是把每个字符拆成了独立段落。 */
  snapshotEditorDom(editor) {
    try {
      const blocks = editor.querySelectorAll('[data-slate-node="element"]').length;
      const state = caretTextAround(editor);
      return {
        blocks,
        textLength: (editor.textContent || "").length,
        caret: state ? { before: state.before.slice(-10), after: state.after.slice(0, 10) } : null,
        html: String(editor.innerHTML || "").slice(0, 900)
      };
    } catch (err) {
      return null;
    }
  }

  /** 等输入框文本真的变了（Slate 的提交是异步的），最多等 timeoutMs。 */
  waitForTextChange(editor, before, timeoutMs) {
    return new Promise((resolve) => {
      if ((editor.textContent || "") !== before) {
        resolve(true);
        return;
      }
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        try { observer.disconnect(); } catch (err) { /* 忽略 */ }
        clearTimeout(timer);
        resolve(value);
      };
      let observer = null;
      try {
        observer = new MutationObserver(() => {
          if ((editor.textContent || "") !== before) finish(true);
        });
        observer.observe(editor, { childList: true, subtree: true, characterData: true });
      } catch (err) {
        observer = null;
      }
      const timer = setTimeout(() => finish((editor.textContent || "") !== before), timeoutMs || 240);
    });
  }

  /** 把一次插入尝试记进诊断快照，写进插件配置旁边（BdApi.Data 的 diag 键）。 */
  recordInsert(report) {
    this.recordDiag("lastInsert", report);
  }

  recordDiag(section, data) {
    try {
      this.diag = this.diag || {};
      this.diag[section] = data;
      this.diag.updatedAt = new Date().toISOString();
      this.diag.version = PLUGIN_VERSION;
      if (BD && BD.Data && typeof BD.Data.save === "function") BD.Data.save(PLUGIN_NAME, "diag", this.diag);
      else if (BD && typeof BD.saveData === "function") BD.saveData(PLUGIN_NAME, "diag", this.diag);
    } catch (err) {
      warn("写诊断快照失败", err);
    }
  }

  /** 采集一次当前输入框附近的 DOM 结构，用来对不上的类名/层级。 */
  captureDomDiag() {
    try {
      const describe = function (node) {
        if (!node || !node.tagName || typeof node.getAttribute !== "function") return null;
        let cls = "";
        try { cls = String(node.className || "").slice(0, 180); } catch (err) { cls = "?"; }
        let rect = null;
        try { rect = node.getBoundingClientRect(); } catch (err) { rect = null; }
        return {
          tag: node.tagName.toLowerCase(),
          cls: cls,
          role: node.getAttribute("role"),
          aria: node.getAttribute("aria-label"),
          testid: node.getAttribute("data-testid") || node.getAttribute("data-test-id"),
          w: rect ? Math.round(rect.width) : null,
          h: rect ? Math.round(rect.height) : null
        };
      };
      const ancestors = function (node, depth) {
        const chain = [];
        let current = node;
        for (let i = 0; current && i < depth; i++) {
          chain.push(describe(current));
          current = current.parentElement;
        }
        return chain;
      };

      getComponentDispatch(); // 顺手刷新一下探测记录

      const mounts = [];
      for (const mount of this.mounts.values()) {
        mounts.push({
          editorChain: ancestors(mount.editor, 9),
          wrapChain: ancestors(mount.wrap, 6),
          composer: describe(mount.composer),
          row: describe(mount.row),
          send: describe(mount.sendButton),
          wrapConnected: !!(mount.wrap && mount.wrap.isConnected)
        });
      }

      const firstMount = this.mounts.values().next().value || null;
      const scope = firstMount && firstMount.composer ? firstMount.composer : document.body;
      const buttons = Array.prototype.slice.call(scope.querySelectorAll('button, [role="button"]')).slice(0, 32).map(describe);

      let textAreaProbe = null;
      if (firstMount && firstMount.editor) {
        const inst = findTextAreaInstance(firstMount.editor);
        textAreaProbe = inst ? { found: true, keys: Object.keys(inst).slice(0, 12) } : { found: false };
      }
      let listenerCount = null;
      try {
        const dispatch = getComponentDispatch();
        listenerCount = dispatch && dispatch.emitter && typeof dispatch.emitter.listenerCount === "function"
          ? dispatch.emitter.listenerCount("INSERT_TEXT")
          : null;
      } catch (err) { listenerCount = "读取失败"; }

      // 整个底部栏里所有候选“发送键”，带坐标，用来判断发送键到底在输入框里还是外面。
      const bottomBar = (firstMount && firstMount.composer && firstMount.composer.closest('[class*="channelBottomBarArea"]')) || scope;
      const bottomButtons = Array.prototype.slice.call(bottomBar.querySelectorAll('button, [role="button"]')).slice(0, 40).map(function (node) {
        const info = describe(node);
        if (!info) return null;
        try {
          const rect = node.getBoundingClientRect();
          info.x = Math.round(rect.left);
          info.y = Math.round(rect.top);
          info.right = Math.round(rect.right);
          info.bottom = Math.round(rect.bottom);
        } catch (err) { /* 忽略 */ }
        return info;
      }).filter(Boolean);
      const sendCandidates = Array.prototype.slice.call(document.querySelectorAll('[class*="sendButton"], [class*="sendButton_"]')).slice(0, 10).map(describe);

      this.recordDiag("dom", {
        build: (window.GLOBAL_ENV && window.GLOBAL_ENV.BUILD_NUMBER) || null,
        href: location.origin + location.pathname,
        editorCount: document.querySelectorAll(EDITOR_SELECTOR).length,
        editorArias: Array.prototype.slice.call(document.querySelectorAll(EDITOR_SELECTOR)).slice(0, 8).map(function (node) {
          return node.getAttribute("aria-label") || null;
        }),
        mountCount: this.mounts.size,
        mounts: mounts,
        buttonsNearComposer: buttons,
        bottomBarButtons: bottomButtons,
        sendCandidates: sendCandidates,
        textAreaProbe: textAreaProbe,
        insertTextListeners: listenerCount,
        dispatchProbe: lastDispatchProbe,
        dispatchAttempts: componentDispatchAttempts,
        hasDispatch: !!componentDispatchCache
      });
    } catch (err) {
      warn("采集诊断信息失败", err);
    }
  }

  /* ---------------- 符号编辑 ---------------- */

  setSymbol(text) {
    if (!this.cfg) return;
    if (!this.cfg.symbols.some(function (entry) { return entry.text === text; })) return;
    if (this.cfg.symbol === text) return;
    this.updateConfig({ symbol: text });
  }

  toggleInner(text) {
    if (!this.cfg || !canBeInner(text)) return;
    const symbols = this.cfg.symbols.map(function (entry) {
      if (entry.text !== text) return { text: entry.text, inner: entry.inner };
      return { text: entry.text, inner: !entry.inner };
    });
    this.updateConfig({ symbols });
  }

  addSymbol(raw) {
    if (!this.cfg) return;
    const els = this.panelEls;
    const text = normalizeSymbolText(raw);
    if (!text) {
      this.toast("这个符号没法用（空、换行或太长）", "warning");
      return;
    }
    if (this.cfg.symbols.some(function (entry) { return entry.text === text; })) {
      this.toast("这个符号已经在菜单里了", "warning");
      return;
    }
    const symbols = this.cfg.symbols.concat([{ text, inner: isWrappingPair(text) }]);
    this.updateConfig({ symbols });
    if (els && els.addInput) els.addInput.value = "";
  }

  removeSymbol(text) {
    if (!this.cfg) return;
    if (this.cfg.symbols.length <= 1) {
      this.toast("至少要留一个符号", "warning");
      return;
    }
    const symbols = this.cfg.symbols
      .filter(function (entry) { return entry.text !== text; })
      .map(function (entry) { return { text: entry.text, inner: entry.inner }; });
    const patch = { symbols };
    if (this.cfg.symbol === text) patch.symbol = symbols[0].text;
    this.updateConfig(patch);
  }

  renameSymbol(oldText, raw) {
    if (!this.cfg) return;
    const text = normalizeSymbolText(raw);
    const unchanged = !text || text === oldText ||
      this.cfg.symbols.some(function (entry) { return entry.text === text; });
    if (unchanged) {
      this.refreshPanel();
      return;
    }
    const symbols = this.cfg.symbols.map(function (entry) {
      if (entry.text !== oldText) return { text: entry.text, inner: entry.inner };
      return { text, inner: canBeInner(text) && entry.inner };
    });
    const patch = { symbols };
    if (this.cfg.symbol === oldText) patch.symbol = text;
    this.updateConfig(patch);
  }

  resetSymbols() {
    const defaults = defaultConfig();
    this.updateConfig({ symbols: defaults.symbols, symbol: defaults.symbol });
  }

  /* ---------------- 设置面板 ---------------- */

  settingRow(label, hint, control) {
    const text = el("div", { class: CLS.settingText }, [
      el("div", { class: CLS.settingLabel, text: label }),
      hint ? el("div", { class: CLS.settingHint, text: hint }) : null
    ]);
    return el("div", { class: CLS.setting }, [text, control]);
  }

  getSettingsPanel() {
    if (!this.cfg) this.cfg = defaultConfig();
    const els = {};
    this.panelEls = els;
    const panel = el("div", { class: CLS.settings });

    panel.appendChild(el("div", { class: CLS.head }, [
      el("div", { class: CLS.headTitle, text: "快捷符号" }),
      el("div", { class: CLS.headSub, text: "v" + PLUGIN_VERSION + " · 改动会自动保存" })
    ]));

    els.showButton = el("input", {
      type: "checkbox",
      class: CLS.check,
      onchange: () => this.updateConfig({ showButton: els.showButton.checked })
    });
    panel.appendChild(this.settingRow(
      "在聊天栏里显示“”按钮",
      "关掉之后按钮会从输入框里消失，但快捷键和这里的设置都还在",
      els.showButton
    ));

    els.scale = el("input", {
      type: "range",
      class: CLS.range,
      min: String(GLYPH_SCALE_MIN),
      max: String(GLYPH_SCALE_MAX),
      step: "1",
      oninput: () => {
        els.scaleValue.textContent = els.scale.value + "%";
        this.updateConfig({ glyphScale: Number(els.scale.value) }, { silent: true });
      },
      onchange: () => this.refreshPanel()
    });
    els.scaleValue = el("span", { class: CLS.mono, text: this.cfg.glyphScale + "%" });
    const scaleReset = el("button", {
      type: "button",
      class: CLS.mini,
      text: "↺",
      title: "恢复默认 " + GLYPH_SCALE_DEFAULT + "%",
      onclick: () => this.updateConfig({ glyphScale: GLYPH_SCALE_DEFAULT })
    });
    panel.appendChild(this.settingRow(
      "按钮上符号的大小",
      GLYPH_SCALE_MIN + "% – " + GLYPH_SCALE_MAX + "%，默认 " + GLYPH_SCALE_DEFAULT + "%",
      el("div", { class: CLS.inline }, [els.scale, els.scaleValue, scaleReset])
    ));

    els.mode = el("select", {
      class: CLS.select,
      onchange: () => this.updateConfig({ menuMode: els.mode.value })
    }, [
      el("option", { value: "auto", text: "自动（触屏点按 / 鼠标悬停）" }),
      el("option", { value: "tap", text: "总是点两下（第一下展开菜单）" }),
      el("option", { value: "hover", text: "总是鼠标悬停展开" })
    ]);
    panel.appendChild(this.settingRow(
      "弹出菜单的方式",
      "菜单里可以随时换用别的符号，并设置每个符号的光标落点",
      els.mode
    ));

    els.animations = el("input", {
      type: "checkbox",
      class: CLS.check,
      onchange: () => this.updateConfig({ animations: els.animations.checked })
    });
    panel.appendChild(this.settingRow(
      "菜单弹出动画",
      "关掉后菜单瞬间出现，给喜欢干脆手感的人",
      els.animations
    ));

    els.wrapSelection = el("input", {
      type: "checkbox",
      class: CLS.check,
      onchange: () => this.updateConfig({ wrapSelection: els.wrapSelection.checked })
    });
    panel.appendChild(this.settingRow(
      "选中文字时用符号包住它",
      "勾选后「符号内」的符号会把选中的文字包起来，变成“文字”的效果；不勾就直接替换选中文字",
      els.wrapSelection
    ));

    els.shortcut = el("input", {
      type: "text",
      class: CLS.text,
      placeholder: "例如 Ctrl+Alt+Q",
      spellcheck: "false",
      onchange: () => this.commitShortcut()
    });
    panel.appendChild(this.settingRow(
      "快捷键",
      "留空表示不启用；必须至少带一个 Ctrl / Alt / Cmd，免得和打字冲突",
      els.shortcut
    ));
    els.shortcutHint = el("div", { class: CLS.hint, text: "" });
    panel.appendChild(els.shortcutHint);

    els.list = el("div", { class: CLS.symbolList });
    els.addInput = el("input", {
      type: "text",
      class: CLS.text,
      maxlength: String(MAX_SYMBOL_LENGTH),
      placeholder: "再加一个符号，比如 『』",
      spellcheck: "false",
      onkeydown: (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        this.addSymbol(els.addInput.value);
      }
    });
    const addButton = el("button", {
      type: "button",
      class: CLS.primary,
      text: "添加",
      onclick: () => this.addSymbol(els.addInput.value)
    });
    const resetButton = el("button", {
      type: "button",
      class: CLS.secondary,
      text: "恢复默认符号",
      onclick: () => this.resetSymbols()
    });

    panel.appendChild(el("div", { class: CLS.section }, [
      el("div", { class: CLS.sectionTitle, text: "菜单里的符号" }),
      el("div", {
        class: CLS.sectionHint,
        text: "点左边的圆圈，把它设成按钮当前使用的符号；「内 / 外」决定插入后光标停在哪；成对符号才能选「内」。"
      }),
      els.list,
      el("div", { class: CLS.inline + " " + CLS.addRow }, [els.addInput, addButton]),
      el("div", { class: CLS.inline }, [resetButton])
    ]));

    panel.appendChild(el("div", { class: CLS.footer }, [
      el("button", {
        type: "button",
        class: CLS.secondary,
        text: "输出诊断信息",
        onclick: () => this.diagnose()
      }),
      el("button", {
        type: "button",
        class: CLS.secondary,
        text: "恢复全部默认设置",
        onclick: () => this.updateConfig(defaultConfig())
      })
    ]));

    this.refreshPanel();
    return panel;
  }

  refreshPanel() {
    const els = this.panelEls;
    if (!els || !this.cfg) return;
    const cfg = this.cfg;

    if (els.showButton) els.showButton.checked = cfg.showButton;
    if (els.scale) els.scale.value = String(cfg.glyphScale);
    if (els.scaleValue) els.scaleValue.textContent = cfg.glyphScale + "%";
    if (els.mode) els.mode.value = cfg.menuMode;
    if (els.animations) els.animations.checked = cfg.animations;
    if (els.wrapSelection) els.wrapSelection.checked = cfg.wrapSelection;
    if (els.shortcut && document.activeElement !== els.shortcut) els.shortcut.value = cfg.shortcut;
    if (els.shortcutHint) {
      els.shortcutHint.textContent = cfg.shortcut ? "当前快捷键：" + cfg.shortcut : "当前没有启用快捷键";
      els.shortcutHint.classList.remove(CLS.error);
    }
    if (els.list) this.renderSymbolRows(els.list);
  }

  renderSymbolRows(list) {
    const cfg = this.cfg;
    if (!cfg) return;
    list.textContent = "";
    cfg.symbols.forEach((entry) => {
      const isCurrent = entry.text === cfg.symbol;
      const dot = el("button", {
        type: "button",
        class: CLS.dot + (isCurrent ? " " + CLS.dotOn : ""),
        title: isCurrent ? "按钮当前使用的符号" : "设为按钮当前使用的符号",
        text: isCurrent ? "●" : "○",
        onclick: () => this.setSymbol(entry.text)
      });
      const input = el("input", {
        type: "text",
        class: CLS.symbolInput,
        maxlength: String(MAX_SYMBOL_LENGTH),
        spellcheck: "false",
        value: entry.text,
        onchange: () => this.renameSymbol(entry.text, input.value)
      });
      const inner = canBeInner(entry.text);
      const side = el("button", {
        type: "button",
        class: CLS.sideBtn + (entry.inner ? " " + CLS.sideOn : ""),
        title: inner ? "切换光标落点：符号内 / 符号外" : "单个字符没法停在中间",
        text: entry.inner ? "内" : "外",
        disabled: !inner,
        onclick: () => this.toggleInner(entry.text)
      });
      if (!inner) side.classList.add(CLS.sideOff);
      const remove = el("button", {
        type: "button",
        class: CLS.mini,
        text: "✕",
        title: "从菜单里删掉",
        onclick: () => this.removeSymbol(entry.text)
      });
      list.appendChild(el("div", { class: CLS.symbolRow }, [dot, input, side, remove]));
    });
  }

  commitShortcut() {
    const els = this.panelEls;
    if (!els || !els.shortcut) return;
    const raw = String(els.shortcut.value || "").trim();
    if (!raw) {
      this.updateConfig({ shortcut: "" });
      return;
    }
    const parsed = parseShortcut(raw);
    if (!parsed) {
      els.shortcutHint.textContent = "格式不对：写成 Ctrl+Alt+Q 这种样子，至少要带一个 Ctrl / Alt / Cmd";
      els.shortcutHint.classList.add(CLS.error);
      els.shortcut.value = this.cfg.shortcut;
      return;
    }
    this.updateConfig({ shortcut: formatShortcut(parsed) });
  }

  diagnose() {
    this.captureDomDiag();
    const lines = [];
    lines.push("QuickSymbols v" + PLUGIN_VERSION);
    lines.push("找到的输入框：" + this.mounts.size);
    let index = 0;
    for (const mount of this.mounts.values()) {
      index++;
      lines.push("  #" + index +
        " 按钮" + (mount.wrap.isConnected ? "在页面上" : "不在页面上") +
        " · 发送键" + (mount.sendButton ? "有" : "无") +
        " · 图标栏" + (mount.row ? "有" : "无") +
        " · 字号" + this.cfg.glyphScale + "%");
    }
    lines.push("INSERT_TEXT 兜底：" + (getComponentDispatch() ? "可用" : "不可用") + "（尝试 " + componentDispatchAttempts + " 次）");
    lines.push("execCommand：" + (typeof document.execCommand === "function" ? "可用" : "不可用"));
    lines.push("设置通道：" + (BD && (BD.Data || typeof BD.loadData === "function") ? "可用" : "不可用"));
    if (this.diag && this.diag.lastInsert) {
      const last = this.diag.lastInsert;
      lines.push("上次插入：" + (last.changed ? last.method : "没生效") + (last.error ? " · " + last.error : ""));
    }
    lines.push("诊断快照：%APPDATA%\\BetterDiscord\\plugins\\" + PLUGIN_NAME + ".config.json 的 diag 键");
    const text = lines.join("\n");
    try { console.log(LOG_PREFIX + "\n" + text); } catch (err) { /* 忽略 */ }
    this.toast("诊断信息已写入插件配置的 diag 键，也输出到了控制台", "info");
    return text;
  }
}

/* ================================================================== *
 * 导出
 * ================================================================== */

try {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = QuickSymbols;
    module.exports.__internals = {
      PLUGIN_NAME,
      PLUGIN_VERSION,
      CONFIG_KEY,
      MAX_SYMBOL_LENGTH,
      GLYPH_SCALE_MIN,
      GLYPH_SCALE_MAX,
      GLYPH_SCALE_DEFAULT,
      CLS,
      CSS,
      defaultConfig,
      normalizeConfig,
      normalizeSymbolText,
      splitPair,
      canBeInner,
      isWrappingPair,
      planInsertion,
      parseShortcut,
      formatShortcut,
      matchesShortcut,
      computeMenuPosition,
      el,
      toCodePoints,
      clamp
    };
  }
} catch (err) {
  /* 忽略：只在测试环境用 */
}


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
      author: "LLP和小鲸娘",
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

})();
