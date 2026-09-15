# Six Things · 六件事

**English** | [简体中文](README.zh-CN.md)

A small daily task planner built around the **Ivy Lee method**: plan ahead, prioritize a short list, work through it in order, and carry unfinished tasks forward.

[Try the Web/PWA demo](https://tacksmith.github.io/sixthings/) · [Download a release](https://github.com/tacksmith/sixthings/releases) · [Deployment guide (中文)](docs/部署与发布.md)

The demo stores your tasks in your browser. It has no shared backend; multi-device sync requires your own Supabase configuration. The interface supports **Simplified Chinese** (default) and **English**.

## The method

Follow this four-step routine:

1. Before ending your day, choose up to six important tasks for tomorrow.
2. Rank them by importance, placing the most important first.
3. Work on the first task before moving to the next.
4. Carry unfinished tasks forward and review their priority again.

The purpose is to make priorities concrete and reduce task switching. Six Things lets you choose a daily limit of **3–6**. An inbox and an optional skip setting help with interruptions; the method is a working habit, not a promise of specific results.

## What you can do

| Feature | Behavior |
|---|---|
| Daily planning | Prioritized tasks, sequential focus, optional skipping, and unfinished-task carryover |
| Inbox and history | Capture interruptions separately; review past tasks in the calendar |
| Local backups | Browser localStorage plus IndexedDB backup; JSON import/export in Settings |
| Optional sync | Pair devices with a code or QR code; offline edits retry after reconnection |
| Interface language | Simplified Chinese by default; English available; switch in Settings, saved on this device only |
| Web/PWA | Use the same website on desktop, Android, iPhone, and tablets; install to the home screen where supported |

Only the **Web/PWA** edition is maintained. No Android SDK or Xcode is required. Offline use needs an initial successful online load. Reminders are checked while the page is running; background Web Push is not implemented. Export backups before clearing browser data or moving to another website address.

## Interface language

Open **Settings** and use the **Language · 语言** selector at the top. Your choice applies to the interface, calendar, reminders, and messages. It stays on this device and is preserved through reloads, offline use, task imports, resets, and sync updates. Changing language does not change your tasks.

## Run locally

Use **Node.js 22+**. No npm dependency installation is needed.

```sh
git clone https://github.com/tacksmith/sixthings.git
cd sixthings
npm run serve
```

Open `http://localhost:8080`. Leave sync configuration empty for local-only use.

## Deploy your own website

### GitHub Pages

1. Fork this repository and enable Actions in your fork.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Under **Actions → Deploy Web/PWA demo**, select **Run workflow** on `main`.
4. Once deployment succeeds, open the website URL shown in that workflow.

Later pushes to `main` run checks, build the site, and deploy automatically. The included workflow explicitly leaves `SIXTHINGS_SUPABASE_URL` and `SIXTHINGS_SUPABASE_ANON_KEY` empty. It publishes a local-only demo, including when repository variables have been configured. Root domains and `/repository-name/` paths are supported.

### Other static hosts

```sh
npm run check
npm test
npm run build
```

Upload **only `dist/`** to an HTTPS static host. `npm run build` reads optional configuration from environment variables or ignored `.env.local`; do not upload the repository root. See the [deployment guide](docs/部署与发布.md) for configuration and upgrade details.

### Copy this prompt to an AI Agent

```text
Repository: https://github.com/tacksmith/sixthings
Clone or open this repository before following the instructions below.
Deploy this repository as a local-only Web/PWA on my GitHub Pages.
Read AGENTS.md, README.md, .github/workflows/pages.yml, and the deployment guide first.
Verify the authenticated GitHub account, target repository, branch, and Pages permissions.
Run npm run check and npm test; after both pass, build with SIXTHINGS_SUPABASE_URL and
SIXTHINGS_SUPABASE_ANON_KEY explicitly empty. Publish only dist/ using the included workflow.
Keep the PWA working under the repository subpath. Verify the live URL, manifest,
asset loading, task persistence after reload, and offline reopening in a fresh test profile.
Do not change repository visibility or connect an existing production database.
Report the account/repository, working URL, and any checks you could not complete.
```

## Enable multi-device sync (optional)

1. Create your own Supabase project and enable **anonymous sign-ins**.
2. Run [supabase-schema-v3.sql](docs/supabase-schema-v3.sql). Back up an existing installation before upgrading; follow the [migration order](docs/部署与发布.md#同步-v3-升级顺序).
3. Copy `.env.example` to `.env.local` and set your project URL and **publishable/anon key**. Never use a secret or service-role key in a browser build.
4. Restart the local server, or rebuild and deploy. For GitHub Pages, replace the workflow's two empty values with your own GitHub Actions configuration, for example `${{ vars.SIXTHINGS_SUPABASE_URL }}` and `${{ vars.SIXTHINGS_SUPABASE_ANON_KEY }}`.
5. Open **设置 (Settings)** on one device to create an invitation. Enter or scan it on another; generate a new invitation for each additional device.

Codes have 12 characters, expire after 10 minutes, and can be used once. Pairing joins a shared room. Realtime notifications are backed by polling; pending changes and sync progress persist locally for retries.

Concurrent edits to different tasks or fields are merged where possible. Deletion wins over an offline edit to the same task; conflicting edits to the same field use the value committed later. **Resetting all data also clears shared content.** Notification permission and delivery records stay local to each device. See [sync design and validation (中文)](docs/同步方案与验证.md).

### Copy this prompt to an AI Agent

```text
Repository: https://github.com/tacksmith/sixthings
Clone or open this repository before following the instructions below.
Enable and verify multi-device sync for my Six Things deployment.
Read AGENTS.md, the deployment guide, sync design, and v3 SQL migration first.
Confirm which Supabase project I intend to use; preserve existing data and prepare
backups before applying a migration. Enable anonymous sign-ins and configure only
public browser credentials through ignored .env.local or deployment variables.
Never commit private credentials or reuse the upstream maintainer's backend.
Run npm run check, npm test, and npm run test:db when PostgreSQL tools are available.
Use two isolated browser profiles with synthetic data to verify pairing, independent
edits, deletion, offline editing plus reload/reconnection, and expired/reused invitations.
Use a fresh invitation for a third profile. Distinguish local test results from live
backend verification; report unresolved failures instead of declaring sync fixed.
```

## Development

| Command | Purpose |
|---|---|
| `npm run serve` | Local web server on port 8080 |
| `npm run check` | JavaScript syntax, asset references, and release versions |
| `npm test` | Node regressions for sync, application interfaces, and the PWA |
| `npm run test:db` | Isolated temporary PostgreSQL transaction/permission tests; requires `initdb`, `pg_ctl`, and `psql` |
| `npm run build` | Clean and regenerate the deployable `dist/` directory |

`test:db` does not connect to your existing database. There is no numerical coverage target. See [AGENTS.md](AGENTS.md) for contribution conventions.

| Path | Purpose |
|---|---|
| `www/app.js`, `www/styles.css` | Task behavior, browser storage, and interface |
| `www/i18n.js` | Explicit zh/en interface dictionary and local language preference |
| `www/sync-engine.js`, `www/sync.js` | Merge/retry engine and Supabase connection |
| `www/sw.js`, `www/manifest.webmanifest` | Offline caching and PWA installation |
| `tests/`, `scripts/` | Regression tests, local server, and build tools |
| `docs/`, `www/vendor/` | Deployment/SQL documentation and bundled browser libraries/licenses |

### Copy this prompt to an AI Agent

```text
Repository: https://github.com/tacksmith/sixthings
Clone or open this repository before following the instructions below.
Implement [describe the feature or bug] in this repository.
Read AGENTS.md and both READMEs; inspect the relevant implementation and tests first.
Keep the project a standalone Web/PWA. For sync changes, preserve offline retries
and conflict handling, and verify the behavior using isolated test data.
Run the relevant checks; keep app, HTML, and service-worker release versions aligned
when shipping changed assets. Update both READMEs if usage or deployment changes.
Report the behavior changed, verification performed, and any remaining limitation.
```

## License

Project code is licensed under [MIT](LICENSE), including permission for commercial use, subject to retaining the copyright and license notice. Bundled libraries retain their own licenses; see [third-party notices](www/vendor/README.md).
