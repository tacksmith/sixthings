# 六件事 · Six Things

[English](README.md) | **简体中文**

基于 **Ivy Lee 法（六件事法）** 的极简每日清单：提前规划、按重要程度排序、逐项执行、未完成顺延。

[体验 Web/PWA 演示站](https://tacksmith.github.io/sixthings/) · [下载发行版](https://github.com/tacksmith/sixthings/releases) · [部署指南](docs/部署与发布.md)

演示站将任务保存在你自己的浏览器中，没有共享后端；多设备同步需要配置自己的 Supabase。应用界面支持**简体中文**（默认）与**英文**。

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
| 界面语言 | 默认简体中文，可选英文；在设置顶部切换，仅保存在本机 |
| Web/PWA | 电脑、安卓、iPhone、平板打开同一个网站；支持时可添加到主屏幕 |

项目只维护 **Web/PWA**，无需 Android SDK 或 Xcode。首次成功联网加载后可离线使用。提醒仅在页面运行时检查，不包含关闭页面后的 Web Push。清除浏览器数据或更换网站地址前，请先导出备份。

## 界面语言

打开「设置」，使用顶部的「语言 · Language」选择器切换语言。界面、日历、提醒和提示信息会随之切换。选择仅保存在本机，刷新、离线使用、导入任务、重置及同步更新后仍会保留；切换语言不会修改任务。

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

此后推送到 `main` 会自动检查、构建并部署。自带工作流明确将 `SIXTHINGS_SUPABASE_URL` 与 `SIXTHINGS_SUPABASE_ANON_KEY` 设为空，默认发布单机演示版；仅添加仓库变量不会自动开启同步。网站支持域名根目录和 `/仓库名/` 子路径。

### 其他静态托管平台

```sh
npm run check
npm test
npm run build
```

只将 **`dist/`** 上传到支持 HTTPS 的静态托管平台。构建会读取环境变量或被 Git 忽略的 `.env.local` 中的可选配置；不要上传仓库根目录。配置和升级顺序见[部署指南](docs/部署与发布.md)。

### 给 AI Agent 的部署提示词

```text
项目：https://github.com/tacksmith/sixthings
请将它部署到我的 GitHub Pages，作为无需后端的 Web/PWA。
验证在线访问、任务保存和离线使用，最后给我网站地址和验证结果。
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
项目：https://github.com/tacksmith/sixthings
请用我自己的 Supabase 项目配置多设备同步，保留已有数据。
验证设备配对、跨设备修改和离线重连后的同步，简述结果及未解决的问题。
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
| `www/i18n.js` | 中英文界面词典与本机语言偏好 |
| `www/sync-engine.js`、`www/sync.js` | 合并重试引擎与 Supabase 连接 |
| `www/sw.js`、`www/manifest.webmanifest` | 离线缓存与 PWA 安装 |
| `tests/`、`scripts/` | 回归测试、本地服务、构建工具 |
| `docs/`、`www/vendor/` | 部署与 SQL 文档、浏览器第三方库及许可证 |

### 给 AI Agent 的开发提示词

```text
项目：https://github.com/tacksmith/sixthings
请实现：[描述功能或问题]，保持 Web/PWA 形式。
完成必要测试并更新相关文档，简述改动和验证结果。
```

## 许可证

本项目自有代码采用 [MIT 许可证](LICENSE)，允许使用、修改、商用和再分发，须保留版权与许可声明。第三方库继续适用各自许可证，见[第三方声明](www/vendor/README.md)。
