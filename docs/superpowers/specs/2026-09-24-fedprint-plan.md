# FedPrint — Implementation Plan

Companion to `2026-09-24-fedprint-design.md`. Work top to bottom; each phase
leaves the tree buildable. Gates at each phase end.

## Phase 0 — Scaffold
- `package.json` (type module), scripts: dev, build, start, typecheck, lint,
  test, web:dev, web:build.
- `tsconfig.json` (NodeNext, strict), `tsconfig.build.json`.
- `eslint.config.js` (flat, typescript-eslint), `vitest.config.ts`,
  `.gitignore`, `.env.example`.
- `web/` Vite React-TS app (vite.config proxy `/api` -> :27183).
- Gate: `npm install`; `npm run typecheck` passes.

## Phase 1 — Core primitives
- `src/config.ts` — Zod env schema, defaults, frozen export.
- `src/logger.ts` — leveled structured logger.
- `src/errors.ts` — `AppError` subclasses + `toUserMessage()`.
- `src/utils/command.ts` — `run()` via `execFile`, timeout, ENOENT mapping.
- `src/utils/net.ts` — LAN IPv4 discovery.
- Gate: unit tests for errors + command.

## Phase 2 — CUPS adapter
- `src/services/cups.ts` — `lpstat/lpoptions/lp/cancel` + parsers
  (`parsePrinterStatus`, `parseLpJobId`, `parseJobs`, `parseCapabilities`).
- Gate: parser unit tests against captured real outputs.

## Phase 3 — Domain services
- `src/services/printer.ts` — `getStatus`, `getCapabilities` (duplex detect).
- `src/services/file-manager.ts` — validate/store/remove/cleanup.
- `src/services/print-job.ts` — submit/list/cancel with friendly errors.
- `src/validation/print-options.ts` — Zod + page-range parser.
- `src/services/mdns.ts` — optional avahi-publish.
- Gate: unit tests for page range, file guards, job normalization.

## Phase 4 — HTTP layer
- `src/routes/{health,printer,print,jobs}.ts`.
- `src/app.ts` — `buildApp()`: multipart (25 MB), static `dist-web/`, routes,
  error handler.
- `src/server.ts` — listen, startup banner, cleanup sweep, mDNS.
- Gate: `inject()` integration tests (health, status, 415, 413, bad job id).

## Phase 5 — Frontend
- `api.ts` (typed fetch), `types.ts`, components per spec, `styles.css`.
- Gate: `npm run web:build` succeeds; manual smoke in browser.

## Phase 6 — Ops & docs
- `scripts/setup-fedora.sh`, `fedprint.service`, `README.md`.
- Gate: shellcheck-by-eye, service file syntax.

## Phase 7 — Verification (must actually run)
1. `npm run typecheck && npm run lint && npm test && npm run build`.
2. Start server; `curl /api/health`, `/api/printer/status`.
3. Upload real test PDF -> assert returned CUPS job id; confirm with `lpstat`.
4. `GET /api/jobs`; `POST /api/jobs/:id/cancel` on an active job.
5. Invalid type (415) and oversized (413) uploads.
6. Confirm temp file removed.
7. Report honestly which checks ran against the real printer.

## Risks
- Printing real documents runs the physical printer; use a tiny test PDF and
  cancel promptly. CUPS output parsing is locale-sensitive -> force `LANG=C`.
