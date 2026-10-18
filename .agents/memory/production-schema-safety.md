---
name: Production schema safety
description: Why fresh-database initialization must stay separate from upgrades to existing production data.
---

Fresh database initialization may create the application's tables atomically, but startup must not force-push schema changes or reset an existing partial database.

**Why:** An uninitialized external Railway database caused background voice tracking to terminate the server after it had appeared healthy. Discord identities, memberships and weekly activity must be preserved; an explicit migration intervention is preferable to automatically modifying an unknown existing schema.

**How to apply:** Validate schema readiness before connecting the bot. Treat an incomplete existing database as a reviewed migration, not as a fresh installation. Test initialization and failures in isolated schemas, never against existing members or challenges. Handle asynchronous bot errors explicitly so they cannot terminate the HTTP process.
