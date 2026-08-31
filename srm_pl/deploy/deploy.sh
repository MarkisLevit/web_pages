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
)

SSH="ssh -p ${VPS_PORT}"
TARGET="${VPS_USER}@${VPS_HOST}"

say "Target: ${TARGET}:${VPS_PATH}  (port ${VPS_PORT})"
$SSH "$TARGET" true 2>/dev/null || die "Cannot reach ${TARGET} over SSH. Check the host, port and your key."

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
  say "Fixing ownership and permissions"
  $SSH "$TARGET" "set -e
    chown -R caddy:caddy '$VPS_PATH'
    find '$VPS_PATH' -type d -exec chmod 755 {} +
    find '$VPS_PATH' -type f -exec chmod 644 {} +"

  # reload only works on a running service; if Caddy is stopped (or died on a
  # previous bad config) fall back to a full start rather than failing the deploy.
  say "Reloading Caddy"
  $SSH "$TARGET" "systemctl reload caddy 2>/dev/null || systemctl restart caddy"
  if ! $SSH "$TARGET" "systemctl is-active --quiet caddy"; then
    echo
    $SSH "$TARGET" "journalctl -u caddy -n 20 --no-pager"
    die "Files uploaded, but Caddy is not running. See the log above."
  fi

  say "Done. Verifying:"
  for path in / /en/ /programy.html /assets/css/main.css; do
    code=$($SSH "$TARGET" "curl -s -o /dev/null -w '%{http_code}' -H 'Host: \${HOSTNAME}' http://127.0.0.1${path}" 2>/dev/null || echo "---")
    printf '    %s  %s\n' "$code" "$path"
  done
fi
