# For AI agents working on this repo

If you add a new page, section, or site anywhere under deangadberry.com (or
on another repo that ends up hosted as a subpath of it), add one line to
`backpage/index.html`. That page is the one place that lists everything on
this domain, including stuff not linked from the homepage nav, so it needs
to stay complete.

No setup, no build step, nothing to learn — just copy-paste.

## How

1. Open `backpage/index.html`.
2. Pick the right list:
   - The first `<ul class="links">` (right under the `<h1>`) — everything
     current, whether it lives in this repo or elsewhere.
   - The one under `<h3>Old stuff</h3>` at the end — only for things that
     are genuinely old/legacy, not new additions.
3. Add one line right before that list's closing `</ul>`, copied exactly
   from this pattern:

   ```html
   <li><a href="PATH_OR_URL" target="_blank" rel="noopener noreferrer">TITLE</a></li>
   ```

   - Page in this repo → `PATH_OR_URL` is a relative path from `backpage/`,
     e.g. `../newpage`.
   - Anything else → `PATH_OR_URL` is the full `https://...` URL.
   - Optional short gray note after the link, same pattern already used
     on a few lines in that file:

     ```html
     <span class="desc">short description</span>
     ```

That's the whole task. The page already has all the styling it needs —
don't touch the `<style>` block, don't add CSS or JS for this.

## Don't

- Don't link `/backpage` from anywhere (the homepage nav, another page,
  etc.) — it's intentionally only reachable if you already know the URL.
- Don't add animation, the rain/falling-photo effect, or any JS to
  `backpage/index.html`. It stays static on purpose.
