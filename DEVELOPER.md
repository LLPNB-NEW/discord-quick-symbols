# QuickSymbols 开发说明

单文件 BetterDiscord 插件，运行在 Discord 桌面版的渲染进程里。所有逻辑都集中在
`QuickSymbols.plugin.js`，没有构建步骤、没有依赖；样式在启动时用 `BdApi.DOM.addStyle` 注入。

---

## 1. 文件结构

| 区段 | 行号（大致） | 内容 |
| --- | --- | --- |
| 1. 常量与默认设置 | 顶部 | `PLUGIN_*`、`CLS`、`DEFAULT_SYMBOLS`、`defaultConfig()`、BetterDiscord 兼容垫片 |
| 2. 纯逻辑 | 中段 | 不碰 DOM：`splitPair` / `normalizeConfig` / `planInsertion` / 快捷键 / 菜单定位 |
| 3. DOM 小工具 | | `el()` 元素工厂、`findEditors` / `findComposer` / `findSendButton`、插入通道 |
| 4. 样式 | | 一整段 `CSS` 模板字符串，类名全部 `qsb-` 前缀 |
| 5. 插件类 | | `class QuickSymbols`：生命周期、挂载、菜单、插入、设置面板 |
| 导出 | 末尾 | `module.exports = QuickSymbols`，并挂 `__internals` 给 Node 测试用 |

`__internals` 只在 Node 里存在（`typeof module !== "undefined"` 判断），Discord 里不会污染全局。

---

## 2. 核心数据

```js
cfg = {
  symbol: "“”",                     // 按钮当前使用的符号
  symbols: [                       // 菜单里的符号，每项独立记光标落点
    { text: "“”", inner: true },
    { text: "「」", inner: true },
    { text: "……", inner: false }
  ],
  showButton: true,                // 是否显示按钮
  glyphScale: 82,                  // 按钮上符号大小 50–150（%）
  menuMode: "auto",                // auto | tap | hover
  animations: true,
  shortcut: "Ctrl+Alt+Q",          // 空字符串＝不启用
  wrapSelection: true              // 选中文字时是否包住
}
```

存储：`BdApi.Data.save("QuickSymbols", "config", cfg)` → `%APPDATA%\BetterDiscord\plugins\QuickSymbols.config.json`。
旧版 BD 没有 `BdApi.Data` 时退回 `saveData` / `loadData`（见 `saveSettings` / `loadSettings`）。

**配置读取约定**：`normalizeConfig(raw)` 以默认配置为底再合并，任何缺失的键、非法值都回落到默认，
`null` / 字符串 / 数组之类直接当默认处理。这条是上一版踩过的坑：新增的键如果被当成 `false`，
等于悄悄关掉了功能。

---

## 3. 纯逻辑（可单测部分）

```js
splitPair("“”")        // { open: "“", close: "”" }
splitPair("〈引〉")     // { open: "〈引", close: "〉" }  ← 奇数长度前半多一个
splitPair("…")         // null（不足两个字符）

canBeInner("…")        // false —— 单字符没法把光标放中间
isWrappingPair("……")   // false —— 省略号不是包裹型，默认「外」
isWrappingPair("「」")  // true  —— 起止是成对括号/引号，默认「内」

planInsertion(cfg, entry, { selected, before, after })
// → { kind: "skip",    moveForward: 1 }           光标正卡在空符号对中间，跳过右半边
// → { kind: "replace", text: "“你好”" }           有选中文字
// → { kind: "insert",  text: "“”", caretBack: 1 } 插入并把光标往回挪 1 个码点
```

`planInsertion` 是整套行为的唯一决策点，插件里只负责执行它给出的计划。
`before` / `after` 由 `textAround(editor, range)` 用两个 Range 取整个编辑器的前后文本得到，
顺便过滤 Slate 的零宽字符 `\u200B` / `\uFEFF`。

菜单定位 `computeMenuPosition({ button, menu, viewport })` 返回 `{ left, bottom, width }`：
默认贴着按钮右侧对齐往上方弹，超出屏幕时夹到 8px 边距内；菜单比屏幕还宽时收缩到 `viewport - 16`。

快捷键：`parseShortcut` 要求至少一个 Ctrl/Alt/Meta（Cmd/Command/⌘ 都映射到 meta），
主键只能一个字符；`formatShortcut` 固定顺序 `Ctrl → Alt → Shift → Meta → 键`，用于显示和比较；
`matchesShortcut(event, shortcut)` 四个修饰键必须严格相等，主键忽略大小写。

---

## 4. DOM 假设与挂载

Discord 的类名是 CSS Modules 哈希（如 `channelTextArea__2e60f`、`buttons__74017`），
所以**不写死完整类名**，一律前缀匹配：

