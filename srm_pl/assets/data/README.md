# news.json — one file, three surfaces

`assets/data/news.json` is the only file that changes when the news changes. It
feeds:

| surface | page | what it renders |
|---|---|---|
| the digest | `co-robimy.html`, `en/what-we-do.html` | weekly rhythm + the newest four entries, one thumbnail each |
| the blog | `aktualnosci.html`, `en/news.html` | every entry in full: photo gallery, body text, facts, event details |
| the rhythm | both of the above | recurring meetings, with dates computed in the browser |

The markup on those pages is an empty container; `news()`, `blog()` and
`lightbox()` in `assets/js/main.js` do the rest. **Never edit the HTML to add a
news item.** Photos live in `assets/img/news/`.

Excluded from deploy: this README (`*.md`). `news.json` and the images ship.

## Shape

```jsonc
{
  "channel":   "https://t.me/SolidRockRzeszow",  // the "follow" button
  "updated":   "2026-09-08",                     // shown in the footer line
  "imageBase": "assets/img/news/",               // where photo `src` resolves
  "place":     { "pl": "…", "en": "…" },         // under the weekly rhythm

  // Recurring meetings, rendered with real dates computed in the browser, so
  // they never go stale. weekday: 0 = Sunday … 6 = Saturday.
  "rhythm": [
    { "weekday": 0, "time": "11:00",
      "pl": { "name": "…", "note": "…" },
      "en": { "name": "…", "note": "…" } }
  ],

  // Entries. File order does not matter — the renderer sorts by date, newest
  // first, with undated notes last.
  "items": [
    {
      "id":      "2026-09-12-festiwal-nadziei",  // unique slug; becomes the
                                                 // element id, so
                                                 // /aktualnosci.html#<id> works
      "date":    "2026-09-12",       // OPTIONAL, YYYY-MM-DD
      "dateEnd": "2026-09-13",       // OPTIONAL, for a multi-day event
      "kind":    "planned",          // past | planned | note
      "link":    "https://t.me/…",   // OPTIONAL, the original post
      "where":   { "pl": "…", "en": "…" },  // OPTIONAL, place line
      "hours":   { "pl": "…", "en": "…" },  // OPTIONAL, opening times

      "photos": [                    // OPTIONAL; [0] is the lead image
        { "src": "festiwal-nadziei", // filename in assets/img/news/, no .webp
          "w": 515, "h": 732,        // real pixel size — prevents layout shift
          "pl": "alt text …", "en": "alt text …" }
      ],

      "pl": {
        "title": "…",
        "lead":  "…",                // one sentence; the digest shows only this
        "body":  ["paragraph", "…"], // blog page only
        "facts": ["chip", "…"]       // blog page only, small pills
      },
      "en": { "…same shape…" }
    }
  ]
}
```

## Rules the renderer follows

- `kind` picks the chip: `past` → "Za nami" / "Happened", `planned` →
  "Zaplanowane" / "Planned" (gold), `note` → "Warto wiedzieć" / "Good to know".
- Omit `kind` and it is inferred from `date` (future → `planned`, else `past`).
- Omit `date` and the entry becomes a standing note: no date, sorted last, and
  in the digest it gets a tinted full-width card.
- `lead` is what the digest shows. `body` and `facts` appear only on the blog
  page, so an entry with no `body` still reads fine in both places.
- The digest shows `photos[0]` as a square thumbnail; the blog page shows
  `photos[0]` large and the rest as a thumbnail strip that opens the lightbox.
- Both `pl` and `en` are required on every entry — there is no fallback.
- Everything is inserted with `textContent`. HTML in the strings is shown
  literally, never executed. Write plain text.
- If the file is missing or malformed, both pages keep their static fallback
  paragraph linking to Telegram. Nothing breaks.

## Adding photos

Telegram's web preview tops out at 800px, which is plenty for the 400–600px
slots the layout uses, so one file per photo at native size is enough — no
srcset, no variants.

```bash
python -c "
from PIL import Image
im = Image.open('SOURCE.jpg').convert('RGB')
im.save('assets/img/news/NAME.webp', 'WEBP', quality=82, method=6)
print(im.size)"   # put those numbers in the entry's w/h
```

Write a real `alt` in both languages. It is also the lightbox caption, so
describe what is in the frame, not just the occasion.

## For a future Telegram scraper

The channel's own posts are in Ukrainian, so `pl` and `en` are translations,
not copies — the scraper needs a translation step.

Write the whole file, do not append: read it, add new objects to `items`, trim
to roughly the newest 8–10, bump `updated`, write it back. Leave `rhythm`
alone. Post media has to be downloaded and converted as above; hot-linking
`cdn*.telesco.pe` will not work, because the site's Content-Security-Policy is
`img-src 'self' data:` and blocks remote images.

Validate before deploying — an unparsable file silently falls back to the
static paragraph:

```bash
python -m json.tool assets/data/news.json > /dev/null && echo ok
```
