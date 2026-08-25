# Deploying 3jse.com

**3jse.com is the official website of the 3JSE project** — the domain is owned by the project and this folder *is* the site. It is maintained as part of the repository (policy in `../docs/WEBSITE.md`): every change to `docs/` or to the landing page ships through this repo and gets uploaded from here. This folder is a fully static site — no build step, no server code.

## Upload with Cyberduck
1. Open Cyberduck → connect to your 3jse.com host (SFTP).
2. Upload **the contents of this `site/` folder** (index.html, manual.html, assets/) to the web root (often `public_html/` or `www/`).
3. Visit https://3jse.com — done.

## Notes
- The Three.js hero loads from the jsdelivr CDN. If you prefer fully self-hosted,
  download `three.module.js` 0.170.0 + the `examples/jsm` addons and update the
  import map in `index.html`.
- `manual.html` is generated from `../docs/*.md` — after editing docs, run
  `node site/build-manual.mjs` and re-upload.
- The SVGs in `assets/img/` mirror the repo's `assets/` folder.
