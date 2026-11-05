# For AI agents working on this repo

If you add a new page, section, or site anywhere under deangadberry.com (or
on another repo that ends up hosted as a subpath of it), add one line to
`backpage/index.html`. That page is the one place that lists everything on
this domain, including stuff not linked from the homepage nav, so it needs
to stay complete.

No setup, no build step, nothing to learn — just copy-paste.

The back page is laid out like a phone home screen: a grid of rounded-square
app icons with a label underneath each one. Every entry needs an icon —
don't add a text-only link.

## How

1. Open `backpage/index.html`.
2. Pick the right grid:
   - The first `<div class="grid">` (right under the `<h1>`) — everything
     current, whether it lives in this repo or elsewhere.
   - The one under `<h3>Old stuff</h3>` at the end (`<div class="grid
     grid-old">`) — only for things that are genuinely old/legacy, not new
     additions.
3. Add one tile right before that grid's closing `</div>`, copied exactly
   from this pattern:

   ```html
   <a class="app" href="PATH_OR_URL" target="_blank" rel="noopener noreferrer" title="TITLE — optional short description">
       <svg class="icon" viewBox="0 0 64 64">ICON_SVG_HERE</svg>
       <span class="label">TITLE</span>
   </a>
   ```

   - Page in this repo → `PATH_OR_URL` is a relative path from `backpage/`,
     e.g. `../newpage`.
   - Anything else → `PATH_OR_URL` is the full `https://...` URL.
   - The `title` attribute is where the optional short description goes
     now (it shows as a hover tooltip) — put `TITLE` alone there if there's
     nothing extra to say.

### The icon

Generate a small original SVG icon for the new page — don't skip this.
Every icon on the page follows the same format, 64×64 viewBox, so any new
one matches:

```html
<rect width="64" height="64" rx="14" fill="#COLOR"/>
<g fill="none" stroke="#FDFBF7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(32,32)">
  <!-- a simple pictogram, 1-4 paths/shapes, roughly -16..16 on each axis -->
</g>
```

Guidelines:
- Rounded-square background (`rx="14"`), a distinct muted/jewel-tone fill
  color not already used by another icon on the page.
- Pictogram strokes in cream (`#FDFBF7`), `stroke-width` 2.2–2.6, round
  caps/joins, centered via `transform="translate(32,32)"`.
- Keep it simple — a handful of paths that read clearly at 56px, not a
  detailed illustration. Pick something that evokes the page's subject
  (an instrument for a music page, a dumbbell shape for fitness, a book
  for reading, etc.) — get creative, this doesn't need to be literal.
- If the page already has its own logo/icon file (e.g. a project with its
  own `icon.svg`), reuse it instead of drawing a new one — use
  `<img class="icon" src="../path/to/icon.svg" alt="">` in place of the
  inline `<svg>`.
- No existing distinct options or unsure what to draw? Use one of the
  default templates below rather than leaving an entry icon-less.

### Default icon templates

Reusable fallbacks, same format, neutral slate `#5A6A72` background:

```html
<!-- page -->
<svg class="icon" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#5A6A72"/><g fill="none" stroke="#FDFBF7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(32,32)"><path d="M-9,-15 L5,-15 L12,-8 L12,15 L-9,15 Z"/><path d="M5,-15 L5,-8 L12,-8"/></g></svg>

<!-- link -->
<svg class="icon" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#5A6A72"/><g fill="none" stroke="#FDFBF7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(32,32)"><rect x="-13" y="-11" width="26" height="20" rx="3"/><path d="M-13,-5 L0,4 L13,-5"/></g></svg>

<!-- folder -->
<svg class="icon" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#5A6A72"/><g fill="none" stroke="#FDFBF7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(32,32)"><path d="M-14,-6 L-2,-6 L2,-10 L14,-10 L14,10 L-14,10 Z"/></g></svg>

<!-- star -->
<svg class="icon" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#5A6A72"/><g fill="none" stroke="#FDFBF7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(32,32)"><path d="M0,-15 L4,-5 L15,-4 L7,3 L9,14 L0,8 L-9,14 L-7,3 L-15,-4 L-4,-5 Z"/></g></svg>
```

Pick whichever shape fits best (page/link/folder/star), or draw a custom
one per the guidelines above if one of these doesn't fit.

That's the whole task. The page already has all the styling it needs —
don't touch the `<style>` block, don't add CSS or JS for this.

## If asked to clean up, redesign, or improve the back page

Check every existing tile for a real, distinctive icon — not a default
template — and design one for any that are still using a default or
feel generic. Match the format and guidelines above, reuse a page's own
logo file where one exists, and get creative with anything ambiguous
rather than leaving it as a fallback.

## Parent pages only — no child links

One entry per feature, pointing at its top-level/parent page, and that's
it. If what you're adding has sub-pages underneath it (e.g. a hub page
with a few linked child pages, or a list page whose items each open their
own page), only the parent/hub goes on the back page. Don't add separate
entries for each child — the parent page's own navigation is how you reach
those, and the back page would turn into a dumping ground otherwise.

Example: adding a "Vitality" hub with four linked sub-pages (strength,
flexibility, nutrition, energy) gets exactly one line on the back page,
for `../vitality` — not five.

## Don't

- Don't link `/backpage` from anywhere (the homepage nav, another page,
  etc.) — it's intentionally only reachable if you already know the URL.
- Don't add animation, the rain/falling-photo effect, or any JS to
  `backpage/index.html`. It stays static on purpose.
