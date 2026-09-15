# Sync Design and Validation

**English** | [简体中文](同步方案与验证.md)

## Merging and retries

Sync uses server version checks, three-way merge, and persistent pending state to support offline edits and retries after reconnection.

Three-way merge compares the last acknowledged state, the current local state, and the latest server state. Only fields changed locally represent local write intent; stale content must not repeatedly overwrite remote changes.

`SixSync.Engine` persists the baseline, current state, and unacknowledged write ID. A write locks the room within a database transaction and checks an incrementing version. On conflict, it returns the latest state for a retry. The server retains successful write IDs so retries after a lost response do not overwrite newer changes with an old request.

Deletion wins over concurrent edits to the same task. Changes to different tasks or fields merge; conflicts on the same field use the later successful commit. An explicit reset has a separate marker to clear old content that other devices have not yet uploaded. Notification permissions do not sync across devices.

## Pairing and permissions

Room membership is independent of invitation records, so a third or later device does not replace existing members. Invitations use random 12-character hexadecimal codes. The server checks expiration, single use, and anonymous identity. The initiating device starts syncing immediately after creating a room; joining sync must not depend on a particular Realtime event.

Browsers can read only rooms they belong to. They cannot modify tables directly or enumerate invitations. Writes and joins use identity-checked RPCs. Realtime speeds up updates; polling and online/foreground events provide fallback checks.

## Validation after deployment

- `npm test`: the actual merge module and application interfaces, covering deletion, settings, the one-time chance state, explicit resets, concurrent additions, same-field conflicts, edits during upload, lost responses, retries after reopening, isolation from old-room responses, identity recovery, and error feedback.
- `npm run test:db`: actual PostgreSQL, covering three members, expired/used invitations, competing invitation consumption, cross-user read/write isolation, atomic version checks, idempotent retries, and old-room migration. A dedicated test database is created and destroyed for each run.
- Browser validation: use three isolated test environments to check pairing, propagation of additions and deletions, settings sync, offline reopening, and reconnection through the interface. Test each target browser separately; local Chromium tests do not replace testing on a physical iPhone or Safari.

Local tests do not replace validation of your actual deployment. Database migrations and website publishing must each be completed. Follow the order in [Deployment and Releases](deployment.md).

## References

[PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html), [Supabase database functions](https://supabase.com/docs/guides/database/functions), and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
