#requires -Version 5.1
<#
    把 QuickSymbols.plugin.js 复制到 BetterDiscord 的插件目录。
    用法：在插件文件夹里右键“使用 PowerShell 运行”，或者：
        pwsh -File .\install.ps1
#>

$ErrorActionPreference = "Stop"

$source = Join-Path $PSScriptRoot "QuickSymbols.plugin.js"
if (-not (Test-Path $source)) {
    Write-Host "找不到 QuickSymbols.plugin.js，请把本脚本和插件放在同一个文件夹里。" -ForegroundColor Red
    exit 1
}

$bdRoot = Join-Path $env:APPDATA "BetterDiscord"
$plugins = Join-Path $bdRoot "plugins"

if (-not (Test-Path $bdRoot)) {
    Write-Host "没有找到 BetterDiscord：$bdRoot" -ForegroundColor Yellow
    Write-Host "这个插件需要 BetterDiscord 才能加载。先安装 https://betterdiscord.app/ ，装好后再运行一次本脚本。"
    exit 1
}

if (-not (Test-Path $plugins)) {
    New-Item -ItemType Directory -Path $plugins | Out-Null
    Write-Host "已创建目录：$plugins"
}

$target = Join-Path $plugins "QuickSymbols.plugin.js"
Copy-Item -LiteralPath $source -Destination $target -Force

Write-Host "已复制到：$target" -ForegroundColor Green
Write-Host ""
Write-Host "接下来："
Write-Host "  1. 启动 / 切换回 Discord"
Write-Host "  2. 用户设置 → 插件（Plugins）→ 打开 QuickSymbols"
Write-Host "  3. 回到任意频道，输入框发送键左边会出现「“”」按钮"
Write-Host ""
Write-Host "已经在运行 Discord 的话，在 BD 设置里点「重新加载」或按 Ctrl+R。"
