# 仓库贡献指南

[English](AGENTS.md) | **简体中文**

## 项目结构与模块

Six Things 是独立的 Web/PWA 六件事法任务清单。`www/app.js` 负责任务行为、界面渲染、本地存储和 IndexedDB 备份；`www/sync-engine.js` 提供独立于界面的三方合并与持久化重试；`www/sync.js` 连接 Supabase 身份验证、邀请和房间 RPC。资源位于 `www/icons/` 与 `www/vendor/`；`tests/` 包含 Node 回归及 PostgreSQL 集成测试；`scripts/` 提供本地服务、构建和检查；`docs/` 包含部署指南及 SQL 迁移。

## 构建、测试与开发命令

使用 Node.js 22 或更新版本，项目没有 npm 运行时依赖。

- `npm run serve`：在 `http://localhost:8080` 启动本地服务。
- `npm run check`：检查 JavaScript 语法、资源引用与版本一致性。
- `npm test`：运行同步、应用接口和 Service Worker 回归测试。
- `npm run test:db`：创建隔离的临时 PostgreSQL 集群，测试实际事务和权限；需要 `initdb`、`pg_ctl`、`psql`。
- `npm run build`：清理并生成 `dist/`，注入可选的公开同步配置。

## 编码风格与命名

JavaScript 使用两空格缩进、分号、双引号、`camelCase` 函数及变量名、大写常量名。CSS 与相邻代码保持一致，保留中文界面术语。项目没有配置格式化或 lint 工具。合并逻辑应独立于 DOM 和网络接口。

## 测试规范

普通 Node 测试使用 `tests/*.test.cjs`，数据库场景位于 `tests/database.integration.cjs`。覆盖跨设备删除、独立并发修改、冲突重试、刷新后保留、配对及授权。浏览器测试不能使用已有用户数据，本地测试适配器不能部署。没有数值覆盖率要求。

## 提交与 Pull Request

提交标题使用简洁中文，例如 `修复…` 或 `发布 YYYYMMDD<后缀>: …`。说明行为变化，关联相关 issue，报告检查结果；界面修改附截图。注明数据库迁移、兼容性限制与部署顺序。

## 配置与发布

可选同步通过将 `.env.example` 复制为被忽略的 `.env.local` 配置。浏览器构建只能包含 publishable/anon 凭据。`local-backups/`、签名密钥及部署凭据不得加入 Git。只部署 `dist/`。保持 `APP_VERSION`、HTML 资源版本和 Service Worker 缓存一致。在发布对应客户端前执行 v3 数据库迁移，遵循 `docs/部署与发布.md`。
