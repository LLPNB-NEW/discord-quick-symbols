/**
 * QuickSymbols 自动化检查（不需要 Discord）
 *
 * 跑法：node check.mjs
 * 覆盖：符号切分、配置整理、插入计划、快捷键解析、菜单定位、元素工厂，
 *       以及插件类是否提供了 BetterDiscord 需要的 start / stop / getSettingsPanel。
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const Plugin = require(join(here, "QuickSymbols.plugin.js"));
const I = Plugin.__internals;

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (err) {
    fail += 1;
    failures.push({ name, message: err && err.message ? err.message : String(err) });
  }
}

function show(value) {
  return JSON.stringify(value);
}

function eq(actual, expected, label) {
  const a = show(actual);
  const b = show(expected);
  if (a !== b) {
    throw new Error((label || "值不相等") + "\n      实际: " + a + "\n      期望: " + b);
  }
}

function ok(value, label) {
  if (!value) throw new Error(label || "期望为真，实际为假");
}

function isNull(value, label) {
  if (value !== null) throw new Error((label || "期望 null") + "，实际 " + show(value));
}

/* ------------------------------------------------------------------ *
 * 假的 document：只实现 el() 用到的那几个方法
 * ------------------------------------------------------------------ */

function stubDocument() {
  const make = (tag) => {
    const node = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      children: [],
      attributes: {},
      listeners: {},
      style: {},
      dataset: {},
      className: "",
      textContent: "",
      hidden: false,
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
      },
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      addEventListener(type, fn) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(fn);
      },
      removeEventListener(type, fn) {
        const list = this.listeners[type] || [];
        const index = list.indexOf(fn);
        if (index >= 0) list.splice(index, 1);
      },
      contains() {
        return false;
      },
      remove() {}
    };
    const classes = new Set();
    Object.defineProperty(node, "classList", {
      value: {
        add(name) {
          classes.add(name);
          node.className = Array.from(classes).join(" ");
        },
        remove(name) {
          classes.delete(name);
          node.className = Array.from(classes).join(" ");
        },
        contains(name) {
          return classes.has(name);
        }
      }
    });
    return node;
  };

  return {
    createElement: make,
    createTextNode(text) {
      return { nodeType: 3, textContent: String(text) };
    }
  };
}

/* ================================================================== *
 * 1. 符号切分
 * ================================================================== */

test("splitPair：中文引号", () => {
  eq(I.splitPair("“”"), { open: "“", close: "”" });
});

test("splitPair：直角引号", () => {
  eq(I.splitPair("「」"), { open: "「", close: "」" });
});

test("splitPair：圆括号 / 书名号 / 方括号", () => {
  eq(I.splitPair("（）"), { open: "（", close: "）" });
  eq(I.splitPair("《》"), { open: "《", close: "》" });
  eq(I.splitPair("【】"), { open: "【", close: "】" });
});

test("splitPair：ASCII 双引号 / 单引号", () => {
  eq(I.splitPair('""'), { open: '"', close: '"' });
  eq(I.splitPair("''"), { open: "'", close: "'" });
});

test("splitPair：两个相同字符（省略号）", () => {
  eq(I.splitPair("……"), { open: "…", close: "…" });
});

test("splitPair：奇数长度，前半个多一个字符", () => {
  eq(I.splitPair("〈引〉"), { open: "〈引", close: "〉" });
});

test("splitPair：单字符和空串没法切", () => {
  isNull(I.splitPair("…"));
  isNull(I.splitPair(""));
  isNull(I.splitPair(null));
});

test("splitPair：emoji 按码点切，不会切坏", () => {
  eq(I.splitPair("😀😀"), { open: "😀", close: "😀" });
});

test("canBeInner：至少两个字符才行", () => {
  ok(I.canBeInner("“”"));
  ok(I.canBeInner("😀😀"));
  ok(!I.canBeInner("…"));
  ok(!I.canBeInner(""));
});

test("isWrappingPair：引号括号算包裹型，新加入时默认「内」", () => {
  ok(I.isWrappingPair("“”"));
  ok(I.isWrappingPair("「」"));
  ok(I.isWrappingPair("（）"));
  ok(I.isWrappingPair("《》"));
  ok(I.isWrappingPair("【】"));
  ok(I.isWrappingPair('""'));
  ok(I.isWrappingPair("[]"));
  ok(I.isWrappingPair("〈引〉"));
});

test("isWrappingPair：省略号、破折号这类不算包裹型，默认「外」", () => {
  ok(!I.isWrappingPair("……"));
  ok(!I.isWrappingPair("——"));
  ok(!I.isWrappingPair("..."));
  ok(!I.isWrappingPair("**"));
  ok(!I.isWrappingPair("…"));
  ok(!I.isWrappingPair(""));
});

