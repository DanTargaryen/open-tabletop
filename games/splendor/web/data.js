// Pokemon edition numeric data adapted from LeonJoeeee/splendor-pokemon.
// See ../SOURCES.md and ../licenses/Pokemon-reference.txt; official character rights are excluded.
export const COLORS = ["red", "blue", "black", "pink", "yellow"];
export const TOKENS = [...COLORS, "master"];
export const CARDS = [
  {
    "id": "bulbasaur-0",
    "speciesId": "BULBASAUR",
    "name": "Bulbasaur",
    "nameZh": "妙蛙种子",
    "dexId": 1,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "red": 3,
      "black": 2
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "pink": 3
    },
    "evolvesToSpeciesId": "IVYSAUR",
    "tier": 1,
    "artIndex": 0
  },
  {
    "id": "bulbasaur-1",
    "speciesId": "BULBASAUR",
    "name": "Bulbasaur",
    "nameZh": "妙蛙种子",
    "dexId": 1,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "yellow": 4
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "pink": 3
    },
    "evolvesToSpeciesId": "IVYSAUR",
    "tier": 1,
    "artIndex": 0
  },
  {
    "id": "charmander-2",
    "speciesId": "CHARMANDER",
    "name": "Charmander",
    "nameZh": "小火龙",
    "dexId": 4,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "black": 3,
      "pink": 2
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "yellow": 3
    },
    "evolvesToSpeciesId": "CHARMELEON",
    "tier": 1,
    "artIndex": 1
  },
  {
    "id": "charmander-3",
    "speciesId": "CHARMANDER",
    "name": "Charmander",
    "nameZh": "小火龙",
    "dexId": 4,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "blue": 4
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "yellow": 3
    },
    "evolvesToSpeciesId": "CHARMELEON",
    "tier": 1,
    "artIndex": 1
  },
  {
    "id": "squirtle-4",
    "speciesId": "SQUIRTLE",
    "name": "Squirtle",
    "nameZh": "杰尼龟",
    "dexId": 7,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "pink": 3,
      "blue": 2
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "black": 3
    },
    "evolvesToSpeciesId": "WARTORTLE",
    "tier": 1,
    "artIndex": 2
  },
  {
    "id": "squirtle-5",
    "speciesId": "SQUIRTLE",
    "name": "Squirtle",
    "nameZh": "杰尼龟",
    "dexId": 7,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "red": 4
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "black": 3
    },
    "evolvesToSpeciesId": "WARTORTLE",
    "tier": 1,
    "artIndex": 2
  },
  {
    "id": "caterpie-6",
    "speciesId": "CATERPIE",
    "name": "Caterpie",
    "nameZh": "绿毛虫",
    "dexId": 10,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "blue": 1,
      "yellow": 1,
      "red": 1,
      "black": 1
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "blue": 3
    },
    "evolvesToSpeciesId": "METAPOD",
    "tier": 1,
    "artIndex": 3
  },
  {
    "id": "caterpie-7",
    "speciesId": "CATERPIE",
    "name": "Caterpie",
    "nameZh": "绿毛虫",
    "dexId": 10,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "black": 2,
      "blue": 1,
      "yellow": 1
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "blue": 3
    },
    "evolvesToSpeciesId": "METAPOD",
    "tier": 1,
    "artIndex": 3
  },
  {
    "id": "weedle-8",
    "speciesId": "WEEDLE",
    "name": "Weedle",
    "nameZh": "独角虫",
    "dexId": 13,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "red": 1,
      "yellow": 1,
      "pink": 1,
      "blue": 1
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "red": 3
    },
    "evolvesToSpeciesId": "KAKUNA",
    "tier": 1,
    "artIndex": 4
  },
  {
    "id": "weedle-9",
    "speciesId": "WEEDLE",
    "name": "Weedle",
    "nameZh": "独角虫",
    "dexId": 13,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "blue": 2,
      "red": 1,
      "pink": 1
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "red": 3
    },
    "evolvesToSpeciesId": "KAKUNA",
    "tier": 1,
    "artIndex": 4
  },
  {
    "id": "pidgey-10",
    "speciesId": "PIDGEY",
    "name": "Pidgey",
    "nameZh": "波波",
    "dexId": 16,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "yellow": 2,
      "black": 1
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "red": 2
    },
    "evolvesToSpeciesId": "PIDGEOTTO",
    "tier": 1,
    "artIndex": 5
  },
  {
    "id": "pidgey-11",
    "speciesId": "PIDGEY",
    "name": "Pidgey",
    "nameZh": "波波",
    "dexId": 16,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "blue": 2,
      "red": 2
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "red": 2
    },
    "evolvesToSpeciesId": "PIDGEOTTO",
    "tier": 1,
    "artIndex": 5
  },
  {
    "id": "pidgey-12",
    "speciesId": "PIDGEY",
    "name": "Pidgey",
    "nameZh": "波波",
    "dexId": 16,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "pink": 3
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "red": 2
    },
    "evolvesToSpeciesId": "PIDGEOTTO",
    "tier": 1,
    "artIndex": 5
  },
  {
    "id": "nidoran-13",
    "speciesId": "NIDORAN",
    "name": "Nidoran",
    "nameZh": "尼多兰",
    "dexId": 29,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "red": 2,
      "pink": 1
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "blue": 2
    },
    "evolvesToSpeciesId": "NIDORINA",
    "tier": 1,
    "artIndex": 6
  },
  {
    "id": "nidoran-14",
    "speciesId": "NIDORAN",
    "name": "Nidoran",
    "nameZh": "尼多兰",
    "dexId": 29,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "blue": 2,
      "yellow": 2
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "blue": 2
    },
    "evolvesToSpeciesId": "NIDORINA",
    "tier": 1,
    "artIndex": 6
  },
  {
    "id": "nidoran-15",
    "speciesId": "NIDORAN",
    "name": "Nidoran",
    "nameZh": "尼多兰",
    "dexId": 29,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "black": 3
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "blue": 2
    },
    "evolvesToSpeciesId": "NIDORINA",
    "tier": 1,
    "artIndex": 6
  },
  {
    "id": "oddish-16",
    "speciesId": "ODDISH",
    "name": "Oddish",
    "nameZh": "走路草",
    "dexId": 43,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "pink": 2,
      "red": 1
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "yellow": 2
    },
    "evolvesToSpeciesId": "GLOOM",
    "tier": 1,
    "artIndex": 7
  },
  {
    "id": "oddish-17",
    "speciesId": "ODDISH",
    "name": "Oddish",
    "nameZh": "走路草",
    "dexId": 43,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "yellow": 2,
      "black": 2
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "yellow": 2
    },
    "evolvesToSpeciesId": "GLOOM",
    "tier": 1,
    "artIndex": 7
  },
  {
    "id": "oddish-18",
    "speciesId": "ODDISH",
    "name": "Oddish",
    "nameZh": "走路草",
    "dexId": 43,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "blue": 3
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "yellow": 2
    },
    "evolvesToSpeciesId": "GLOOM",
    "tier": 1,
    "artIndex": 7
  },
  {
    "id": "poliwag-19",
    "speciesId": "POLIWAG",
    "name": "Poliwag",
    "nameZh": "蚊香蝌蚪",
    "dexId": 60,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "blue": 2,
      "yellow": 1
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "black": 2
    },
    "evolvesToSpeciesId": "POLIWHIRL",
    "tier": 1,
    "artIndex": 8
  },
  {
    "id": "poliwag-20",
    "speciesId": "POLIWAG",
    "name": "Poliwag",
    "nameZh": "蚊香蝌蚪",
    "dexId": 60,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "pink": 2,
      "black": 2
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "black": 2
    },
    "evolvesToSpeciesId": "POLIWHIRL",
    "tier": 1,
    "artIndex": 8
  },
  {
    "id": "poliwag-21",
    "speciesId": "POLIWAG",
    "name": "Poliwag",
    "nameZh": "蚊香蝌蚪",
    "dexId": 60,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "red": 3
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "black": 2
    },
    "evolvesToSpeciesId": "POLIWHIRL",
    "tier": 1,
    "artIndex": 8
  },
  {
    "id": "abra-22",
    "speciesId": "ABRA",
    "name": "Abra",
    "nameZh": "凯西",
    "dexId": 63,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "blue": 3,
      "yellow": 2
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "red": 3
    },
    "evolvesToSpeciesId": "KADABRA",
    "tier": 1,
    "artIndex": 9
  },
  {
    "id": "abra-23",
    "speciesId": "ABRA",
    "name": "Abra",
    "nameZh": "凯西",
    "dexId": 63,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "pink": 4
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "red": 3
    },
    "evolvesToSpeciesId": "KADABRA",
    "tier": 1,
    "artIndex": 9
  },
  {
    "id": "machop-24",
    "speciesId": "MACHOP",
    "name": "Machop",
    "nameZh": "腕力",
    "dexId": 66,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "blue": 1,
      "yellow": 1,
      "pink": 1,
      "black": 1
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "yellow": 3
    },
    "evolvesToSpeciesId": "MACHOKE",
    "tier": 1,
    "artIndex": 10
  },
  {
    "id": "machop-25",
    "speciesId": "MACHOP",
    "name": "Machop",
    "nameZh": "腕力",
    "dexId": 66,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "yellow": 2,
      "pink": 1,
      "black": 1
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "yellow": 3
    },
    "evolvesToSpeciesId": "MACHOKE",
    "tier": 1,
    "artIndex": 10
  },
  {
    "id": "bellsprout-26",
    "speciesId": "BELLSPROUT",
    "name": "Bellsprout",
    "nameZh": "喇叭芽",
    "dexId": 69,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "black": 2,
      "blue": 1
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "pink": 2
    },
    "evolvesToSpeciesId": "WEEPINBELL",
    "tier": 1,
    "artIndex": 11
  },
  {
    "id": "bellsprout-27",
    "speciesId": "BELLSPROUT",
    "name": "Bellsprout",
    "nameZh": "喇叭芽",
    "dexId": 69,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "pink": 2,
      "red": 2
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "pink": 2
    },
    "evolvesToSpeciesId": "WEEPINBELL",
    "tier": 1,
    "artIndex": 11
  },
  {
    "id": "bellsprout-28",
    "speciesId": "BELLSPROUT",
    "name": "Bellsprout",
    "nameZh": "喇叭芽",
    "dexId": 69,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "yellow": 3
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "pink": 2
    },
    "evolvesToSpeciesId": "WEEPINBELL",
    "tier": 1,
    "artIndex": 11
  },
  {
    "id": "geodude-29",
    "speciesId": "GEODUDE",
    "name": "Geodude",
    "nameZh": "小拳石",
    "dexId": 74,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "black": 1,
      "yellow": 1,
      "pink": 1,
      "red": 1
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "pink": 3
    },
    "evolvesToSpeciesId": "GRAVELER",
    "tier": 1,
    "artIndex": 12
  },
  {
    "id": "geodude-30",
    "speciesId": "GEODUDE",
    "name": "Geodude",
    "nameZh": "小拳石",
    "dexId": 74,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "red": 2,
      "yellow": 1,
      "blue": 1
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "pink": 3
    },
    "evolvesToSpeciesId": "GRAVELER",
    "tier": 1,
    "artIndex": 12
  },
  {
    "id": "gastly-31",
    "speciesId": "GASTLY",
    "name": "Gastly",
    "nameZh": "鬼斯",
    "dexId": 92,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "blue": 1,
      "red": 1,
      "pink": 1,
      "black": 1
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "black": 3
    },
    "evolvesToSpeciesId": "HAUNTER",
    "tier": 1,
    "artIndex": 13
  },
  {
    "id": "gastly-32",
    "speciesId": "GASTLY",
    "name": "Gastly",
    "nameZh": "鬼斯",
    "dexId": 92,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "pink": 2,
      "black": 1,
      "red": 1
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 0,
    "evolveCost": {
      "black": 3
    },
    "evolvesToSpeciesId": "HAUNTER",
    "tier": 1,
    "artIndex": 13
  },
  {
    "id": "dratini-33",
    "speciesId": "DRATINI",
    "name": "Dratini",
    "nameZh": "迷你龙",
    "dexId": 147,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "yellow": 3,
      "red": 2
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "blue": 3
    },
    "evolvesToSpeciesId": "DRAGONAIR",
    "tier": 1,
    "artIndex": 14
  },
  {
    "id": "dratini-34",
    "speciesId": "DRATINI",
    "name": "Dratini",
    "nameZh": "迷你龙",
    "dexId": 147,
    "kind": "normal",
    "stage": 1,
    "cost": {
      "black": 4
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "blue": 3
    },
    "evolvesToSpeciesId": "DRAGONAIR",
    "tier": 1,
    "artIndex": 14
  },
  {
    "id": "ivysaur-35",
    "speciesId": "IVYSAUR",
    "name": "Ivysaur",
    "nameZh": "妙蛙草",
    "dexId": 2,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "red": 4,
      "pink": 4,
      "blue": 1
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 3,
    "evolveCost": {
      "blue": 4
    },
    "evolvesToSpeciesId": "VENUSAUR",
    "tier": 2,
    "artIndex": 15
  },
  {
    "id": "ivysaur-36",
    "speciesId": "IVYSAUR",
    "name": "Ivysaur",
    "nameZh": "妙蛙草",
    "dexId": 2,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "yellow": 6
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 3,
    "evolveCost": {
      "blue": 4
    },
    "evolvesToSpeciesId": "VENUSAUR",
    "tier": 2,
    "artIndex": 15
  },
  {
    "id": "charmeleon-37",
    "speciesId": "CHARMELEON",
    "name": "Charmeleon",
    "nameZh": "火恐龙",
    "dexId": 5,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "yellow": 4,
      "black": 4,
      "red": 1
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 3,
    "evolveCost": {
      "red": 4
    },
    "evolvesToSpeciesId": "CHARIZARD",
    "tier": 2,
    "artIndex": 16
  },
  {
    "id": "charmeleon-38",
    "speciesId": "CHARMELEON",
    "name": "Charmeleon",
    "nameZh": "火恐龙",
    "dexId": 5,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "blue": 6
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 3,
    "evolveCost": {
      "red": 4
    },
    "evolvesToSpeciesId": "CHARIZARD",
    "tier": 2,
    "artIndex": 16
  },
  {
    "id": "wartortle-39",
    "speciesId": "WARTORTLE",
    "name": "Wartortle",
    "nameZh": "卡咪龟",
    "dexId": 8,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "blue": 4,
      "black": 4,
      "pink": 1
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 3,
    "evolveCost": {
      "pink": 4
    },
    "evolvesToSpeciesId": "BLASTOISE",
    "tier": 2,
    "artIndex": 17
  },
  {
    "id": "wartortle-40",
    "speciesId": "WARTORTLE",
    "name": "Wartortle",
    "nameZh": "卡咪龟",
    "dexId": 8,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "red": 6
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 3,
    "evolveCost": {
      "pink": 4
    },
    "evolvesToSpeciesId": "BLASTOISE",
    "tier": 2,
    "artIndex": 17
  },
  {
    "id": "metapod-41",
    "speciesId": "METAPOD",
    "name": "Metapod",
    "nameZh": "铁甲蛹",
    "dexId": 11,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "blue": 4,
      "red": 2,
      "yellow": 1
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 2,
    "evolveCost": {
      "yellow": 3
    },
    "evolvesToSpeciesId": "BUTTERFREE",
    "tier": 2,
    "artIndex": 18
  },
  {
    "id": "metapod-42",
    "speciesId": "METAPOD",
    "name": "Metapod",
    "nameZh": "铁甲蛹",
    "dexId": 11,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "pink": 5,
      "black": 2
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 2,
    "evolveCost": {
      "yellow": 3
    },
    "evolvesToSpeciesId": "BUTTERFREE",
    "tier": 2,
    "artIndex": 18
  },
  {
    "id": "kakuna-43",
    "speciesId": "KAKUNA",
    "name": "Kakuna",
    "nameZh": "铁壳蛹",
    "dexId": 14,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "red": 4,
      "blue": 2,
      "pink": 1
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 2,
    "evolveCost": {
      "pink": 3
    },
    "evolvesToSpeciesId": "BEEDRILL",
    "tier": 2,
    "artIndex": 19
  },
  {
    "id": "kakuna-44",
    "speciesId": "KAKUNA",
    "name": "Kakuna",
    "nameZh": "铁壳蛹",
    "dexId": 14,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "black": 5,
      "yellow": 2
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 2,
    "evolveCost": {
      "pink": 3
    },
    "evolvesToSpeciesId": "BEEDRILL",
    "tier": 2,
    "artIndex": 19
  },
  {
    "id": "pidgeotto-45",
    "speciesId": "PIDGEOTTO",
    "name": "Pidgeotto",
    "nameZh": "比比鸟",
    "dexId": 17,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "red": 3,
      "yellow": 2,
      "pink": 2
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "red": 4
    },
    "evolvesToSpeciesId": "PIDGEOT",
    "tier": 2,
    "artIndex": 20
  },
  {
    "id": "pidgeotto-46",
    "speciesId": "PIDGEOTTO",
    "name": "Pidgeotto",
    "nameZh": "比比鸟",
    "dexId": 17,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "blue": 3,
      "pink": 2,
      "black": 2
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "red": 4
    },
    "evolvesToSpeciesId": "PIDGEOT",
    "tier": 2,
    "artIndex": 20
  },
  {
    "id": "nidorina-47",
    "speciesId": "NIDORINA",
    "name": "Nidorina",
    "nameZh": "尼多娜",
    "dexId": 30,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "blue": 3,
      "pink": 2,
      "black": 2
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "blue": 4
    },
    "evolvesToSpeciesId": "NIDOQUEEN",
    "tier": 2,
    "artIndex": 21
  },
  {
    "id": "nidorina-48",
    "speciesId": "NIDORINA",
    "name": "Nidorina",
    "nameZh": "尼多娜",
    "dexId": 30,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "yellow": 3,
      "pink": 2,
      "red": 2
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "blue": 4
    },
    "evolvesToSpeciesId": "NIDOQUEEN",
    "tier": 2,
    "artIndex": 21
  },
  {
    "id": "gloom-49",
    "speciesId": "GLOOM",
    "name": "Gloom",
    "nameZh": "臭臭花",
    "dexId": 44,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "yellow": 3,
      "blue": 2,
      "red": 2
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "yellow": 4
    },
    "evolvesToSpeciesId": "VILEPLUME",
    "tier": 2,
    "artIndex": 22
  },
  {
    "id": "gloom-50",
    "speciesId": "GLOOM",
    "name": "Gloom",
    "nameZh": "臭臭花",
    "dexId": 44,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "black": 3,
      "blue": 2,
      "red": 2
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "yellow": 4
    },
    "evolvesToSpeciesId": "VILEPLUME",
    "tier": 2,
    "artIndex": 22
  },
  {
    "id": "poliwhirl-51",
    "speciesId": "POLIWHIRL",
    "name": "Poliwhirl",
    "nameZh": "蚊香君",
    "dexId": 61,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "black": 3,
      "blue": 2,
      "red": 2
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "black": 4
    },
    "evolvesToSpeciesId": "POLIWRATH",
    "tier": 2,
    "artIndex": 23
  },
  {
    "id": "poliwhirl-52",
    "speciesId": "POLIWHIRL",
    "name": "Poliwhirl",
    "nameZh": "蚊香君",
    "dexId": 61,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "pink": 3,
      "blue": 2,
      "yellow": 2
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "black": 4
    },
    "evolvesToSpeciesId": "POLIWRATH",
    "tier": 2,
    "artIndex": 23
  },
  {
    "id": "kadabra-53",
    "speciesId": "KADABRA",
    "name": "Kadabra",
    "nameZh": "勇基拉",
    "dexId": 64,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "red": 4,
      "yellow": 4,
      "black": 1
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 3,
    "evolveCost": {
      "black": 4
    },
    "evolvesToSpeciesId": "ALAKAZAM",
    "tier": 2,
    "artIndex": 24
  },
  {
    "id": "kadabra-54",
    "speciesId": "KADABRA",
    "name": "Kadabra",
    "nameZh": "勇基拉",
    "dexId": 64,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "pink": 6
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 3,
    "evolveCost": {
      "black": 4
    },
    "evolvesToSpeciesId": "ALAKAZAM",
    "tier": 2,
    "artIndex": 24
  },
  {
    "id": "machoke-55",
    "speciesId": "MACHOKE",
    "name": "Machoke",
    "nameZh": "豪力",
    "dexId": 67,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "yellow": 4,
      "black": 2,
      "blue": 1
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 2,
    "evolveCost": {
      "blue": 3
    },
    "evolvesToSpeciesId": "MACHAMP",
    "tier": 2,
    "artIndex": 25
  },
  {
    "id": "machoke-56",
    "speciesId": "MACHOKE",
    "name": "Machoke",
    "nameZh": "豪力",
    "dexId": 67,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "red": 5,
      "pink": 2
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 2,
    "evolveCost": {
      "blue": 3
    },
    "evolvesToSpeciesId": "MACHAMP",
    "tier": 2,
    "artIndex": 25
  },
  {
    "id": "weepinbell-57",
    "speciesId": "WEEPINBELL",
    "name": "Weepinbell",
    "nameZh": "口呆花",
    "dexId": 70,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "pink": 3,
      "yellow": 2,
      "black": 2
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "pink": 4
    },
    "evolvesToSpeciesId": "VICTREEBEL",
    "tier": 2,
    "artIndex": 26
  },
  {
    "id": "weepinbell-58",
    "speciesId": "WEEPINBELL",
    "name": "Weepinbell",
    "nameZh": "口呆花",
    "dexId": 70,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "red": 3,
      "black": 2,
      "yellow": 2
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 1,
    "evolveCost": {
      "pink": 4
    },
    "evolvesToSpeciesId": "VICTREEBEL",
    "tier": 2,
    "artIndex": 26
  },
  {
    "id": "graveler-59",
    "speciesId": "GRAVELER",
    "name": "Graveler",
    "nameZh": "隆隆石",
    "dexId": 75,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "pink": 4,
      "yellow": 2,
      "black": 1
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 2,
    "evolveCost": {
      "black": 3
    },
    "evolvesToSpeciesId": "GOLEM",
    "tier": 2,
    "artIndex": 27
  },
  {
    "id": "graveler-60",
    "speciesId": "GRAVELER",
    "name": "Graveler",
    "nameZh": "隆隆石",
    "dexId": 75,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "blue": 5,
      "red": 2
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 2,
    "evolveCost": {
      "black": 3
    },
    "evolvesToSpeciesId": "GOLEM",
    "tier": 2,
    "artIndex": 27
  },
  {
    "id": "haunter-61",
    "speciesId": "HAUNTER",
    "name": "Haunter",
    "nameZh": "鬼斯通",
    "dexId": 93,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "black": 4,
      "pink": 2,
      "red": 1
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 2,
    "evolveCost": {
      "red": 3
    },
    "evolvesToSpeciesId": "GENGAR",
    "tier": 2,
    "artIndex": 28
  },
  {
    "id": "haunter-62",
    "speciesId": "HAUNTER",
    "name": "Haunter",
    "nameZh": "鬼斯通",
    "dexId": 93,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "yellow": 5,
      "blue": 2
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 2,
    "evolveCost": {
      "red": 3
    },
    "evolvesToSpeciesId": "GENGAR",
    "tier": 2,
    "artIndex": 28
  },
  {
    "id": "dragonair-63",
    "speciesId": "DRAGONAIR",
    "name": "Dragonair",
    "nameZh": "哈克龙",
    "dexId": 148,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "black": 6
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 3,
    "evolveCost": {
      "yellow": 4
    },
    "evolvesToSpeciesId": "DRAGONITE",
    "tier": 2,
    "artIndex": 29
  },
  {
    "id": "dragonair-64",
    "speciesId": "DRAGONAIR",
    "name": "Dragonair",
    "nameZh": "哈克龙",
    "dexId": 148,
    "kind": "normal",
    "stage": 2,
    "cost": {
      "blue": 4,
      "pink": 4,
      "yellow": 1
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 3,
    "evolveCost": {
      "yellow": 4
    },
    "evolvesToSpeciesId": "DRAGONITE",
    "tier": 2,
    "artIndex": 29
  },
  {
    "id": "venusaur-65",
    "speciesId": "VENUSAUR",
    "name": "Venusaur",
    "nameZh": "妙蛙花",
    "dexId": 3,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "red": 7,
      "pink": 3
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 5,
    "tier": 3,
    "artIndex": 30
  },
  {
    "id": "charizard-66",
    "speciesId": "CHARIZARD",
    "name": "Charizard",
    "nameZh": "喷火龙",
    "dexId": 6,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "black": 7,
      "yellow": 3
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 5,
    "tier": 3,
    "artIndex": 31
  },
  {
    "id": "blastoise-67",
    "speciesId": "BLASTOISE",
    "name": "Blastoise",
    "nameZh": "水箭龟",
    "dexId": 9,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "blue": 7,
      "black": 3
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 5,
    "tier": 3,
    "artIndex": 32
  },
  {
    "id": "butterfree-68",
    "speciesId": "BUTTERFREE",
    "name": "Butterfree",
    "nameZh": "巴大蝶",
    "dexId": 12,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "blue": 6,
      "black": 4
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 4,
    "tier": 3,
    "artIndex": 33
  },
  {
    "id": "beedrill-69",
    "speciesId": "BEEDRILL",
    "name": "Beedrill",
    "nameZh": "大针蜂",
    "dexId": 15,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "red": 6,
      "yellow": 4
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 4,
    "tier": 3,
    "artIndex": 34
  },
  {
    "id": "pidgeot-70",
    "speciesId": "PIDGEOT",
    "name": "Pidgeot",
    "nameZh": "大比鸟",
    "dexId": 18,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "blue": 5,
      "black": 2,
      "yellow": 2
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 3,
    "tier": 3,
    "artIndex": 35
  },
  {
    "id": "nidoqueen-71",
    "speciesId": "NIDOQUEEN",
    "name": "Nidoqueen",
    "nameZh": "尼多后",
    "dexId": 31,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "yellow": 5,
      "red": 2,
      "pink": 2
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 3,
    "tier": 3,
    "artIndex": 36
  },
  {
    "id": "vileplume-72",
    "speciesId": "VILEPLUME",
    "name": "Vileplume",
    "nameZh": "霸王花",
    "dexId": 45,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "black": 5,
      "blue": 2,
      "pink": 2
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 3,
    "tier": 3,
    "artIndex": 37
  },
  {
    "id": "poliwrath-73",
    "speciesId": "POLIWRATH",
    "name": "Poliwrath",
    "nameZh": "蚊香泳士",
    "dexId": 62,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "pink": 5,
      "yellow": 2,
      "red": 2
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 3,
    "tier": 3,
    "artIndex": 38
  },
  {
    "id": "alakazam-74",
    "speciesId": "ALAKAZAM",
    "name": "Alakazam",
    "nameZh": "胡地",
    "dexId": 65,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "yellow": 7,
      "red": 3
    },
    "bonus": "pink",
    "bonusAmount": 1,
    "points": 5,
    "tier": 3,
    "artIndex": 39
  },
  {
    "id": "machamp-75",
    "speciesId": "MACHAMP",
    "name": "Machamp",
    "nameZh": "怪力",
    "dexId": 68,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "yellow": 6,
      "pink": 4
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 4,
    "tier": 3,
    "artIndex": 40
  },
  {
    "id": "victreebel-76",
    "speciesId": "VICTREEBEL",
    "name": "Victreebel",
    "nameZh": "大食花",
    "dexId": 71,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "red": 5,
      "black": 2,
      "blue": 2
    },
    "bonus": "red",
    "bonusAmount": 1,
    "points": 3,
    "tier": 3,
    "artIndex": 41
  },
  {
    "id": "golem-77",
    "speciesId": "GOLEM",
    "name": "Golem",
    "nameZh": "隆隆岩",
    "dexId": 76,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "pink": 6,
      "red": 4
    },
    "bonus": "blue",
    "bonusAmount": 1,
    "points": 4,
    "tier": 3,
    "artIndex": 42
  },
  {
    "id": "gengar-78",
    "speciesId": "GENGAR",
    "name": "Gengar",
    "nameZh": "耿鬼",
    "dexId": 94,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "black": 6,
      "blue": 4
    },
    "bonus": "yellow",
    "bonusAmount": 1,
    "points": 4,
    "tier": 3,
    "artIndex": 43
  },
  {
    "id": "dragonite-79",
    "speciesId": "DRAGONITE",
    "name": "Dragonite",
    "nameZh": "快龙",
    "dexId": 149,
    "kind": "normal",
    "stage": 3,
    "cost": {
      "pink": 7,
      "blue": 3
    },
    "bonus": "black",
    "bonusAmount": 1,
    "points": 5,
    "tier": 3,
    "artIndex": 44
  },
  {
    "id": "lapras-80",
    "speciesId": "LAPRAS",
    "name": "Lapras",
    "nameZh": "拉普拉斯",
    "dexId": 131,
    "kind": "rare",
    "stage": 3,
    "cost": {
      "master": 1,
      "black": 3,
      "blue": 2
    },
    "bonus": "red",
    "bonusAmount": 2,
    "points": 0,
    "tier": 4,
    "artIndex": 45
  },
  {
    "id": "ditto-81",
    "speciesId": "DITTO",
    "name": "Ditto",
    "nameZh": "百变怪",
    "dexId": 132,
    "kind": "rare",
    "stage": 3,
    "cost": {
      "master": 1,
      "pink": 3,
      "yellow": 2
    },
    "bonus": "blue",
    "bonusAmount": 2,
    "points": 0,
    "tier": 4,
    "artIndex": 46
  },
  {
    "id": "eevee-82",
    "speciesId": "EEVEE",
    "name": "Eevee",
    "nameZh": "伊布",
    "dexId": 133,
    "kind": "rare",
    "stage": 3,
    "cost": {
      "master": 1,
      "yellow": 3,
      "red": 2
    },
    "bonus": "black",
    "bonusAmount": 2,
    "points": 0,
    "tier": 4,
    "artIndex": 47
  },
  {
    "id": "aerodactyl-83",
    "speciesId": "AERODACTYL",
    "name": "Aerodactyl",
    "nameZh": "化石翼龙",
    "dexId": 142,
    "kind": "rare",
    "stage": 3,
    "cost": {
      "master": 1,
      "blue": 3,
      "pink": 2
    },
    "bonus": "yellow",
    "bonusAmount": 2,
    "points": 0,
    "tier": 4,
    "artIndex": 48
  },
  {
    "id": "snorlax-84",
    "speciesId": "SNORLAX",
    "name": "Snorlax",
    "nameZh": "卡比兽",
    "dexId": 143,
    "kind": "rare",
    "stage": 3,
    "cost": {
      "master": 1,
      "red": 3,
      "black": 2
    },
    "bonus": "pink",
    "bonusAmount": 2,
    "points": 0,
    "tier": 4,
    "artIndex": 49
  },
  {
    "id": "articuno-85",
    "speciesId": "ARTICUNO",
    "name": "Articuno",
    "nameZh": "急冻鸟",
    "dexId": 144,
    "kind": "legendary",
    "stage": 3,
    "cost": {
      "master": 1,
      "red": 3,
      "pink": 3,
      "black": 3
    },
    "bonus": "yellow",
    "bonusAmount": 2,
    "points": 2,
    "tier": 5,
    "artIndex": 50
  },
  {
    "id": "zapdos-86",
    "speciesId": "ZAPDOS",
    "name": "Zapdos",
    "nameZh": "闪电鸟",
    "dexId": 145,
    "kind": "legendary",
    "stage": 3,
    "cost": {
      "master": 1,
      "pink": 3,
      "blue": 3,
      "yellow": 3
    },
    "bonus": "red",
    "bonusAmount": 2,
    "points": 2,
    "tier": 5,
    "artIndex": 51
  },
  {
    "id": "moltres-87",
    "speciesId": "MOLTRES",
    "name": "Moltres",
    "nameZh": "火焰鸟",
    "dexId": 146,
    "kind": "legendary",
    "stage": 3,
    "cost": {
      "master": 1,
      "blue": 3,
      "yellow": 3,
      "black": 3
    },
    "bonus": "pink",
    "bonusAmount": 2,
    "points": 2,
    "tier": 5,
    "artIndex": 52
  },
  {
    "id": "mewtwo-88",
    "speciesId": "MEWTWO",
    "name": "Mewtwo",
    "nameZh": "超梦",
    "dexId": 150,
    "kind": "legendary",
    "stage": 3,
    "cost": {
      "master": 1,
      "pink": 3,
      "red": 3,
      "blue": 3
    },
    "bonus": "black",
    "bonusAmount": 2,
    "points": 2,
    "tier": 5,
    "artIndex": 53
  },
  {
    "id": "mew-89",
    "speciesId": "MEW",
    "name": "Mew",
    "nameZh": "梦幻",
    "dexId": 151,
    "kind": "legendary",
    "stage": 3,
    "cost": {
      "master": 1,
      "black": 3,
      "yellow": 3,
      "red": 3
    },
    "bonus": "blue",
    "bonusAmount": 2,
    "points": 2,
    "tier": 5,
    "artIndex": 54
  }
];
