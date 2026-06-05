/**
 * Gen 2 (Gold/Silver/Crystal) egg group data for all 251 Pokémon.
 *
 * groups: array of egg group keys. Special values:
 *   'ditto'        – Ditto itself; breeds with any non-'none' Pokémon
 *   'undiscovered' – Can't breed (legendaries, baby Pokémon)
 *
 * gender:
 *   'normal'      – Both genders available (most Pokémon)
 *   'male-only'   – Hitmonlee/chan/top, Tauros, etc.
 *   'female-only' – Chansey, Blissey, Jynx (can breed but always female)
 *   'genderless'  – Magnemite line, Voltorb line, Staryu, Porygon, etc. (Ditto only)
 *   'none'        – Can't breed at all (babies + legendaries)
 *
 * NOTE on Gen 2 differences from Gen 3+:
 *  - Nidorina (030) and Nidoqueen (031) CAN breed in Gen 2 (Field group).
 *    They were moved to Undiscovered in Gen 3.
 */

// Egg group short keys → display names
export const EGG_GROUP_LABELS = {
  monster:      'Monster',
  water1:       'Water 1',
  bug:          'Bug',
  flying:       'Flying',
  field:        'Field',
  fairy:        'Fairy',
  grass:        'Grass',
  humanlike:    'Human-Like',
  water3:       'Water 3',
  mineral:      'Mineral',
  amorphous:    'Amorphous',
  water2:       'Water 2',
  dragon:       'Dragon',
  ditto:        'Ditto',
  undiscovered: 'Undiscovered',
};