```
EDITOR_SELECTOR = '[contenteditable="true"][role="textbox"], [data-slate-editor="true"]'
DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"], [class*="modal" i], [class*="dialog" i]'
isComposerEditor(editor) = 不是搜索框（aria 排 /(搜索|查找|筛选|search|filter)/）
                           && 祖先里没有 DIALOG_SELECTOR
                           && closest('[class*="channelTextArea"], [class*="channelBottomBarArea"], [class*="chatInput"]')
findComposer(editor)   = editor.closest('[class*="channelTextArea"]') || closest('[class*="chatInput"]')
visibleButtons(scope)  = scope 里可见的 button / [role=button]，**排除 closest(EDITOR_SELECTOR) 的那些**
findEmojiButton(scope) = 从右往左找 aria-label 命中 /(表情|emoji|emote)/ 或类名含 emojiButton 的按钮
findRowSpot(send)      = 从发送键往上最多 4 层，找第一个含 ≥2 个可见按钮的那层
```

**弹窗里的输入框不是聊天框。** 频道语音状态弹窗（「我们聊些什么？」）里的状态输入框复用了
`channelTextArea__74017` 这类类名，只按类名判断会多挂一个按钮到弹窗右上角（1.0.5 修的）。
`isComposerEditor()` 先用 `DIALOG_SELECTOR` 排掉 `[role="dialog"]` / `[aria-modal="true"]` /
类名含 modal、dialog 的祖先，再要求真的在输入框容器里。

**最重要的一条：编辑器内部的 `[role=button]` 是消息内容，不是界面按钮。** Discord 把 @提及、表情、
频道引用都渲染成 `<span role="button">` 塞在 Slate 里；真机上这些 span 还是两层嵌套的。
早期版本把它们当成发送键，`insertBefore` 就把钩子插进了提及标签内部——按钮于是变成草稿的一部分，
显示在输入框里、点它等于往消息里加字符。所以 `visibleButtons()` 必须过滤
`node.closest(EDITOR_SELECTOR)`，`isMisplaced()` 里也要有一条「钩子在编辑器里就重挂」的兜底。

挂载位置由 `planMountPosition()` 决定，优先级：

1. 发送键存在 → 插到发送键左边（`findRowSpot` 找到的那层）
2. 没有发送键（输入框为空时 Discord 不渲染它）→ 插到表情键右边
3. 有 `[class*="buttons_"]` 图标栏 → 追加到末尾
4. 都没有 → 追加到输入框容器末尾，并 `warn` 一条

发送键是「有文字才出现」的，所以 `mountAll()` 每次都要比一次位置：`isMisplaced()` 发现钩子的
下一个兄弟不是发送键（或钩子已经不在这一排），就重挂一次；位置对了就不动，避免自己触发自己的
MutationObserver。

按钮用 `mousedown` 的 `preventDefault()` 保住输入框焦点和选区——这是不丢光标的关键。
React 重渲染会把按钮挤掉，所以 `MutationObserver`（`documentElement`，`childList + subtree`，
120ms debounce）跑 `mountAll()`：按编辑器元素做 `Map` 键，缺的补挂、脱离的销毁。

触屏判定 `tapMode()`：`menuMode` 显式指定时直接用；`auto` 时看 `matchMedia("(hover: hover)").matches`。
**不要用 `maxTouchPoints`**——桌面浏览器/触屏笔记本会报 10 个触点，误判成触屏后按钮就变成「点两下」了。

---

## 5. 插入流水线

```
insertCurrent(mount)   // async
  resolveRange(mount)        先用当前编辑器内的选区；没有就聚焦编辑器、恢复 mount.lastRange，
                             再没有就放到编辑器末尾
  textAround(editor, range)  得到 { before, after, selected }
  planInsertion(...)         纯逻辑给出 skip / replace / insert
  skip   → moveCaretBy(+n)   Selection.modify("move", "forward", "character") × n
  replace/insert
         → instanceInsertText(text)                 顺 fiber 往上找到这个输入框的 TextArea 实例，
                                                   调它的 handleInsertText({ plainText, rawText })
         → dispatchInsertText(text)                 兜底：ComponentDispatch.dispatchToLastSubscribed("INSERT_TEXT")
         → execInsertText(text)                     再兜底：document.execCommand("insertText", false, text)
         每一步之后都用 waitForTextChange() 验「文本真的变了」才认这个 method
         → caretBack > 0：placeCaretInside(editor, open, close)
              waitForFocus()        等编辑器真的拿到焦点（Slate 只在聚焦时同步 DOM 选区）
              setCaretAt(point)     按文本节点直接建 Range，把光标放到闭合符号前
              caretIsInside()       用「光标前文本以开符号结尾、后文本以闭符号开头」验证
              失败就再来一次，最多 4 轮；用户一打字立刻停手
```

