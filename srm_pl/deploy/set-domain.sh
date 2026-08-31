#!/usr/bin/env bash
#
# Rewrite the site's canonical domain everywhere it is hardcoded.
#
#     bash deploy/set-domain.sh solidrock.pl
#
# The domain appears in canonical tags, hreflang pairs, og:url, JSON-LD,
# sitemap.xml and robots.txt — around 100 places. Run this before the first
# deploy, and again if the domain ever changes.

set -euo pipefail

NEW="${1:-}"
[[ -n "$NEW" ]] || { echo "Usage: bash deploy/set-domain.sh <new-domain>   (no https://, no trailing /)"; exit 1; }

NEW="${NEW#http://}"; NEW="${NEW#https://}"; NEW="${NEW%/}"; NEW="${NEW#www.}"
[[ "$NEW" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || { echo "[!] '$NEW' does not look like a domain."; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CURRENT=$(grep -oP '(?<=<link rel="canonical" href="https://)[^/"]+' index.html | head -1)
[[ -n "$CURRENT" ]] || { echo "[!] Could not read the current domain from index.html"; exit 1; }

if [[ "$CURRENT" == "$NEW" ]]; then
  echo "Domain is already $NEW — nothing to do."; exit 0
fi

echo "Rewriting:  $CURRENT  ->  $NEW"

mapfile -t FILES < <(grep -rl "$CURRENT" --include='*.html' --include='*.xml' --include='*.txt' . || true)
[[ ${#FILES[@]} -gt 0 ]] || { echo "[!] No files reference $CURRENT"; exit 1; }

for f in "${FILES[@]}"; do
  n=$(grep -c "$CURRENT" "$f")
  sed -i "s|${CURRENT}|${NEW}|g" "$f"
  printf '  %3d  %s\n' "$n" "${f#./}"
done

echo
echo "Done — ${#FILES[@]} files updated."
echo "Remaining references to the old domain: $(grep -rc "$CURRENT" --include='*.html' --include='*.xml' --include='*.txt' . 2>/dev/null | grep -v ':0' | wc -l)"
