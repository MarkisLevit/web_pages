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

## Done

- **Fake availability removed.** The hero strip printed "N listeners free right now ·
  typical wait 90 seconds", counted from the hardcoded `LISTENERS` array — it would have
  said the same at 4am with nobody employed. The per-listener "Available now / Back
  tomorrow" badge came from the same array and is now the topics each listener covers.
  Dead CSS went with it. The `on:` flags remain in the data, unused, for if real presence
  ever exists.
- **Privacy and Terms drafted** at `public/privacy.html` and `public/terms.html`, written
  from what `server.js` actually does. Footer and checkout links now point at them.
  **Both are drafts with `[BRACKETED]` gaps and a visible "not yet reviewed" banner.**

## Blocking issues before real traffic

- **The legal pages need a lawyer and their blanks filled.** Entity name, address,
  contact, jurisdiction, retention periods. Remove the draft banner only after review.
- **The roster is eight invented people** with invented years of experience, and the FAQ
  says they are "trained and background-checked". Removing the live counter fixed the
  real-time claim, not this one. It needs to match who you actually employ.
- **"Available 24/7, worldwide"** (`public/index.html:393`) is still a coverage claim —
  make sure it is true.
- **The refund windows contradict each other.** The timeline and FAQ say "within 5
  minutes of the call starting"; line 527 says "within 24 hours". The draft Terms treat
  them as two separate rights, which is the customer-friendly reading. Decide, then make
  page and Terms agree.
- **No 14-day withdrawal acknowledgement at checkout.** Under the Consumer Rights
  Directive, a customer wanting the service to start inside those 14 days must expressly
  request it *and* acknowledge losing the right once delivered. The form does not capture
  either today.
- **Art. 9 consent is not captured separately.** Topic selection needs explicit,
  unbundled consent with a timestamp — consent folded into the Terms does not qualify.
- **Login is a stub.** The modal authenticates nobody.
- **No transactional email.** A paid customer currently gets a `console.log`.
- **Google Fonts** are loaded from Google's servers, so Google sees every visitor's IP.
  Self-hosting the two families removes a third party from the privacy policy entirely.

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
