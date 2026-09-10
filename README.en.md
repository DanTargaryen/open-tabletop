# Open Tabletop

[![CI](https://github.com/DanTargaryen/open-tabletop/actions/workflows/ci.yml/badge.svg)](https://github.com/DanTargaryen/open-tabletop/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/Code-MIT-d2b77c)](LICENSE)

![Open Tabletop collection](docs/collection-preview.jpg)

An open-source collection of browser tabletop games that you can run yourself and extend. It currently includes Texas Hold’em for solo or online play and an unofficial Abracada...What? rules prototype with both local play and friend rooms.

[中文](README.md) · [Add a game](docs/adding-a-game.md) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md)

## Try a game

[Open the existing Texas Hold’em demo](https://velvet-poker-friends.linming-dracarys.chatgpt.site)

This link points to the existing poker demo, not a deployment of this repository’s collection homepage. When you run this repository, its homepage lists available games from the game catalog.

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

## Run locally

Requires **Node.js 22.13 or newer**. There are no npm dependencies, so `npm install` is not required.

```sh
git clone https://github.com/DanTargaryen/open-tabletop.git
cd open-tabletop
npm start
```

Open <http://127.0.0.1:18772>.

| Page | Path |
| --- | --- |
| Game catalog | `/` |
| Solo Texas Hold’em | `/games/texas-holdem/index.html` |
| Online Texas Hold’em | `/games/texas-holdem/online.html` |
| Local Abracada...What? | `/games/abracada-what/index.html` |
| Online Abracada...What? | `/games/abracada-what/online.html` |

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

Tests cover both game engines, room behavior, hidden-information projections, synchronization, and the root server. The static build copies assets to `.dist/public`. Online Texas Hold’em requires `/api/poker`, while online Abracada...What? requires `/api/abracada`. Static-only hosting supports each game’s local mode but cannot provide friend rooms.

The default entry point, `server/index.mjs`, runs in a Node environment you control. An optional Cloudflare adapter is included:

- `deploy/cloudflare/worker.mjs`
- `deploy/cloudflare/wrangler.example.jsonc`

Database settings in the example configuration are placeholders. Create and bind your own resources before using it. This repository does not include reusable hosted accounts or database IDs. See [architecture](docs/architecture.md) for deployment boundaries.

## Extend the collection

Each game lives in `games/<game-id>/` and appears on the homepage through `games/catalog.json`. Additional games will be added as they are implemented and contributed.

```text
games/
  catalog.json
  texas-holdem/
    web/        Browser pages and assets
    server/     Poker rules and room service
    tests/      Game tests
    scripts/    Game development tools
  abracada-what/
    web/        Local and online pages and assets
    server/     Abracada room service
    tests/      Spell, scoring, room, and hidden-information tests
public/         Collection homepage
server/         Node server entry point
deploy/         Optional platform adapters
docs/           Architecture and extension guides
```

Bug fixes, interaction improvements, and complete playable games are welcome. Start with [contributing](CONTRIBUTING.md) and [adding a game](docs/adding-a-game.md). Report security issues privately as described in [security](SECURITY.md).

## License

Original project code is licensed under the [MIT License](LICENSE). Third-party names, marks, and other assets remain subject to the rights and licenses described in [third-party notices](THIRD_PARTY_NOTICES.md).
