# Kindred — VPS deployment

Node + SQLite behind **Caddy**, Stripe Checkout for payments, on the Hostinger VPS
at `187.77.77.62`.

> **This box is not empty.** It already serves the SRM Polska site
> (`markislevit.online`) from Caddy. Do **not** install nginx — it would fight Caddy
> for ports 80 and 443 and take that site down. The previous version of this file
> said to install nginx and run certbot; that advice was wrong for this server and
> has been removed. Caddy issues and renews TLS itself, so there is no certbot here.

---

## 1. One-time: point a domain at the box

Kindred needs its **own** hostname — an A record for it pointing at `187.77.77.62`.
`markislevit.online` is taken by the other site.

Wait for the record to resolve before deploying; Caddy asks Let's Encrypt for a
certificate the moment the site loads, and that fails if DNS is not live yet.

## 2. One-time: local config

```bash
cd deploy
cp deploy.conf.example deploy.conf
```

Fill in `DOMAIN` and `ACME_EMAIL`. `deploy.conf` is gitignored — it never gets committed.

## 3. Deploy

```bash
bash deploy/deploy.sh --dry-run   # see what would be uploaded
bash deploy/deploy.sh             # do it
```

It asks for the SSH password once, then on the server it will:

- install Node 22 and `build-essential` if missing
- create the `kindred` system user and `/var/www/kindred`
- upload the app and run `npm install --omit=dev`
- write `/var/www/kindred/.env` on first run, with a generated `ADMIN_TOKEN`
- install the systemd unit
- write `/etc/caddy/conf.d/kindred.caddy` and add an `import` line to the main
  Caddyfile — **it never rewrites the SRM config**, and it keeps a timestamped backup
- run `caddy validate` before reloading, so a bad config cannot take the live site down
- check that both Kindred and `markislevit.online` still answer

On the first run it stops before starting the service, because there is no Stripe key yet.

## 4. Stripe keys — on the server, not in a chat

```bash
ssh root@187.77.77.62
nano /var/www/kindred/.env
```

Fill in `STRIPE_SECRET_KEY` from dashboard.stripe.com/apikeys.
**Use a test key (`sk_test_…`) first.** Then:

```bash
systemctl start kindred
systemctl status kindred
journalctl -u kindred -f
```

Set `CURRENCY` here too. BLIK / Przelewy24 only work with `pln`, and the prices in
`server.js` are integers in the smallest unit — switching currency means restating them.

## 5. Stripe webhook

**Without this, every sign-up stays `pending` forever.** The webhook is what marks it paid.

1. dashboard.stripe.com → Developers → Webhooks → **Add endpoint**
2. URL: `https://YOURDOMAIN/api/webhook`
3. Event: `checkout.session.completed`
4. Copy the signing secret (`whsec_…`) into `.env` as `STRIPE_WEBHOOK_SECRET`
5. `systemctl restart kindred`

Also set Settings → Business → Public details → statement descriptor to `KND DIGITAL`,
so the discretion promise on the page is actually true.

## 6. Test before taking real money

With test keys: card `4242 4242 4242 4242`, any future expiry, any CVC.

- the thank-you screen appears when Stripe sends you back
- `https://YOURDOMAIN/admin?token=…` shows the row as **paid** (token is in `.env`)

Then swap to live keys, `systemctl restart kindred`, and do one real small purchase
on yourself before spending anything on ads.

## Updating later

```bash
bash deploy/deploy.sh --app-only
```

Pushes code and restarts the service. Skips provisioning and leaves Caddy alone.

---

## Blocking issues before real traffic

These are not polish. Each one is a reason not to open the doors yet.

- **The hero claims listeners are online who are not.** `public/index.html:383` prints
  "N listeners free right now · typical wait 90 seconds", counted from the hardcoded
  `LISTENERS` array at line 674 — eight invented people with invented years of
  experience. It will say the same thing at 4am with nobody employed. In the EU that is
  a misleading commercial practice under the UCPD, and the audience is people having a
  bad day. Wire it to real presence or delete the strip.
- **Privacy and Terms links go nowhere** (`public/index.html:647`), while the checkout
  says "you agree to our Terms" (line 953). You cannot take payment against terms that
  do not exist.
- **No refund policy** matching the "first call refunded" guarantee on the page.
- **GDPR Art. 9.** Topics like grief or loneliness attached to a named person are
  arguably health data — a stricter category than ordinary personal data. That affects
  your privacy policy, your retention period, and your hosting contract. Get it reviewed.
- **Login is a stub.** The modal authenticates nobody.
- **No transactional email.** A paid customer currently gets a `console.log`.

## Operational gaps

- **Backups.** SQLite is one file at `/var/www/kindred/data/kindred.db`, on one box.
  Nothing copies it off the server yet:
  ```bash
  apt install -y sqlite3
  echo '0 3 * * * kindred sqlite3 /var/www/kindred/data/kindred.db ".backup /var/www/kindred/data/backup-$(date +\%F).db"' \
    > /etc/cron.d/kindred-backup
  ```
  That still leaves every copy on the same machine — pull them down regularly.
- **Prices live in `server.js` (`PLANS`) and nowhere else.** The object in `index.html`
  is display only. Change one, change both; the server value is what gets charged.
