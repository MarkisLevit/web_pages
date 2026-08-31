#!/usr/bin/env bash
#
# Solid Rock Mission Polska — one-time VPS bootstrap (Ubuntu/Debian).
#
# Installs Caddy and PHP-FPM, writes the site config and SMTP credentials,
# and opens the firewall. Run once, as root, on a fresh Hostinger VPS:
#
#     sudo bash server-setup.sh
#
# Re-running is safe: it overwrites config but never touches site content.

set -euo pipefail

die() { printf '\n[!] %s\n' "$*" >&2; exit 1; }
say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }

[[ $EUID -eq 0 ]] || die "Run this as root:  sudo bash server-setup.sh"
command -v apt-get >/dev/null || die "This script targets Ubuntu/Debian."

SITE_ROOT=/var/www/srm
CONF_DIR=/etc/srm
STATE_DIR=/var/lib/srm

# --------------------------------------------------------------- questions --

say "Site details"
read -rp "  Domain (without www, e.g. solidrock.pl): " DOMAIN
[[ -n "${DOMAIN// }" ]] || die "A domain is required."
read -rp "  Email for Let's Encrypt expiry notices: " ACME_EMAIL
[[ -n "${ACME_EMAIL// }" ]] || die "An email is required."

say "SMTP relay — used to deliver contact-form messages"
echo "  Hostinger blocks outbound port 25, and mail sent straight from a VPS IP"
echo "  goes to spam. Use an authenticated relay instead. Common choices:"
echo "    Gmail   smtp.gmail.com     port 587  (needs an App Password)"
echo "    Brevo   smtp-relay.brevo.com  port 587  (300/day free)"
echo "    Resend  smtp.resend.com    port 587"
echo
read -rp "  SMTP host [smtp.gmail.com]: " SMTP_HOST
SMTP_HOST=${SMTP_HOST:-smtp.gmail.com}
read -rp "  SMTP port [587]: " SMTP_PORT
SMTP_PORT=${SMTP_PORT:-587}
read -rp "  SMTP username: " SMTP_USER
[[ -n "${SMTP_USER// }" ]] || die "SMTP username is required."
read -rsp "  SMTP password / app password: " SMTP_PASS; echo
[[ -n "${SMTP_PASS// }" ]] || die "SMTP password is required."
read -rp "  Send FROM address [${SMTP_USER}]: " FROM_EMAIL
FROM_EMAIL=${FROM_EMAIL:-$SMTP_USER}
read -rp "  Deliver TO address [solidrockmission@gmail.com]: " TO_EMAIL
TO_EMAIL=${TO_EMAIL:-solidrockmission@gmail.com}

# ---------------------------------------------------------------- packages --

say "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  debian-keyring debian-archive-keyring apt-transport-https \
  curl gnupg ca-certificates rsync ufw \
  php-fpm php-mbstring php-cli

if ! command -v caddy >/dev/null; then
  say "Adding the official Caddy repository"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

PHP_VER=$(ls -1 /etc/php 2>/dev/null | sort -V | tail -n1)
[[ -n "$PHP_VER" ]] || die "PHP-FPM did not install correctly."
PHP_SOCK=/run/php/php-srm.sock
say "Detected PHP $PHP_VER"

# ----------------------------------------------------------- php-fpm pool --

say "Configuring a dedicated PHP-FPM pool"
cat > "/etc/php/${PHP_VER}/fpm/pool.d/srm.conf" <<POOL
; Dedicated pool for the Solid Rock contact form.
; PHP runs as www-data; the socket is owned by caddy so only Caddy can reach it.
[srm]
user  = www-data
group = www-data

listen       = ${PHP_SOCK}
listen.owner = caddy
listen.group = caddy
listen.mode  = 0660

pm                       = ondemand
pm.max_children          = 5
pm.process_idle_timeout  = 10s
pm.max_requests          = 200

