# Qoder Sites React starter

A React, TypeScript, Vite and Tailwind frontend with a bundled Shadcn component catalog. Vite produces static files in `dist/`. Server behavior belongs in the optional Qoder Sites Function, not a Node or framework server.

## Develop

Use a Node version accepted by `package.json` (`^22.13.0 || >=24.0.0`). Select an installed compatible runtime and keep it selected for installation, development and build:

```sh
npm ci
npm run dev
```

Use the loopback URL printed by Vite. Edit `src/App.tsx`, `src/globals.css` and the title/description in `index.html`. Replace the sample page with the requested product before presenting a first meaningful preview. Import existing UI primitives from `@/components/ui/<component>` and compose them for the site's design. The neutral starter theme is a starting point, not the finished visual direction.

For production output:

```sh
npm run build
npm run preview
```

The build fixes `NODE_ENV=production` before loading Vite, independently of the terminal environment. It checks the frontend and bundled component types and emits `dist/index.html` and assets. `npm run preview` serves this output locally. Reuse passing checks while source is unchanged; no additional unit-test suite or browser QA is required by the template.

## Optional Function

The default page is entirely static and does not call a Function. For server behavior, adapt the public, credential-free example in `functions/handler.ts`. `functions/index.ts` is the Deno deployment entry point. Check `deno --version` before using a separate terminal for:

```sh
npm run check:function
npm run dev:function
```

If Deno is unavailable, the static frontend can still build and run. Keep Function validation pending until Deno or an equivalent existing Function checker is available; `npm run build` checks the frontend only. Local proxy requests also need a running compatible Function server.

The local service binds to `127.0.0.1:8000`; Vite development and built preview proxy `/functions/v1/app` to it, preserving the path. Probe with an available HTTP tool or Node `fetch`; with `curl` installed, for example:

```sh
curl --fail 'http://127.0.0.1:5173/functions/v1/app?name=Visitor'
```

Use Vite's actual port if it differs. The same frontend request after deployment is routed by Qoder Sites. Local proxy configuration is not production routing. Keep local-only servers and fixtures in `dev/`, outside both publication directories. The included Function has no dependencies; add self-contained runtime imports as required. Frontend npm dependencies are not automatically installed in Functions.

## Publish with Qoder Sites

Open a local conversation in this project and follow the `sites-hosting` skill. Workspace registration is optional. Use the directory returned by `get_context` with:

- `webDirectory: "dist"` after the build.
- `spa: false` for the default single page; use `true` when adding client-side deep routes that need fallback.
- `functionDirectory: "functions"` only if the application uses the Function. Omit it for static-only delivery.

The Sites tools prepare artifacts and generate the publication descriptor; publish completed hosted work by default, unless the user explicitly requests a preview first or defers publication. Do not upload the project root, `node_modules`, `dev`, or source as the web artifact. A successful build or release does not prove an external integration works.

For a new database-backed React page, follow the installed `sites-building` Skill's `references/function-backend.md`. Its assembled `assets/function-backend/` example includes `Notes.tsx`, Function routes and a schema using the platform's private database credentials. For a runnable records-and-attachments workbench, use that Skill's `references/records-example.md`; its setup command assembles a new project from this starter and keeps local fixtures outside deployment outputs. Preserve and adapt its application identity and ownership checks before exposing private records. `references/database.md`, `assets/database-react/App.tsx` and `assets/database-function/` are for existing legacy allocations only. These optional assets stay in the Skill rather than being copied into every static project.

For database or Storage, follow the corresponding `sites-building` references and `sites-management` capability workflow. For AI, follow `sites-build-agent-app` and keep Cloud Agents access in the Function. Application credentials belong in server-side Sites Settings; frontend environment variables are public. This starter does not implement visitor login, database permissions, Cloud resource coordination or QCA sessions; add those only for the requested feature using the existing skills.

See `PROVENANCE.md` and `vendor/` for source attribution and the preserved stylesheet license.

After copying the starter, rename `gitignore.template` to `.gitignore` before installing dependencies. This keeps the file available in npm and bundled CLI resources.

## Deploy on Coolify (Docker)

This repo also runs self-hosted on Coolify with no Qoder platform dependency: a small
Node server (`server/`) serves the built `dist/` and mounts the application router at
`/functions/v1/app/*` against its own Postgres.

1. In Coolify, create a resource from this repo and choose **Docker Compose** (it uses
   `docker-compose.yml`).
2. Set environment variables (Coolify → Environment):
   - `DB_PASSWORD` — strong password for Postgres.
   - `APP_ORIGIN` — the app's public **https** origin, e.g. `https://app.example.com`.
     It must match the domain you assign to the `app` service (used for CSRF origin checks).
   - Optional first-boot account passwords: `ADMIN_PASSWORD`, `ACCOUNTANT_PASSWORD`,
     `CASHIER_PASSWORD`, `VIEWER_PASSWORD`. If omitted, a random password is generated and
     printed **once** in the `app` logs on first start.
3. Assign a domain to the `app` service (container port `3000`). The compose publishes no
   host ports — Coolify's proxy routes to the container port.
4. Deploy. On first boot the `app` container creates the schema and seeds demo data, then
   serves. Record the bootstrap credentials from the `app` logs.

Local run (binds to 127.0.0.1 for testing only):

```bash
cp .env.example .env      # set DB_PASSWORD, and APP_ORIGIN=http://127.0.0.1:3000
docker compose up --build # http://127.0.0.1:3000
```

Notes:
- Writes require `Origin` to equal `APP_ORIGIN` (CSRF). Behind Coolify's TLS proxy this
  matches automatically; for local http, set `APP_ORIGIN=http://127.0.0.1:3000`
  (enforcement auto-disables for non-https origins).
- Data lives in the `db_data` volume; back it up. `docker compose down -v` deletes it.
- The seed is synthetic demo data; the source workbook is not part of the image.
