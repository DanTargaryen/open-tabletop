# Third-party notices

The root MIT license covers original Open Tabletop code. Preserve the notices below when redistributing the corresponding files. Names and trademarks remain the property of their respective owners; inclusion does not imply endorsement or a connection to the named model APIs.

## Velvet Poker

`games/texas-holdem/` incorporates Velvet Poker, copyright (c) 2026 Velvet Poker contributors, under MIT. The original notice is preserved in [the game's LICENSE](games/texas-holdem/LICENSE).

## AI character icons

The AI characters use local game strategies. They do not call the services whose names they use.

| Files under `games/texas-holdem/web/assets/brands/` | Source and notice |
| --- | --- |
| `chatgpt.svg`, `claude.svg`, `glm.svg`, `deepseek.svg` | LobeHub Icons, pinned package `@lobehub/icons-static-svg@1.95.0`, copyright (c) 2023 LobeHub, MIT. The full license and source URLs are retained in [SOURCES.md](games/texas-holdem/web/assets/brands/SOURCES.md). Trademark rights are not granted by that MIT license. |
| `doubao.png` | Public favicon from the official Doubao website. No separate open-source license accompanied this asset; it is excluded from the project's MIT grant. Copyright and trademark rights remain with the relevant rights holders. See [SOURCES.md](games/texas-holdem/web/assets/brands/SOURCES.md) for its exact source and checksum. |

The GPT, Claude, DeepSeek and Doubao icons are also reused without modification under `games/splendor/web/assets/brands/`, with the same notices and rights exclusions. Pokémon keeps its existing game strategies; these brands are cosmetic identities, not live model opponents.

The collection's card illustration and favicon are original HTML/CSS/SVG assets and use the root MIT license. No Sites account configuration, proprietary deployment credentials, or runtime player data are distributed with this repository.

## Splendor: Pokémon fan implementation

`games/splendor/` is an unofficial implementation of the published Pokémon edition. Pokémon characters, names and trademarks belong to their respective rights holders, including Nintendo, Creatures, GAME FREAK and The Pokémon Company. Splendor belongs to Space Cowboys / Asmodee. No affiliation, endorsement or official license is claimed. The root MIT license does not grant rights to those characters, marks or the physical game artwork.

Numeric card fields were adapted from LeonJoeeee/splendor-pokemon at commit `c4a0a4fe564483d9568a0a436367400a090f9657`. Preserve [its code license and exclusions](games/splendor/licenses/Pokemon-reference.txt), copyright (c) 2026 Leon (LeonJoeeee). Data is a community transcription, not a publisher-certified deck audit.

All 55 local SVG character illustrations come from **The Artificial — Pokémon Icons**, pinned to commit `132142217e40990f694142d9efb28ecde1e2976e`. The creator describes these as fan art made from scratch and expressly permits sharing with attribution under CC-BY (version not specified). Preserve [the original asset README](games/splendor/web/assets/pokemon/README.txt) and the author link to https://theartificial.github.io/pokemon-icons/. SVG contents are unchanged; only display size is controlled by CSS. The old generated atlas and numeric stand-ins are no longer used. Character rights remain excluded from the code MIT license. See [the source and artwork record](games/splendor/SOURCES.md).

## User-supplied human-player portrait

`games/splendor/web/assets/players/human.png` was supplied by the site owner for the human-player avatar. The image bytes are preserved; CSS frames it within avatar controls. The additional selectable human portraits and their mechanically resized WebP thumbnails are also owner-supplied third-party images. All are excluded from the code MIT license.

## Abracada rules prototype

`games/abracada-what/` is an unofficial rules and interaction prototype inspired by the tabletop game *Abracada...What?*, designed by Gary Kim and originally published by Korea Boardgames. The original game name, localized title, rules terminology, and related rights remain with their respective owners. This repository does not include or license any official illustrations, logos, scans, rulebook text, or other publisher assets. All visual assets in the prototype are original HTML, CSS and SVG under the root MIT license. Inclusion does not imply endorsement, authorization, or affiliation.
