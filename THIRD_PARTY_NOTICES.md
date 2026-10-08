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

The 3D table renderer uses [Three.js](https://github.com/mrdoob/three.js), copyright (c) 2010-2026 Three.js Authors, under the MIT license. The dependency is installed from npm as `three@0.186.0`; its license is distributed with the package.

The optimized 3D characters and animation clips under `games/abracada-what/web/assets/3d/characters/` and `games/abracada-what/web/assets/3d/animations/` come from [KayKit Character Pack: Adventurers 2.0](https://kaylousberg.itch.io/kaykit-adventurers) and [KayKit Character Animations 1.1](https://kaylousberg.itch.io/kaykit-character-animations) by Kay Lousberg. The selected dungeon props under `games/abracada-what/web/assets/3d/dungeon/` come from [KayKit Dungeon Pack 1.1](https://kaylousberg.itch.io/kaykit-dungeon-pack). These assets are dedicated under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/); attribution is included for provenance.

The particle textures under `games/abracada-what/web/assets/3d/particles/` are selected from [Kenney Particle Pack 1.0](https://kenney.nl/assets/particle-pack) by Kenney. They are dedicated under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/); attribution is included for provenance.

The background track `tower-ambient-loop.ogg` is *Ambient Relaxing Loop* by isaiah658, obtained from [OpenGameArt](https://opengameart.org/content/ambient-relaxing-loop) under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Spell and fantasy sound effects are selected from [Fantasy Sound Effects Library](https://opengameart.org/content/fantasy-sound-effects-library) by Little Robot Sound Factory under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); attribution and the creator's requested website link are preserved in the [audio source record](games/abracada-what/web/assets/audio/SOURCES.md). The fifth spell's thunder sound comes from [8 Magic Attacks](https://opengameart.org/content/8-magic-attacks) by leohpaz under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The remaining interaction, dice, impact, and chime sounds are selected from Kenney's [RPG Audio](https://kenney.nl/assets/rpg-audio), [Casino Audio](https://kenney.nl/assets/casino-audio), [Impact Sounds](https://kenney.nl/assets/impact-sounds), and [Music Jingles](https://kenney.nl/assets/music-jingles) packages. They are dedicated under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Exact source file mappings are recorded in the [audio source record](games/abracada-what/web/assets/audio/SOURCES.md).

## Steel Expedition Audio

Steel Expedition reuses the previously downloaded *Ambient Relaxing Loop* by isaiah658 (CC0 1.0), *Impact Sounds* by Kenney (CC0 1.0), *Fantasy Sound Effects Library* by Little Robot Sound Factory (CC BY 3.0, https://www.littlerobotsoundfactory.com/), and *8 Magic Attacks* by leohpaz (CC BY 4.0). Exact sources, original filenames and runtime playback changes are recorded in [Steel Expedition audio sources](games/steel-arc/web/assets/audio/SOURCES.md). These audio assets retain their respective licenses rather than the code MIT license.

## Aeroplane Chess / 飞行棋

The game logic, SVG board, airplane controls, and synthesized Web Audio effects are original Open Tabletop implementation code under the repository MIT license. `games/aeroplane-chess/web/assets/airplane-club.jpg` is an AI-generated illustration created for this project; it is not scanned or extracted from any published board. Traditional game names and rule references do not imply publisher endorsement. See [rule and asset sources](games/aeroplane-chess/SOURCES.md).

## Campus Festival / 学园祭奇妙物语

The campus board layout, rules engine, UI, and synthesized sound are project code. Anime character names and inspired decorative motifs do not imply endorsement. Original official character pictures are an optional local installation in `games/anime-campus/web/assets/official/`, excluded from Git and from the project MIT license. Source URLs, hashes and display viewports are recorded in `games/anime-campus/assets-sources.json`; see [asset details](games/anime-campus/SOURCES.md).

## Turning Sanctuary / 旋转归途

`games/turning-sanctuary/web/` is a Godot 4.7.2 Web export of the project's own 3D rotating-cube puzzle, contributed as a build artifact rather than hand-written front-end code. The bundle embeds the Godot Engine runtime (MIT / Expat, full notice in `games/turning-sanctuary/licenses/Godot-Engine-COPYRIGHT.txt`), Noto Sans SC and Noto Sans Math subsets (SIL OFL 1.1, notice in the same folder), and CC0 1.0 music and UI sound effects by tricksntraps, The Cynic Project, Yoiyami and Kenney. The card cover image is a screenshot of the game itself. Rules, levels, models and UI are original work; no published board game artwork, scans or rulebook text are included. Sources and licences: [game sources](games/turning-sanctuary/SOURCES.md).


## City Ledger / Monopoly rules reference

The `games/monopoly` game is an unofficial digital adaptation referencing Hasbro's classic Monopoly rules. Monopoly and related marks remain the property of their respective owners; no affiliation or endorsement is claimed. The game uses original Chinese place names, event descriptions, architectural line art, 40 AI-generated 3D tile illustrations, and CSS, with no scanned boards, logos, commercial character assets or recordings. Rule sources and explicit adaptation differences are recorded in `games/monopoly/SOURCES.md` and its README.
## Ink War / 墨战参考说明

`games/ink-war/` 根据蜜獾工坊《墨战》的公开介绍与官方截图研究玩法。墨战名称与原版素材的权利属于原权利人。本项目使用原创 Canvas/SVG 绘制和合成音效，没有包含原版截图、游戏音画文件、源码或品牌标识。参考链接见 `games/ink-war/SOURCES.md`；本游戏为非官方玩法复现，不表示原开发商参与或背书。

`games/ink-war/web/assets/ink-brush.woff2` is a subset of Ma Shan Zheng, Copyright 2018 The Ma Shan Zheng Project Authors ([upstream](https://github.com/googlefonts/mashanzheng)), distributed under the SIL Open Font License 1.1. The complete license is preserved in `games/ink-war/licenses/MaShanZheng-OFL.txt`. The font's license is independent of the project's MIT license.
