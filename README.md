# 六件事 · Six Things

> **一个价值 25,000 美金的待办方法** —— 1918 年 Ivy Lee 靠这套方法让美国钢铁公司老板 Charles Schwab 心甘情愿付了这笔巨款。

**六件事**（Six Things）是一款严格践行 **Ivy Lee 法（六件事法）** 的待办 App：睡前列 6 件最重要的事、按重要排序、白天只做第一件、做不完顺延到明天。没有复杂的项目、标签、分类——只有**最纯粹的执行**。

---

## 🚀 第二部分：软件介绍

### 这是什么

一款极简、严格按 Ivy Lee 法执行的**每日清单 App**。核心循环：

`晚间规划 → 白天按序执行 → 晚间收尾（顺延）→ 坚持记录`

### 核心功能

| 功能 | 说明 |
|---|---|
| **今日清单** | 睡前列 6 件（可调 3~6 件）最重要的事，按重要性排序 |
| **顺序锁定** | 默认第 1 件做完前不能碰别的；可开「允许跳过」 |
| **一键机会** | 今日清单定型后，仍可把新规划作为今日任务执行一次 |
| **收件箱** | 突发事项先扔进收件箱，不打断主清单顺序 |
| **顺延** | 未完成任务一键滚到明天，重新排序 |
| **坚持日历** | 月历展示每天完成状态，点击任意日期查看当天全部历史任务 |
| **多端实时同步** | 电脑/手机实时一致，扫码配对即可，无需导出导入 |
| **数据备份** | localStorage + IndexedDB 双写自动备份，可导出/导入 JSON 文件 |
| **提醒** | 晚间规划提醒 + 早晨「今天的第一件事」推送 |
| **PWA** | 添加到主屏幕即像原生 App，可离线使用 |

### 平台

| 平台 | 形态 | 状态 |
|---|---|---|
| **Web / PWA** | 纯静态，浏览器打开即用 | ✅ 可用 |
| **Android** | Capacitor 打包 APK | ✅ 可用（debug 版） |
| **iOS** | Capacitor 打包 Xcode 工程 | ⚙️ 需 Xcode 编译 |

### 快速开始

#### Web / PWA（最快）
```bash
# 本地预览
python3 -m http.server 8080 --directory www
# 打开 http://localhost:8080
```
部署到任意静态托管（Vercel / Netlify / GitHub Pages）即可公网使用。

#### Android
```bash
npm run android:build          # 构建 debug APK
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```
正式发布请改用 **release 签名**（见《部署与发布指南》）。

#### 多端实时同步（可选）
需要 Supabase 项目，配置一次即可（详见 [docs/部署与发布.md](docs/部署与发布.md)）：
1. Supabase 开启**匿名登录**
2. 运行 [docs/supabase-schema-v2.sql](docs/supabase-schema-v2.sql) 建表 + RLS
3. 将表加入 realtime publication
4. 把 Project URL / publishable key 填入 [www/sync.js](www/sync.js)

### 技术栈

- **Web**：纯 HTML / CSS / 原生 JS，零框架，零运行时依赖
- **持久化**：localStorage（主）+ IndexedDB（自动备份）
- **同步**：Supabase Realtime（WebSocket 实时推送，RLS 行级数据隔离，匿名登录，无需用户注册）
- **配对**：8 位一次性配对码 + 二维码（扫码自动加入）
- **打包**：Capacitor 7（Android / iOS）
- **PWA**：Service Worker 离线缓存

### 目录结构

```
www/                  # Web 应用（单一逻辑源，三端共用）
  app.js              # 核心逻辑
  sync.js             # 多端同步模块
  styles.css          # 样式
  index.html          # 入口
  vendor/             # 本地化第三方库（supabase、qrcode、jsQR）
android/              # Android 工程（Capacitor）
ios/                  # iOS 工程（Capacitor）
docs/                 # 文档（方法、部署、测试环境、Supabase SQL）
scripts/              # 工具脚本
```

### 许可证

保留所有权利（私有项目，未授权请勿分发）。