- 插入必须先走实例通道：Slate 是受控组件，直接改 DOM（`execCommand`）会被它下一次渲染还原；
  Discord 自己的 `handleInsertText` 是唯一保证写进模型的入口。
- `INSERT_TEXT` 是全局「发给最后一个订阅者」，多输入框时可能打偏，所以排在实例之后当兜底。
- 往回挪光标不能只挪 DOM：Slate 只把「聚焦状态下的 DOM 选区变化」同步进模型，
  否则模型里的光标还在末尾，下一次输入（比如打 `@` 选人）就会插到符号外面。
- 跳过右半边（`skip`）只挪光标、不插文本、不删任何东西；所以「在已有引号的文字里再点」不会删引号，
  而是照常插一对新的（故意允许嵌套）。

`mount.lastRange` 由 `document` 的 `selectionchange`（capture）维护：只在选区落在某个编辑器内时记录。
输入框失焦后 `window.getSelection()` 经常指向别处，没有这份记忆就会插到末尾。

---

## 6. 插件生命周期

```js
new QuickSymbols(meta)   // BD 传入 meta（@name/@author/@description/@version）
start()                  // 读配置 → 注入样式 → 挂全局监听 → MutationObserver → mountAll
stop()                   // 断开 observer、移除监听和定时器、关菜单、卸载所有按钮、删样式
getSettingsPanel()       // 返回一个 DOM 元素（不是字符串），BD 负责挂进设置页
```

全局监听（capture）：`selectionchange`、`focusin`、`keydown`（Esc 关菜单 + 快捷键）、
`resize`、`blur`；菜单打开期间额外挂 `pointerdown`（点菜单外关闭）。

设置面板里的控件直接改 `this.cfg`：`updateConfig(patch, { silent })` 会 `normalizeConfig` 合并、
清快捷键缓存、300ms debounce 保存、`apply()` 刷新按钮和已打开的菜单，并 `refreshPanel()` 回填控件。
滑杆输入时用 `silent: true`，避免拖动过程中重建整个面板。

---

## 7. 测试

```powershell
node --check QuickSymbols.plugin.js   # 语法
node check.mjs                        # 60 项断言，不需要 Discord
node tests/browser-check.mjs          # 11 项交互断言，起一个无头 Chrome/Edge
node build-userscript.mjs             # 生成 QuickSymbols.user.js
node tests/browser-check.mjs --page tests/userscript-harness.html   # 用户脚本 10 项断言
node tests/serve.mjs                                              # 需要真 Slate 时先起本地 http（8765）
node tests/browser-check.mjs --page http://127.0.0.1:8765/tests/slate-lab.html --suite __runSlateLab   # 4 项
```

`check.mjs` 用 `createRequire` 把 `.plugin.js` 当 CommonJS 加载，取 `__internals` 测纯逻辑；
`el()` 用最小假 document（`createElement` / `createTextNode` / `classList` / `setAttribute`）验证属性、事件、子节点。

`tests/browser-check.mjs` 通过 CDP 驱动无头 Chrome（找不到 Chrome 会自动试 Edge，也可用 `--chrome <路径>` 指定），
打开 `tests/harness.html` 跑页面里的测试套件：那个页面搭了仿 Discord 的聊天栏 DOM（`channelTextArea__fake` >
编辑器 + `buttons__fake` 图标栏 + 包一层的 `sendButton__fake`）和最小 `BdApi` 替身，覆盖真实的
`start()` / 点击插入 / 跳过 / 包裹 / 菜单切换 / 内-外 / 点按模式 / 设置面板 / 增删符号 / `diagnose()` / `stop()`。
它验证的是浏览器里的真实行为，`check.mjs` 验证的是纯函数——两边都过再发版。

覆盖：符号切分（含 emoji、奇数长度）、`canBeInner` / `isWrappingPair`、符号文本规整、
默认配置与副本隔离、`normalizeConfig`（夹取、去重、非法回落、幂等、缺失键）、
`planInsertion`（插入/跳过/包裹/外部/防御性）、快捷键解析与格式化、`matchesShortcut`、
菜单定位的四种夹取情况、`el()` 的属性和事件、插件类是否导出 `start` / `stop` / `getSettingsPanel`、
样式表关键类和 `qsb-` 前缀一致性。

新增行为时先写断言再改代码；纯逻辑一律放第 2 段，别在插件类里算光标位置。

### Slate 光标实验室（`tests/slate-lab.html`）

仿 Discord 的 DOM 里，光标位置由 Slate 的选区模型说了算，纯 DOM 断言测不出来。这个页面用
esm.sh 上的真 React 18 + slate 0.94 搭一个 `Editable`，跑两组对照：

- **A 旧行为**：插入 `（）` 后不动光标，接着输入 `@` —— 断言 `@` 落在右括号**外面**（复现用户看到的 bug）。
- **B 新行为**：插入后等 `focus` → 用 `Selection.modify` 把 DOM 光标挪回括号中间 → 断言 Slate 模型选区
  也进了括号内，且接着输入 `@` 落在里面。

