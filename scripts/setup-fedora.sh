#!/usr/bin/env bash
#
# FedPrint — Fedora setup and build helper.
#
# Verifies the host prerequisites, installs project dependencies, and builds
# the application. It does NOT modify unrelated system configuration, the
# CUPS printer setup, the firewall, or systemd.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

PRINTER_NAME="${PRINTER_NAME:-DCPT230}"
if [[ -f "${PROJECT_DIR}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "${PROJECT_DIR}/.env"
  set +a
  PRINTER_NAME="${PRINTER_NAME:-DCPT230}"
fi

ok() { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
info() { printf '\n\033[1m%s\033[0m\n' "$1"; }

failures=0

info "Checking host prerequisites"

if command -v node >/dev/null 2>&1; then
  ok "Node.js $(node --version)"
else
  fail "Node.js is not installed. Install it with: sudo dnf install nodejs npm"
  failures=$((failures + 1))
fi

if command -v npm >/dev/null 2>&1; then
  ok "npm $(npm --version)"
else
  fail "npm is not installed. Install it with: sudo dnf install nodejs npm"
  failures=$((failures + 1))
fi

if command -v lp >/dev/null 2>&1; then
  ok "CUPS command-line client (lp) found"
else
  fail "The 'lp' command was not found. Install CUPS with: sudo dnf install cups"
  failures=$((failures + 1))
fi

if systemctl is-active --quiet cups 2>/dev/null; then
  ok "CUPS service is running"
else
  fail "CUPS is not running. Start it with: sudo systemctl enable --now cups"
  failures=$((failures + 1))
fi

if command -v lpstat >/dev/null 2>&1 && lpstat -p "${PRINTER_NAME}" >/dev/null 2>&1; then
  ok "Printer '${PRINTER_NAME}' exists in CUPS"
else
  fail "Printer '${PRINTER_NAME}' was not found. Check: lpstat -p"
  failures=$((failures + 1))
fi

if [[ "${failures}" -gt 0 ]]; then
  printf '\n\033[31mPrerequisite checks failed (%d). Fix the issues above and re-run.\033[0m\n' "${failures}"
  exit 1
fi

info "Install dependencies"
cd "${PROJECT_DIR}"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

info "Build application"
npm run build
mkdir -p "${PROJECT_DIR}/uploads"

cat <<EOF

$(printf '\033[32mFedPrint is ready to start.\033[0m')

Start the server:
  cd ${PROJECT_DIR}
  npm start

Then open http://localhost:27183 on this machine, or
http://<fedora-ip>:27183 from another device on the same network.

Accessing FedPrint from another device may require opening the firewall:
  sudo firewall-cmd --permanent --add-port=27183/tcp
  sudo firewall-cmd --reload

To run FedPrint automatically at boot, see the README section
"systemd service" and install fedprint.service.
EOF
