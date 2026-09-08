# Solid Rock Polska — website

Bilingual (PL/EN) static site for **Solid Rock Polska** — the community and foundation in
Rzeszów, and the Polish part of the international Solid Rock mission.

Built as a Polish site in its own right, not a translation of the American one. Content and
photography come from the community's own [Telegram channel](https://t.me/SolidRockRzeszow).

No build step. No dependencies. No third-party requests at runtime.

---

## Structure

```
srm_pl/
├── index.html            Home                 ├── en/index.html       Home
├── o-nas.html            About                ├── en/about.html
├── co-robimy.html        What we do           ├── en/what-we-do.html
├── wsparcie.html         Support              ├── en/give.html
├── kontakt.html          Contact              ├── en/contact.html
├── dziekujemy.html       Form thank-you       ├── en/thank-you.html
├── 404.html              Bilingual not-found
├── sitemap.xml · robots.txt
├── api/contact.php       Contact-form handler (the only server-side code)
├── assets/
│   ├── css/main.css      Design system + all components (~26 KB)
│   ├── js/main.js        Nav, reveal, counters, clipboard, next-Sunday date
│   ├── fonts/            Newsreader + Figtree, self-hosted woff2 (121 KB)
│   └── img/              27 WebP files from the Telegram channel (~780 KB)
└── deploy/               VPS setup, Caddyfile, deploy scripts — not uploaded
```

Polish is the default at the root; English lives under `/en/`. Every page carries `hreflang`
tags pointing at its counterpart. Five pages per language, down from six — the site is
deliberately lighter than the first version.

---

## Design

A complete redesign, sharing nothing with the previous American-facing version.

| Token | Value | Use |
|---|---|---|
| `--pine-500` / `--pine-700` / `--pine-900` | `#2C5545` `#1E3D31` `#12291F` | Primary. Buttons, CTA bands, footer |
| `--gold-500` / `--gold-600` | `#D89B34` `#A8741F` | Accent, used sparingly — never as a surface |
| `--ink` / `--paper` | `#16211D` `#FBFAF7` | Green-black text on warm paper |

Type: **Newsreader** (serif) for display, **Figtree** for body and UI. Both self-hosted with
`latin` + `latin-ext` so Polish diacritics render correctly and no visitor IP reaches Google.

The homepage leads with a **split hero** rather than a full-bleed photo, and a **schedule
strip** — the single most useful thing the site can tell a visitor is when they can turn up.

---

## Two kinds of statistics, kept apart

This matters and is deliberate. The site shows:

- **Solid Rock Polska since 2025** — small, honest, verifiable numbers (started 2025,
  two weekly gatherings, three free programmes in 2026, zero cost to attend).
- **The whole Solid Rock mission since 2012** — 20 371 children, 67+ towns, 350+ volunteers,
  10 010+ Christmas gifts, on a visually distinct pine section, with a footnote saying the
  figures cover every country the mission works in.

Do not merge these. The Polish foundation has not reached 20 371 children, and presenting
the mission's record as its own would be false.

---

## Deployment

Unchanged from before — Hostinger VPS running Caddy. Full walkthrough in
[deploy/DEPLOY.md](deploy/DEPLOY.md) and the [visual guide](deploy/guide.html).

```bash
bash deploy/deploy.sh --dry-run   # preview
bash deploy/deploy.sh             # publish
```

`deploy/Caddyfile` redirects the legacy Tilda paths *and* the first version's URLs
(`/programy.html`, `/zespol.html`, `/en/team.html`, …) so nothing already shared breaks.

Local preview (static pages only; the form needs PHP):
```
python -m http.server 8000
```

---

## Before this is finished

1. **Photographs of children.** `dzieci-*.webp` and several gallery images show identifiable
   minors. Under Polish law (RODO plus image rights, art. 81 pr. aut.) publishing these needs
   guardian consent. They came from your own public channel, so consent may already exist via
   camp registration — please confirm before this goes live, or swap them for photos where
   children are not identifiable.

2. **Foundation registration.** The site says "Fundacja w trakcie rejestracji" in the footer
   and about page, and the PLN/BLIK card says *coming soon* rather than showing an invented
   account number. Add the KRS and NIP once you have them; the giving page's tax paragraph
   will need rewriting at the same time.

3. **A Polish phone number.** The contact page carries a clearly-marked placeholder. The old
   US and Ukrainian numbers were removed — they were no use to a visitor in Rzeszów.

4. **The "three organisations" block.** It names USA, Ukraine and Poland, following the voice
   brief ("we have an American organisation, a Ukrainian organisation and a Polish one"). If
   you want Ukraine dropped entirely, it's the `orgs_block` section on the home and about pages.

5. **Team list.** Four people are named on the about page. Add or correct as needed — there
   are no portraits, by design, to keep the page light.

---

## Editing notes

- **Header and footer are duplicated per page** — the cost of having no build step. Change
  one, change all twelve.
- **Counters** animate from `data-count` and format via `Intl.NumberFormat` using the page's
  `lang`, so `20371` renders `20 371` in Polish and `20,371` in English automatically.
- **`data-next-sunday`** fills in the date of the coming Sunday, so the schedule reads as an
  invitation rather than an opening hour.
- **Reveal on scroll** is opt-in per element: `class="rv"` plus optional `data-d="1..3"`.
  Everything degrades to visible without JS or under `prefers-reduced-motion`.

---

## Accessibility & privacy

- Skip link, visible focus rings, `aria-current` on the active nav item, labelled form fields.
- All motion respects `prefers-reduced-motion`; the three theme states (light, dark, and the
  unstamped system default) are defined as complete token sets.
- **No Google Fonts, no analytics, no external calls.** Fonts are self-hosted specifically so
  visitor IPs never reach a third party. There is no cookie banner because nothing is tracked.
