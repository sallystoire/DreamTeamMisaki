---
name: Railpack toolchain verification
description: Diagnose frozen-lockfile errors caused by the builder selecting a different pnpm version.
---

Do not assume a frozen-lockfile configuration mismatch means the lockfile is stale. Reproduce with the package-manager version selected by the builder before changing the lockfile or weakening frozen installation.

**Why:** A clean copy reproduced the exact overrides mismatch under pnpm 9 while pnpm 10 installed the same files successfully. A later Railway log still selected pnpm from the lockfile fallback, omitted the custom version diagnostic, and used outdated frontend-only commands despite the current files being present on GitHub. Repository contents alone do not establish what source/configuration a deployment used.

**How to apply:** Pin pnpm at the Railpack toolchain layer as well as in the project metadata. Check the actual Railpack-generated plan for the resolved version and inherited installation commands, then run installation and the configured build in a clean copy. Railway's automatic install precedes its custom build command; a repair placed only in that build command runs too late.

If the external log differs from the tested plan, inspect the service repository, branch, root directory, selected configuration files and deployed source before changing dependencies again. A pnpm version reported as a lockfile fallback, together with missing project-specific install commands, is evidence that the intended configuration was not applied.
