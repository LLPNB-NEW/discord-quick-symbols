# 快捷符号（Discord 版）

> **当前分支：`userscript`（网页版）**。这是可以用篡改猴装进浏览器、直接在 discord.com 里跑的用户脚本；
> 客户端版（BetterDiscord 插件）在 [`main` 分支](https://github.com/LLPNB-NEW/discord-quick-symbols/tree/main)。
> 两边的符号逻辑、菜单、快捷键完全一致，只是宿主不同，配置各存各的。

在 Discord 聊天输入框的**发送键左边**加一个直接显示符号本身的按钮——默认是「“”」。
点一下插入一对符号、光标停在中间；再点一下跳过右半边；选中文字时自动把文字包进符号里。

## 安装（网页版）

1. 装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）。
2. 点这个链接安装脚本：
   <https://raw.githubusercontent.com/LLPNB-NEW/discord-quick-symbols/userscript/QuickSymbols.user.js>
   （篡改猴会直接弹安装页；也可以下载后把 `.user.js` 拖进浏览器窗口。）
3. 打开 <https://discord.com/channels/@me> 并刷新页面，进任意频道。
4. 输入框图标栏里会出现「“”」按钮。**右键点它**打开设置面板（网页版没有 BD 的插件设置页），
   `Esc` 或点面板外空白处关闭。

> 只对网页版 discord.com 生效；桌面客户端请用 `main` 分支的 BetterDiscord 版本。

## 手机 / 平板安装（网页版）

手机上的 Discord **App 装不了这个插件**（官方 App 没有插件接口，BetterDiscord 也只改桌面版）。
手机要用就走「浏览器 + 用户脚本管理器」，登录网页版 Discord：

**Android**

1. 装一个支持扩展的浏览器：[Kiwi Browser](https://kiwibrowser.com/)（Chromium 内核，可装 Chrome 扩展）
   或 Firefox for Android（在「附加组件」里直接搜 Tampermonkey）。
2. 装 Tampermonkey：Kiwi 打开 Chrome 应用商店搜 Tampermonkey 安装；Firefox 从附加组件页安装。
3. 用这个浏览器打开脚本地址（就是上面那条 raw 链接），篡改猴会弹出安装页 → 安装。
4. 打开 <https://discord.com/channels/@me> 登录，进任意频道。
5. **长按**「“”」按钮 0.6 秒打开设置（触屏没有右键）；轻点还是插入 / 开菜单。

**iPhone / iPad**

1. 装免费的 [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)（Safari 扩展），
   或在 App Store 买 Tampermonkey（Safari 版）。
2. 「设置 → Safari → 扩展」里打开它，并允许访问 `discord.com`。
3. Safari 打开上面那条 raw 链接，扩展会识别 `.user.js` 并弹出安装。
4. 打开 discord.com 登录后使用；同样长按按钮开设置。

**看不到按钮 / 装不上？**

- 手机网页版可能是窄屏布局，图标栏和桌面不同。先切「请求桌面版网站」再刷新：
  Safari 点地址栏左侧「大小」→ 请求桌面网站；Kiwi 点「⋮」→ 桌面版网站。
- 手机网页版登录偶尔会卡在人机验证，换网络或换浏览器重试。
- 脚本只有在**聊天输入框渲染出来之后**才会挂上按钮；刚进频道时稍等一两秒。
- 长按没反应：确认装的是 1.0.4 及以上（篡改猴里看脚本版本），旧版只支持右键。

> 想用官方 App 的话只能走第三方改包客户端（Vendetta / Revenge 之类），那是另一套插件格式，
> 本仓库的 `.plugin.js` 和 `.user.js` 都不能直接用。

---

## 功能

- **按钮上就是符号本身**，不是图标；大小可在 50%–150% 之间调。
- **插入一对符号，光标停在中间**：点一下得到 `“|”`（`|` 是光标）。
- **不会重复加引号**：光标正好停在一对空引号中间时再点，光标直接跳到右引号后面。
- **包住选中文字**：选中「你好」再点，得到「“你好”」；不勾选这项则直接替换选中内容。
- **符号菜单**：鼠标悬停（或触屏点按一下）弹出横向菜单，菜单里所有符号都能直接换用。
- **每个符号单独记住光标落点**：`内`＝光标停在符号中间，`外`＝光标跟在符号后面；
  单个字符的符号只能「外」。
- **可以自己加符号**：设置面板里增删改，最多 8 个字符一对。
- **快捷键**：可绑定 `Ctrl+Alt+Q` 这类组合，必须至少带一个 Ctrl / Alt / Cmd，避免和打字冲突。
- **设置自动保存**，保存在 BetterDiscord 的插件配置里，重装插件不丢。

---

## 客户端版安装（切到 main 分支）

这个插件是 **BetterDiscord** 插件，原版 Discord 不能直接加载 `.plugin.js`。

1. 先装 [BetterDiscord](https://betterdiscord.app/)（安装器会把 BD 注入 Discord 桌面版）。
2. 退出 Discord。
3. 把 `QuickSymbols.plugin.js` 复制到插件目录：

   ```
   %APPDATA%\BetterDiscord\plugins\
   ```

   也可以在这个文件夹里右键运行 `install.ps1`，脚本会自动找 BetterDiscord 的目录并复制。
4. 启动 Discord → **用户设置 → 插件（Plugins）** → 找到 `QuickSymbols` → 打开开关（可顺便点旁边的设置齿轮）。
5. 回到任意频道，输入框里发送键左边应该出现「“”」按钮。

> 已经开着 Discord 的话，装好 BD 后一般会自动重载；没有的话在 BD 设置里点「重新加载」或按 `Ctrl+R`。

---

## 这个分支是怎么来的

`QuickSymbols.user.js` 就是把 `QuickSymbols.plugin.js` 原样打包，前面套了一层 BdApi 兼容层
（存储、样式、Webpack、React 内部实例、toast、日志），所以插入逻辑、菜单、快捷键和桌面版完全一致。
改过插件后重新生成（在 `main` 分支上跑，再把产物提交到这个分支）：

```
node build-userscript.mjs
```

> 只对网页版 discord.com 生效；桌面客户端请用 `main` 分支的 BetterDiscord 版本。设置存在 `QuickSymbols.*` 名下
> （脚本管理器提供 GM 存储就用 GM 存储，否则退回 localStorage），换浏览器或换管理器不会同步。

---

## 使用

| 操作 | 结果 |
| --- | --- |
| 点一下按钮 | 插入当前符号（默认 `“”`），光标停在中间 |
| 光标在两个引号之间再点 | 光标跳过右引号，不会多插一对 |
| 选中文字再点 | 用符号包住选中文字（可在设置里关闭） |
| 鼠标悬停按钮 | 弹出符号菜单，点哪个就换用哪个并插入 |
| 触屏 / 点按模式 | 第一下打开菜单，第二下插入当前符号 |
| 菜单里的「内 / 外」 | 切换这个符号插入后的光标落点 |
| 按 Esc | 关掉菜单 |

**关于「内 / 外」**：成对符号（`“”`、`「」`、`（）`、`《》`、`【】`、`""`、`''` 等）默认「内」，
插入后直接就能往里打字；`……` 这类不是拿来包内容的符号默认「外」。单字符符号没法停在中间，只能是「外」。

---

## 设置面板

BD 设置 → 插件 → QuickSymbols 右边的齿轮，或插件卡片里的设置按钮。

| 设置 | 说明 |
| --- | --- |
| 在聊天栏里显示按钮 | 关掉后按钮消失，快捷键和设置仍然生效 |
| 按钮上符号的大小 | 50%–150%，默认 82%，右边 `↺` 恢复默认 |
| 弹出菜单的方式 | 自动（触屏点按 / 鼠标悬停）、总是点两下、总是悬停 |
| 菜单弹出动画 | 关掉后菜单瞬间出现 |
| 选中文字时用符号包住它 | 关掉则用符号直接替换选中文字 |
| 快捷键 | 例如 `Ctrl+Alt+Q`，留空不启用 |
| 菜单里的符号 | 点圆圈设为当前符号、改文本重命名、切「内 / 外」、`✕` 删除；底部可添加、恢复默认 |
| 输出诊断信息 | 把输入框挂载情况打印到控制台，排查问题时用 |

所有改动即时生效并自动保存。

---

## 常见问题

**按钮没出现？**
1. 确认脚本装上了且在运行：篡改猴的「管理面板」里 QuickSymbols 应该是启用状态，
   并且 `https://discord.com` 的图标上显示 `1`（表示已注入）。
2. 按 `Ctrl+Shift+I` 打开控制台，看有没有 `[QuickSymbols]` 开头的日志。
3. 右键按钮（如果没有按钮，就先按 `F5` 刷新页面），在设置面板点「输出诊断信息」，
   它会把「找到的输入框数量 / 发送键 / 图标栏 / 插入通道」列出来。
   - 输入框为 0：Discord 这版可能改了输入框结构，把诊断内容发出来就能定位。

**点了没反应？**
诊断里看 `execCommand` 和 `INSERT_TEXT 兜底` 两行，两条都「不可用」时才会插入失败。

**按钮跑进输入框里了？**
1.0.3 之前有个 bug：Discord 把 @提及渲染成输入框内部的 `role="button"`，插件把它误认成发送键，
于是把自己插进了提及标签里——按钮显示在草稿里，点它等于往消息里打字符。1.0.3 起已排除编辑器内部的
所有 `role="button"`（`visibleButtons()` 过滤 `closest(EDITOR_SELECTOR)`），并把「钩子落在编辑器里」
当作错位强制重挂。如果你还看到旧位置，`Ctrl+R` 重载一次即可。

**和别的插件冲突？**
本插件所有类名和样式 id 都带 `qsb-` / `QuickSymbols` 前缀，不 patch 任何 Discord 内部模块，
只是 DOM 上多一个按钮和一个固定定位的菜单，一般不会和别的东西抢。

**Discord 更新后失效？**
Discord 的 CSS 类名是编译后的哈希，插件一律用 `[class*="channelTextArea"]`、`[class*="buttons_"]`
这种前缀匹配，不写死完整类名。真失效时看诊断输出，通常只要改一个选择器。

**为什么光标落点有时候不对？**
Discord 的输入框是 Slate 的 contenteditable：它只在输入框聚焦时才会把浏览器选区同步进自己的模型。
插件插入后会先等输入框真的拿到焦点，再把光标放进符号中间，并用「光标前是开符号、后是闭符号」验证一次；
Slate 若把光标弹回末尾，会重试（最多 4 次），你一打字就立刻停手。极少数情况下点一下输入框再插一次即可。

---

## 卸载

BD 设置 → 插件 → QuickSymbols → 关掉开关；想彻底删掉就把 `QuickSymbols.plugin.js`
从 `%APPDATA%\BetterDiscord\plugins\` 里删掉，顺带删 `QuickSymbols.config.json`。

---

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `QuickSymbols.plugin.js` | 插件本体，单文件，直接放进 BD 插件目录即可 |
| `QuickSymbols.user.js` | 网页版用户脚本（由 `build-userscript.mjs` 生成，不要手改） |
| `build-userscript.mjs` | 把插件打包成用户脚本：`node build-userscript.mjs` |
| `check.mjs` | 不需要 Discord 的自动检查，`node check.mjs`，60 项断言 |
| `install.ps1` | 把插件复制到 BetterDiscord 插件目录的小脚本 |
| `tests/browser-check.mjs` | 无头浏览器冒烟测试：`node tests/browser-check.mjs`，11 项交互断言 |
| `tests/live-probe.mjs` | 在真实 discord.com 登录页验证兼容层：`node tests/live-probe.mjs --userscript` |
| `tests/userscript-harness.html` | 用户脚本的冒烟测试页，`node tests/browser-check.mjs --page tests/userscript-harness.html`，10 项断言 |
| `tests/harness.html` | 上面那个测试用的页面（仿 Discord 聊天栏 + 假的 BdApi） |
| `tests/slate-lab.html` | Slate 光标同步实验室：用真 Slate 复现「插入后打 @ 落在括号外」，验证修法；配 `tests/serve.mjs` 起本地 http |
| `DEVELOPER.md` | 实现细节、DOM 假设、测试与排查手册 |
| `LICENSE` | GPL-3.0 开源协议 |

---

## 和上一版（SillyTavern 扩展）的差异

| | SillyTavern / TauriTavern 版 | 这一版（Discord） |
| --- | --- | --- |
| 宿主 | 网页扩展文件夹 | BetterDiscord 单文件插件 |
| 输入框 | `<textarea>` | Slate `contenteditable` |
| 插入方式 | `execCommand("insertText")` | 先调这个输入框自己的 TextArea 实例插入（保证写进 Slate 模型），再退 `INSERT_TEXT`、`execCommand`；每条都验文本有没有真的变 |
| 存储 | `extension_settings` / localStorage | `BdApi.Data`（`plugins\QuickSymbols.config.json`） |
| 按钮位置 | 发送键左边（原生工具栏） | 聊天输入框图标栏里、发送键左边（发送键只在有文字时出现，出现后自动就位） |

同样的几个结论沿用下来了：**触屏判定不能看 `maxTouchPoints`**（桌面机会误报），要按
`matchMedia("(hover: hover)")` 判定；配置里**缺失的键必须当成默认值**处理，不能当成
「用户关掉了」；光标位置要单独记，因为输入框失焦后读到的选区往往是末尾。

---

## 开源协议

[GPL-3.0](LICENSE) © 2026 LLP和小鲸娘

本项目按 **GNU General Public License v3.0**（或更新版本）发布：

- 可以自由使用、修改、分发，包括商用；分发时必须保留本协议和版权声明。
- **改了再发（包括打包进自己的插件或用户脚本）必须以 GPL-3.0 同样开源**，并注明改动。
- 不提供任何担保。

重新打包或二次发布时，请一并保留 `LICENSE` 并注明来源仓库。
