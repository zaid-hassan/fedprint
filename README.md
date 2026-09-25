# FedPrint

A tiny self-hosted web app that lets any phone, tablet, or computer on your
local network send documents to a USB printer attached to a Fedora machine.

FedPrint runs next to an existing CUPS installation. It does not install
drivers, does not talk to the printer directly, and does not need the Internet,
a cloud account, a database, or any external API.

```
Android / laptop
      │  Wi-Fi
      ▼
FedPrint Web UI  (http://<fedora-ip>:27183)
      │
      ▼
Node.js API  (Fastify + TypeScript)
      │
      ▼
CUPS  (lp / lpstat / lpoptions / cancel)
      │  USB
      ▼
Brother DCP-T230  (CUPS queue: DCPT230)
```

> **WARNING — trusted networks only.**
> FedPrint is designed for trusted home/local networks. It has **no
> authentication**. Do not expose port 27183 directly to the Internet. If you
> need remote access, put it behind a VPN (for example WireGuard or Tailscale).

---

## Features

- Drag-and-drop or file-picker upload of **PDF, PNG, JPG/JPEG, TXT** (max 25 MB).
- A built-in **Markdown editor** with live preview that prints a clean, formatted
  PDF (headings, lists, quotes, code blocks) — no attachments or extra apps.
- **Mermaid diagrams**: fenced ` ```mermaid ` blocks render in the preview and
  are rasterized in the browser and embedded into the printed PDF. Mermaid is
  loaded on demand, so pages without diagrams stay light.
- Print options: copies (1–20), page range (`all`, `1-3`, `1,3,5`), orientation,
  paper size (A4/A5/Letter), color mode, and duplex **only when CUPS reports it**.
- Live printer status from CUPS, refreshed while the page is open.
- Recent print jobs with cancel for queued/printing jobs.
- Optional `fedprint.local` mDNS address.
- Plain-language errors, safe command execution, and automatic temp-file cleanup.

---

## Requirements

- Fedora Linux (or another systemd + CUPS distribution).
- Node.js 20 or newer and npm.
- CUPS running with a working printer queue.
- A printer already configured and printing successfully through CUPS.

FedPrint does **not** configure the printer. Set the printer up first with the
normal CUPS tools (`system-config-printer`, `lpadmin`, or the CUPS web UI at
`http://localhost:631`) and confirm it prints before using FedPrint.

---

## Verify the CUPS printer

The physical Brother DCP-T230 is connected to Fedora over USB and managed by
CUPS. FedPrint communicates with it through CUPS only.

```bash
systemctl status cups
lpstat -p
lpstat -v
lpstat -p DCPT230
```

Expected output includes a queue named `DCPT230` and a USB device URI similar
to:

```
device for DCPT230: usb://Brother/DCP-T230?serial=...
```

If the queue is missing, configure the printer in CUPS before continuing.

---

## Environment variables

Copy `.env.example` to `.env` and adjust if needed.

