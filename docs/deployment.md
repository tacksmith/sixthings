# Web/PWA Deployment and Releases

**English** | [简体中文](部署与发布.md)

The project builds a single static website into `dist/`. Do not deploy the repository root or upload `.env.local` or `local-backups/`.

## GitHub release packages

The `sixthings-web-pwa-<version>.zip` asset in a GitHub Release contains only the static website, the project's MIT license, and third-party licenses. It excludes native projects, local credentials, and test adapters. Generic release packages have empty backend configuration and work locally by default. To enable sync, configure your own Supabase project and rebuild in the order below. Use `SHA256SUMS.txt` to verify downloads.

Uploading source code or release packages does not run database migrations. The repository can remain private while website deployment is managed separately.

## Sync v3 upgrade order

1. Export a task backup from the old version's Settings and retain existing backend backups.
2. Run `docs/supabase-schema-v3.sql` in the Supabase SQL Editor; keep anonymous sign-ins enabled.
3. Set the build variables `SIXTHINGS_SUPABASE_URL` and `SIXTHINGS_SUPABASE_ANON_KEY`. Locally, you can use the Git-ignored `.env.local` file.
4. Run `npm run check`, `npm test`, `npm run test:db`, and `npm run build`.
5. Deploy `dist/` and reload all paired devices. Verify additions, deletions, settings, and sync after reopening offline.

The script creates new room, member, invitation, and idempotent-write records without deleting old tables. When members sign in with the new client, their existing v2 room migrates to the same v3 room using their existing membership. Once migrated, the room rejects writes from old clients; those clients must reload to avoid divergent copies. Deletions that the old client never uploaded and for which it recorded no baseline cannot be inferred automatically. Review the task list after upgrading.

If you see “Sync service needs an upgrade,” run the database script first. Publishing the frontend does not upgrade the database.

## Hosting settings

| Platform | Settings |
|---|---|
| Cloudflare Pages | Build command: `npm run build`; output directory: `dist`; configure the two variables above in the build environment |
| Vercel | The repository's `vercel.json` specifies the build command and `dist`; add variables in project settings |
| GitHub Pages | Select GitHub Actions in Settings → Pages; use the included workflow to publish `dist/` |
| Your own static server | Upload the contents of `dist/` to the root path of an HTTPS site |

After building, you can also deploy with Cloudflare Wrangler:

```sh
npx wrangler pages deploy dist --project-name <your-project-name>
```

Keep deployment credentials in local login sessions or CI secrets.

The manifest uses relative paths for `start_url`, `id`, and `scope`, supporting both domain roots and GitHub Pages `/repository-name/` paths. The service worker removes only this application's old caches under the current path.

### Automatic GitHub Pages deployment

The repository's demo is at <https://tacksmith.github.io/sixthings/>. After forking, enable Actions, select GitHub Actions in Settings → Pages, and run the `Deploy Web/PWA demo` workflow. Later pushes to `main` automatically run checks, Node tests, the build, and deployment. You can also run the workflow manually when first enabling it.

`.github/workflows/pages.yml` explicitly leaves both Supabase configuration variables empty, so the demo uses only each visitor's local storage. To enable sync in your own instance, configure the database first, replace the empty workflow values with `${{ vars.SIXTHINGS_SUPABASE_URL }}` and `${{ vars.SIXTHINGS_SUPABASE_ANON_KEY }}`, and enter your public browser configuration under Settings → Secrets and variables → Actions → Variables. These values are written into the publicly readable `config.js`; they must not include server secrets.

Copyable AI Agent prompts for deployment and sync are in the [English README](../README.md) and [Chinese README](../README.zh-CN.md).

## A demo site is optional

Maintainers can provide MIT-licensed source code, Web/PWA downloads, and self-deployment instructions without committing to hosting a demo or sync service. A demo can use empty backend configuration and store data in each visitor's browser. Multi-device sync requires a separate Supabase configuration.

GitHub Pages hosts static Web/PWA sites. GitHub Free supports public repositories; private repositories require an eligible plan such as Pro or Team. Project sites default to `https://<account>.github.io/<repository>/`. Pages hosts the website but does not provide the sync database this project needs. See [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Caching and versions

Update `APP_VERSION` in `app.js`, the version parameters in `index.html`, and the cache identifier in `sw.js`. Versioned assets include `styles.css`, `app.js`, `sync.js`, `sync-engine.js`, and `i18n.js`. `npm run check` validates version consistency. After the first complete load, the service worker caches offline assets; page navigation tries the network first.

If you change scripts repeatedly under the same version during development, reload and confirm the new scripts have loaded. Use a new version when releasing. `npm run build` clears and regenerates the output directory.

## Rollback limits

The database script can be run repeatedly. Retained old data helps with auditing, but do not roll back only the frontend to v2 for migrated rooms. Fix v3 or restore from a known backup to avoid overwriting changes made after migration.

References: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json).
