# Solid Rock Mission Polska — website

Bilingual (PL/EN) static site for the Poland branch of [Solid Rock Mission](https://solidrockmission.org),
based in Rzeszów. Rebuilt from the original Tilda site with the same brand recognition —
slate / sand / coral palette, Isaiah 61:1 framing, impact counters, missionary support links.

No build step. No dependencies. No third-party requests at runtime.

---

## Structure

```
srm_pl/
├── index.html            PL homepage          ├── en/index.html      EN homepage
├── programy.html         Programs             ├── en/programs.html
├── projekty.html         Projects             ├── en/projects.html
├── zespol.html           Team                 ├── en/team.html
├── wsparcie.html         Give                 ├── en/give.html
├── kontakt.html          Contact              ├── en/contact.html
├── dziekujemy.html       Form thank-you       ├── en/thank-you.html
├── 404.html              Bilingual not-found
├── sitemap.xml · robots.txt
├── api/contact.php       Contact-form handler (the only server-side code)
├── assets/
│   ├── css/main.css      Design system + all components (~35 KB)
│   ├── js/main.js        Nav, scroll reveal, counters, clipboard (~7 KB)
│   ├── fonts/            Jost + Manrope, self-hosted woff2 (83 KB)
│   └── img/              39 WebP files, responsive sizes (2.5 MB total)
└── deploy/               VPS setup, Caddyfile, deploy scripts — not uploaded
```

Polish is the default language at the root; English lives under `/en/`. Each page carries
`hreflang` tags pointing at its counterpart, so Google indexes both and shared links land
in the right language.

---

## Design system

Colours are lifted from the original site so the two feel like one organisation.

| Token | Value | Use |
|---|---|---|
| `--ink-900 / 800 / 700` | `#111315` `#1a2026` `#232b33` | Dark sections, hero, footer, body text |
| `--sand-50 / 200 / 300` | `#faf8f6` `#e1d9d5` `#c4bdb8` | Alternating light sections |
| `--coral` / `--coral-dk` | `#f69178` / `#d4674a` | Primary CTAs, accents, eyebrow text |
| `--gold` | `#f5c662` | Reserved highlight |

Type: **Jost** for display (closest free match to the original's Geometria), **Manrope** for body.
Both self-hosted with `latin` + `latin-ext` subsets so Polish diacritics render correctly.

Everything scales fluidly with `clamp()` — there are no fixed breakpoints in the type scale.

---

## Deployment

Target is a **Hostinger VPS running Caddy**. Full walkthrough in
[deploy/DEPLOY.md](deploy/DEPLOY.md); the short version:

```bash
# once, on the server
scp deploy/server-setup.sh deploy/Caddyfile root@YOUR_VPS_IP:/root/
ssh root@YOUR_VPS_IP "bash /root/server-setup.sh"

# once, locally
bash deploy/set-domain.sh yourdomain.pl
cp deploy/deploy.conf.example deploy/deploy.conf   # then set VPS_HOST

# every time after that
bash deploy/deploy.sh
```

| File | Role |
|---|---|
| `deploy/server-setup.sh` | One-time bootstrap: Caddy, PHP-FPM, firewall, SMTP credentials |
| `deploy/Caddyfile` | Site config — auto-HTTPS, caching, security headers, legacy redirects |
| `deploy/deploy.sh` | `rsync --delete` upload, with a tar-over-SSH fallback for Windows |
| `deploy/set-domain.sh` | Rewrites the hardcoded domain in all 105 places |
| `api/contact.php` | Contact-form handler — the only executable file on the server |

Local preview (static pages only; the form needs PHP):
```
python -m http.server 8000
```

---

## Before going live

These need a human decision or real data — they are marked in the code, not silently faked.

1. **Domain.** Every canonical URL, `hreflang` and `og:url` assumes `https://solidrockmission.pl`.
   Run `bash deploy/set-domain.sh yourdomain.pl` — it rewrites all 105 references and
   verifies none are left behind.

2. **PLN payments.** `wsparcie.html` / `en/give.html` have a "Przelew i BLIK" card that
   currently shows a *Coming soon* notice instead of an account number. Wire up
   Przelewy24, PayU or Stripe and replace the notice — do not invent an IBAN.

3. **Tax deductibility.** Both give pages state plainly that a gift to a US 501(c)(3) is
   **not** deductible on a Polish tax return, and offer to route donors through a partner
   church or foundation. Confirm that this is how you want it worded; it is a legal claim.

4. **SMTP credentials.** The contact form relays through an authenticated SMTP server.
   `server-setup.sh` prompts for the details and writes them to `/etc/srm/smtp.conf`
   on the VPS (mode `0640`, outside the web root). A Gmail App Password is the quickest
   start; see [deploy/DEPLOY.md §5](deploy/DEPLOY.md). Nothing secret lives in this repo.

5. **Missing portraits.** Six team members render as initials on a sand gradient
   (`.person__photo--placeholder`): Mark Kyzliuk, Karina Zhavoronkova, Olya Zhavoronkova,
   Alex & Anna Zakharov, Olesya Andrienko, and the Ukraine leadership pairs. Drop a square
   photo into `assets/img/` and swap the placeholder `<div>` for an `<img>` to fill them in.

6. **2024–2025 impact numbers.** The chart on the programs pages ends at 2023 — that is
   where the source site's data stops. Add the newer bars when you have the figures.

---

## Editing notes

- **Header and footer are duplicated per page.** That is the cost of having no build step.
  Change one, change all twelve — grep for the block you are editing.
- **Images** are pre-generated at several widths (`-640`, `-1000`, `-1600`). Adding a new
  photo means generating the sizes and writing the `srcset` by hand.
- **Counters** animate from `data-count` and format via `Intl.NumberFormat` using the page's
  `lang`, so `20371` renders as `20 371` in Polish and `20,371` in English automatically.
- **Scroll reveal** is opt-in per element via `class="reveal"` plus optional `data-delay="1..4"`.
  Everything degrades to visible if JavaScript is off or `prefers-reduced-motion` is set.

---

## Accessibility & privacy

- Skip link, visible focus rings, `aria-current` on the active nav item, labelled form fields.
- The bar chart carries a full `role="img"` + `aria-label` description of every data point.
- All motion respects `prefers-reduced-motion`.
- **No Google Fonts, no analytics, no external calls.** Fonts are self-hosted specifically so
  visitor IPs are never sent to a third party — the Google Fonts CDN has been ruled a GDPR/RODO
  problem in EU case law. Adding analytics later would require a cookie banner; there is none
  now because nothing is tracked.
