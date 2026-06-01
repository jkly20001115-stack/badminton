# 羽毛球小游戏云端发布与归档手册

本文档记录羽毛球小游戏接入 Supabase、部署 Vercel、推送 GitHub 的完整过程，并提供后续版本更新时可直接复用的发布步骤。

归档日期：2026-06-01  
工作区：`D:\羽毛球小游戏`

## 1. 当前线上资源

### Supabase

| 项目 | 值 |
| --- | --- |
| 项目名 | `badminton` |
| Project ID | `hsasqrbdodluijskxvyu` |
| Project URL | `https://hsasqrbdodluijskxvyu.supabase.co` |
| 前端配置 | `game/public/env.js` |
| MCP 配置 | `.mcp.json` |

前端使用的是 `sb_publishable_...` 格式的 publishable key。它本来就是浏览器端公开配置，可以出现在静态网站中。

禁止把 Supabase `sb_secret_...`、`service_role` key 或数据库密码写入源码、文档、Git 提交或浏览器代码。

### Supabase 数据表

当前使用表：`public.match_results`

用途：保存每场比赛结果，包括模式、玩家名、胜方、局分、每局比分、比赛时长和客户端版本。

已应用迁移：

| 迁移 | 本地文件 | 作用 |
| --- | --- | --- |
| `create_match_results` | `supabase/migrations/202605300001_create_match_results.sql` | 创建比赛结果表、启用 RLS、授予 Data API 访问权限 |
| `harden_match_results_insert_policy` | `supabase/migrations/202605300002_harden_match_results_insert_policy.sql` | 限制匿名写入的数据范围，避免任意垃圾数据直接写入 |

验证结果：

- `public.match_results` 已存在，RLS 已启用。
- Supabase Security Advisor：无告警。
- Supabase Performance Advisor：无告警。
- 已用 publishable key 做真实 REST 插入测试，并删除测试记录。

### Vercel

| 项目 | 值 |
| --- | --- |
| Team | `adrian-soos-projects` |
| Team ID | `team_xFB2iAY3TAztb1VKe01APywL` |
| Project | `badminton-game` |
| Project ID | `prj_u9dKDUhlv8hgckWpc5OhoZsrNvo3` |
| 生产地址 | `https://badminton-game-sandy.vercel.app` |
| 首次部署 ID | `dpl_7MaCnMxnYDUhnqVkEUyx3pAhfn5n` |

Vercel 使用根目录的 `vercel.json`：

```json
{
  "installCommand": "cd game && npm install",
  "buildCommand": "cd game && npm run build",
  "outputDirectory": "game/public",
  "framework": null
}
```

本机 `.vercel/project.json` 记录 Vercel 链接信息，但 `.vercel/` 已加入 `.gitignore`，不会推送到 GitHub。更换电脑后需要重新执行 `vercel link`。

### GitHub

| 项目 | 值 |
| --- | --- |
| 仓库 | `jkly20001115-stack/badminton` |
| 地址 | `https://github.com/jkly20001115-stack/badminton` |
| Remote | `https://github.com/jkly20001115-stack/badminton.git` |
| 默认分支 | `main` |
| 当前已推送提交 | `5618103 configure badminton Supabase project` |
| 初始标签 | `badminton0.1` |

历史说明：`main` 已成功推送。`badminton0.1` 标签在首次推送时遇到 GitHub 网络超时，后续发布前应再次执行标签推送命令确认远端存在。

## 2. 项目中的云端相关文件

| 文件 | 用途 |
| --- | --- |
| `.mcp.json` | Supabase MCP 服务地址 |
| `vercel.json` | Vercel 静态站点构建配置 |
| `game/public/env.js` | 浏览器端 Supabase URL 和 publishable key |
| `game/public/src/supabase-game.js` | Supabase Realtime 与比赛结果保存封装 |
| `game/scripts/build.mjs` | 生成 `env.js` 并复制 Three.js 静态文件 |
| `supabase/migrations/*.sql` | 数据库迁移历史 |

## 3. 日常快速发布

适用场景：只修改游戏代码，没有新增或修改数据库表。