/* ================================================================== *
 * 2. 符号文本规整
 * ================================================================== */

test("normalizeSymbolText：去掉首尾空白", () => {
  eq(I.normalizeSymbolText("  “” "), "“”");
});

test("normalizeSymbolText：空白 / 换行 / 非字符串一律拒绝", () => {
  isNull(I.normalizeSymbolText(""));
  isNull(I.normalizeSymbolText("   "));
  isNull(I.normalizeSymbolText("\n"));
  isNull(I.normalizeSymbolText(123));
  isNull(I.normalizeSymbolText(null));
});

test("normalizeSymbolText：超过 8 个码点拒绝，正好 8 个接受", () => {
  isNull(I.normalizeSymbolText("123456789"));
  eq(I.normalizeSymbolText("12345678"), "12345678");
});

/* ================================================================== *
 * 3. 默认配置与配置整理
 * ================================================================== */

test("defaultConfig：默认值符合预期", () => {
  const cfg = I.defaultConfig();
  eq(cfg.symbol, "“”");
  eq(cfg.symbols.length, 8);
  eq(cfg.symbols[0], { text: "“”", inner: true });
  eq(cfg.symbols[7], { text: "……", inner: false });
  eq(cfg.menuMode, "auto");
  eq(cfg.glyphScale, I.GLYPH_SCALE_DEFAULT);
  eq(cfg.showButton, true);
  eq(cfg.animations, true);
  eq(cfg.shortcut, "");
  eq(cfg.wrapSelection, true);
});

test("defaultConfig：每次返回独立副本", () => {
  const a = I.defaultConfig();
  a.symbols[0].text = "X";
  a.symbol = "X";
  eq(I.defaultConfig().symbols[0].text, "“”");
  eq(I.defaultConfig().symbol, "“”");
});

test("normalizeConfig：垃圾输入回落到默认值", () => {
  eq(I.normalizeConfig(null), I.defaultConfig());
  eq(I.normalizeConfig(undefined), I.defaultConfig());
  eq(I.normalizeConfig("garbage"), I.defaultConfig());
  eq(I.normalizeConfig([]), I.defaultConfig());
});

test("normalizeConfig：未知菜单模式回落到 auto", () => {
  eq(I.normalizeConfig({ menuMode: "bogus" }).menuMode, "auto");
  eq(I.normalizeConfig({ menuMode: "tap" }).menuMode, "tap");
  eq(I.normalizeConfig({ menuMode: "hover" }).menuMode, "hover");
});

test("normalizeConfig：字号夹在 50–150 之间并取整", () => {
  eq(I.normalizeConfig({ glyphScale: 500 }).glyphScale, 150);
  eq(I.normalizeConfig({ glyphScale: -3 }).glyphScale, 50);
  eq(I.normalizeConfig({ glyphScale: "70" }).glyphScale, 70);
  eq(I.normalizeConfig({ glyphScale: 82.6 }).glyphScale, 83);
  eq(I.normalizeConfig({ glyphScale: "abc" }).glyphScale, 82);
});

test("normalizeConfig：字符串数组形式的符号会被整理、去重、去空", () => {
  const cfg = I.normalizeConfig({ symbols: ["「」", "「」", "", "……", 42] });
  eq(cfg.symbols, [
    { text: "「」", inner: true },
    { text: "……", inner: false }
  ]);
});

test("normalizeConfig：单字符符号的 inner 会被强制关掉", () => {
  const cfg = I.normalizeConfig({ symbols: [{ text: "…", inner: true }] });
  eq(cfg.symbols, [{ text: "…", inner: false }]);
});

test("normalizeConfig：符号列表为空时用默认列表", () => {
  const cfg = I.normalizeConfig({ symbols: [] });
  eq(cfg.symbols.length, 8);
  eq(cfg.symbols[0].text, "“”");
});

test("normalizeConfig：不认识的当前符号会被加进列表并设为当前", () => {
  const cfg = I.normalizeConfig({ symbol: "『』", symbols: ["「」"] });
  eq(cfg.symbols, [
    { text: "「」", inner: true },
    { text: "『』", inner: true }
  ]);
  eq(cfg.symbol, "『』");
});

test("normalizeConfig：当前符号在列表里时沿用列表里的 inner 设置", () => {
  const cfg = I.normalizeConfig({ symbol: "「」", symbols: [{ text: "「」", inner: false }] });
  eq(cfg.symbol, "「」");
  eq(cfg.symbols[0].inner, false);
});

