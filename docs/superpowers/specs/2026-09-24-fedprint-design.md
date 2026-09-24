# FedPrint — Design Specification

Date: 2026-09-24
Status: Awaiting review

## 1. Purpose

FedPrint is a zero-friction, self-hosted print portal for a trusted local
network. A Fedora host with a USB Brother DCP-T230 printer already configured
in CUPS (queue `DCPT230`) acts as the print server. Any phone, tablet, or
computer on the same Wi-Fi opens `http://<fedora-ip>:27183`, drops a file,
adjusts a few options, and prints.

No Internet, cloud, accounts, database, or external API is used. CUPS is the
only source of truth for printers, capabilities, and jobs. The physical path is:

```text
Android -> Wi-Fi -> FedPrint Web UI -> Node API -> CUPS -> USB -> DCP-T230
```

## 2. Verified environment (2026-09-24)

- CUPS `active`; printer `DCPT230` `idle`, `enabled`; device
  `usb://Brother/DCP-T230?serial=...`
- `lp`, `lpstat`, `lpoptions`, `cancel`, `ipptool` present at `/usr/bin`.
- `lpoptions -p DCPT230 -l` reports: `PageSize`
  (A4, A5, Letter, Legal, B5, A6, ...), `BRMonoColor` (FullColor, Mono),
  `BRMediaType`, `BRResolution`, `BRInputSlot`.
- **No duplex/`sides` option is advertised** by the queue. Duplex must be
  hidden, not faked. The `/api/printer/status` response drives this.
- `avahi-daemon` active; `avahi-publish` present -> optional `fedprint.local`.
- `firewalld` active. Node v24.21, npm 11.19. No pnpm.

## 3. Scope

In scope: single-file upload, options, submit to CUPS, printer status, job
list, job cancel, optional mDNS, Fedora setup script, systemd unit, docs.

Out of scope (YAGNI): authentication, multi-user accounts, print history
persistence, per-user quotas, scanning, printer administration/reconfiguration,
driver installation, document preview/rendering, job reordering.

## 4. Architecture

Thin HTTP layer over a domain service layer over a single CUPS adapter. The
CUPS adapter is the *only* module allowed to execute system commands.

```
routes/*        HTTP: parse/validate request, map errors, serialize response
  |
services/*      Domain: printer status, capabilities, submit/list/cancel job,
  |             temp-file lifecycle, mDNS announce
  |
services/cups   Adapter: typed wrappers over execFile(lp|lpstat|lpoptions|cancel)
  |
utils/command   Primitive: safe execFile (never shell), timeout, error mapping
```

Rules:

- No `exec`/shell strings anywhere. Always `execFile(cmd, argsArray)`.
- Printer name is never accepted from the client; it comes from config.
- User input never reaches a command as an unparsed string.
- Every command returns a typed result or throws a typed `AppError` whose
  message is safe to show a non-technical user.

### 4.1 Module map

```
src/
  server.ts            entrypoint: build app, listen, print LAN URLs, mDNS
  app.ts               buildApp(): registers plugins + routes (testable)
  config.ts            Zod-validated env -> frozen Config object
  logger.ts            structured leveled logger ([INFO] ...), no doc contents
  errors.ts            AppError hierarchy + user-facing messages

  routes/
    health.ts          GET  /api/health
    printer.ts         GET  /api/printer/status
    print.ts           POST /api/print        (multipart)
    jobs.ts            GET  /api/jobs, POST /api/jobs/:id/cancel

  services/
    cups.ts            low-level CUPS commands + output parsers
    printer.ts         status + capabilities (duplex detection, page sizes, colors)
    print-job.ts       submit, list, cancel; maps CUPS errors to friendly text
    file-manager.ts    temp dir, random names, sanitize, type/size guard, cleanup
    mdns.ts            optional avahi-publish announce (feature-detected)

  validation/
    print-options.ts   Zod schema + page-range parser/validator

  utils/
    command.ts         safe execFile wrapper (+ CommandError)
    net.ts             LAN IPv4 discovery for startup banner

web/                    React + Vite + TS frontend
  index.html  vite.config.ts
  src/main.tsx  src/App.tsx  src/api.ts  src/types.ts
  src/components/{Header,DropZone,FileCard,OptionsPanel,PrintButton,JobsList}.tsx
  src/styles.css
  (build output -> dist-web/, served by Fastify)

scripts/setup-fedora.sh
fedprint.service
.env.example  .gitignore  README.md
tsconfig.json  eslint.config.js  vitest.config.ts
```

