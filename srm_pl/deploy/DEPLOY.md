# Deploying to a Hostinger VPS

End-to-end: from a fresh VPS to a live HTTPS site with a working contact form.
Budget about 30 minutes, most of it waiting for DNS.

---

## 0. What you need

| | |
|---|---|
| **Hostinger VPS** | Any KVM plan. In hPanel go to **VPS → Manage → OS & Panel** and make sure the template is **Ubuntu 24.04 (plain)** — no cPanel, no CyberPanel. Those panels install their own Apache/nginx and will fight Caddy for ports 80/443. |
| **Your domain** | Registered anywhere. You need access to its DNS records. |
| **SSH access** | hPanel → **VPS → SSH Access** shows the IP, port and root password. Adding an SSH key there saves typing the password on every deploy. |
| **An SMTP account** | For the contact form. A Gmail App Password is the quickest — see §5. |

Everything below is run from **Git Bash** on Windows (it ships with Git for Windows).

---

## 1. Point the domain at the VPS

Grab the VPS IP from hPanel → **VPS → Overview**.

**If the domain is registered with Hostinger:** hPanel → **Domains** → pick the domain →
**DNS / Nameservers** → **DNS Zone**. Delete any existing `A` records for `@` and `www`,
then add:

```
Type   Name    Points to        TTL
A      @       203.0.113.45     3600      <- your VPS IP
A      www     203.0.113.45     3600
```

**If it is registered elsewhere** (OVH, GoDaddy, namecheap…), add the same two `A` records
in that registrar's DNS panel.

Then wait. Check from Git Bash until it answers with your VPS IP:

```bash
nslookup yourdomain.pl 1.1.1.1
```

Usually 5–30 minutes. **Do not run step 4 until this resolves** — Caddy asks Let's Encrypt
for a certificate on first request, and Let's Encrypt rate-limits repeated failures.

---

## 2. Check the Hostinger firewall

hPanel → **VPS → Settings → Firewall**. If a firewall is active, it must allow **80** and
**443** inbound. If no firewall rules exist, everything is open and there is nothing to do —
`server-setup.sh` configures `ufw` on the box itself either way.

---

## 3. Bootstrap the server (once)

Copy the two setup files up and run them:

```bash
cd /m/Work/web_pages/srm_pl

scp deploy/server-setup.sh deploy/Caddyfile root@203.0.113.45:/root/
ssh root@203.0.113.45 "bash /root/server-setup.sh"
```

It will ask for your domain, an email for certificate expiry notices, and your SMTP details,
then install Caddy and PHP-FPM, write the configs, and open the firewall.

What it sets up:

- **Caddy** serving `/var/www/srm`, with automatic HTTPS and renewal
- **A dedicated PHP-FPM pool** that only runs `/api/*.php`, with `open_basedir` locked to
  three directories and `exec`/`shell_exec`/`system` disabled
- **`/etc/srm/smtp.conf`** — your SMTP password, mode `0640`, `root:www-data`, outside the
  web root so it can never be served
- **301s from the old Tilda paths** (`/kids`, `/give`, `/contactus`, `/ua`, …) so links
  already shared on Facebook and Instagram keep working

---

## 4. Set the domain and upload

The domain is hardcoded in canonical tags, hreflang pairs, `og:url`, JSON-LD and the
sitemap — 105 places. One command rewrites all of them:

```bash
bash deploy/set-domain.sh yourdomain.pl
```

Tell the deploy script where the server is:

```bash
cp deploy/deploy.conf.example deploy/deploy.conf
# edit deploy/deploy.conf and set VPS_HOST to your IP
```

Then ship it:

```bash
bash deploy/deploy.sh --dry-run   # see what would change
bash deploy/deploy.sh             # actually upload
```

`deploy.conf` is gitignored — your server address never lands in the repo.

Open `https://yourdomain.pl`. The certificate is issued on the first request, so the very
first load can take a few seconds. Watch it if you want:

```bash
ssh root@203.0.113.45 "journalctl -u caddy -f"
```

---

## 5. The contact form and SMTP

The form POSTs to `/api/contact.php`, which relays through an authenticated SMTP server and
redirects to the thank-you page.

**Why a relay and not plain `mail()`:** Hostinger blocks outbound port 25 on VPS plans, and
mail sent directly from a VPS IP with no SPF or DKIM record is filtered as spam almost
everywhere. Relaying through a provider that already has sending reputation is what makes
these messages actually arrive.

### Gmail App Password (quickest)

1. The Google account must have 2-Step Verification on.
2. Go to <https://myaccount.google.com/apppasswords>, create one named `srm-website`.
3. Use the 16-character string as the SMTP password — not your normal Gmail password.

```
host  smtp.gmail.com
port  587
user  solidrockmission@gmail.com
pass  <the 16-character app password>
```

Set **`from_email` to the same Gmail address**. Gmail rewrites the `From` header if it does
not match the authenticated account, which breaks deliverability.

Gmail caps at roughly 500 messages/day — far beyond what a contact form needs.

### Alternatives

**Brevo** (`smtp-relay.brevo.com:587`, 300/day free) or **Resend** (`smtp.resend.com:587`)
give better deliverability and let you send as `kontakt@yourdomain.pl` once you add their
DKIM records. Worth switching to later; not worth blocking launch on.

### Changing SMTP details afterwards

```bash
ssh root@203.0.113.45 "nano /etc/srm/smtp.conf"
```

No restart needed — the handler reads the file on each request.

### Testing it

Submit the form. If something breaks, the error is in the PHP log:

```bash
ssh root@203.0.113.45 "journalctl -u php8.3-fpm -n 50 | grep srm-contact"
```

Every failure is logged with the actual SMTP reply, so you see exactly what the server said.

---

## 6. Everyday updates

Edit files locally, then:

```bash
bash deploy/deploy.sh
```

`rsync --delete` means the server ends up matching your folder exactly — files you deleted
locally get removed remotely too. Run `--dry-run` first if you are unsure.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Browser can't reach the site at all | DNS has not propagated. `nslookup yourdomain.pl 1.1.1.1` must return your VPS IP. |
| Certificate error / stuck on HTTP | Caddy could not complete the ACME challenge. Port 80 must be reachable from the internet: check the hPanel firewall, then `journalctl -u caddy -n 50`. |
| `502` on the contact form | PHP-FPM is not running or Caddy cannot reach its socket. `systemctl status php8.3-fpm` and confirm `/run/php/php-srm.sock` exists. |
| Form says "could not send" | SMTP rejected the login. Almost always a normal password used instead of an App Password. Check the log line in §5. |
| Form times out | Hostinger may restrict outbound SMTP on new VPS accounts. Test with `nc -zv smtp.gmail.com 587`; if it hangs, open a support ticket asking to unblock outbound SMTP. |
| Apache/nginx grabbed the ports | The OS template included a control panel. `systemctl disable --now apache2 nginx`, then `systemctl restart caddy`. |
| Polish characters look wrong | The page is UTF-8 and Caddy sets the charset automatically — this is nearly always the editor saving as Windows-1250. Save as UTF-8. |

---

## What is where, on the server

```
/var/www/srm/              the site (this is what deploy.sh syncs)
/var/www/srm/api/          contact.php — the only executable file
/etc/caddy/Caddyfile       web server config
/etc/srm/smtp.conf         SMTP credentials, 0640 root:www-data
/var/lib/srm/ratelimit/    per-IP submission counters
journalctl -u caddy        access log (journald, not a file)
```
