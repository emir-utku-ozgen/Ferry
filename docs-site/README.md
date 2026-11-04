# Ferry Docs site

Static documentation site generated from the Markdown in [`../docs`](../docs) plus the root reference reports (`GAP_ANALYSIS.md`, `CORRIDOR_VERIFICATION.md`, `TESTNET_HASHES.md`). The Markdown stays the single source of truth; this folder only holds the generator and theme.

```bash
cd docs-site
npm install
npm run build     # -> docs-site/dist
npm run preview   # build + serve locally
```

- **Add or reorder a page:** edit the `PAGES` list at the top of `build.mjs`.
- **Theme:** `assets/style.css` uses the Ferry app's "Bosphorus at dusk" palette, with dark and light modes.
- **Auto-linking:** inline code that names a Stellar transaction hash or account is linked to Stellar Expert (Testnet). A doc filename links to its page, and a repository path links to GitHub.
- **Deploy:** Vercel project `ferry-docs` (https://ferry-docs.vercel.app), connected to this repo with Root Directory `docs-site`. Build settings live in `vercel.json`. Every push to `main` redeploys automatically.
