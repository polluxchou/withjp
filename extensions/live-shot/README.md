# 竞品直播截图（Chrome 扩展）

在 TikTok 直播间页面点扩展图标：截下竖屏直播画面、读当前房间与 Following 区同期竞品的在线人数，点「上传」写进竞品监测后台。设计见 `docs/superpowers/specs/2026-10-09-live-shot-extension-design.md`。

## 安装

1. 生成本机配置（只含公开值，已 gitignore）：

   ```bash
   node --env-file=<主仓目录>/.env.local scripts/gen-extension-config.mjs
   ```

   本地联调后台时加 `--api-base http://localhost:3100`。

2. Chrome 打开 `chrome://extensions` → 打开右上角「开发者模式」→「加载已解压的扩展程序」→ 选本目录 `extensions/live-shot`。
3. 点工具栏的扩展图标，用 MCN 后台的邮箱和密码登录一次。

## 使用

在 TikTok 直播间页面点图标，弹窗会自动截图并读人数；确认缩略图是这个房间后点「上传」。弹窗底部是今天（日本时间）的截图数与上传数。

截不了图时弹窗会说原因：不是直播间页面、页面被双指缩放、直播画面没完整在窗口里、页面刚切换了直播间。

## 已知限制

- 点了「上传」后立刻点别处会关掉弹窗：上传可能已经完成但没看到确认，再打开会重新截一张，可能多出一张，去竞品页相册删掉即可。
- 没生成 `config.local.js` 时弹窗是空白的，先跑「安装」第 1 步。

## 改了判据之后

`generated/page-reader.js` 由 `src/lib/competitors/pageReader.ts` 生成，禁止手改。改了 `liveProbe.ts` 或 `pageReader.ts` 后运行：

```bash
node --experimental-strip-types scripts/gen-extension-reader.mjs
```

然后在 `chrome://extensions` 里点本扩展的刷新按钮。
