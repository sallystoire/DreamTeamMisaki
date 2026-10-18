---
name: Railpack toolchain verification
description: Diagnose frozen-lockfile errors caused by the builder selecting a different pnpm version.
---

Do not assume a frozen-lockfile configuration mismatch means the lockfile is stale. Reproduce with the package-manager version selected by the builder before changing the lockfile or weakening frozen installation.

**Why:** A clean copy reproduced the exact overrides mismatch under pnpm 9 while pnpm 10 installed the same files successfully. Setting only `packageManager` had not resolved the user's Railway build.

**How to apply:** Pin pnpm at the Railpack toolchain layer as well as in the project metadata. Check the actual Railpack-generated plan for the resolved version and inherited installation commands, then run installation and the configured build in a clean copy. Railway's automatic install precedes its custom build command; a repair placed only in that build command runs too late.