在项目根目录运行：

```powershell
git status --short --branch

node --check game\public\src\main.js
node --check game\public\src\supabase-game.js
node --check game\scripts\build.mjs
npm.cmd run build --prefix game

git add <本次修改的文件>
git commit -m "<简短版本说明>"
git push origin main

& "$env:APPDATA\npm\vercel.cmd" deploy --prod --yes --scope adrian-soos-projects
& "$env:APPDATA\npm\vercel.cmd" inspect badminton-game-sandy.vercel.app --scope adrian-soos-projects
& "$env:APPDATA\npm\vercel.cmd" logs badminton-game-sandy.vercel.app --scope adrian-soos-projects --limit 20
```

发布后打开：

```text
https://badminton-game-sandy.vercel.app
```

至少验证：

- 首页可以打开。
- 单人模式可以进入。
- 场地、球网、比分 HUD 正常显示。
- 双人模式可以创建房间。
- 浏览器开发者工具没有明显报错。

## 4. 带数据库变更的发布

适用场景：新增表、字段、索引或 RLS 策略。

### 4.1 新增迁移文件

迁移文件只追加，不修改已经应用到远端的旧迁移。

文件命名建议：

```text
supabase/migrations/YYYYMMDDHHMM_<description>.sql
```

如果已安装 Supabase CLI，优先使用 CLI 创建迁移文件：

```powershell
supabase migration new <description>
```

### 4.2 应用迁移

推荐让 Codex 使用 Supabase MCP：

```text
请将 supabase/migrations/<文件名>.sql 应用到 Supabase 项目 badminton，
随后检查 public schema、Security Advisor 和 Performance Advisor。
```

迁移后必须确认：

- 目标表结构正确。
- 暴露在 `public` schema 的表已启用 RLS。
- `anon` / `authenticated` 权限满足实际需求。
- Security Advisor 和 Performance Advisor 没有未处理告警。
- 用真实 REST 请求验证浏览器端需要的读写路径。

### 4.3 再执行日常发布

完成数据库验证后，执行第 3 节的构建、提交、推送和 Vercel 部署步骤。

## 5. 创建版本标签

每个稳定版本建议打标签，例如 `badminton0.2`：

```powershell
git tag badminton0.2
git push origin badminton0.2
```

查看已有标签：

```powershell
git tag
git ls-remote --tags origin
```

网络不稳定时，先确认提交已经推送，再单独重试标签：

```powershell
git push origin refs/tags/badminton0.2
```

## 6. 首次配置或换电脑

### 6.1 Supabase MCP Reconnect

项目根目录已有 `.mcp.json`：

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp"
    }
  }
}
```

正常情况下运行：

```powershell
codex mcp add supabase --url https://mcp.supabase.com/mcp
codex mcp login supabase
codex mcp list
```

如果 WindowsApps 中的 `codex.exe` 报 `Access is denied`，从 Codex 配置中读取真实 CLI 路径：

```powershell
$config = Get-Content "$env:USERPROFILE\.codex\config.toml"
$codexPath = [regex]::Match(($config -join "`n"), "CODEX_CLI_PATH = '([^']+)'").Groups[1].Value

