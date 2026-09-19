# Open Tabletop

[![CI](https://github.com/DanTargaryen/open-tabletop/actions/workflows/ci.yml/badge.svg)](https://github.com/DanTargaryen/open-tabletop/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/Code-MIT-d2b77c)](LICENSE)

![Open Tabletop collection](docs/collection-preview.jpg)

An open-source collection of browser games that you can run yourself and extend. **The collection contains Texas Hold’em, unofficial Splendor: Pokémon, Abracada...What?, Aeroplane Chess, Chamber Pact and Steel Expedition**, with local AI, shared-screen play or online rooms depending on the game.

[中文](README.md) · [Add a game](docs/adding-a-game.md) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md)

## Try a game

[Open the game lobby](https://velvet-poker-friends.linming-dracarys.chatgpt.site)

The public root URL is the six-game selection homepage. All six games provide friend rooms. Steel Expedition is a desktop 2D game with keyboard movement and mouse-or-keyboard aiming, weapon selection, firing and menus.

Texas Hold’em includes:

- Solo play and online rooms to share with friends.
- Doubao, ChatGPT, Claude, GLM, and DeepSeek themed opponents. Their decisions use local strategies: **no model API calls or API keys are required**.
- Hand evaluation, main-pot and side-pot settlement, and masking of opponents’ hole cards in online play.
- Persistent room state, recovery after a refresh, and lightweight synchronization at 1 / 2 / 5 second intervals according to state.
- Automatic check or fold after a 45 second action timeout, with a 24 hour room activity TTL.

The Abracada...What? rules prototype includes:

- Local play and six-character-code friend rooms. Each game supports 2–5 total seats and 1–5 human players, with public-information-only local AI filling empty seats.
- A multi-round score mode that ends at 8 points and a one-round mode with no persistent scoring.
- All eight spell effects, the chained-casting restriction, secret stones, player-count setup rules, action animations, and a narrow-screen layout.
- A separate hidden-information projection for every online player, refresh recovery, and AI tower spirits that take over after a 45-second timeout or temporary disconnect.
- Original HTML/CSS visuals with no publisher art, scans, or other official assets.

Brand names and marks remain the property of their respective owners. They do not imply participation or endorsement, and the project’s MIT license does not grant rights to those marks. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Splendor: Pokémon

An unofficial implementation of the published Pokémon edition: 2–4 seats, 90 cards, evolution, special cards, and an 18-point final round. Solo opponents use local heuristics. Online rooms include readiness, optional AI filling, refresh recovery, private hands, and separate persistence.

Numeric data is community-transcribed and has not been checked card-by-card against a physical copy. All 55 species have local illustrations from The Artificial’s creator-authored Pokémon Icons, shared with attribution under their stated CC-BY permission. No numeric placeholders are used. See [game documentation](games/splendor/README.md) and [sources and notices](games/splendor/SOURCES.md). Pokémon multiplayer supports the Node server or Cloudflare Workers with migrated D1 storage. Pokémon rooms and rate limits use separate tables from poker.

## Aeroplane Chess

Aeroplane Chess is available at `/games/aeroplane-chess/index.html` (solo AI or 2–4 players sharing a screen) and `/games/aeroplane-chess/online.html` (1–4 human players, empty seats filled by local rule-based AI). Its shared rules engine implements six-to-launch, bonus rolls, color jumps, shortcut flights, captures and exact-finish bounce. The in-game help documents the house rules: stacks move individually, no blockades and no triple-six penalty. Four finished planes win immediately.

Friend rooms use server-generated dice, action validation, revision CAS, request deduplication, refresh recovery, 45-second action timeouts and a 24-hour activity TTL. Node storage is isolated in `aeroplane-rooms.json`; the optional Worker adapter requires migration `0004_aeroplane_rooms.sql`. Static files alone support local play. No remote AI or API key is needed. See [game documentation](games/aeroplane-chess/README.md). [Play solo / shared-screen](https://velvet-poker-friends.linming-dracarys.chatgpt.site/games/aeroplane-chess/index.html) or [open a friend room](https://velvet-poker-friends.linming-dracarys.chatgpt.site/games/aeroplane-chess/online.html).

## Chamber Pact

A high-pressure table duel with mixed live and blank shells. Solo play uses local rule AI (casual / standard / expert / pro). Friend rooms are two humans only, with no AI fill. Practice, night and challenge lighting modes; night hides the far side, and challenge reloads may turn the lights off.

The engine settles first, then animation displays the same result; adrenaline injects, then steals the clicked opponent slot. Friend rooms pick a random first player and force a shot at the opponent after 90 seconds. Node storage is `buckshot-rooms.json`; the Worker adapter needs `0005_buckshot_rooms.sql`. [Solo](https://velvet-poker-friends.linming-dracarys.chatgpt.site/games/buckshot-roulette/index.html) · [Friend room](https://velvet-poker-friends.linming-dracarys.chatgpt.site/games/buckshot-roulette/online.html).

## Steel Expedition

An original 2D turn-based artillery duel for desktop browsers. Move with `A/D`, pull backward on the lower-left slingshot control to fire in the opposite direction, or fine-tune aim and power with `W/S` and `Q/E`. Seven shells across four tiers unlock as the battle advances, while supply drops restore health or grant rare tier-four ammunition. Explosions damage tanks and permanently deform the layered terrain. In addition to solo rule AI, friend rooms offer four seats (A1, B1, A2 and B2). Humans can switch to any empty seat; the host adds AI manually, with no AI by default. Rooms support 1-vs-1, asymmetric teams and two humans against two AI. Solo and multiplayer share easy, normal and hard AI, camera behavior, ballistics and supply rules. The server authoritatively resolves movement, ballistics, damage and terrain in `A1 → B1 → A2 → B2` order. See [game documentation](games/steel-arc/README.md).

## Run locally

Requires **Node.js 22.13 or newer**. Install the local dependencies before the first run:

```sh
git clone https://github.com/DanTargaryen/open-tabletop.git
cd open-tabletop
npm install
npm start
```

Open <http://127.0.0.1:18772>.

| Page | Path |
| --- | --- |
| Game catalog | `/` |
| Solo Texas Hold’em | `/games/texas-holdem/index.html` |
| Online Texas Hold’em | `/games/texas-holdem/online.html` |
| Solo Splendor: Pokémon | `/games/splendor/index.html` |
| Online Splendor: Pokémon | `/games/splendor/online.html` |
| Local Abracada...What? | `/games/abracada-what/index.html` |
| Online Abracada...What? | `/games/abracada-what/online.html` |
| Solo / shared-screen Aeroplane Chess | `/games/aeroplane-chess/index.html` |
| Online Aeroplane Chess | `/games/aeroplane-chess/online.html` |
| Solo Chamber Pact | `/games/buckshot-roulette/index.html` |
| Online Chamber Pact | `/games/buckshot-roulette/online.html` |
| Solo Steel Expedition | `/games/steel-arc/index.html` |
| Online Steel Expedition | `/games/steel-arc/online.html` |

To play with friends on the same local network:

```sh
npm run lan
```

Share `http://your-local-network-address:18772`. This command binds to `0.0.0.0`; your device’s firewall must also allow access to the port.

## Configuration

| Setting | CLI option | Environment variable | Default |
| --- | --- | --- | --- |
| Port | `--port` | `PORT` | `18772` |
| Runtime data directory | `--data-dir` | `DATA_DIR` | `.data/` |
| Public origin | `--origin` | `PUBLIC_ORIGIN` | Derived from the request |

For example, when running behind a reverse proxy:

```sh
npm start -- --port 18772 --data-dir /absolute/path/tabletop-data --origin https://tabletop.example.com
```

`--origin` configures the external origin. It does not configure DNS, TLS, or a reverse proxy. Public deployments need their own HTTPS entry point.

Runtime data may contain room state and recovery identities. Keep it outside public directories, Git, and static deployments. The current Node backend uses **single-instance JSON persistence**; multiple processes must not share the same data file.

## Test and deploy

```sh
npm test
npm run build:static
```

Tests cover all six game engines, plus room behavior, hidden-information projections and synchronization for all six online games. The static build copies assets to `.dist/public`; solo Steel Expedition works there without a backend. Online rooms, including `/api/steel-arc`, require a Node or Worker + D1 backend.

The default entry point, `server/index.mjs`, runs in a Node environment you control. An optional Cloudflare adapter is included:

- `deploy/cloudflare/worker.mjs`
- `deploy/cloudflare/wrangler.example.jsonc`

Database settings in the example configuration are placeholders. Create and bind your own resources before using it. This repository does not include reusable hosted accounts or database IDs. See [architecture](docs/architecture.md) for deployment boundaries.

## Extend the collection

Each game lives in `games/<game-id>/` and appears on the homepage through `games/catalog.json`. The sixth entry is the 2D artillery game `steel-arc`, with solo and friend-room modes; additional games will be added as they are implemented and contributed.

```text
games/
  catalog.json
  texas-holdem/
    web/        Browser pages and assets
    server/     Poker rules and room service
    tests/      Game tests
    scripts/    Game development tools
  splendor/
    web/        Pokemon pages and assets
    server/     Pokemon room service
    tests/      Game and room tests
  abracada-what/
    web/        Local and online pages and assets
    server/     Abracada room service
    tests/      Spell, scoring, room, and hidden-information tests
  aeroplane-chess/
    web/        Solo, shared-screen and online UI with shared rules
    server/     Authoritative Aeroplane room service
    tests/      Rules, rooms and HTTP tests
  buckshot-roulette/
    web/        Solo and friend-room UI, 3D table and models
    server/     Authoritative Chamber Pact room service
    tests/      Rules, rooms and HTTP tests
public/         Collection homepage
server/         Node server entry point
deploy/         Optional platform adapters
docs/           Architecture and extension guides
```

Bug fixes, interaction improvements, and complete playable games are welcome. Start with [contributing](CONTRIBUTING.md) and [adding a game](docs/adding-a-game.md). Report security issues privately as described in [security](SECURITY.md).

## License

Original project code is licensed under the [MIT License](LICENSE). Third-party names, marks, and other assets remain subject to the rights and licenses described in [third-party notices](THIRD_PARTY_NOTICES.md).
