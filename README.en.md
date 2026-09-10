# Open Tabletop

[![CI](https://github.com/DanTargaryen/open-tabletop/actions/workflows/ci.yml/badge.svg)](https://github.com/DanTargaryen/open-tabletop/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/Code-MIT-d2b77c)](LICENSE)

![Open Tabletop collection](docs/collection-preview.jpg)

An open-source collection of browser tabletop games that you can run yourself and extend. **The collection contains Texas Hold’em and an unofficial Splendor: Pokémon implementation**, with solo play against local AI and online rooms for friends.

[中文](README.md) · [Add a game](docs/adding-a-game.md) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md)

## Try a game

[Open the existing Texas Hold’em demo](https://velvet-poker-friends.linming-dracarys.chatgpt.site)

The public root URL is now the game-selection homepage, with solo and friend-room links for both games. Existing poker URLs and root room invitations remain supported.

Texas Hold’em includes:

- Solo play and online rooms to share with friends.
- Doubao, ChatGPT, Claude, GLM, and DeepSeek themed opponents. Their decisions use local strategies: **no model API calls or API keys are required**.
- Hand evaluation, main-pot and side-pot settlement, and masking of opponents’ hole cards in online play.
- Persistent room state, recovery after a refresh, and lightweight synchronization at 1 / 2 / 5 second intervals according to state.
- Automatic check or fold after a 45 second action timeout, with a 24 hour room activity TTL.

Brand names and marks remain the property of their respective owners. They do not imply participation or endorsement, and the project’s MIT license does not grant rights to those marks. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Splendor: Pokémon

An unofficial implementation of the published Pokémon edition: 2–4 seats, 90 cards, evolution, special cards, and an 18-point final round. Solo opponents use local heuristics. Online rooms include readiness, optional AI filling, refresh recovery, private hands, and separate persistence.

Numeric data is community-transcribed and has not been checked card-by-card against a physical copy. All 55 species have local illustrations from The Artificial’s creator-authored Pokémon Icons, shared with attribution under their stated CC-BY permission. No numeric placeholders are used. See [game documentation](games/splendor/README.md) and [sources and notices](games/splendor/SOURCES.md). Pokémon multiplayer supports the Node server or Cloudflare Workers with migrated D1 storage. Pokémon rooms and rate limits use separate tables from poker.

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
| Solo Splendor: Pokémon | `/games/splendor/index.html` |
| Online Splendor: Pokémon | `/games/splendor/online.html` |

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

Tests cover both game engines, room behavior, synchronization, and the root server. The static build copies assets to `.dist/public`. Online play also requires a Node or Worker + D1 backend serving `/api/poker` and `/api/splendor`; static hosting alone does not provide rooms.

The default entry point, `server/index.mjs`, runs in a Node environment you control. An optional Cloudflare adapter is included:

- `deploy/cloudflare/worker.mjs`
- `deploy/cloudflare/wrangler.example.jsonc`

Database settings in the example configuration are placeholders. Create and bind your own resources before using it. This repository does not include reusable hosted accounts or database IDs. See [architecture](docs/architecture.md) for deployment boundaries.

## Extend the collection

Each game lives in `games/<game-id>/` and appears on the homepage through `games/catalog.json`. The catalog contains `texas-holdem` and `splendor`; additional games will be added as they are implemented and contributed.

```text
games/
  catalog.json
  texas-holdem/
    web/        Browser pages and assets
    server/     Poker rules and room service
    tests/      Game tests
    scripts/    Game development tools
public/         Collection homepage
server/         Node server entry point
deploy/         Optional platform adapters
docs/           Architecture and extension guides
```

Bug fixes, interaction improvements, and complete playable games are welcome. Start with [contributing](CONTRIBUTING.md) and [adding a game](docs/adding-a-game.md). Report security issues privately as described in [security](SECURITY.md).

## License

Original project code is licensed under the [MIT License](LICENSE). Third-party names, marks, and other assets remain subject to the rights and licenses described in [third-party notices](THIRD_PARTY_NOTICES.md).