### 4.2 Key interfaces

```ts
// utils/command.ts
interface CommandResult { stdout: string; stderr: string }
function run(cmd: string, args: string[], opts?: {timeoutMs?: number}): Promise<CommandResult>
// throws CommandError { code: 'ENOENT'|'TIMEOUT'|'EXIT', exitCode?, stderr }

// services/cups.ts  (only consumer of utils/command)
function lpstat(args: string[]): Promise<string>
function lpoptions(args: string[]): Promise<string>
function lp(args: string[]): Promise<string>      // returns "request id is DCPT230-N"
function cancel(args: string[]): Promise<string>

// services/printer.ts
interface PrinterStatus {
  name: string; status: 'idle'|'printing'|'stopped';
  enabled: boolean; message: string; currentJob?: string;
}
interface PrinterCapabilities {
  pageSizes: string[]; colors: string[]; duplex: boolean;
}
function getStatus(): Promise<PrinterStatus>
function getCapabilities(): Promise<PrinterCapabilities>

// services/print-job.ts
interface SubmitInput {
  filePath: string; displayName: string; copies: number;
  pages?: string; orientation: 'portrait'|'landscape';
  media: string; color: 'color'|'grayscale'; sides?: 'one-sided'|
  'two-sided-long-edge'|'two-sided-short-edge';
}
function submit(input: SubmitInput): Promise<{ jobId: string }>
function list(): Promise<PrintJob[]>
function cancel(jobId: string): Promise<void>

// services/file-manager.ts
function validateAndStore(part): Promise<StoredFile>  // {path, name, size, ext}
function safeRemove(path: string): Promise<void>
function cleanupStale(maxAgeMs: number): Promise<void>
```

## 5. HTTP API

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | liveness; `{ok:true,service:"fedprint"}` |
| GET  | `/api/printer/status` | status + capabilities (duplex flag) |
| GET  | `/api/jobs` | recent jobs (active + completed via CUPS) |
| POST | `/api/print` | multipart upload + options -> submit |
| POST | `/api/jobs/:id/cancel` | cancel a known job |

### 5.1 `GET /api/printer/status`

```json
{
  "name": "DCPT230",
  "status": "idle",
  "enabled": true,
  "message": "Ready",
  "capabilities": {
    "pageSizes": ["A4", "A5", "Letter"],
    "colors": ["color", "grayscale"],
    "duplex": false
  }
}
```

`status` is derived from `lpstat -p` (idle/printing/stopped). If CUPS is
unreachable the endpoint returns HTTP 503 with a friendly `message`.

### 5.2 `POST /api/print`

multipart fields: `file` (required), plus option fields. Options are validated
by Zod; page ranges are parsed and checked against `-P` syntax. Success:

```json
{ "ok": true, "jobId": "DCPT230-42", "status": "queued" }
```

The temp file is deleted after `lp` exits (CUPS has already copied the spool),
including on failure. Cleanup is also swept at startup.

### 5.3 `GET /api/jobs`

Returns jobs from `lpstat -o` (active) and `lpstat -W completed -o` (recent
completed), normalized:

```json
[{"id":"DCPT230-42","name":"invoice.pdf","status":"printing",
  "submittedAt":"2026-09-24T14:43:41Z","copies":1}]
```

Job titles are set explicitly to the sanitized display filename so CUPS records
it for admins. Because this CUPS configuration withholds job titles from
listing commands ("Withheld"/"Unknown"), FedPrint remembers the display name,
copies, and cancellation state of jobs it submits in an in-memory,
process-local registry (not a database) and merges it with CUPS data on each
`GET /api/jobs`. CUPS remains the source of truth for job id, state, and
timing; jobs submitted by other means or before a restart show as "Document".

### 5.4 `POST /api/jobs/:id/cancel`

`:id` must match `^[A-Za-z0-9_.-]{1,64}$` **and** exist in the current
`lpstat` job set before `cancel <id>` runs. Unknown/malformed IDs -> 404/400.

## 6. Print option semantics

- Copies: integer 1..20 -> `-n`.
- Page range: `all` | `1-3` | `1,3,5` (merge: `1-3,5,7-9`) -> `-P`. Parse
  each token as positive int / int-int with `a<=b`; reject otherwise.
- Orientation: portrait -> `-o orientation-requested=3`; landscape -> `=4`.
- Paper: whitelist from capabilities -> `-o PageSize=<value>`
  (A4 default).
