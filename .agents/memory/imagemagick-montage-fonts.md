---
name: ImageMagick montage/convert font requirement
description: On this container, any ImageMagick text annotation fails unless an explicit -font path is passed.
---

# ImageMagick annotation needs an explicit font on this container

`montage`/`magick` fails with `unable to read font ''` whenever it tries to
render text (a `-title`, tile labels, `-annotate`, `-draw text`, etc.) because no
default font is configured in this NixOS environment.

**Fix:** pass an explicit font file, discovered at runtime:

```bash
FONT=$(fc-list : file | head -1 | cut -d: -f1)   # e.g. /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
magick montage img1 img2 ... -font "$FONT" -tile 4x4 -geometry 260x195+3+3 out.jpg
```

**Why:** image-only operations (plain montage with no labels) work fine; the
error only appears once annotation is involved, so it's easy to misread as a
different problem.

**How to apply:** any time you build a contact sheet / montage / labeled image
with ImageMagick here, resolve a font via `fc-list` first and pass `-font`.
Building a labelless montage is the quickest way to eyeball many images at once
(read the output file with the image reader).
