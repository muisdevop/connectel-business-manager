# Implementation Plan — ConnecTEL RBAC Web App

Spec: `docs/superpowers/specs/2026-11-13-connectel-rbac-design.md`. Execute autonomously (owner asleep, go-ahead given).

## Phases
1. **Scaffold**: copy React starter into the project root (keep the source workbook outside the repo), rename gitignore, `git init`, `npm ci`.
2. **Shared backend core** (`functions/`): reuse password-example `http/sessions/passwords/limiter`;
   add `rbac.mjs` (matrix), `calc.mjs` (accounting), `domain.mjs` (field defs/enums/validators), `validate.mjs`.
3. **Schema + seed**: `schema.sql` (15 tables); `functions/seed.mjs` (sheet rows + 4 role accounts, Excel→ISO).
4. **Backend routes** (`functions/router.mjs` + `registers/reports/users.mjs`): auth, RBAC guard, generic CRUD,
   reports, user admin, meta. `functions/index.ts` Deno entry.
5. **Local dev + tests**: `dev/fake-db.mjs`, `dev/server.mjs` (Node, seed), `test/*.test.mjs` (node --test).
6. **Frontend** (`src/`): api client, types, auth context, layout/nav, login, dashboard, registers, masters,
   reports, users. Role-aware from `/api/me`. Responsive 390px.
7. **Verify**: unit+API tests, `npm run build`, run dev+function servers, browser golden path + RBAC denials
   at desktop & 390px. Fix until green. Evidence-based.
8. **Deliver**: sites-hosting — ensure_backend(function_backend), apply schema migration, prepare_site
   (webDirectory=dist, functionDirectory=functions, databaseAccess=read_write, spa), publish, verify deployed
   login+CRUD+RBAC. Report live URL + credentials, or precise blocker.

## Guardrails
- Keep DB ops to proven subset; aggregate in JS. No blind write retries. Server-side RBAC on every mutation.
- Don't claim success without running/inspecting. Deno-specific checks pending until delivery.
- Commit progress to git per phase.