// Each entry: { id, name, groups: string[], gender }
export const POKEMON_DATA = [
  // ── Gen 1 ──────────────────────────────────────────────────────────────────
  { id: 1,   name: 'Bulbasaur',   groups: ['monster','grass'],         gender: 'normal', shinyAlwaysMale: true },
  { id: 2,   name: 'Ivysaur',     groups: ['monster','grass'],         gender: 'normal', shinyAlwaysMale: true },
  { id: 3,   name: 'Venusaur',    groups: ['monster','grass'],         gender: 'normal', shinyAlwaysMale: true },
  { id: 4,   name: 'Charmander',  groups: ['monster','dragon'],        gender: 'normal', shinyAlwaysMale: true },
  { id: 5,   name: 'Charmeleon',  groups: ['monster','dragon'],        gender: 'normal', shinyAlwaysMale: true },
  { id: 6,   name: 'Charizard',   groups: ['monster','dragon'],        gender: 'normal', shinyAlwaysMale: true },
  { id: 7,   name: 'Squirtle',    groups: ['monster','water1'],        gender: 'normal', shinyAlwaysMale: true },
  { id: 8,   name: 'Wartortle',   groups: ['monster','water1'],        gender: 'normal', shinyAlwaysMale: true },
  { id: 9,   name: 'Blastoise',   groups: ['monster','water1'],        gender: 'normal', shinyAlwaysMale: true },
  { id: 10,  name: 'Caterpie',    groups: ['bug'],                     gender: 'normal' },
  { id: 11,  name: 'Metapod',     groups: ['bug'],                     gender: 'normal' },
  { id: 12,  name: 'Butterfree',  groups: ['bug'],                     gender: 'normal' },
  { id: 13,  name: 'Weedle',      groups: ['bug'],                     gender: 'normal' },
  { id: 14,  name: 'Kakuna',      groups: ['bug'],                     gender: 'normal' },
  { id: 15,  name: 'Beedrill',    groups: ['bug'],                     gender: 'normal' },
  { id: 16,  name: 'Pidgey',      groups: ['flying'],                  gender: 'normal' },
  { id: 17,  name: 'Pidgeotto',   groups: ['flying'],                  gender: 'normal' },
  { id: 18,  name: 'Pidgeot',     groups: ['flying'],                  gender: 'normal' },
  { id: 19,  name: 'Rattata',     groups: ['field'],                   gender: 'normal' },
  { id: 20,  name: 'Raticate',    groups: ['field'],                   gender: 'normal' },
  { id: 21,  name: 'Spearow',     groups: ['flying'],                  gender: 'normal' },
  { id: 22,  name: 'Fearow',      groups: ['flying'],                  gender: 'normal' },
  { id: 23,  name: 'Ekans',       groups: ['field','dragon'],          gender: 'normal' },
  { id: 24,  name: 'Arbok',       groups: ['field','dragon'],          gender: 'normal' },
  { id: 25,  name: 'Pikachu',     groups: ['field','fairy'],           gender: 'normal' },
  { id: 26,  name: 'Raichu',      groups: ['field','fairy'],           gender: 'normal' },
  { id: 27,  name: 'Sandshrew',   groups: ['field'],                   gender: 'normal' },
  { id: 28,  name: 'Sandslash',   groups: ['field'],                   gender: 'normal' },
  { id: 29,  name: 'Nidoran♀',    groups: ['field','monster'],         gender: 'female-only' },
  { id: 30,  name: 'Nidorina',    groups: ['field','monster'],         gender: 'female-only' }, // Gen 2: CAN breed
  { id: 31,  name: 'Nidoqueen',   groups: ['field','monster'],         gender: 'female-only' }, // Gen 2: CAN breed
  { id: 32,  name: 'Nidoran♂',    groups: ['field','monster'],         gender: 'male-only' },
  { id: 33,  name: 'Nidorino',    groups: ['field','monster'],         gender: 'male-only' },
  { id: 34,  name: 'Nidoking',    groups: ['field','monster'],         gender: 'male-only' },
  { id: 35,  name: 'Clefairy',    groups: ['fairy'],                   gender: 'normal' },
  { id: 36,  name: 'Clefable',    groups: ['fairy'],                   gender: 'normal' },
  { id: 37,  name: 'Vulpix',      groups: ['field'],                   gender: 'normal' },
  { id: 38,  name: 'Ninetales',   groups: ['field'],                   gender: 'normal' },
  { id: 39,  name: 'Jigglypuff',  groups: ['fairy'],                   gender: 'normal' },
  { id: 40,  name: 'Wigglytuff',  groups: ['fairy'],                   gender: 'normal' },
  { id: 41,  name: 'Zubat',       groups: ['flying'],                  gender: 'normal' },
  { id: 42,  name: 'Golbat',      groups: ['flying'],                  gender: 'normal' },
  { id: 43,  name: 'Oddish',      groups: ['grass'],                   gender: 'normal' },
  { id: 44,  name: 'Gloom',       groups: ['grass'],                   gender: 'normal' },
  { id: 45,  name: 'Vileplume',   groups: ['grass'],                   gender: 'normal' },
  { id: 46,  name: 'Paras',       groups: ['bug','grass'],             gender: 'normal' },
  { id: 47,  name: 'Parasect',    groups: ['bug','grass'],             gender: 'normal' },
  { id: 48,  name: 'Venonat',     groups: ['bug'],                     gender: 'normal' },
  { id: 49,  name: 'Venomoth',    groups: ['bug'],                     gender: 'normal' },
  { id: 50,  name: 'Diglett',     groups: ['field'],                   gender: 'normal' },
  { id: 51,  name: 'Dugtrio',     groups: ['field'],                   gender: 'normal' },
  { id: 52,  name: 'Meowth',      groups: ['field'],                   gender: 'normal' },
  { id: 53,  name: 'Persian',     groups: ['field'],                   gender: 'normal' },
  { id: 54,  name: 'Psyduck',     groups: ['water1','field'],          gender: 'normal' },
  { id: 55,  name: 'Golduck',     groups: ['water1','field'],          gender: 'normal' },
  { id: 56,  name: 'Mankey',      groups: ['field'],                   gender: 'normal' },
  { id: 57,  name: 'Primeape',    groups: ['field'],                   gender: 'normal' },
  { id: 58,  name: 'Growlithe',   groups: ['field'],                   gender: 'normal' },
  { id: 59,  name: 'Arcanine',    groups: ['field'],                   gender: 'normal' },
  { id: 60,  name: 'Poliwag',     groups: ['water1'],                  gender: 'normal' },
  { id: 61,  name: 'Poliwhirl',   groups: ['water1'],                  gender: 'normal' },
  { id: 62,  name: 'Poliwrath',   groups: ['water1'],                  gender: 'normal' },
  { id: 63,  name: 'Abra',        groups: ['humanlike'],               gender: 'normal' },
  { id: 64,  name: 'Kadabra',     groups: ['humanlike'],               gender: 'normal' },
  { id: 65,  name: 'Alakazam',    groups: ['humanlike'],               gender: 'normal' },
  { id: 66,  name: 'Machop',      groups: ['humanlike'],               gender: 'normal' },
  { id: 67,  name: 'Machoke',     groups: ['humanlike'],               gender: 'normal' },
  { id: 68,  name: 'Machamp',     groups: ['humanlike'],               gender: 'normal' },
  { id: 69,  name: 'Bellsprout',  groups: ['grass'],                   gender: 'normal' },
  { id: 70,  name: 'Weepinbell',  groups: ['grass'],                   gender: 'normal' },
  { id: 71,  name: 'Victreebel',  groups: ['grass'],                   gender: 'normal' },
  { id: 72,  name: 'Tentacool',   groups: ['water3'],                  gender: 'normal' },
  { id: 73,  name: 'Tentacruel',  groups: ['water3'],                  gender: 'normal' },
  { id: 74,  name: 'Geodude',     groups: ['mineral'],                 gender: 'normal' },
  { id: 75,  name: 'Graveler',    groups: ['mineral'],                 gender: 'normal' },
  { id: 76,  name: 'Golem',       groups: ['mineral'],                 gender: 'normal' },
  { id: 77,  name: 'Ponyta',      groups: ['field'],                   gender: 'normal' },
  { id: 78,  name: 'Rapidash',    groups: ['field'],                   gender: 'normal' },
  { id: 79,  name: 'Slowpoke',    groups: ['monster','water1'],        gender: 'normal' },
  { id: 80,  name: 'Slowbro',     groups: ['monster','water1'],        gender: 'normal' },
  { id: 81,  name: 'Magnemite',   groups: ['mineral'],                 gender: 'genderless' },
  { id: 82,  name: 'Magneton',    groups: ['mineral'],                 gender: 'genderless' },
  { id: 83,  name: "Farfetch'd",  groups: ['flying','field'],          gender: 'normal' },
  { id: 84,  name: 'Doduo',       groups: ['flying'],                  gender: 'normal' },
  { id: 85,  name: 'Dodrio',      groups: ['flying'],                  gender: 'normal' },
  { id: 86,  name: 'Seel',        groups: ['water1','field'],          gender: 'normal' },
  { id: 87,  name: 'Dewgong',     groups: ['water1','field'],          gender: 'normal' },
  { id: 88,  name: 'Grimer',      groups: ['amorphous'],               gender: 'normal' },
  { id: 89,  name: 'Muk',         groups: ['amorphous'],               gender: 'normal' },
  { id: 90,  name: 'Shellder',    groups: ['water3'],                  gender: 'normal' },
  { id: 91,  name: 'Cloyster',    groups: ['water3'],                  gender: 'normal' },
  { id: 92,  name: 'Gastly',      groups: ['amorphous'],               gender: 'normal' },
  { id: 93,  name: 'Haunter',     groups: ['amorphous'],               gender: 'normal' },
  { id: 94,  name: 'Gengar',      groups: ['amorphous'],               gender: 'normal' },
  { id: 95,  name: 'Onix',        groups: ['mineral'],                 gender: 'normal' },
  { id: 96,  name: 'Drowzee',     groups: ['humanlike'],               gender: 'normal' },
  { id: 97,  name: 'Hypno',       groups: ['humanlike'],               gender: 'normal' },
  { id: 98,  name: 'Krabby',      groups: ['water3'],                  gender: 'normal' },
  { id: 99,  name: 'Kingler',     groups: ['water3'],                  gender: 'normal' },
  { id: 100, name: 'Voltorb',     groups: ['mineral'],                 gender: 'genderless' },
  { id: 101, name: 'Electrode',   groups: ['mineral'],                 gender: 'genderless' },
  { id: 102, name: 'Exeggcute',   groups: ['grass'],                   gender: 'normal' },
  { id: 103, name: 'Exeggutor',   groups: ['grass'],                   gender: 'normal' },
  { id: 104, name: 'Cubone',      groups: ['monster'],                 gender: 'normal' },
  { id: 105, name: 'Marowak',     groups: ['monster'],                 gender: 'normal' },
  { id: 106, name: 'Hitmonlee',   groups: ['humanlike'],               gender: 'male-only' },
  { id: 107, name: 'Hitmonchan',  groups: ['humanlike'],               gender: 'male-only' },
  { id: 108, name: 'Lickitung',   groups: ['monster'],                 gender: 'normal' },
  { id: 109, name: 'Koffing',     groups: ['amorphous'],               gender: 'normal' },
  { id: 110, name: 'Weezing',     groups: ['amorphous'],               gender: 'normal' },
  { id: 111, name: 'Rhyhorn',     groups: ['field','monster'],         gender: 'normal' },
  { id: 112, name: 'Rhydon',      groups: ['field','monster'],         gender: 'normal' },
  { id: 113, name: 'Chansey',     groups: ['fairy'],                   gender: 'female-only' },
  { id: 114, name: 'Tangela',     groups: ['grass'],                   gender: 'normal' },
  { id: 115, name: 'Kangaskhan',  groups: ['monster'],                 gender: 'female-only' },
  { id: 116, name: 'Horsea',      groups: ['water1','dragon'],         gender: 'normal' },
  { id: 117, name: 'Seadra',      groups: ['water1','dragon'],         gender: 'normal' },
  { id: 118, name: 'Goldeen',     groups: ['water2'],                  gender: 'normal' },
  { id: 119, name: 'Seaking',     groups: ['water2'],                  gender: 'normal' },
  { id: 120, name: 'Staryu',      groups: ['water3'],                  gender: 'genderless' },
  { id: 121, name: 'Starmie',     groups: ['water3'],                  gender: 'genderless' },
  { id: 122, name: 'Mr. Mime',    groups: ['humanlike'],               gender: 'normal' },
  { id: 123, name: 'Scyther',     groups: ['bug'],                     gender: 'normal' },
  { id: 124, name: 'Jynx',        groups: ['humanlike'],               gender: 'female-only' },
  { id: 125, name: 'Electabuzz',  groups: ['humanlike'],               gender: 'normal' },
  { id: 126, name: 'Magmar',      groups: ['humanlike'],               gender: 'normal' },
  { id: 127, name: 'Pinsir',      groups: ['bug'],                     gender: 'normal' },
  { id: 128, name: 'Tauros',      groups: ['field'],                   gender: 'male-only' },
  { id: 129, name: 'Magikarp',    groups: ['water2','dragon'],         gender: 'normal' },
  { id: 130, name: 'Gyarados',    groups: ['water2','dragon'],         gender: 'normal' },
  { id: 131, name: 'Lapras',      groups: ['monster','water1'],        gender: 'normal' },
  { id: 132, name: 'Ditto',       groups: ['ditto'],                   gender: 'genderless' },
  { id: 133, name: 'Eevee',       groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 134, name: 'Vaporeon',    groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 135, name: 'Jolteon',     groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 136, name: 'Flareon',     groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 137, name: 'Porygon',     groups: ['mineral'],                 gender: 'genderless' },
  { id: 138, name: 'Omanyte',     groups: ['water1','water3'],         gender: 'normal' },
  { id: 139, name: 'Omastar',     groups: ['water1','water3'],         gender: 'normal' },
  { id: 140, name: 'Kabuto',      groups: ['water1','water3'],         gender: 'normal' },
  { id: 141, name: 'Kabutops',    groups: ['water1','water3'],         gender: 'normal' },
  { id: 142, name: 'Aerodactyl',  groups: ['flying'],                  gender: 'normal', shinyAlwaysMale: true },
  { id: 143, name: 'Snorlax',     groups: ['monster'],                 gender: 'normal', shinyAlwaysMale: true },
  { id: 144, name: 'Articuno',    groups: ['undiscovered'],            gender: 'none' },
  { id: 145, name: 'Zapdos',      groups: ['undiscovered'],            gender: 'none' },
  { id: 146, name: 'Moltres',     groups: ['undiscovered'],            gender: 'none' },
  { id: 147, name: 'Dratini',     groups: ['water1','dragon'],         gender: 'normal' },
  { id: 148, name: 'Dragonair',   groups: ['water1','dragon'],         gender: 'normal' },
  { id: 149, name: 'Dragonite',   groups: ['water1','dragon'],         gender: 'normal' },
  { id: 150, name: 'Mewtwo',      groups: ['undiscovered'],            gender: 'none' },
  { id: 151, name: 'Mew',         groups: ['undiscovered'],            gender: 'none' },

  // ── Gen 2 ──────────────────────────────────────────────────────────────────
  { id: 152, name: 'Chikorita',   groups: ['monster','grass'],         gender: 'normal', shinyAlwaysMale: true },
  { id: 153, name: 'Bayleef',     groups: ['monster','grass'],         gender: 'normal', shinyAlwaysMale: true },
  { id: 154, name: 'Meganium',    groups: ['monster','grass'],         gender: 'normal', shinyAlwaysMale: true },
  { id: 155, name: 'Cyndaquil',   groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 156, name: 'Quilava',     groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 157, name: 'Typhlosion',  groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 158, name: 'Totodile',    groups: ['monster','water1'],        gender: 'normal', shinyAlwaysMale: true },
  { id: 159, name: 'Croconaw',    groups: ['monster','water1'],        gender: 'normal', shinyAlwaysMale: true },
  { id: 160, name: 'Feraligatr',  groups: ['monster','water1'],        gender: 'normal', shinyAlwaysMale: true },
  { id: 161, name: 'Sentret',     groups: ['field'],                   gender: 'normal' },
  { id: 162, name: 'Furret',      groups: ['field'],                   gender: 'normal' },
  { id: 163, name: 'Hoothoot',    groups: ['flying'],                  gender: 'normal' },
  { id: 164, name: 'Noctowl',     groups: ['flying'],                  gender: 'normal' },
  { id: 165, name: 'Ledyba',      groups: ['bug'],                     gender: 'normal' },
  { id: 166, name: 'Ledian',      groups: ['bug'],                     gender: 'normal' },
  { id: 167, name: 'Spinarak',    groups: ['bug'],                     gender: 'normal' },
  { id: 168, name: 'Ariados',     groups: ['bug'],                     gender: 'normal' },
  { id: 169, name: 'Crobat',      groups: ['flying'],                  gender: 'normal' },
  { id: 170, name: 'Chinchou',    groups: ['water2'],                  gender: 'normal' },
  { id: 171, name: 'Lanturn',     groups: ['water2'],                  gender: 'normal' },
  { id: 172, name: 'Pichu',       groups: ['undiscovered'],            gender: 'none' },   // baby
  { id: 173, name: 'Cleffa',      groups: ['undiscovered'],            gender: 'none' },   // baby
  { id: 174, name: 'Igglybuff',   groups: ['undiscovered'],            gender: 'none' },   // baby
  { id: 175, name: 'Togepi',      groups: ['undiscovered'],            gender: 'none' },   // baby
  { id: 176, name: 'Togetic',     groups: ['flying','fairy'],          gender: 'normal' },
  { id: 177, name: 'Natu',        groups: ['flying'],                  gender: 'normal' },
  { id: 178, name: 'Xatu',        groups: ['flying'],                  gender: 'normal' },
  { id: 179, name: 'Mareep',      groups: ['field','monster'],         gender: 'normal', shinyAlwaysMale: true },
  { id: 180, name: 'Flaaffy',     groups: ['field','monster'],         gender: 'normal', shinyAlwaysMale: true },
  { id: 181, name: 'Ampharos',    groups: ['field','monster'],         gender: 'normal', shinyAlwaysMale: true },
  { id: 182, name: 'Bellossom',   groups: ['grass'],                   gender: 'normal' },
  { id: 183, name: 'Marill',      groups: ['water1','fairy'],          gender: 'normal' },
  { id: 184, name: 'Azumarill',   groups: ['water1','fairy'],          gender: 'normal' },
  { id: 185, name: 'Sudowoodo',   groups: ['mineral'],                 gender: 'normal' },
  { id: 186, name: 'Politoed',    groups: ['water1'],                  gender: 'normal' },
  { id: 187, name: 'Hoppip',      groups: ['fairy','grass'],           gender: 'normal' },
  { id: 188, name: 'Skiploom',    groups: ['fairy','grass'],           gender: 'normal' },
  { id: 189, name: 'Jumpluff',    groups: ['fairy','grass'],           gender: 'normal' },
  { id: 190, name: 'Aipom',       groups: ['field'],                   gender: 'normal' },
  { id: 191, name: 'Sunkern',     groups: ['grass'],                   gender: 'normal' },
  { id: 192, name: 'Sunflora',    groups: ['grass'],                   gender: 'normal' },
  { id: 193, name: 'Yanma',       groups: ['bug'],                     gender: 'normal' },
  { id: 194, name: 'Wooper',      groups: ['water1','field'],          gender: 'normal' },
  { id: 195, name: 'Quagsire',    groups: ['water1','field'],          gender: 'normal' },
  { id: 196, name: 'Espeon',      groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 197, name: 'Umbreon',     groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 198, name: 'Murkrow',     groups: ['flying'],                  gender: 'normal' },
  { id: 199, name: 'Slowking',    groups: ['monster','water1'],        gender: 'normal' },
  { id: 200, name: 'Misdreavus',  groups: ['amorphous'],               gender: 'normal' },
  { id: 201, name: 'Unown',       groups: ['undiscovered'],            gender: 'none' },
  { id: 202, name: 'Wobbuffet',   groups: ['amorphous'],               gender: 'normal' },
  { id: 203, name: 'Girafarig',   groups: ['field'],                   gender: 'normal' },
  { id: 204, name: 'Pineco',      groups: ['bug'],                     gender: 'normal' },
  { id: 205, name: 'Forretress',  groups: ['bug'],                     gender: 'normal' },
  { id: 206, name: 'Dunsparce',   groups: ['field'],                   gender: 'normal' },
  { id: 207, name: 'Gligar',      groups: ['bug','flying'],            gender: 'normal' },
  { id: 208, name: 'Steelix',     groups: ['mineral'],                 gender: 'normal' },
  { id: 209, name: 'Snubbull',    groups: ['field','fairy'],           gender: 'normal' },
  { id: 210, name: 'Granbull',    groups: ['field','fairy'],           gender: 'normal' },
  { id: 211, name: 'Qwilfish',    groups: ['water2'],                  gender: 'normal' },
  { id: 212, name: 'Scizor',      groups: ['bug'],                     gender: 'normal' },
  { id: 213, name: 'Shuckle',     groups: ['bug'],                     gender: 'normal' },
  { id: 214, name: 'Heracross',   groups: ['bug'],                     gender: 'normal' },
  { id: 215, name: 'Sneasel',     groups: ['field'],                   gender: 'normal' },
  { id: 216, name: 'Teddiursa',   groups: ['field'],                   gender: 'normal' },
  { id: 217, name: 'Ursaring',    groups: ['field'],                   gender: 'normal' },
  { id: 218, name: 'Slugma',      groups: ['amorphous'],               gender: 'normal' },
  { id: 219, name: 'Magcargo',    groups: ['amorphous'],               gender: 'normal' },
  { id: 220, name: 'Swinub',      groups: ['field'],                   gender: 'normal' },
  { id: 221, name: 'Piloswine',   groups: ['field'],                   gender: 'normal' },
  { id: 222, name: 'Corsola',     groups: ['water1','water3'],         gender: 'normal' },
  { id: 223, name: 'Remoraid',    groups: ['water2'],                  gender: 'normal' },
  { id: 224, name: 'Octillery',   groups: ['water2'],                  gender: 'normal' },
  { id: 225, name: 'Delibird',    groups: ['flying','field'],          gender: 'normal' },
  { id: 226, name: 'Mantine',     groups: ['water1'],                  gender: 'normal' },
  { id: 227, name: 'Skarmory',    groups: ['flying'],                  gender: 'normal' },
  { id: 228, name: 'Houndour',    groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 229, name: 'Houndoom',    groups: ['field'],                   gender: 'normal', shinyAlwaysMale: true },
  { id: 230, name: 'Kingdra',     groups: ['water1','dragon'],         gender: 'normal' },
  { id: 231, name: 'Phanpy',      groups: ['field'],                   gender: 'normal' },
  { id: 232, name: 'Donphan',     groups: ['field'],                   gender: 'normal' },
  { id: 233, name: 'Porygon2',    groups: ['mineral'],                 gender: 'genderless' },
  { id: 234, name: 'Stantler',    groups: ['field'],                   gender: 'normal' },
  { id: 235, name: 'Smeargle',    groups: ['field'],                   gender: 'normal' },
  { id: 236, name: 'Tyrogue',     groups: ['undiscovered'],            gender: 'none' },   // baby
  { id: 237, name: 'Hitmontop',   groups: ['humanlike'],               gender: 'male-only' },
  { id: 238, name: 'Smoochum',    groups: ['undiscovered'],            gender: 'none' },   // baby
  { id: 239, name: 'Elekid',      groups: ['undiscovered'],            gender: 'none' },   // baby
  { id: 240, name: 'Magby',       groups: ['undiscovered'],            gender: 'none' },   // baby
  { id: 241, name: 'Miltank',     groups: ['field'],                   gender: 'female-only' },
  { id: 242, name: 'Blissey',     groups: ['fairy'],                   gender: 'female-only' },
  { id: 243, name: 'Raikou',      groups: ['undiscovered'],            gender: 'none' },
  { id: 244, name: 'Entei',       groups: ['undiscovered'],            gender: 'none' },
  { id: 245, name: 'Suicune',     groups: ['undiscovered'],            gender: 'none' },
  { id: 246, name: 'Larvitar',    groups: ['monster'],                 gender: 'normal', shinyAlwaysMale: true },
  { id: 247, name: 'Pupitar',     groups: ['monster'],                 gender: 'normal', shinyAlwaysMale: true },
  { id: 248, name: 'Tyranitar',   groups: ['monster'],                 gender: 'normal', shinyAlwaysMale: true },
  { id: 249, name: 'Lugia',       groups: ['undiscovered'],            gender: 'none' },
  { id: 250, name: 'Ho-Oh',       groups: ['undiscovered'],            gender: 'none' },
  { id: 251, name: 'Celebi',      groups: ['undiscovered'],            gender: 'none' },
];