& $codexPath mcp add supabase --url https://mcp.supabase.com/mcp
& $codexPath mcp login supabase
& $codexPath mcp list
```

浏览器授权完成后，如果当前 Codex 会话仍无法看到 Supabase 工具，完全关闭并重新打开 Codex。

排查 Supabase MCP 网络：

```powershell
curl.exe -v --connect-timeout 10 https://mcp.supabase.com/mcp
```

未带 token 时返回 `401 Unauthorized` 是正常现象，说明 MCP 服务可达。

### 6.2 Vercel CLI

安装：

```powershell
npm.cmd install -g vercel
```

Windows PowerShell 可能阻止运行 `vercel.ps1`。直接使用 `.cmd`：

```powershell
& "$env:APPDATA\npm\vercel.cmd" login
& "$env:APPDATA\npm\vercel.cmd" whoami
```

首次链接当前目录：

```powershell
& "$env:APPDATA\npm\vercel.cmd" link --yes --scope adrian-soos-projects --project badminton-game
```

如果部署时报错：

```text
Detected linked project does not have "id"
```

重新执行上面的显式 `vercel link`，然后再部署。

### 6.3 GitHub Remote

如果当前仓库还没有 `origin`：

```powershell
git remote add origin https://github.com/jkly20001115-stack/badminton.git
git push -u origin main
```

检查远端：

```powershell
git remote -v
git status --short --branch
```

## 7. 回滚

### 7.1 回滚 Vercel

查看部署：

```powershell
& "$env:APPDATA\npm\vercel.cmd" ls --scope adrian-soos-projects
```

回滚到上一个生产版本：

```powershell
& "$env:APPDATA\npm\vercel.cmd" rollback --scope adrian-soos-projects
```

### 7.2 回滚 Git 代码

优先使用 `git revert` 创建反向提交，不要直接改写已推送历史：

```powershell
git log --oneline --decorate -10
git revert <需要撤销的提交>
git push origin main
```

如果需要从旧版本开始新分支：

```powershell
git switch -c restore/badminton0.1 badminton0.1
```

### 7.3 回滚数据库

不要编辑已经应用的迁移。新增一个补偿迁移，例如：

```text
supabase/migrations/YYYYMMDDHHMM_revert_<description>.sql
```

应用补偿迁移后，再运行 Supabase advisor 和真实 REST 测试。

## 8. 安全注意事项

- 浏览器代码只允许使用 Supabase publishable key。
- 不要提交 Supabase secret key、`service_role`、数据库密码或 `VERCEL_TOKEN`。
- `.vercel/`、`.env`、`.env.*` 已加入 `.gitignore`。
- 当前小游戏为了免登录体验，Realtime 房间仍使用公开 Broadcast channel。
- 若后续需要更强的线上防作弊和房间隐私，应升级为 Supabase Auth、private channel，以及 `realtime.messages` 上按房间授权的 RLS 策略。
- 当前 `match_results` 允许公开读取，适合 demo 或公开排行榜。若结果不应公开，需要移除公开 SELECT policy。

## 9. 常用检查命令

```powershell
# Git
git status --short --branch
git log --oneline --decorate -10
git remote -v

# Build
node --check game\public\src\main.js
node --check game\public\src\supabase-game.js
node --check game\scripts\build.mjs
npm.cmd run build --prefix game

# Vercel
& "$env:APPDATA\npm\vercel.cmd" whoami
& "$env:APPDATA\npm\vercel.cmd" inspect badminton-game-sandy.vercel.app --scope adrian-soos-projects
& "$env:APPDATA\npm\vercel.cmd" logs badminton-game-sandy.vercel.app --scope adrian-soos-projects --limit 20
```

## 10. 下次可以直接交给 Codex 的提示词

```text
请按照 docs/CLOUD_RELEASE_RUNBOOK.md 对羽毛球小游戏执行一次发布：
1. 检查本次改动和 Git 状态；
2. 运行语法检查和 npm 构建；
3. 如果有 Supabase 迁移，应用到 badminton 项目并运行 advisor 和真实 REST 验证；
4. 提交并推送 main；
5. 创建版本标签；
6. 部署 Vercel 生产环境；
7. 检查线上页面、env.js 和日志；
8. 汇总提交号、标签、GitHub 地址和 Vercel 地址。
```

## 11. 官方参考

- Supabase API keys：<https://supabase.com/docs/guides/getting-started/api-keys>
- Supabase RLS：<https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Realtime Authorization：<https://supabase.com/docs/guides/realtime/authorization>
- Supabase MCP：<https://supabase.com/docs/guides/getting-started/mcp>
- Vercel CLI 部署：<https://vercel.com/docs/projects/deploy-from-cli>
- Vercel `vercel.json`：<https://vercel.com/docs/project-configuration/vercel-json>
- GitHub 推送提交：<https://docs.github.com/en/get-started/using-git/pushing-commits-to-a-remote-repository>
- GitHub 标签：<https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases>