浏览器要能访问 esm.sh，页面必须走 http（`node tests/serve.mjs` 后用
`http://127.0.0.1:8765/tests/slate-lab.html`），`file://` 下 import map 解析不了。模块版本要注意
`slate-react` 只有 0.94.0，写 0.94.1 会 404。

---

## 8. 网页版打包（build-userscript.mjs）

`node build-userscript.mjs` 读 `QuickSymbols.plugin.js`，加上用户脚本头、BdApi 兼容层、启动段，
输出 `QuickSymbols.user.js`——插件源码一字不改，所以两边行为一致。

兼容层只实现插件实际用到的面：

- `Data.load/save/delete`（旧版 `loadData/saveData`）：优先 `GM_getValue/GM_setValue`，没有就
  localStorage；键名 `QuickSymbols.<key>`，localStorage 里前缀是 `qsb.`。
- `DOM.addStyle/removeStyle`（旧版 `injectCSS/clearCSS`）：插入 `<style id="bd-...">`。
- `Webpack.getByKeys/getModule/getByStrings`：向 `webpackChunkdiscord_app` push 一个空 chunk 拿到
  require，再扫 `req.c[*].exports`；`getByStrings` 用函数源码 `indexOf` 兜底。没有 Discord 环境时
  全部返回 null，插件自动退到 `execCommand`。
- `ReactUtils.getInternalInstance`：读节点上的 `__reactFiber$` / `__reactInternalInstance$` 键。
- `UI.showToast` 自绘、`Logger.*` 走 console。

启动：`window.__QSB_MANUAL_BOOT__` 为真时不自动启动（测试用）；否则等聊天输入框出现（最多 30 秒）后
`new QuickSymbols(meta).start()`。实例挂在 `window.__qsbInstance`，类挂在 `window.__QSB_PLUGIN__`，方便控制台调试。

设置入口：网页版没有 BD 插件页，所以脚本额外监听 `contextmenu`——右键 `.qsb-btn` 弹出自绘遮罩 +
`instance.getSettingsPanel()`，`Esc` 或点遮罩关闭并 `saveNow()`。

测试：`node tests/browser-check.mjs --page tests/userscript-harness.html`，10 项断言（兼容层 4 项 +
启动 / 插入 / 跳过 / 包裹 / 设置弹窗 / stop）。这是生成结果的冒烟测试，不替代真实 discord.com 上的验证。

真实环境还有一条不需要登录的检查：`node tests/live-probe.mjs --userscript` 会把生成的用户脚本注入
`https://discord.com/login`，确认兼容层装上、插件类解析成功、没有未捕获异常（登录页没有聊天输入框，
所以此时不应该挂载按钮）。另一个用法 `node tests/live-probe.mjs` 验证 `webpackChunkdiscord_app`
push 空 chunk 能拿到 require、能扫描已加载模块；登录页只加载部分模块，所以找不到 ComponentDispatch 是正常的。

改插件后必须重新生成；`build-userscript.mjs` 写文件前会用 `vm.Script` 编译一遍，语法错直接退出，
生成后再跑一次 `node --check QuickSymbols.user.js` 更稳。

---

## 9. 已知限制

- 桌面版走 BetterDiscord，网页版走用户脚本；Vencord / Equicord 用户需要改写成 Vencord 插件（插入 API 相同）。
- 界面文案只有中文（用户是中文使用者）；如要 i18n，把 `getSettingsPanel` 里的字符串抽成表即可。
- 没有截图/预览，按钮外观完全靠 CSS 变量跟随 Discord 主题（`--interactive-normal`、`--background-floating` 等）。
- 菜单是横向单行、超出时横向滚动；符号很多时不会自动换行。
- `Selection.modify` 在 Chromium 系（Discord 桌面版）可用；万一不可用，跳过动作会静默失效，插入不受影响。

---

## 10. 排查手册

- 控制台过滤 `[QuickSymbols]`：启动/停用、挂载失败、插入失败都会有日志。
- 设置面板「输出诊断信息」：输入框数量、每个输入框的按钮/发送键/图标栏状态、两条插入通道是否可用。
- 按钮在但点击无反应：先看诊断里 `execCommand` 是否可用；再看点击时输入框是否处于禁用状态（频道无发言权限）。
- 按钮不在：输入框数量为 0 多半是 Discord 改了输入框结构，检查 `EDITOR_SELECTOR` 和 `findComposer`。
- 想临时看挂载情况：`BdApi.Plugins.get("QuickSymbols")` 拿到插件实例后可调 `diagnose()`。

排查完把诊断输出贴出来，基本能直接定位是哪一环（选择器 / 挂载位置 / 插入通道）。
