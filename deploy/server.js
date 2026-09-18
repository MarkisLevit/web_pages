'use strict';
require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const Stripe = require('stripe');

const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const CURRENCY = (process.env.CURRENCY || 'usd').toLowerCase();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/* ------------------------------------------------------------------ */
/* database                                                            */
/* ------------------------------------------------------------------ */
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'data', 'kindred.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS signups (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    topics        TEXT,
    language      TEXT,
    timezone      TEXT,
    listener      TEXT,
    plan          TEXT NOT NULL,
    cycle         TEXT NOT NULL,
    follow_up     INTEGER DEFAULT 0,
    is_gift       INTEGER DEFAULT 0,
    recipient     TEXT,
    amount_cents  INTEGER NOT NULL,
    currency      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    stripe_session TEXT,
    stripe_customer TEXT,
    created_at    TEXT NOT NULL,
    paid_at       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_session ON signups(stripe_session);
  CREATE INDEX IF NOT EXISTS idx_created ON signups(created_at);
`);

/* ------------------------------------------------------------------ */
/* pricing — the server is the only source of truth for money          */
/* ------------------------------------------------------------------ */
const PLANS = {
  single:  { label: 'Single call — 30 minutes',        once: true,  monthly: 1900, annual: 1900 },
  monthly: { label: 'Monthly plan — 3 calls a month',  once: false, monthly: 4900, annual: 47000 },
  premium: { label: 'Premium plan — unlimited calls',  once: false, monthly: 8900, annual: 85400 }
};
const FOLLOW_UP_CENTS = 900;

const app = express();
app.set('trust proxy', 1);

/* ------------------------------------------------------------------ */
/* Stripe webhook — MUST be mounted before the JSON body parser        */
/* ------------------------------------------------------------------ */
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    db.prepare(
      `UPDATE signups SET status='paid', paid_at=?, stripe_customer=? WHERE stripe_session=?`
    ).run(new Date().toISOString(), s.customer || null, s.id);
    console.log('Paid:', s.id, s.customer_details && s.customer_details.email);
    // Send your welcome email / provision the account here.
  }

  res.json({ received: true });
});

/* ------------------------------------------------------------------ */
/* middleware                                                          */
/* ------------------------------------------------------------------ */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'", 'https://checkout.stripe.com'],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '32kb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false }));

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const isEmail = v => typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v) && v.length < 200;
const clean = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function priceFor(plan, cycle, followUp) {
  const p = PLANS[plan];
  const base = p.once ? p.monthly : (cycle === 'annual' ? p.annual : p.monthly);
  return base + (p.once && followUp ? FOLLOW_UP_CENTS : 0);
}

/* ------------------------------------------------------------------ */
/* POST /api/checkout                                                  */
/* ------------------------------------------------------------------ */
app.post('/api/checkout', async (req, res) => {
  try {
    const b = req.body || {};
    const name = clean(b.name, 80);
    const email = clean(b.email, 200).toLowerCase();
    const password = typeof b.password === 'string' ? b.password : '';
    const plan = PLANS[b.plan] ? b.plan : null;
    const cycle = b.cycle === 'annual' ? 'annual' : 'monthly';
    const isGift = !!b.gift;
    const recipient = isGift ? clean(b.recipient, 200).toLowerCase() : null;
    const followUp = !!b.followUp;

    if (!name) return res.status(400).json({ error: 'name required' });
    if (!isEmail(email)) return res.status(400).json({ error: 'valid email required' });
    if (password.length < 8) return res.status(400).json({ error: 'password too short' });
    if (!plan) return res.status(400).json({ error: 'unknown plan' });
    if (isGift && !isEmail(recipient)) return res.status(400).json({ error: 'valid recipient email required' });

    const p = PLANS[plan];
    const amount = priceFor(plan, cycle, followUp);
    const id = crypto.randomUUID();

    db.prepare(`INSERT INTO signups
      (id,name,email,password_hash,topics,language,timezone,listener,plan,cycle,
       follow_up,is_gift,recipient,amount_cents,currency,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?)`).run(
      id, name, email, bcrypt.hashSync(password, 12),
      JSON.stringify(Array.isArray(b.topics) ? b.topics.slice(0, 8).map(t => clean(t, 30)) : []),
      clean(b.language, 40), clean(b.timezone, 60), clean(b.listener, 60) || null,
      plan, cycle, followUp ? 1 : 0, isGift ? 1 : 0, recipient,
      amount, CURRENCY, new Date().toISOString()
    );

    const lineItems = [];
    if (p.once) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: p.monthly,
          product_data: { name: isGift ? 'Gifted conversation — 30 minutes' : p.label }
        }
      });
      if (followUp) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: FOLLOW_UP_CENTS,
            product_data: { name: '15-minute follow-up call' }
          }
        });
      }
    } else {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: cycle === 'annual' ? p.annual : p.monthly,
          recurring: { interval: cycle === 'annual' ? 'year' : 'month' },
          product_data: { name: p.label }
        }
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: p.once ? 'payment' : 'subscription',
      line_items: lineItems,
      customer_email: email,
      client_reference_id: id,
      allow_promotion_codes: true,
      metadata: { signup_id: id, plan, cycle, gift: String(isGift), recipient: recipient || '' },
      success_url: `${BASE_URL}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?checkout=cancelled`,
      // Statement descriptors are set in the Stripe Dashboard
      // (Settings → Public details) so charges read "KND DIGITAL".
    });

    db.prepare(`UPDATE signups SET stripe_session=? WHERE id=?`).run(session.id, id);
    res.json({ url: session.url });
  } catch (err) {
    console.error('checkout error:', err);
    res.status(500).json({ error: 'could not start checkout' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/session — used by the thank-you screen                     */
/* ------------------------------------------------------------------ */
app.get('/api/session', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM signups WHERE stripe_session=?`).get(String(req.query.id || ''));
    if (!row) return res.status(404).json({ paid: false });
    let paid = row.status === 'paid';
    if (!paid) {
      const s = await stripe.checkout.sessions.retrieve(row.stripe_session);
      paid = s.payment_status === 'paid' || s.status === 'complete';
    }
    res.json({
      paid,
      name: row.name,
      email: row.email,
      gift: !!row.is_gift,
      recipient: row.recipient,
      listener: row.listener
    });
  } catch {
    res.status(500).json({ paid: false });
  }
});