test("normalizeConfig：当前符号非法时落到列表第一个", () => {
  const cfg = I.normalizeConfig({ symbol: "   ", symbols: ["《》"] });
  eq(cfg.symbol, "《》");
});

test("normalizeConfig：布尔字段只认真正的布尔值", () => {
  const cfg = I.normalizeConfig({ showButton: "no", animations: 0, wrapSelection: true });
  eq(cfg.showButton, true);
  eq(cfg.animations, true);
  eq(cfg.wrapSelection, true);
  eq(I.normalizeConfig({ showButton: false, animations: false, wrapSelection: false }), {
    ...I.defaultConfig(),
    showButton: false,
    animations: false,
    wrapSelection: false
  });
});

test("normalizeConfig：快捷键会被格式化，非法则清空", () => {
  eq(I.normalizeConfig({ shortcut: "ctrl+alt+q" }).shortcut, "Ctrl+Alt+Q");
  eq(I.normalizeConfig({ shortcut: "q" }).shortcut, "");
  eq(I.normalizeConfig({ shortcut: "Ctrl+Alt" }).shortcut, "");
  eq(I.normalizeConfig({ shortcut: 123 }).shortcut, "");
});

test("normalizeConfig：整理两次结果不变（幂等）", () => {
  const once = I.normalizeConfig({
    symbol: "『』",
    symbols: ["「」", "『』", "……"],
    glyphScale: 133,
    menuMode: "tap",
    shortcut: "ctrl+shift+1",
    showButton: false
  });
  eq(I.normalizeConfig(once), once);
});

/* ================================================================== *
 * 4. 插入计划
 * ================================================================== */

const wrapCfg = { wrapSelection: true };
const replaceCfg = { wrapSelection: false };
const quote = { text: "“”", inner: true };
const dots = { text: "……", inner: false };
const angle = { text: "〈引〉", inner: true };

test("planInsertion：空输入框插入一对符号，光标往回一格", () => {
  eq(I.planInsertion(wrapCfg, quote, { selected: "", before: "", after: "" }), {
    kind: "insert",
    text: "“”",
    caretBack: 1
  });
});

test("planInsertion：光标已经在中间时，跳过结尾符号", () => {
  eq(I.planInsertion(wrapCfg, quote, { selected: "", before: "abc“", after: "”def" }), {
    kind: "skip",
    moveForward: 1,
    caretBack: 0
  });
});

test("planInsertion：光标不在中间时正常插入", () => {
  eq(I.planInsertion(wrapCfg, quote, { selected: "", before: "abc“", after: "x”" }), {
    kind: "insert",
    text: "“”",
    caretBack: 1
  });
});

test("planInsertion：选中文字且设备是「内」时，包住选中文字", () => {
  eq(I.planInsertion(wrapCfg, quote, { selected: "你好", before: "", after: "" }), {
    kind: "replace",
    text: "“你好”",
    caretBack: 0
  });
});

test("planInsertion：关掉包裹时，选中文字直接替换成符号", () => {
  eq(I.planInsertion(replaceCfg, quote, { selected: "你好", before: "", after: "" }), {
    kind: "replace",
    text: "“”",
    caretBack: 0
  });
});

test("planInsertion：符号外——选中文字时直接替换，光标不往回", () => {
  eq(I.planInsertion(wrapCfg, dots, { selected: "你好", before: "", after: "" }), {
    kind: "replace",
    text: "……",
    caretBack: 0
  });
});

test("planInsertion：符号外——无选中时插入后光标跟在后面", () => {
  eq(I.planInsertion(wrapCfg, dots, { selected: "", before: "", after: "" }), {
    kind: "insert",
    text: "……",
    caretBack: 0
  });
});

test("planInsertion：符号外不会触发跳过", () => {
  eq(I.planInsertion(wrapCfg, dots, { selected: "", before: "……", after: "" }), {
    kind: "insert",
    text: "……",
    caretBack: 0
  });
});

test("planInsertion：奇数长度的成对符号，光标停在前半之后", () => {
  eq(I.planInsertion(wrapCfg, angle, { selected: "", before: "", after: "" }), {
    kind: "insert",
    text: "〈引〉",
    caretBack: 1
  });
});

test("planInsertion：奇数长度的成对符号也能跳过结尾", () => {
  eq(I.planInsertion(wrapCfg, angle, { selected: "", before: "〈引", after: "〉" }), {
    kind: "skip",
    moveForward: 1,
    caretBack: 0
  });
});

test("planInsertion：state 缺省时按空输入框处理", () => {
  eq(I.planInsertion(wrapCfg, quote, null), { kind: "insert", text: "“”", caretBack: 1 });
  eq(I.planInsertion(wrapCfg, quote, {}), { kind: "insert", text: "“”", caretBack: 1 });
});