// Map id → pokemon entry for fast lookup
export const POKEMON_BY_ID = Object.fromEntries(POKEMON_DATA.map(p => [p.id, p]));

// ── BFS helper ────────────────────────────────────────────────────────────────

/**
 * Build adjacency list: pokemonId → Set<pokemonId>
 * Two Pokémon are adjacent if they share at least one egg group.
 * Ditto is adjacent to every breedable (non-undiscovered) Pokémon.
 */
export function buildAdjacency() {
  const adj = {};
  const breedable = POKEMON_DATA.filter(p => p.groups[0] !== 'undiscovered');

  for (const p of breedable) adj[p.id] = new Set();

  // Group-based edges
  const byGroup = {};
  for (const p of breedable) {
    for (const g of p.groups) {
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(p.id);
    }
  }

  for (const [group, ids] of Object.entries(byGroup)) {
    if (group === 'undiscovered') continue;
    if (group === 'ditto') {
      // Ditto connects to everything breedable
      const dittoId = 132;
      for (const other of breedable) {
        if (other.id !== dittoId) {
          adj[dittoId].add(other.id);
          adj[other.id].add(dittoId);
        }
      }
    } else {
      // Add edges within this group
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          adj[ids[i]].add(ids[j]);
          adj[ids[j]].add(ids[i]);
        }
      }
    }
  }

  return adj;
}