/* ------------------------------------------------------------------ */
/* GET /admin?token=…                                                  */
/* ------------------------------------------------------------------ */
app.get('/admin', (req, res) => {
  const given = Buffer.from(String(req.query.token || ''));
  const want = Buffer.from(ADMIN_TOKEN);
  if (!ADMIN_TOKEN || given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return res.status(404).send('Not found');
  }
  const rows = db.prepare(`SELECT * FROM signups ORDER BY created_at DESC LIMIT 500`).all();
  const money = c => (c / 100).toFixed(2);
  const esc = v => String(v ?? '').replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Kindred — sign-ups</title>
  <style>body{font:14px/1.5 system-ui;margin:32px;color:#222}table{border-collapse:collapse;width:100%}
  th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
  th{background:#f6f6f6}.paid{color:#137333;font-weight:600}.pending{color:#9a6700}</style>
  <h1>Sign-ups (${rows.length})</h1>
  <p>Paid: ${rows.filter(r => r.status === 'paid').length} · Revenue:
  ${money(rows.filter(r => r.status === 'paid').reduce((a, r) => a + r.amount_cents, 0))} ${CURRENCY.toUpperCase()}</p>
  <table><tr><th>When</th><th>Name</th><th>Email</th><th>Plan</th><th>Topics</th><th>Amount</th><th>Status</th></tr>
  ${rows.map(r => `<tr><td>${esc(r.created_at.slice(0, 16).replace('T', ' '))}</td><td>${esc(r.name)}</td>
  <td>${esc(r.email)}</td><td>${esc(r.plan)} / ${esc(r.cycle)}${r.is_gift ? ' (gift)' : ''}</td>
  <td>${esc(JSON.parse(r.topics || '[]').join(', '))}</td><td>${money(r.amount_cents)}</td>
  <td class="${r.status}">${esc(r.status)}</td></tr>`).join('')}</table>`);
});

/* ------------------------------------------------------------------ */
app.get('/healthz', (_, res) => res.send('ok'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', extensions: ['html'] }));
app.use((_, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '127.0.0.1', () => console.log(`Kindred listening on 127.0.0.1:${PORT}`));
