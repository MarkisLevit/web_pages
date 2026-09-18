#!/usr/bin/env bash
#
# Kindred — provision and deploy to the VPS.
#
#     bash deploy/deploy.sh              # provision if needed, then deploy
#     bash deploy/deploy.sh --app-only   # just push code + restart (fast path)
#     bash deploy/deploy.sh --dry-run    # list what would be uploaded, touch nothing
#
# Settings come from deploy/deploy.conf (create it from deploy.conf.example).
#
# This box also serves the SRM Polska site (markislevit.online) from Caddy.
# Two rules follow from that, and both are enforced below:
#   * nginx is never installed — it would fight Caddy for :80 and :443.
#   * /etc/caddy/Caddyfile is never rewritten. Kindred gets its own file under
#     /etc/caddy/conf.d/, and the config is validated before any reload.
# The script checks the SRM site is still answering before reporting success.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE"
CONF="$HERE/deploy.conf"

die()  { printf '\n[!] %s\n' "$*" >&2; exit 1; }
say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }

[[ -f "$CONF" ]] || die "Missing $CONF — copy deploy.conf.example to deploy.conf and fill it in."
# shellcheck disable=SC1090
source "$CONF"

: "${VPS_HOST:?set VPS_HOST in deploy.conf}"
: "${DOMAIN:?set DOMAIN in deploy.conf}"
: "${ACME_EMAIL:?set ACME_EMAIL in deploy.conf}"
: "${VPS_USER:=root}"
: "${VPS_PORT:=22}"
: "${VPS_PATH:=/var/www/kindred}"

if [[ "$DOMAIN" == "kindred.example.com" ]]; then
  die "DOMAIN is still the example value. Put your real hostname in deploy.conf."
fi
if [[ "$DOMAIN" == "markislevit.online" ]]; then
  die "That domain is the SRM site already on this box. Kindred needs its own hostname."
fi

MODE="full"
DRY=0
case "${1:-}" in
  --app-only) MODE="app" ;;
  --dry-run)  DRY=1 ;;
  "")         ;;
  *)          die "Unknown option: $1" ;;
esac

SSH="ssh -p ${VPS_PORT}"
TARGET="${VPS_USER}@${VPS_HOST}"

say "Target: ${TARGET}:${VPS_PATH}   domain: ${DOMAIN}"

# --------------------------------------------------------------- preflight --
# Caddy asks Let's Encrypt for a certificate the moment the site block loads.
# If DNS does not point here yet that request fails and the site serves a TLS
# error instead of the page, so it is worth one lookup before uploading.
if command -v nslookup >/dev/null 2>&1; then
  # Only the answer section: everything from the "Name:" line onward. Reading
  # every "Address:" line would pick up the resolver's own address and report
  # a bogus wrong-A-record warning for a domain that simply does not exist.
  resolved="$(nslookup "$DOMAIN" 2>/dev/null | sed -n '/^Name:/,$p' | awk '/^Address/{print $NF}' | head -1 || true)"
  if [[ -z "$resolved" ]]; then
    warn "$DOMAIN does not resolve yet. Caddy cannot get a certificate until it does."
  elif [[ "$resolved" != "$VPS_HOST" ]]; then
    warn "$DOMAIN resolves to $resolved, not $VPS_HOST. Check the A record."
  else
    say "DNS OK: $DOMAIN -> $resolved"
  fi
fi

# Files that belong in the repo but never on the server.
EXCLUDES=(
  ".git" ".gitignore" ".vscode" ".DS_Store" "Thumbs.db"
  "node_modules" "data" ".env" "deploy.conf"
  "deploy.sh" "deploy.conf.example" "*.md"
)

cd "$ROOT"

if [[ $DRY -eq 1 ]]; then
  say "DRY RUN — files that would be uploaded:"
  find . -type f \
    | grep -vE '(\.git/|node_modules/|/data/|\.env$|deploy\.conf|deploy\.sh$|\.md$)' \
    | sed 's|^\./|  |'
  exit 0
fi

say "Uploading application"
TAR_EXCL=()
for e in "${EXCLUDES[@]}"; do TAR_EXCL+=(--exclude="$e"); done

STAGE="/tmp/kindred-stage-$$"

# One SSH session for the whole deploy: with password authentication, one
# connection means one prompt instead of a dozen.
tar czf - "${TAR_EXCL[@]}" . | $SSH "$TARGET" "bash -s" <<REMOTE
set -euo pipefail

APP="$VPS_PATH"
DOMAIN="$DOMAIN"
ACME_EMAIL="$ACME_EMAIL"
MODE="$MODE"
STAGE="$STAGE"

step() { printf '\033[1;36m  ->\033[0m %s\n' "\$*"; }

# ------------------------------------------------------------ unpack code --
mkdir -p "\$STAGE" "\$APP"
tar xzf - -C "\$STAGE"

if [[ "\$MODE" == "full" ]]; then
  # -------------------------------------------------------------- guards ---
  if command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
    echo "[!] nginx is running and would conflict with Caddy on :80/:443." >&2
    echo "    Stop it before deploying:  systemctl disable --now nginx" >&2
    exit 1
  fi

  if ! command -v caddy >/dev/null 2>&1; then
    echo "[!] Caddy is not installed, but this deploy assumes it (the SRM site uses it)." >&2
    exit 1
  fi

  # ---------------------------------------------------------------- node ---
  need_node=1
  if command -v node >/dev/null 2>&1; then
    major="\$(node -v | sed 's/^v//' | cut -d. -f1)"
    [[ "\$major" -ge 18 ]] && need_node=0
  fi
  if [[ "\$need_node" -eq 1 ]]; then
    step "Installing Node.js 22"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
  step "Node \$(node -v)"

  # ------------------------------------------------------------ app user ---
  if ! id kindred >/dev/null 2>&1; then
    step "Creating kindred service user"
    adduser --system --group --home "\$APP" --no-create-home kindred
  fi

  # better-sqlite3 may need to compile if no prebuilt binary matches.
  if ! dpkg -s build-essential >/dev/null 2>&1; then
    step "Installing build-essential (for better-sqlite3)"
    apt-get install -y build-essential python3
  fi