| Variable | Default | Description |
| --- | --- | --- |
| `PRINTER_NAME` | `DCPT230` | CUPS queue that jobs are submitted to. |
| `PORT` | `27183` | HTTP port. |
| `HOST` | `0.0.0.0` | Bind address (all interfaces). |
| `MAX_UPLOAD_MB` | `25` | Maximum upload size in megabytes. |
| `UPLOAD_DIR` | `./uploads` | Directory for temporary uploads. |
| `MDNS_ENABLED` | `auto` | `auto`, `true`, or `false`. `auto` publishes `fedprint.local` when `avahi-publish` is available. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error`. |

---

## Fedora setup

A helper script checks prerequisites, installs dependencies, and builds:

```bash
cd fedprint
./scripts/setup-fedora.sh
```

It verifies Node.js, CUPS, the `lp` command, and that `PRINTER_NAME` exists. It
does not modify unrelated system configuration, the firewall, or systemd.

To install dependencies manually:

```bash
sudo dnf install nodejs npm cups
sudo systemctl enable --now cups
npm install
npm run build
```

---

## Development

Run the backend (TypeScript, auto-reload) and the Vite dev server together:

```bash
npm run dev        # API on http://localhost:27183
npm run web:dev    # UI on http://localhost:5173, proxies /api to :27183
```

Quality gates:

```bash
npm run typecheck
npm run lint
npm test
```

---

## Production

```bash
npm run build
npm start
```

`npm run build` compiles the server to `dist/` and the UI to `dist-web/`. The
server serves the UI at `/` and the API at `/api/*`. On startup it prints the
local and network URLs, the printer label, and the CUPS queue.

---

## systemd service

A unit file is provided in `fedprint.service`. It runs as a dedicated
**non-root** user that must be able to submit jobs to CUPS.

```bash
# 1. Create a dedicated user in the "lp" group (CUPS job submission needs it).
sudo useradd --system --home-dir /opt/fedprint --shell /sbin/nologin fedprint

# 2. Install the app to /opt/fedprint.
sudo mkdir -p /opt/fedprint
sudo cp -r . /opt/fedprint
sudo chown -R fedprint:fedprint /opt/fedprint

# 3. Install and start the service.
sudo cp /opt/fedprint/fedprint.service /etc/systemd/system/fedprint.service
sudo systemctl daemon-reload
sudo systemctl enable --now fedprint
systemctl status fedprint
```

The application must not run as root. On Fedora, users in the `lp` group can
print; add the service user with:

```bash
sudo usermod -aG lp fedprint
```

If your CUPS configuration restricts printing to specific users, grant the
`fedprint` user access via `lpadmin`/`/etc/cups/cupsd.conf` instead of running
the service as root.

---

## Firewall

Port 27183 is closed by default on Fedora (`firewalld`). Open it for the local
network only, and only if you need remote devices to reach FedPrint:

```bash
sudo firewall-cmd --permanent --add-port=27183/tcp
sudo firewall-cmd --reload
```

FedPrint does not change the firewall automatically.

---

## Accessing from Android (or any device)

1. Find the Fedora machine's IP address:

   ```bash
   hostname -I
   ```

2. Connect the phone to the same Wi-Fi network.
3. Open `http://<fedora-ip>:27183` in Chrome or any browser.
4. Tap **Upload** to send a document, or **Write** to compose a Markdown note, then tap **Print**.

If `avahi-daemon` and `avahi-tools` are installed, FedPrint also publishes
`fedprint.local`, so Android devices with mDNS support can use
`http://fedprint.local:27183`.

---

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness: `{ "ok": true, "service": "fedprint" }` |
| `GET` | `/api/printer/status` | Printer state and CUPS capabilities. |
| `GET` | `/api/jobs` | Recent jobs (active + completed) from CUPS. |
| `POST` | `/api/print` | Multipart upload + options; submits to CUPS. |
| `POST` | `/api/print/markdown` | JSON `{ markdown, diagrams?, ...options }`; renders a PDF and submits it. `diagrams` is an ordered array of PNG data URLs (or `null`) for mermaid blocks. |
| `POST` | `/api/jobs/:id/cancel` | Cancel a queued/printing job. |

Example status response:

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

---

## Troubleshooting

| Symptom | Check / fix |
| --- | --- |
| "Printing service is unavailable" | `systemctl status cups` and start CUPS. |
| "Printer is currently unavailable" | `lpstat -p DCPT230`; clear pauses with `cupsenable DCPT230`. |
| Printer not found | Confirm `PRINTER_NAME` matches `lpstat -p`. |
| Jobs stay queued | Check USB cable, printer power, and `lpstat -o DCPT230`. |
| Cannot reach the page from another device | Verify the IP, same Wi-Fi, and firewall port 27183. |
| Phone shows "Connection lost while sending" on larger files | The Wi-Fi dropped mid-upload. Move closer to the router and tap **Print** again — print requests are idempotent, so a retry never prints twice. |
| `fedprint.local` does not resolve | Install `avahi`/`nss-mdns` and use the IP instead. |
| Permission denied submitting jobs | Add the service user to the `lp` group. |

Useful commands:

```bash
lpstat -p                 # printer status
lpstat -v                 # device URIs
lpstat -o DCPT230         # active jobs
lpstat -W completed -o    # recent completed jobs
cupsenable DCPT230        # resume a paused queue
cancel DCPT230-42         # cancel a job
journalctl -u fedprint -f # service logs
```

---

## Security considerations

FedPrint aims to be safe on a trusted LAN, but it is intentionally simple.

- The server binds to `0.0.0.0` for LAN convenience; keep it off the Internet.
- Uploads are limited by size, restricted by extension **and** magic bytes
  (PDF/PNG/JPEG), stored under random UUID filenames, and never executed.
- Client filenames are sanitized; directory components are stripped.
- System commands are always executed with argument arrays, never a shell.
- The printer name comes only from server configuration; the client cannot
  choose a CUPS destination.
- Job ids are format-validated and must belong to a known active CUPS job
  before cancellation.
- Temporary uploads are deleted after submission and swept at startup.
- Print requests carry a client idempotency key, so retrying after a dropped
  connection returns the original job instead of printing twice.
- Every state-changing request is logged (method, route, status, duration) for
  diagnosing intermittent mobile network failures; document contents are never
  logged.

---

## Project structure

```
fedprint/
├── src/
│   ├── server.ts              # entrypoint: listen, banner, mDNS, shutdown
│   ├── app.ts                 # buildApp(): plugins, routes, error handling
│   ├── config.ts              # Zod-validated environment configuration
│   ├── logger.ts              # structured leveled logger
│   ├── errors.ts              # AppError types + friendly messages
│   ├── routes/                # health, printer, print, jobs
│   ├── services/              # cups adapter, parsers, printer, print-job,
│   │                          #   markdown->PDF, file-manager, job-registry, mdns
│   ├── validation/            # print option, page range, markdown validation
│   └── utils/                 # safe command runner, network helpers
├── web/                       # React + Vite + TypeScript frontend
├── scripts/setup-fedora.sh    # Fedora prerequisite check + build
├── fedprint.service           # systemd unit (non-root)
├── .env.example
└── docs/superpowers/specs/    # design spec and implementation plan
```

The only module that runs system commands is `src/services/cups.ts`, which uses
the safe runner in `src/utils/command.ts`. Everything else works with typed
data, which keeps the CUPS integration auditable and testable.