/**
 * Find the shortest breeding chain from any owned shiny to the target.
 *
 * Pokémon with shinyAlwaysMale:true are excluded as sources and intermediates
 * (shiny ♀ is impossible for them), but they can still be the final target.
 *
 * @param {number[]} ownedIds  – Pokémon IDs the user already has as shiny
 * @param {number}   targetId  – Desired Pokémon ID
 * @param {Object}   adj       – Adjacency map from buildAdjacency()
 * @returns {{ path: number[] }|null}
 *   path: [sourceId, ...intermediates, targetId] — or [targetId] if already owned
 */
export function findShortestChain(ownedIds, targetId, adj) {
  const owned = new Set(ownedIds);

  // Already owned
  if (owned.has(targetId)) return { path: [targetId] };

  // Target can't breed — no path possible
  const target = POKEMON_BY_ID[targetId];
  if (!target || target.groups[0] === 'undiscovered') return null;

  // BFS — multi-source (start from all owned shinies at once)
  // Skip shinyAlwaysMale as sources — their shiny is always male, can't pass DVs
  const queue = [];
  const prev = {}; // id → parent id (for path reconstruction)
  const visited = new Set();

  for (const id of ownedIds) {
    const p = POKEMON_BY_ID[id];
    if (!p || p.groups[0] === 'undiscovered') continue;
    if (p.shinyAlwaysMale) continue;
    if (!adj[id]) continue;
    queue.push(id);
    visited.add(id);
    prev[id] = null;
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = adj[current] || new Set();

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      prev[neighbor] = current;
      if (neighbor === targetId) {
        // Reconstruct path
        const path = [];
        let node = targetId;
        while (node !== null) {
          path.unshift(node);
          node = prev[node];
        }
        return { path };
      }
      // Skip shinyAlwaysMale as intermediates — only valid as the final target
      if (POKEMON_BY_ID[neighbor]?.shinyAlwaysMale) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return null; // isolated group — no path
}

/**
 * Return the shared egg groups between two Pokémon IDs (for display).
 */
export function sharedGroups(idA, idB) {
  const a = POKEMON_BY_ID[idA];
  const b = POKEMON_BY_ID[idB];
  if (!a || !b) return [];
  if (a.groups.includes('ditto') || b.groups.includes('ditto')) return ['ditto'];
  return a.groups.filter(g => b.groups.includes(g));
}