; The handler needs nothing but its own directory, its config and its state.
php_admin_value[open_basedir]      = ${SITE_ROOT}:${CONF_DIR}:${STATE_DIR}:/tmp
php_admin_value[disable_functions] = exec,passthru,shell_exec,system,proc_open,popen,curl_exec,curl_multi_exec
php_admin_flag[allow_url_fopen]    = off
php_admin_flag[expose_php]         = off
php_admin_value[max_execution_time] = 30
php_admin_value[post_max_size]      = 256K
php_admin_value[upload_max_filesize] = 0
POOL

# ---------------------------------------------------------- dirs & secrets --

say "Creating directories"
mkdir -p "$SITE_ROOT" "$CONF_DIR" "$STATE_DIR/ratelimit"
chown -R caddy:caddy "$SITE_ROOT"
chown -R www-data:www-data "$STATE_DIR"
chmod 700 "$STATE_DIR/ratelimit"

say "Writing SMTP credentials to ${CONF_DIR}/smtp.conf"
cat > "${CONF_DIR}/smtp.conf" <<CONF
; Read by /var/www/srm/api/contact.php — keep outside the web root.
smtp_host = "${SMTP_HOST}"
smtp_port = "${SMTP_PORT}"
smtp_user = "${SMTP_USER}"
smtp_pass = "${SMTP_PASS}"
from_email = "${FROM_EMAIL}"
from_name  = "Solid Rock Mission - strona"
to_email   = "${TO_EMAIL}"
CONF
chown root:www-data "${CONF_DIR}/smtp.conf"
chmod 640 "${CONF_DIR}/smtp.conf"

# ------------------------------------------------------------------ caddy --

say "Installing the Caddy site config"
SRC_CADDYFILE="$(dirname "$(readlink -f "$0")")/Caddyfile"
[[ -f "$SRC_CADDYFILE" ]] || die "Caddyfile not found next to this script."

[[ -f /etc/caddy/Caddyfile ]] && cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s)"

sed -e "s|__DOMAIN__|${DOMAIN}|g" \
    -e "s|__ACME_EMAIL__|${ACME_EMAIL}|g" \
    -e "s|__PHP_SOCK__|${PHP_SOCK}|g" \
    "$SRC_CADDYFILE" > /etc/caddy/Caddyfile

caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile || die "Caddyfile failed validation."

# Access logs go to the systemd journal, not a file — see the note in the
# Caddyfile. Nothing to create or chown, and no permission problem can stop
# the web server from starting.

# --------------------------------------------------------------- firewall --

say "Opening the firewall (22, 80, 443)"
ufw allow OpenSSH   >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
ufw allow 80/tcp    >/dev/null
ufw allow 443/tcp   >/dev/null
ufw --force enable  >/dev/null

# ---------------------------------------------------------------- restart --

say "Restarting services"
systemctl enable --now "php${PHP_VER}-fpm" >/dev/null 2>&1 || systemctl enable --now php-fpm
systemctl restart "php${PHP_VER}-fpm"
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy

# Do not report success if Caddy died on startup — the old code let a failed
# start slip past and the next thing the operator saw was a dead site.
sleep 2
if ! systemctl is-active --quiet caddy; then
  echo
  echo "[!] Caddy did not stay running. The reason is in the last lines below:"
  echo
  journalctl -u caddy -n 20 --no-pager
  die "Fix the error above, then re-run this script."
fi

cat <<DONE

  ------------------------------------------------------------------
  Server is ready.

    Domain      : ${DOMAIN}
    Site root   : ${SITE_ROOT}
    PHP socket  : ${PHP_SOCK}  (PHP ${PHP_VER})
    SMTP relay  : ${SMTP_USER} via ${SMTP_HOST}:${SMTP_PORT}

  Next, from your Windows machine:

    1. Point DNS at this server (hPanel -> Domains -> DNS Zone):
           A   @     $(curl -s4 --max-time 5 ifconfig.me || echo YOUR_VPS_IP)
           A   www   $(curl -s4 --max-time 5 ifconfig.me || echo YOUR_VPS_IP)

    2. Upload the site:
           bash deploy/deploy.sh

  Caddy will fetch the TLS certificate on the first HTTPS request once
  DNS resolves. Watch it happen with:  journalctl -u caddy -f
  ------------------------------------------------------------------

DONE
