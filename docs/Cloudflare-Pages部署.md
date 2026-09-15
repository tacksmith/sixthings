# Cloudflare Pages 部署

统一使用 Web/PWA 构建：

```sh
npm run check
npm test
npm run build
npx wrangler pages deploy dist --project-name <你的项目名>
```

Git 集成的构建命令为 `npm run build`，输出目录为 `dist`。

同步环境变量、v3 数据库升级顺序及缓存要求见 [部署与发布](部署与发布.md)。

不要上传仓库根目录或本机备份；Cloudflare 账户凭据放在本机登录状态或 CI secrets 中。

参考：[Cloudflare 官方 Direct Upload 指南](https://developers.cloudflare.com/pages/get-started/direct-upload/)。
