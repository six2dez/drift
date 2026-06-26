# Technology Stack

**Analysis Date:** 2026-06-26

## Languages

**Primary:**
- TypeScript 5.5.4 — all three packages (`packages/backend`, `packages/frontend`, `packages/shared`)

**Secondary:**
- JavaScript (ES module) — `packages/backend/assets/mcp-server.mjs` (plain `.mjs`, not TypeScript; intentionally standalone so it can run under any Node without a build step)

## Runtime

**Environment:**
- Node.js ≥ 20 (enforced in `package.json` `engines` field; CI pins Node 20 via `actions/setup-node`)
- `.nvmrc` pins `20` for local development

**Plugin host:**
- Caido's QuickJS-based backend runtime. The backend bundle is loaded by Caido as an ES module inside a constrained JavaScript environment. Key constraint: Zod crashes QuickJS, so no Zod or similar schema-validation libraries are used. Comment in `packages/backend/src/index.ts` line 68: `// ── Types (inline to avoid Zod which crashes QuickJS) ──────────────`. UUID generation also avoids `crypto` module (custom hex loop at line 829 of `index.ts`).

**Package Manager:**
- pnpm 9.0.0 (enforced via `packageManager` field)
- Lockfile: `pnpm-lock.yaml` present (lockfileVersion `9.0`)

## Frameworks

**Core (frontend):**
- Vue 3.5.29 — UI framework; `packages/frontend/src/index.ts` creates the app with `createApp`
- PrimeVue 4.1.0 — component library, used unstyled with `Classic` preset from `@caido/primevue`
- Pinia 3.0.4 — state management; `packages/frontend/src/stores/`

**CSS:**
- Tailwind CSS 3.4.13 with `tailwindcss-primeui` and `@caido/tailwindcss`
- PostCSS with `postcss-prefixwrap` to scope all styles under `#plugin--drift` (avoids Caido style collisions)
- Config: `caido.config.ts` (PostCSS inline in Vite config)

**Markdown rendering (frontend):**
- `markdown-it` 14.1.1 with `markdown-it-highlightjs` for syntax highlighting in chat messages
- `highlight.js` ^11.11.1 — code highlighting
- `dompurify` 3.3.3 — sanitizes rendered HTML output before injection

**Testing:**
- Vitest 4.0.18 — test runner and assertion library
- `@vue/test-utils` ^2.4.6 — Vue component test helpers
- `happy-dom` ^20.8.9 — DOM environment for frontend tests
- Config: `vitest.config.ts` at repo root

**Build / Dev:**
- Vite 6.0.7 — bundler for the frontend package
- `@caido-community/dev` 0.1.6 (`caido-dev`) — Caido-specific build wrapper that orchestrates the monorepo build into `dist/plugin_package/`; invoked via `caido-dev build` and `caido-dev watch`
- `@vitejs/plugin-vue` 6.0.1 — Vue SFC support in Vite
- `vue-tsc` 3.2.5 — type-checking for Vue SFCs (`packages/frontend`)

## Key Dependencies

**Caido Plugin SDK:**
- `@caido/sdk-backend` 0.55.3 — backend plugin API (`caido:plugin` virtual import resolves from this); provides `SDK`, `DefineAPI`, `DefineEvents` types and runtime hooks (`sdk.meta`, `sdk.api`, `sdk.events`, `sdk.projects`, `sdk.console`)
- `@caido/sdk-frontend` 0.55.3 — frontend plugin API and `FrontendSDK` type; `packages/frontend/src/types.ts`
- `@caido/primevue` 0.3.3 — Caido-themed PrimeVue component set; imported in frontend as `Classic` preset and Tailwind content glob
- `@caido/tailwindcss` 0.1.0 — Caido-specific Tailwind plugin

**Backend Node built-ins used (explicit imports):**
- `fs/promises`: `readFile`, `writeFile`, `open`, `stat`, `mkdir`, `rm`, `rename`, `readdir` — `packages/backend/src/index.ts` line 2
- `child_process`: `spawn`, `ChildProcessWithoutNullStreams` — `packages/backend/src/index.ts` line 3
- `buffer`: `Buffer` — `packages/backend/src/index.ts` line 4
- `path` — `packages/backend/src/index.ts` line 5
- `fs/promises`: `readdir`, `stat` — `packages/backend/src/command-resolution.ts` line 1
- `path` — `packages/backend/src/command-resolution.ts` line 2
- `os` — **not used** (home directory detection is done via `process.env.HOME` and path inference from `pluginPath`/provider binary paths)
- `crypto` — **not used** (UUID generation uses a custom hex loop to avoid crypto availability uncertainty in QuickJS)

**MCP server (standalone `.mjs`) Node built-ins:**
- `node:fs`: `appendFileSync`, `readFileSync`, `writeFileSync` — synchronous I/O for activity log and approval files (only sync methods; no `fs/promises`)
- `fetch` — global (Node 18+ built-in) for Caido GraphQL HTTP calls

**Frontend workspace:**
- `backend: workspace:*` — frontend imports backend types directly (TypeScript path only, not at runtime)
- `shared: workspace:*` — shared types consumed by both frontend and backend

## Configuration

**Plugin definition:**
- `caido.config.ts` — authoritative plugin manifest (id, name, version, author); controls backend assets glob, frontend Vite config, and plugin package structure

**TypeScript:**
- Root `tsconfig.json`: `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `isolatedModules`, target `esnext`, `moduleResolution: bundler`
- `packages/backend/tsconfig.json`: extends root, adds `@caido/sdk-backend` types, excludes test files
- Frontend uses `vue-tsc` for type-checking

**Build output:**
- `dist/plugin_package/` — produced by `caido-dev build`
- `dist/drift.zip` — final deliverable created by the `build` script in root `package.json`; `packages/backend/assets/` is copied into `dist/plugin_package/backend/assets/` post-build

**Linting/Formatting:**
- ESLint: `eslint ./packages/**/src --fix` (config file not detected in root; likely in individual packages or inherited)
- Prettier 3.8.1: formats `*.{vue,ts,js,json}` files under `packages/**/src`

## Platform Requirements

**Development:**
- Node.js 20 (`.nvmrc`)
- pnpm 9.x
- macOS or Linux (release signing uses `openssl pkeyutl` and `zip`)

**Production:**
- Installed as a Caido plugin; the backend bundle runs inside Caido's embedded QuickJS runtime
- The MCP server (`mcp-server.mjs`) is spawned as a separate Node.js process on the user's system; requires Node ≥ 18 on the host
- Local AI CLIs (`claude`, `gemini`, `codex`, `copilot`) must be separately installed by the user

## Release / Signing Pipeline

**Files:** `.github/workflows/release.yml`, `.github/workflows/ci.yml`

**CI (`ci.yml`):**
- Triggers on push/PR to `main`
- Runs: typecheck → `vitest run` → `pnpm build`
- Uploads `dist/drift.zip` as a GitHub artifact (14-day retention)

**Release (`release.yml`):**
- Manual `workflow_dispatch`, restricted to `main` branch only
- Runs: typecheck → test → build
- Signs `dist/drift.zip` with Ed25519 using `openssl pkeyutl` and the `PRIVATE_KEY` repository secret
- Produces `dist/drift.zip.sig`
- Extracts version from `manifest.json` inside the zip (via `python3`)
- Creates GitHub release via `caido/action-release@v1` with both `drift.zip` and `drift.zip.sig` as artifacts

---

*Stack analysis: 2026-06-26*