fi

# ------------------------------------------------------------ sync files --
step "Syncing files into \$APP"
mkdir -p "\$APP/data"
rsync -a --delete \
  --exclude node_modules --exclude data --exclude .env \
  "\$STAGE"/ "\$APP"/
rm -rf "\$STAGE"

# ------------------------------------------------------------- .env file --
# Secrets are never carried in this script or in the repo. The file is created
# once, with a generated admin token; Stripe keys are typed in on the server.
if [[ ! -f "\$APP/.env" ]]; then
  step "Creating .env (Stripe keys still need filling in)"
  cat > "\$APP/.env" <<ENVFILE
BASE_URL=https://\$DOMAIN
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CURRENCY=usd
ADMIN_TOKEN=\$(openssl rand -hex 32)
PORT=3000
DB_PATH=\$APP/data/kindred.db
ENVFILE
else
  # Keep BASE_URL honest if the domain changed, but never touch the secrets.
  sed -i "s|^BASE_URL=.*|BASE_URL=https://\$DOMAIN|" "\$APP/.env"
fi

# ---------------------------------------------------------- dependencies --
step "Installing npm dependencies"
cd "\$APP"
npm install --omit=dev --no-audit --no-fund

chown -R kindred:kindred "\$APP"
chmod 600 "\$APP/.env"

# --------------------------------------------------------------- systemd --
if [[ "\$MODE" == "full" ]]; then
  step "Installing systemd unit"
  cp "\$APP/kindred.service" /etc/systemd/system/kindred.service
  systemctl daemon-reload
  systemctl enable kindred >/dev/null 2>&1

  # ----------------------------------------------------------------- caddy --
  step "Installing Caddy site block"
  mkdir -p /etc/caddy/conf.d
  if [[ ! -f "\$APP/Caddyfile.kindred" ]]; then
    echo "[!] Caddyfile.kindred missing from the upload." >&2
    exit 1
  fi
  sed "s/__DOMAIN__/\$DOMAIN/g" "\$APP/Caddyfile.kindred" > /etc/caddy/conf.d/kindred.caddy

  # Append the import line rather than rewriting the SRM Caddyfile.
  if ! grep -q 'conf.d/\*' /etc/caddy/Caddyfile; then
    step "Adding conf.d import to /etc/caddy/Caddyfile"
    cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-\$(date +%F-%H%M%S)"
    printf '\n# Additional sites, one file each (added by the Kindred deploy).\nimport /etc/caddy/conf.d/*.caddy\n' >> /etc/caddy/Caddyfile
  fi

  # Validate BEFORE reloading: a bad config here would take the SRM site down.
  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    echo "[!] Caddy config failed validation — NOT reloading. The live site is untouched." >&2
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -20 >&2
    exit 1
  fi
  step "Caddy config valid"
fi

reload_caddy() {
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
}

# ----------------------------------------------------------------- start --
# server.js exits immediately when STRIPE_SECRET_KEY is empty, so starting the
# service before the keys exist would only produce a crash loop. Check first.
if ! grep -qE '^STRIPE_SECRET_KEY=sk_' "\$APP/.env"; then
  if [[ "\$MODE" == "full" ]]; then reload_caddy; fi
  echo
  echo "  ----------------------------------------------------------------"
  echo "  Files are in place, but Kindred is NOT started yet."
  echo "  It needs a Stripe secret key, which belongs only on this server:"
  echo
  echo "    nano \$APP/.env          # fill in STRIPE_SECRET_KEY"
  echo "    systemctl start kindred"
  echo
  echo "  Admin dashboard (token is in that file):"
  echo "    https://\$DOMAIN/admin?token=\$(grep '^ADMIN_TOKEN=' "\$APP/.env" | cut -d= -f2-)"
  echo "  ----------------------------------------------------------------"
  exit 0
fi

step "Starting kindred"
systemctl restart kindred
if [[ "\$MODE" == "full" ]]; then reload_caddy; fi
sleep 3

# ---------------------------------------------------------------- verify --
echo
if ! systemctl is-active --quiet kindred; then
  echo "[!] kindred failed to start:" >&2
  journalctl -u kindred -n 30 --no-pager >&2
  exit 1
fi
echo "  kindred: active"

if ! systemctl is-active --quiet caddy; then
  echo "[!] Caddy is not running — BOTH sites are down:" >&2
  journalctl -u caddy -n 30 --no-pager >&2
  exit 1
fi
echo "  caddy:   active"

code=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/healthz || echo 000)
echo "  \$code  /healthz (straight to Node)"

code=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://\$DOMAIN/" || echo 000)
echo "  \$code  https://\$DOMAIN/"
if [[ "\$code" == "000" ]]; then
  echo "       (first certificate can take a minute — retry shortly)"
fi

# The other site on this box must still be serving.
code=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://markislevit.online/ || echo 000)
echo "  \$code  https://markislevit.online/  (SRM — must still be 200)"
REMOTE

say "Done."
