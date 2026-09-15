# Local Web/PWA Testing

**English** | [简体中文](本地测试环境.md)

## Routine checks

```sh
npm run check
npm test
npm run serve
```

Open `http://localhost:8080` and check planning, today's task execution, history, settings, and backup export. Switch between 简体中文 and English at the top of Settings. Confirm that the interface, dates, calendar, reminders, messages, and pairing instructions change while task content stays the same, and that the language persists after reloading. Development requires only Node.js 22+; there are no npm runtime dependencies.

## Database regressions

Install PostgreSQL tools with `initdb`, `pg_ctl`, and `psql` on PATH, then run:

```sh
npm run test:db
```

The script creates an isolated database in the system temporary directory and uses a dedicated Unix socket. It simulates Supabase's `auth.uid()`, runs the actual v3 SQL and transactions, then shuts down and removes the temporary database. It does not use production URLs.

## Isolated browser tests

`tests/support/browser-server.cjs` is a test-only adapter: pages use the real Supabase browser SDK, authentication is simulated locally, and RPC calls execute against local PostgreSQL. Set `SIXTHINGS_TEST_PG_DIR` explicitly. Use `SIXTHINGS_TEST_PG_PORT` and `SIXTHINGS_TEST_PORTS` to choose isolated ports. Never deploy this adapter to a live site.

Use three different local ports to simulate three devices. Before starting, confirm that all three origins have no existing task lists and that each `/config.js` URL points to its current local origin.

1. A creates a pairing code and B joins; A creates a new code and C joins.
2. A adds and deletes tasks and changes settings; B and C should match.
3. Disconnect B and edit tasks. Reopen the page offline and confirm the changes remain; reconnect and verify that A and C receive them.
4. Edit different tasks, then different fields of the same task, concurrently on two devices; check that their state converges.
5. Check mobile widths, offline loading, and cache updates for a new version.

The project maintains only a Web/PWA; development and testing do not require Android SDK or Xcode.
