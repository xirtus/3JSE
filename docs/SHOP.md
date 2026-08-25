# 3JSE Shop

## What this is

The Shop is 3JSE's content marketplace — **examples, kits, templates, and community games**, browsable in the editor and on 3jse.com. Its defining rule is **link-first**: the app ships metadata and pointers, never content. The editor stays lightweight; the internet is the CDN. Where the vendor registry (`VENDOR_INTEGRATIONS.md`) exists for *capabilities* — code worth wrapping into `@3jse/*` packages — the Shop exists for *content*: things to learn from, remix, play, or start from. The two cross-link whenever both apply (poseidon is both a water capability and a kit).

## Design principles

1. **Link-first.** An entry is metadata plus URLs: source repo, homepage, live demo, and — for the freshest work — a social signal (an x.com post, the way `chiro-elemental`'s registry entry already records `x.com/TokenGremlin/status/…` and its author). Nothing is mirrored or re-hosted by default. Pulling happens on demand through the same pinned-commit staging machinery the vendor fetcher already uses (`VENDOR_INTEGRATIONS.md`, Tier B) — a fixed SHA, never a floating branch.
2. **The Shop states licensing; it never adjudicates it.** Every entry carries the license *as declared by the creator*, with the registry's `verifiedBy` status. The Shop's legal posture is disclosure and attribution, not warranty. What users build with a kit is their own responsibility — this is written into the Terms of Use, and the Terms ask users to be ethical: credit the humans, respect the declared terms, don't repackage someone else's game as your own.
3. **Everything is a project.** Any example, kit, or community game can be staged as a read-only project, run in the editor, inspected — then "Save as my project" forks it locally. There is no second way to consume content; the editor's normal project flow (`PROJECT_FORMAT.md`) is the only way.
4. **Curated, not a firehose.** Scrapers generate *candidates*; humans and the Curator agent graduate them. X/Twitter drops are the freshest and riskiest signal class — they always land as candidates, never auto-published, and staged content never executes at import time (`VENDOR_INTEGRATIONS.md`'s sandboxing section applies unchanged).
5. **First-party shelf is templates only.** The one shelf 3JSE itself maintains is `TEMPLATES.md`'s template catalog — every other shelf is someone else's work, attributed and linked, never absorbed.

## Categories

| Category | What belongs | Canonical example |
|---|---|---|
| **Examples** | Technique demos, reference scenes, the official Three.js examples (indexed wholesale from `threejs.org/examples/files.json`, pinned to the current Three.js release tag) | `webgl_animation_keyframes` |
| **Kits** | Reusable packs: shader/effect collections, character rigs, environment kits — the Owen pantheon, Chiro Elemental, Three-VFX | `poseidon`, `chiro-elemental` |
| **Templates** | Official 3JSE templates (`TEMPLATES.md`) — the only first-party shelf | `template-third-person` |
| **Community games** | Finished or playable games, including the AI-generated wave — links to where the creator published: GitHub, an x.com post, itch.io, a personal site | a game the creator posted on X |
| **Portals** | Discovery feeds, not entries: CodePen's `three-js` tag, itch.io's webgl tag, an x.com search — rendered as browse-out links | — |

## Sources and scraping

- **Official examples shelf** — `tools/shop-scan.mjs` indexes `threejs.org/examples/files.json` (the same index the official examples page loads) and emits one candidate per example: live URL `threejs.org/examples/#<slug>`, source at `github.com/mrdoob/three.js/blob/<release>/examples/<slug>.html`. Three.js is MIT; the shelf is the single largest free selection the Shop can offer and it costs us one HTTP fetch.
- **GitHub discovery** — the same tool queries `gh api search/repositories` (`topic:threejs`, stars threshold, license field from the API *as a hint only*) and emits candidates with `license.verifiedBy` empty. The API's license field is a hint, never a verdict — the registry's BOM case (`tiamat`, `VENDOR_INTEGRATIONS.md`) is exactly why.
- **Social drops (x.com et al.)** — no automated scraping: the platforms' APIs are closed or paid, and the content is the riskiest class. Captured manually (or by a human-supervised Curator agent) into candidates with the post id and author recorded as the `signal` field — the pattern already established in the registry.
- **Everything lands in `packages/vendor/shop-candidates.json` first.** Publishing to `packages/vendor/shop.json` is a deliberate, reviewed step — the same graduation discipline as Tier B → Tier A, applied to content.

## Entry schema (`packages/vendor/shop.json`)

```json
{
  "id": "webgl-animation-keyframes",
  "category": "example",
  "title": "Animation — keyframes",
  "author": "Three.js project",
  "source": {
    "repo": "github.com/mrdoob/three.js",
    "pinnedCommit": "r185",
    "liveDemo": "https://threejs.org/examples/#webgl_animation_keyframes"
  },
  "license": { "spdx": "MIT", "verifiedBy": "human", "verifiedAt": "2026-08-24" },
  "tags": ["animation", "skinning"],
  "aiGenerated": false,
  "registryId": null,
  "notes": ""
}
```

Fields: `id` (globally unique with the registry), `category`, `title`, `author`, `source` (`repo`/`homepage`/`liveDemo`/`signal`), `pinnedCommit`, `license` (as declared + verification status), `tags`, `aiGenerated` (the AI-game wave gets flagged in the UI with "license uncertain — check with the creator"), `registryId` (cross-link when the same work is a capability), `notes`. `signal` records `{ platform, url, author }` for social drops.

## Licensing and ethics — the paperwork

- The Shop states what the creator declared. `verifiedBy: "human"` remains a hard gate for anything the editor *imports* into a user's machine; a link-only entry (live demo, homepage) can ship with `verifiedBy` empty and is rendered with an "as declared" badge instead of a verdict.
- **Users are responsible for what they build.** The Terms of Use (`site/terms.html`, linked from the Shop in editor and on the web) state it plainly: each entry's license governs its use; commercial use must be checked independently; creators must be attributed; the Shop is a directory and licensor of nothing; no warranty, express or implied.
- **The Terms ask users to be ethical.** Credit the humans. Respect the declared terms. Don't pass off others' work — AI-generated or not — as your own. The Shop makes great software; how people use it is their own responsibility, and the Terms say so without pretending to police it.
- **Take-down.** Any creator can have their work removed from the Shop by issue or email; removals happen promptly, no questions required. The Shop is a service to creators, not a claim on their work.

## Editor integration

The Content Browser gains a **Shop** panel (Phase 3, alongside the Open Source panel — same `@3jse/vendor` machinery, different shelf):

- **Browse** — cards with screenshot, license badge, category tabs, search, `aiGenerated` flag.
- **Preview** — stages the pinned tarball into `/plugins/_vendor/shop/<id>/` read-only and runs it sandboxed. Never executes at import time.
- **Open as project** — materializes a normal project folder; Play works; "Save as my project" forks it. The AI-generated wave is consumable here like everything else: as a project to learn from and remix.
- **Install** — exists only for registry-cross-linked entries (`registryId`), where it behaves exactly like the Open Source panel's install button.
- **Live demo** — opens the creator's canonical link. The creator's page is the entry's home, always.

## Website integration

`site/shop.html` is the public Shop — the same `shop.json`, baked by `site/build-shop.mjs` (generated, never hand-edited, like the manual). It renders the shelves, license badges, the ethics/legal band, and a deep-link placeholder (`3jse://open?entry=<id>`) that becomes live once the editor registers the protocol. Terms live at `site/terms.html`.

## Roadmap placement

- **Phase 3** — Shop panel, Preview/Open-as-project staging (reuses the vendor fetcher), the official examples shelf (the files.json index is an immediate, zero-risk win), and the candidates queue.
- **Phase 4** — the Curator agent graduates candidates → entries under human review, exactly like registry curation.
- **Phase 6** — community submissions UI, ratings, the take-down workflow, and the `3jse://` deep-link protocol. No payment rails — the Shop is free and open; a paid marketplace is explicitly out of scope.

## What the Shop is not

- **Not a payment marketplace.** No money rails, no storefront for selling assets — free and open, now and later.
- **Not a license adjudicator.** The Shop discloses; it does not decide disputes, and it will not guess licenses the creator never declared.
- **Not a hosting service.** Creators' links stay canonical; the Shop mirrors nothing publicly (staging is local and pinned, never re-served).