- Color: `color` -> `-o BRMonoColor=FullColor`; `grayscale` ->
  `-o BRMonoColor=Mono`. Option key is resolved from capabilities at runtime
  with fallback, so a different queue still works.
- Duplex: only sent if capabilities report duplex; `-o sides=...`.
- Job title: `-t <sanitized display name>`.

## 7. Frontend

React + Vite + TypeScript single page, mobile-first, large touch targets, no
gradients/cards sprawl. Dev server proxies `/api` to the backend; production
builds to `dist-web/` and is served by Fastify via `@fastify/static`.

Layout: header (`FedPrint`, subtitle, live `● DCPT230 · Ready`); drop zone
(tap/click or drag; accepts PDF/PNG/JPG/JPEG/TXT, 25 MB); selected-file card
(name/size/type, page count for PDF when cheaply available, remove); compact
options (copies stepper, page range, orientation segmented, paper select,
color segmented, duplex segmented only if supported); large `PRINT` button;
`Recent prints` list with cancel for active jobs. Status polls every ~5 s.

PDF page count: computed client-side by counting `/Type /Page` occurrences
without a PDF library (best-effort). If unavailable, omit rather than block.

## 8. Security & error handling

- Bind `0.0.0.0:27183`; README warns never to expose port 27183 to the Internet.
- Upload: whitelist extensions + MIME sniff; max size from config (25 MB);
  random `crypto.randomUUID()` temp names; stored in a dedicated `uploads/`
  temp dir; never executed; path traversal impossible (server-generated names,
  `basename()` on client name).
- No client-supplied printer names or shell fragments. Job IDs validated and
  membership-checked.
- Errors translated to plain language via `errors.ts`:

| Condition | User message |
|---|---|
| spawn ENOENT (no CUPS tools) | Printing service is unavailable. Please check that CUPS is running. |
| printer stopped/offline | Brother DCP-T230 is currently unavailable. |
| unsupported type | This file type isn't supported. Please upload a PDF, JPG, PNG, or TXT file. |
| too large | File is too large. Maximum size is 25 MB. |
| malformed multipart | The upload could not be read. Please try again. |

- Logs are structured and leveled; file contents are never logged; full paths
  are not logged.

## 9. Configuration

```env
PRINTER_NAME=DCPT230
PORT=27183
HOST=0.0.0.0
MAX_UPLOAD_MB=25
MDNS_ENABLED=auto      # auto | true | false
UPLOAD_DIR=./uploads
LOG_LEVEL=info
```

Validated by Zod at boot; invalid config exits with a clear message.

## 10. Packaging & ops

- `scripts/setup-fedora.sh`: check Node, CUPS active, printer exists, `lp`
  present, `npm ci`/install, build, print next steps. No system changes.
- `fedprint.service`: `After=network-online.target cups.service`,
  `Wants=network-online.target`; runs as non-root `fedprint` user, `DynamicUser`
  fallback documented; `Restart=on-failure`. README documents CUPS group
  permissions (`lp`/`lpadmin`) instead of running as root.
- Firewall documented, not auto-applied:
  `sudo firewall-cmd --permanent --add-port=27183/tcp && sudo firewall-cmd --reload`.
- Startup banner prints local + LAN URLs, printer name, CUPS queue.
- mDNS optional via `avahi-publish -a fedprint.local <ip>` (feature-detected);
  failure is a warning, never fatal.

## 11. Testing strategy

- Unit (vitest): page-range parser, option validation, CUPS output parsers,
  filename sanitization, error translation, file-manager type/size guards.
- Integration: `buildApp().inject()` for `/api/health`, status shape, invalid
  upload (415), oversized (413), malformed job id (400/404). CUPS layer is
  stubbed so tests do not print.
- Manual end-to-end (documented, actually executed): health, status, upload a
  real test PDF to `DCPT230`, verify returned job id via `lpstat`, test cancel,
  invalid/oversized rejection, access from another LAN device.
- Quality gates: `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm test`.

## 12. Decisions taken (invite override)

1. **Fastify** over Express — built-in schema validation, `@fastify/multipart`
   (busboy, streams to disk), `inject()` for tests.
2. **React + Vite + TypeScript** frontend, built to `dist-web/` and served
   statically by Fastify (user preference).
3. **Zod** for config and request validation (as suggested).
4. **vitest** for tests; Node built-in where sufficient.
5. **mDNS via avahi-publish** (already installed) rather than bundling a
   second mDNS stack that would contend for port 5353.
6. Duplex hidden based on live capability detection (currently false).

## 13. Open questions

None blocking. Defaults above will be used unless changed on review.
