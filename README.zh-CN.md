# 六件事 · Six Things

[English](README.md) | **简体中文**

基于 **Ivy Lee 法（六件事法）** 的极简每日清单：提前规划、按重要程度排序、逐项执行、未完成顺延。

[体验 Web/PWA 演示站](https://tacksmith.github.io/sixthings/) · [下载发行版](https://github.com/tacksmith/sixthings/releases) · [部署指南](docs/部署与发布.md)

演示站将任务保存在你自己的浏览器中，没有共享后端；多设备同步需要配置自己的 Supabase。目前应用界面为**简体中文**，两份 README 介绍的是同一款应用。

## 方法：每天只关注最重要的几件事

按以下四步安排每天的任务：

1. 每天结束前，写下明天最重要的事，最多六件。
2. 按重要程度排序，把最重要的放在第一位。
3. 先做第一件，再依次处理后面的任务。
4. 未完成的顺延，并重新评估优先级。

重点是明确取舍、减少任务切换。应用支持将每日上限设为 **3–6 件**，并提供收件箱和「允许跳过」来应对突发事项。这是一种工作习惯，不是对具体成果的保证。

## 功能与使用范围

| 功能 | 说明 |
|---|---|
| 每日规划 | 按优先级执行、可选跳过、未完成任务顺延 |
| 收件箱与历史 | 临时事项单独记录，日历中回看历史任务 |
| 本机备份 | localStorage 与 IndexedDB 备份，设置中可导入、导出 JSON |
| 可选多端同步 | 配对码或扫码加入，离线修改在恢复联网后重试 |
| Web/PWA | 电脑、安卓、iPhone、平板打开同一个网站；支持时可添加到主屏幕 |

项目只维护 **Web/PWA**，无需 Android SDK 或 Xcode。首次成功联网加载后可离线使用。提醒仅在页面运行时检查，不包含关闭页面后的 Web Push。清除浏览器数据或更换网站地址前，请先导出备份。

## 本地运行

需要 **Node.js 22+**，无需安装 npm 依赖。

```sh
git clone https://github.com/tacksmith/sixthings.git
cd sixthings
npm run serve
```

打开 `http://localhost:8080`。保持同步配置为空，即可单机使用。

## 部署自己的网站

### GitHub Pages

1. Fork 本仓库，并在自己的仓库中启用 Actions。
2. 打开 **Settings → Pages → Build and deployment**，选择 **GitHub Actions**。
3. 打开 **Actions → Deploy Web/PWA demo**，在 `main` 分支点击 **Run workflow**。
4. 部署成功后，打开该工作流显示的网站地址。

此后推送到 `main` 会自动检查、构建并部署。自带工作流明确将两个 Supabase 变量设为空，默认发布单机演示版；仅添加仓库变量不会自动开启同步。网站支持域名根目录和 `/仓库名/` 子路径。

### 其他静态托管平台

```sh
npm run check
npm test
npm run build
```

只将 **`dist/`** 上传到支持 HTTPS 的静态托管平台。构建会读取环境变量或被 Git 忽略的 `.env.local` 中的可选配置；不要上传仓库根目录。配置和升级顺序见[部署指南](docs/部署与发布.md)。

### 给 AI Agent 的部署提示词

```text
项目完整链接：https://github.com/tacksmith/sixthings
请先克隆或打开此仓库，再执行下面的任务。
请把本仓库以单机 Web/PWA 形式部署到我的 GitHub Pages。
先阅读 AGENTS.md、README.zh-CN.md、.github/workflows/pages.yml 和部署指南。
核对已登录的 GitHub 账号、目标仓库、分支及 Pages 权限。
执行检查和测试；构建时明确将 SIXTHINGS_SUPABASE_URL 与
SIXTHINGS_SUPABASE_ANON_KEY 都设为空，使用已有工作流，只发布 dist/。
保持仓库子路径下的 PWA 可用，并在独立测试环境验证线上地址、manifest、
静态资源、任务刷新后保留以及离线重新打开。
不要改变仓库可见性或连接已有生产数据库。
最后简要报告账号与仓库、可用网址，以及未能完成的检查。
```

## 开启多设备同步（可选）

1. 创建自己的 Supabase 项目，启用**匿名登录**。
2. 执行 [v3 数据库脚本](docs/supabase-schema-v3.sql)。已有项目先备份，并遵循[迁移顺序](docs/部署与发布.md#同步-v3-升级顺序)。
3. 复制 `.env.example` 为 `.env.local`，填入 Project URL 和 **publishable/anon key**。浏览器构建不能使用 secret 或 service-role key。
4. 重启本地服务，或重新构建部署。GitHub Pages 还需把工作流中两个空值替换为自己的 Actions 配置，例如 `${{ vars.SIXTHINGS_SUPABASE_URL }}` 和 `${{ vars.SIXTHINGS_SUPABASE_ANON_KEY }}`。
5. 一台设备打开「设置」生成配对码，其他设备输入或扫码加入；每增加一台设备，生成一个新码。

配对码为 12 位，10 分钟有效，仅可使用一次。设备配对后加入共享空间；实时通知不可用时会轮询。待上传修改和同步进度保存在本机，恢复联网后继续重试。

不同任务、不同字段的修改尽量合并；删除优先于对同一任务的离线编辑；同一字段冲突时采用后成功提交的值。**「清空所有数据」也会清空共享内容。** 通知许可和通知记录仅属于本机。设计与验证范围见[同步方案](docs/同步方案与验证.md)。

### 给 AI Agent 的同步提示词

```text
项目完整链接：https://github.com/tacksmith/sixthings
请先克隆或打开此仓库，再执行下面的任务。
请为我的 Six Things 部署配置并验证多设备同步。
先阅读 AGENTS.md、部署指南、同步方案和 v3 SQL 脚本。
确认我要使用的 Supabase 项目；迁移前保留现有数据并准备备份。
启用匿名登录，只通过被忽略的 .env.local 或部署变量配置浏览器公开凭据。
不要提交私密凭据，也不要复用原作者的后端。
运行 npm run check、npm test；PostgreSQL 工具可用时运行 npm run test:db。
使用两个独立浏览器环境和测试数据，验证配对、分别编辑、删除、离线修改后
刷新与重连、过期及重复使用的邀请；第三台设备使用新邀请测试。
区分本地测试与真实后端验证结果，有失败如实报告，不能仅凭前端上线宣布同步已解决。
```

## 开发与贡献

| 命令 | 用途 |
|---|---|
| `npm run serve` | 在 8080 端口启动本地服务 |
| `npm run check` | 检查 JavaScript 语法、资源引用和版本一致性 |
| `npm test` | 同步、应用接口及 PWA 的 Node 回归测试 |
| `npm run test:db` | 临时 PostgreSQL 事务与权限测试；需 `initdb`、`pg_ctl`、`psql` |
| `npm run build` | 清理并重新生成可部署的 `dist/` |

`test:db` 不连接现有数据库。项目未设置数值覆盖率门槛，贡献约定见 [AGENTS.md](AGENTS.md)。

| 路径 | 用途 |
|---|---|
| `www/app.js`、`www/styles.css` | 任务行为、本机存储与界面 |
| `www/sync-engine.js`、`www/sync.js` | 合并重试引擎与 Supabase 连接 |
| `www/sw.js`、`www/manifest.webmanifest` | 离线缓存与 PWA 安装 |
| `tests/`、`scripts/` | 回归测试、本地服务、构建工具 |
| `docs/`、`www/vendor/` | 部署与 SQL 文档、浏览器第三方库及许可证 |

### 给 AI Agent 的开发提示词

```text
项目完整链接：https://github.com/tacksmith/sixthings
请先克隆或打开此仓库，再执行下面的任务。
请在本仓库实现：[描述功能或问题]。
先阅读 AGENTS.md 和中英文 README，检查相关实现及已有测试。
保持独立 Web/PWA 架构；涉及同步时保留离线重试和冲突处理，并使用隔离测试数据验证。
执行相关检查；发布修改后的资源时，同步更新应用、HTML 和 Service Worker 版本。
用法或部署方式有变化时，同时更新两份 README。
最后简述行为变化、验证结果和剩余限制。
```

## 许可证

本项目自有代码采用 [MIT 许可证](LICENSE)，允许使用、修改、商用和再分发，须保留版权与许可声明。第三方库继续适用各自许可证，见[第三方声明](www/vendor/README.md)。