test("planInsertion：防御性——单字符但误标 inner 也不会崩", () => {
  eq(I.planInsertion(wrapCfg, { text: "…", inner: true }, { selected: "", before: "", after: "" }), {
    kind: "insert",
    text: "…",
    caretBack: 0
  });
});

/* ================================================================== *
 * 5. 快捷键
 * ================================================================== */

test("parseShortcut：基本组合", () => {
  eq(I.parseShortcut("Ctrl+Alt+Q"), { ctrl: true, alt: true, shift: false, meta: false, key: "q" });
});

test("parseShortcut：标点键", () => {
  eq(I.parseShortcut("ctrl+shift+,"), { ctrl: true, alt: false, shift: true, meta: false, key: "," });
});

test("parseShortcut：Meta / Cmd / Command 都是同一个键", () => {
  eq(I.parseShortcut("Meta+K"), { ctrl: false, alt: false, shift: false, meta: true, key: "k" });
  eq(I.parseShortcut("Command+Shift+K"), { ctrl: false, alt: false, shift: true, meta: true, key: "k" });
  eq(I.parseShortcut("⌘+K"), { ctrl: false, alt: false, shift: false, meta: true, key: "k" });
});

test("parseShortcut：全角加号也认", () => {
  eq(I.parseShortcut("Ctrl＋Alt＋Q"), { ctrl: true, alt: true, shift: false, meta: false, key: "q" });
});

test("parseShortcut：不合法的一律 null", () => {
  isNull(I.parseShortcut(""));
  isNull(I.parseShortcut("Q"));
  isNull(I.parseShortcut("Shift+Q"));
  isNull(I.parseShortcut("Ctrl+"));
  isNull(I.parseShortcut("Ctrl+Alt"));
  isNull(I.parseShortcut("Ctrl+Alt+QQ"));
  isNull(I.parseShortcut("Ctrl+Alt+A+B"));
  isNull(I.parseShortcut(null));
  isNull(I.parseShortcut(123));
});

test("formatShortcut：固定顺序输出", () => {
  eq(I.formatShortcut(I.parseShortcut("alt+ctrl+q")), "Ctrl+Alt+Q");
  eq(I.formatShortcut(I.parseShortcut("shift+meta+1")), "Shift+Meta+1");
  eq(I.formatShortcut(null), "");
});

test("matchesShortcut：修饰键和主键都要对上", () => {
  const shortcut = I.parseShortcut("Ctrl+Alt+Q");
  ok(I.matchesShortcut({ ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, key: "q" }, shortcut));
  ok(I.matchesShortcut({ ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, key: "Q" }, shortcut));
  ok(!I.matchesShortcut({ ctrlKey: true, altKey: true, shiftKey: true, metaKey: false, key: "q" }, shortcut));
  ok(!I.matchesShortcut({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: "q" }, shortcut));
  ok(!I.matchesShortcut({ ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, key: "w" }, shortcut));
  ok(!I.matchesShortcut(null, shortcut));
  ok(!I.matchesShortcut({}, null));
});

/* ================================================================== *
 * 6. 菜单定位
 * ================================================================== */

test("computeMenuPosition：默认右对齐按钮", () => {
  eq(I.computeMenuPosition({
    button: { left: 900, right: 1000, top: 700, bottom: 732 },
    menu: { width: 300, height: 80 },
    viewport: { width: 1280, height: 800 }
  }), { left: 700, bottom: 106, width: 300 });
});

test("computeMenuPosition：贴左边时不会跑出屏幕", () => {
  eq(I.computeMenuPosition({
    button: { left: 100, right: 200, top: 700, bottom: 732 },
    menu: { width: 300, height: 80 },
    viewport: { width: 1280, height: 800 }
  }), { left: 8, bottom: 106, width: 300 });
});

test("computeMenuPosition：贴右边时留出边距", () => {
  eq(I.computeMenuPosition({
    button: { left: 1200, right: 1279, top: 700, bottom: 732 },
    menu: { width: 300, height: 80 },
    viewport: { width: 1280, height: 800 }
  }), { left: 972, bottom: 106, width: 300 });
});

test("computeMenuPosition：菜单比屏幕宽时收缩到屏幕内", () => {
  eq(I.computeMenuPosition({
    button: { left: 600, right: 700, top: 700, bottom: 732 },
    menu: { width: 2000, height: 80 },
    viewport: { width: 1280, height: 800 }
  }), { left: 8, bottom: 106, width: 1264 });
});

