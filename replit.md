# Bäckerei Panitz — Website

## Project Overview

A collection of static HTML landing pages for local German businesses, served via Python's built-in HTTP server.

### Pages

| Folder | File | Description |
|---|---|---|
| `backerei/` | `bakery_panitz (1).html` | **Main page** — Bäckerei Panitz (Bautzen, Germany) |
| `backerei/` | `bakery.html`, `bakery_panitz.html`, `bakery_panitz (2).html` | Earlier drafts / variants |
| `Eligent/` | `elligant-landing-page.html` | Luxury hair & beauty studio |
| `jak_w_ulu/` | `jak_w_ulu_artisan_cafe.html` | Scandinavian artisan café |

## Running the Project

```bash
python3 -m http.server 5000
```

Then open: `http://localhost:5000/backerei/bakery_panitz%20(1).html`

The workflow **"Start application"** is already configured and will start this server automatically.

## Bäckerei Panitz — Features

The main page (`bakery_panitz (1).html`) includes:

- **Hero section** with bakery photos
- **About / Geschichte** section
- **Product grid** with category filter (Kuchen & Torten, Feingebäck, Brot & Brötchen)
- **Features strip** — Regional wheat, Night baking, Master craft, Cosy café, Free WiFi, Air conditioning
- **Photo gallery**
- **Opening hours** — two blocks:
  - *Currently valid (until Oct 2026, construction):* Mon–Fri 05:00–13:00, Sat & Sun closed
  - *Regular hours (resume after October, shown dimmed/struck-through):* Mon–Sat 05:00–16:00, Sun closed
- **Contact section** — Phone `03591 / 601065` (clickable), Email `baeckerei.panitz@googlemail.com`
- **Google Maps embed** (`#karte`) in the contact area with a "Route planen" button
- **Construction site alert banner** — shown Mon–Fri 05:00–13:00 until October 2026 (dismissible)
- **Pre-order form** (`#vorbestellung`) with anti-spam:
  - Honeypot hidden field
  - Minimum time-on-form check (6 seconds)
  - Dynamic math captcha
  - Pickup date/time validation
  - Falls back to `mailto:` if Formspree is not configured

## Pre-order Form Email Setup (Formspree)

To receive pre-order emails directly in the inbox:

1. Go to [formspree.io](https://formspree.io) and create a free account
2. Register the email `baeckerei.panitz@googlemail.com`
3. Create a new form — copy the **Form ID** (looks like `xyzabcde`)
4. In `bakery_panitz (1).html`, find `YOUR_FORM_ID` and replace it:
   ```html
   <form ... action="https://formspree.io/f/YOUR_FORM_ID" ...>
   ```
5. Save and re-upload. Done — orders will land in the inbox automatically.

Until then, the form falls back to opening the user's email client with the order details pre-filled.

## User Preferences

- Keep the existing page structure; avoid restructuring or migrating the stack
- Professional web design with warm bakery colour palette (burgundy, amber, cream)
- German-language content
