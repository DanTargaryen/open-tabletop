# Steel Expedition Audio Sources

These are provisional selections reused from the repository's previously downloaded
`games/abracada-what/web/assets/audio/` files. No new online download or online audition
was completed for this change: network access was blocked. Encoded bytes are unchanged.
The existing source record in that directory provides the provenance below.

## Background Music

`tower-ambient-loop.ogg`: **Ambient Relaxing Loop**, original file
`Ambient-Loop-isaiah658.ogg`, by **isaiah658**.
Source: https://opengameart.org/content/ambient-relaxing-loop
License: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/

## Weapon Samples

| Weapon | Local file | Original file | Creator | License |
| --- | --- | --- | --- | --- |
| Calibration | damage-impact.ogg | Audio/impactPunch_heavy_002.ogg | Kenney | CC0 1.0 |
| Armor piercing | spell-blast.mp3 | Mp3/Spell_03.mp3 | Little Robot Sound Factory | CC BY 3.0 |
| Quake | spell-fireball.ogg | 04_fire_explosion_04_medium.ogg | leohpaz | CC BY 4.0 |
| Drill | spell-shadow.mp3 | Mp3/Spell_04.mp3 | Little Robot Sound Factory | CC BY 3.0 |
| Hive | spell-shimmer.mp3 | Mp3/Spell_02.mp3 | Little Robot Sound Factory | CC BY 3.0 |
| Meteor | spell-thunder.ogg | 18_thunder_02.ogg | leohpaz | CC BY 4.0 |
| Pulse | spell-arcane.mp3 | Mp3/Spell_00.mp3 | Little Robot Sound Factory | CC BY 3.0 |

Source collections:

- Kenney, **Impact Sounds**: https://kenney.nl/assets/impact-sounds
- Little Robot Sound Factory, **Fantasy Sound Effects Library**:
  https://opengameart.org/content/fantasy-sound-effects-library
  Attribution website: https://www.littlerobotsoundfactory.com/
- leohpaz, **8 Magic Attacks**: https://opengameart.org/content/8-magic-attacks

Licenses:

- https://creativecommons.org/publicdomain/zero/1.0/
- https://creativecommons.org/licenses/by/3.0/
- https://creativecommons.org/licenses/by/4.0/

Playback rate, gain and duration envelopes are adjusted at runtime. Each weapon uses
its own source file; launch and impact use different runtime rate/volume settings
of that file. These are not fourteen independently recorded effects. UI, movement,
split and drill transition cues continue to use the original synthesized sounds.
Background playback begins after user interaction, loops during battle, and stops
when leaving battle. The sound toggle mutes both music and effects.
