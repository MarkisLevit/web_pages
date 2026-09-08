#!/usr/bin/env bash
#
# Solid Rock Mission Polska — upload the site to the VPS.
#
#     bash deploy/deploy.sh            # deploy
#     bash deploy/deploy.sh --dry-run  # show what would change, touch nothing
#
# Settings come from deploy/deploy.conf (create it from deploy.conf.example).
# Uses local rsync when present; otherwise streams a tarball over SSH and lets
# the server's own rsync do the sync — Git Bash on Windows has no rsync.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
CONF="$HERE/deploy.conf"

die() { printf '\n[!] %s\n' "$*" >&2; exit 1; }
say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

[[ -f "$CONF" ]] || die "Missing $CONF — copy deploy.conf.example to deploy.conf and fill it in."
# shellcheck disable=SC1090
source "$CONF"

: "${VPS_HOST:?set VPS_HOST in deploy.conf}"
: "${VPS_USER:=root}"
: "${VPS_PORT:=22}"
: "${VPS_PATH:=/var/www/srm}"

DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

# Files that belong in the repo but never on the web server.
EXCLUDES=(
  ".git" ".gitignore" ".vscode" ".DS_Store" "Thumbs.db"
  "deploy" "README.md" "*.md" "deploy.conf"
  # Source material, not site content. Voice notes and raw recordings must never
  # be pushed to the web root — anything uploaded there is publicly downloadable.
  "*.ogg" "*.oga" "*.m4a" "*.wav" "audio_*"
)

SSH="ssh -p ${VPS_PORT}"
TARGET="${VPS_USER}@${VPS_HOST}"

say "Target: ${TARGET}:${VPS_PATH}  (port ${VPS_PORT})"
# No pre-flight probe: it only costs an extra authentication round-trip.
# Any connection problem surfaces on the first real command, with SSH's own
# error message intact rather than swallowed by a redirect.

cd "$ROOT"

if command -v rsync >/dev/null 2>&1; then
  say "Using local rsync"
  ARGS=(-az --delete --human-readable --info=stats1,name0)
  for e in "${EXCLUDES[@]}"; do ARGS+=(--exclude "$e"); done
  [[ $DRY -eq 1 ]] && ARGS+=(--dry-run) && say "DRY RUN — nothing will be written"
  rsync "${ARGS[@]}" -e "$SSH" ./ "${TARGET}:${VPS_PATH}/"
else
  say "No local rsync — streaming a tarball and syncing server-side"
  TAR_EXCL=()
  for e in "${EXCLUDES[@]}"; do TAR_EXCL+=(--exclude="$e"); done

  STAGE="/tmp/srm-stage-$$"
  RSYNC_FLAGS="-a --delete"
  [[ $DRY -eq 1 ]] && RSYNC_FLAGS="$RSYNC_FLAGS --dry-run -v" && say "DRY RUN — nothing will be written"

  tar czf - "${TAR_EXCL[@]}" . \
    | $SSH "$TARGET" "set -e
        mkdir -p '$STAGE'
        tar xzf - -C '$STAGE'
        mkdir -p '$VPS_PATH'
        rsync $RSYNC_FLAGS '$STAGE'/ '$VPS_PATH'/
        rm -rf '$STAGE'"
fi

if [[ $DRY -eq 0 ]]; then
  say "Setting permissions, reloading Caddy and verifying"

  # Everything below runs in a single SSH session on purpose: with password
  # authentication, one connection means one prompt instead of six.
  $SSH "$TARGET" "bash -s" <<REMOTE
set -e
chown -R caddy:caddy '$VPS_PATH'
find '$VPS_PATH' -type d -exec chmod 755 {} +
find '$VPS_PATH' -type f -exec chmod 644 {} +

# reload only works on a running service; if Caddy died on an earlier bad
# config, start it rather than failing the whole deploy.
systemctl reload caddy 2>/dev/null || systemctl restart caddy
sleep 2

if ! systemctl is-active --quiet caddy; then
  echo
  echo "[!] Caddy is not running. Files uploaded, but the site is down:"
  journalctl -u caddy -n 20 --no-pager
  exit 1
fi

echo
echo "  Caddy: active"
for path in / /en/ /co-robimy.html /assets/css/main.css; do
  code=\$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${VPS_HOST}" "http://127.0.0.1\${path}")
  printf '  %s  %s\n' "\$code" "\$path"
done
REMOTE

  say "Deployed."
fi
