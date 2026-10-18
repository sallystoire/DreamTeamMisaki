---
name: Browser test mutation isolation
description: Prevent browser mutation tests from changing existing development data.
---

Only mutate records created specifically for the test. Do not use an existing challenge, team or account as a write target, even when a request stub is intended to intercept the operation.

**Why:** A page-level interceptor failed to catch a reward save during browser testing, temporarily changing an existing challenge. The original value was restored, but prevention must not depend on a stub matching correctly.

**How to apply:** Give testers isolated fixture IDs. If a real record must be displayed, block non-fixture mutation targets at the browser-context request boundary before interacting, verify the interception is active, and prefer read-only inspection over clicking Save on an existing record.
