# 羽毛球小游戏云端部署

完整的 Supabase、Vercel、GitHub 配置归档、发布步骤、故障处理和回滚方法见：

[`docs/CLOUD_RELEASE_RUNBOOK.md`](docs/CLOUD_RELEASE_RUNBOOK.md)

## 快速发布

```powershell
node --check game\public\src\main.js
node --check game\public\src\supabase-game.js
node --check game\scripts\build.mjs
npm.cmd run build --prefix game

git add <本次修改的文件>
git commit -m "<简短版本说明>"
git push origin main

& "$env:APPDATA\npm\vercel.cmd" deploy --prod --yes --scope adrian-soos-projects
```

生产地址：

<https://badminton-game-sandy.vercel.app>