test("computeMenuPosition：按钮贴近底部时菜单不会沉到屏幕外", () => {
  const pos = I.computeMenuPosition({
    button: { left: 600, right: 700, top: 900, bottom: 932 },
    menu: { width: 300, height: 80 },
    viewport: { width: 1280, height: 800 }
  });
  eq(pos.bottom, 8);
});

/* ================================================================== *
 * 7. 元素工厂
 * ================================================================== */

test("el：class / 属性 / 事件 / 文本子节点", () => {
  const doc = stubDocument();
  const child = doc.createElement("span");
  let clicked = 0;
  const node = I.el("div", {
    class: "a b",
    title: "提示",
    onclick: () => { clicked += 1; }
  }, ["文字", [child], null], doc);

  eq(node.className, "a b");
  eq(node.attributes.title, "提示");
  eq(node.children.length, 2);
  eq(node.children[0].nodeType, 3);
  eq(node.children[0].textContent, "文字");
  ok(node.children[1] === child, "第二个子节点应该是传进去的 span");
  eq(node.listeners.click.length, 1);
  node.listeners.click[0]();
  eq(clicked, 1);
});

test("el：布尔属性与 value 走属性/属性值两条路", () => {
  const doc = stubDocument();
  const input = I.el("input", { type: "checkbox", checked: true, disabled: true, value: "x" }, null, doc);
  eq(input.checked, true);
  eq(input.disabled, true);
  eq(input.value, "x");
  eq(input.attributes.checked, "");
  eq(input.attributes.type, "checkbox");
});

test("el：style 对象会逐个赋值", () => {
  const doc = stubDocument();
  const node = I.el("div", { style: { left: "10px", bottom: "20px" } }, null, doc);
  eq(node.style.left, "10px");
  eq(node.style.bottom, "20px");
});

test("el：没有 document 时明确报错", () => {
  let threw = false;
  try {
    I.el("div", {}, null, null);
  } catch (err) {
    threw = true;
  }
  ok(threw, "应该抛错");
});

/* ================================================================== *
 * 8. 插件形态
 * ================================================================== */

test("插件导出一个类，带 BetterDiscord 需要的三个方法", () => {
  eq(typeof Plugin, "function");
  eq(typeof Plugin.prototype.start, "function");
  eq(typeof Plugin.prototype.stop, "function");
  eq(typeof Plugin.prototype.getSettingsPanel, "function");
  const instance = new Plugin({ name: "QuickSymbols" });
  eq(typeof instance.insertCurrent, "function");
  eq(typeof instance.diagnose, "function");
});

test("实例方法：tapMode / parsedShortcut / currentEntry 不依赖 DOM", () => {
  const instance = new Plugin({ name: "QuickSymbols" });
  instance.cfg = I.normalizeConfig({ symbol: "……", menuMode: "tap", shortcut: "ctrl+alt+q" });
  eq(instance.tapMode(), true);
  eq(instance.parsedShortcut().key, "q");
  eq(instance.currentEntry(), { text: "……", inner: false });
  eq(I.planInsertion(instance.cfg, instance.currentEntry(), { selected: "", before: "", after: "" }), {
    kind: "insert",
    text: "……",
    caretBack: 0
  });

  instance.cfg = I.normalizeConfig({ symbol: "“”", menuMode: "hover" });
  eq(instance.tapMode(), false);
  eq(instance.currentEntry(), { text: "“”", inner: true });
  eq(I.planInsertion(instance.cfg, instance.currentEntry(), { selected: "", before: "", after: "" }), {
    kind: "insert",
    text: "“”",
    caretBack: 1
  });
});

test("样式表覆盖了按钮、菜单和设置面板的关键类", () => {
  ok(I.CSS.includes(".qsb-btn"), "缺 .qsb-btn");
  ok(I.CSS.includes(".qsb-menu"), "缺 .qsb-menu");
  ok(I.CSS.includes(".qsb-settings"), "缺 .qsb-settings");
  ok(I.CSS.indexOf("qsb-open") !== -1);
});

test("所有类名前缀统一，避免和 Discord 自己的样式打架", () => {
  Object.keys(I.CLS).forEach((key) => {
    const value = I.CLS[key];
    ok(value.indexOf("qsb-") === 0, "类名 " + key + " = " + value + " 没有 qsb- 前缀");
  });
});

/* ------------------------------------------------------------------ */

if (fail > 0) {
  console.log("FAILED " + fail + " / " + (pass + fail));
  failures.forEach((item) => {
    console.log("\n✗ " + item.name + "\n    " + item.message);
  });
  process.exit(1);
}

console.log("PASS " + pass + " / " + (pass + fail));
