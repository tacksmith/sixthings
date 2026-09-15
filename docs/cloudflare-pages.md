# Cloudflare Pages Deployment

**English** | [简体中文](Cloudflare-Pages部署.md)

Use the shared Web/PWA build:

```sh
npm run check
npm test
npm run build
npx wrangler pages deploy dist --project-name <your-project-name>
```

For Git integration, set the build command to `npm run build` and the output directory to `dist`.

See [Deployment and Releases](deployment.md) for sync environment variables, the v3 database upgrade order, and caching requirements.

Do not upload the repository root or local backups. Keep Cloudflare account credentials in local login sessions or CI secrets.

Reference: [Cloudflare Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/).
