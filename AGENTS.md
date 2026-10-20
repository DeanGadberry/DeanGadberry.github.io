# For AI agents working on this repo

If you add a new page, section, or site anywhere under deangadberry.com (or
on another repo that ends up hosted as a subpath of it), add one line to
`hidden/index.html`. That page is the one place that lists everything on
this domain, including stuff not linked from the homepage nav, so it needs
to stay complete.

No setup, no build step, nothing to learn — just copy-paste.

## How

1. Open `hidden/index.html`.
2. Pick the right list:
   - Under `<h3>This site</h3>` — anything that lives in this repo.
   - Under `<h3>Elsewhere</h3>` — anything hosted elsewhere (another repo,
     a subdomain, a different site entirely).
3. Add one line right before that list's closing `</ul>`, copied exactly
   from this pattern:

   ```html
   <li><a href="PATH_OR_URL" target="_blank" rel="noopener noreferrer">TITLE</a></li>
   ```

   - Page in this repo → `PATH_OR_URL` is a relative path from `hidden/`,
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

- Don't link `/hidden` from anywhere (the homepage nav, another page,
  etc.) — it's intentionally only reachable if you already know the URL.
- Don't add animation, the rain/falling-photo effect, or any JS to
  `hidden/index.html`. It stays static on purpose.
