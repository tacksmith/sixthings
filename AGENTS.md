# Repository Guidelines

## Project Structure & Module Organization

Six Things is a standalone Web/PWA Ivy Lee task planner. `www/app.js` owns task behavior, rendering, local storage, and IndexedDB backups. `www/sync-engine.js` contains the UI-independent three-way merge and durable retry engine; `www/sync.js` connects it to Supabase authentication, invitations, and room RPCs. Assets live in `www/icons/` and `www/vendor/`. `tests/` contains Node regressions and PostgreSQL integration tests. `scripts/` contains local serving, build, and validation tools; `docs/` contains deployment instructions and SQL migrations.

## Build, Test, and Development Commands

Use Node.js 22 or newer. The application has no npm runtime dependencies.

- `npm run serve`: run the local web server at `http://localhost:8080`.
- `npm run check`: validate JavaScript syntax, asset references, and version consistency.
- `npm test`: run synchronization, application-interface, and service-worker regressions.
- `npm run test:db`: create an isolated temporary PostgreSQL cluster and test real transactions and permissions; requires `initdb`, `pg_ctl`, and `psql`.
- `npm run build`: clean and generate `dist/`, injecting optional public sync configuration.

## Coding Style & Naming Conventions

Use two-space JavaScript indentation, semicolons, double-quoted strings, `camelCase` functions/variables, and uppercase constants. Match neighboring CSS and preserve Chinese UI terminology. No formatter or linter is configured. Keep merging independent of DOM and network APIs.

## Testing Guidelines

Name ordinary Node tests `tests/*.test.cjs`; database scenarios live in `tests/database.integration.cjs`. Cover behavior across devices: deletion, independent concurrent edits, conflict retries, reload persistence, pairing, and authorization. Never use existing user data for browser fixtures. Local test adapters must not be deployed. No numerical coverage threshold is configured.

## Commit & Pull Request Guidelines

Follow concise Chinese commit subjects such as `修复…` or `发布 YYYYMMDD<suffix>: …`. Explain behavior changes, link relevant issues, and report checks performed; include screenshots for UI changes. Identify schema migrations, compatibility limits, and deployment order.

## Configuration & Releases

Copy `.env.example` to ignored `.env.local` for optional sync. Only publishable/anon credentials may enter browser builds. Keep `local-backups/`, signing keys, and deployment credentials out of Git. Deploy only `dist/`. Align `APP_VERSION`, HTML asset versions, and service-worker caches. Apply v3 database migrations before publishing the matching client; follow `docs/部署与发布.md`.
