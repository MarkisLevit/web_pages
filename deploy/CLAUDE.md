# Kindred

Landing page + checkout for a paid emotional-support ("listening") service.
Static front end, small Node backend, Stripe Checkout for payments, deployed on a VPS
behind nginx.

## Layout

```
public/index.html   entire front end — HTML, CSS and JS in one file, no build step
server.js           Express: /api/checkout, /api/webhook, /api/session, /admin
data/kindred.db     SQLite (created on first run, gitignored)
Caddyfile.kindred   Caddy site block (the VPS runs Caddy, not nginx)
deploy/deploy.sh    provision + deploy to the VPS
kindred.service     systemd unit
.env                secrets — never commit, never paste into a chat
```

No bundler, no framework. Edit `public/index.html` directly; changes are live on restart.

## Commands

```bash
npm install          # first time
npm start            # runs on 127.0.0.1:3000
```

Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC.
Admin view: `/admin?token=` + the `ADMIN_TOKEN` from `.env`.

## Rules for changing this codebase

**Prices live in `server.js` (`PLANS`, in cents) and nowhere else.** The `PLANS` object in
`index.html` is display only. If you change one, change both — but the server value is what
the customer is actually charged. Never let the browser send an amount to the server.

**Never add card fields to this site.** Payment details are collected on Stripe's hosted
checkout page. Collecting them here would drag the project into PCI-DSS scope.

**No fake urgency.** No countdown timers, no invented "N people are viewing this", no scarcity
that isn't real. The audience is people having a bad day, and in the EU false urgency is an
unfair commercial practice under the UCPD. The live-availability strip in the hero currently
reads the hardcoded `LISTENERS` array — it must be wired to real presence data or removed
before launch.

**This is not a medical service.** The safety section stating that listeners are not therapists,
and that this is not a crisis service, must stay on the page. Don't let marketing copy drift
toward clinical claims ("treatment", "therapy", "cure", "diagnosis").

**Personal data is sensitive here.** Topics like grief or loneliness attached to a named person
may count as special-category data under GDPR Art. 9. Don't log them, don't send them to
third-party analytics, don't put them in URLs.

## Known TODO

- [ ] Wire live listener availability to real data, or remove the strip
- [ ] Privacy policy and Terms pages (footer links are dead)
- [ ] Refund policy matching the "first call refunded" guarantee on the page
- [ ] Switch to PLN + enable BLIK/Przelewy24 if targeting Poland (they don't work with USD)
- [ ] Transactional email on successful checkout (currently just a console.log in the webhook)
- [ ] Login flow is a stub — the modal exists but authenticates nobody
- [ ] Nightly SQLite backup off the box
