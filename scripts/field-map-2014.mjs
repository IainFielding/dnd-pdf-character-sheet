/**
 * Field-name map for templates/DnD_2014_Character-Sheet.pdf (official WotC 2014 fillable sheet).
 * Field lists are ordered top-to-bottom exactly as printed on the sheet. Several field names in
 * the template contain stray whitespace ("Race ", "SpellSaveDC  2"); lookups in SheetFiller are
 * whitespace-insensitive (see SheetFiller.normalize), so clean canonical names are used here.
 */

/** Ability score / modifier boxes, saving throw totals and proficiency checkboxes. */
export const ABILITIES = {
  str: { score: "STR", mod: "STRmod", save: "ST Strength", saveProf: "Check Box 11" },
  dex: { score: "DEX", mod: "DEXmod", save: "ST Dexterity", saveProf: "Check Box 18" },
  con: { score: "CON", mod: "CONmod", save: "ST Constitution", saveProf: "Check Box 19" },
  int: { score: "INT", mod: "INTmod", save: "ST Intelligence", saveProf: "Check Box 20" },
  wis: { score: "WIS", mod: "WISmod", save: "ST Wisdom", saveProf: "Check Box 21" },
  cha: { score: "CHA", mod: "CHamod", save: "ST Charisma", saveProf: "Check Box 22" }
};

/** Skill totals and proficiency checkboxes, keyed by dnd5e skill id. */
export const SKILLS = {
  acr: { field: "Acrobatics", prof: "Check Box 23" },
  ani: { field: "Animal", prof: "Check Box 24" },
  arc: { field: "Arcana", prof: "Check Box 25" },
  ath: { field: "Athletics", prof: "Check Box 26" },
  dec: { field: "Deception", prof: "Check Box 27" },
  his: { field: "History", prof: "Check Box 28" },
  ins: { field: "Insight", prof: "Check Box 29" },
  itm: { field: "Intimidation", prof: "Check Box 30" },
  inv: { field: "Investigation", prof: "Check Box 31" },
  med: { field: "Medicine", prof: "Check Box 32" },
  nat: { field: "Nature", prof: "Check Box 33" },
  prc: { field: "Perception", prof: "Check Box 34" },
  prf: { field: "Performance", prof: "Check Box 35" },
  per: { field: "Persuasion", prof: "Check Box 36" },
  rel: { field: "Religion", prof: "Check Box 37" },
  slt: { field: "SleightofHand", prof: "Check Box 38" },
  ste: { field: "Stealth", prof: "Check Box 39" },
  sur: { field: "Survival", prof: "Check Box 40" }
};

export const DEATH_SAVES = {
  success: ["Check Box 12", "Check Box 13", "Check Box 14"],
  failure: ["Check Box 15", "Check Box 16", "Check Box 17"]
};

/** The three weapon rows of the Attacks & Spellcasting block. */
export const WEAPON_ROWS = [
  { name: "Wpn Name", atk: "Wpn1 AtkBonus", dmg: "Wpn1 Damage" },
  { name: "Wpn Name 2", atk: "Wpn2 AtkBonus", dmg: "Wpn2 Damage" },
  { name: "Wpn Name 3", atk: "Wpn3 AtkBonus", dmg: "Wpn3 Damage" }
];

/**
 * Spell page layout. Lines are listed top-to-bottom as printed; the first one or two field
 * numbers of each block are out of sequence in the source PDF, which is why these are
 * explicit lists rather than ranges. `checks` are the "prepared" circles beside each line
 * (cantrips have none). Slot header fields are `SlotsTotal 19`..`SlotsTotal 27` for levels 1-9.
 */
// Shorthand builders for the long field lists below:
//   cb(251)        -> "Check Box 251"
//   spells([1, 2]) -> ["Spells 1", "Spells 2"]
//   seq(3, 6)      -> [3, 4, 5, 6]
const cb = n => `Check Box ${n}`;
const spells = ns => ns.map(n => `Spells ${n}`);
const seq = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const SPELL_LEVELS = {
  0: { lines: spells([1014, ...seq(1016, 1022)]), checks: [] },
  1: { lines: spells([1015, ...seq(1023, 1033)]), checks: [251, 309, ...seq(3010, 3019)].map(cb) },
  2: { lines: spells([1046, ...seq(1034, 1045)]), checks: [313, 310, ...seq(3020, 3030)].map(cb) },
  3: { lines: spells([1048, 1047, ...seq(1049, 1059)]), checks: [315, 314, ...seq(3031, 3041)].map(cb) },
  4: { lines: spells([1061, 1060, ...seq(1062, 1072)]), checks: [317, 316, ...seq(3042, 3052)].map(cb) },
  5: { lines: spells([1074, 1073, ...seq(1075, 1081)]), checks: [319, 318, ...seq(3053, 3059)].map(cb) },
  6: { lines: spells([1083, 1082, ...seq(1084, 1090)]), checks: [321, 320, ...seq(3060, 3066)].map(cb) },
  7: { lines: spells([1092, 1091, ...seq(1093, 1099)]), checks: [323, 322, ...seq(3067, 3073)].map(cb) },
  8: { lines: spells([10101, 10100, ...seq(10102, 10106)]), checks: [325, 324, ...seq(3074, 3078)].map(cb) },
  9: { lines: spells([10108, 10107, 10109, ...seq(101010, 101013)]), checks: [327, 326, ...seq(3079, 3083)].map(cb) }
};

/** Spell slot header fields: level 1 => "SlotsTotal 19" ... level 9 => "SlotsTotal 27". */
export const slotFields = level => ({ total: `SlotsTotal ${18 + level}`, remaining: `SlotsRemaining ${18 + level}` });

/** Simple one-to-one text fields. */
export const FIELDS = {
  // Page 1 header
  characterName: "CharacterName",
  classLevel: "ClassLevel",
  background: "Background",
  playerName: "PlayerName",
  race: "Race",
  alignment: "Alignment",
  xp: "XP",
  // Page 1 core stats
  inspiration: "Inspiration",
  profBonus: "ProfBonus",
  ac: "AC",
  initiative: "Initiative",
  speed: "Speed",
  hpMax: "HPMax",
  hpCurrent: "HPCurrent",
  hpTemp: "HPTemp",
  hdTotal: "HDTotal",
  hd: "HD",
  passivePerception: "Passive",
  // Page 1 text blocks
  personalityTraits: "PersonalityTraits",
  ideals: "Ideals",
  bonds: "Bonds",
  flaws: "Flaws",
  attacksSpellcasting: "AttacksSpellcasting",
  proficienciesLang: "ProficienciesLang",
  equipment: "Equipment",
  featuresTraits: "Features and Traits",
  // Currency
  cp: "CP", sp: "SP", ep: "EP", gp: "GP", pp: "PP",
  // Page 2
  characterName2: "CharacterName 2",
  age: "Age",
  height: "Height",
  weight: "Weight",
  eyes: "Eyes",
  skin: "Skin",
  hair: "Hair",
  allies: "Allies",
  factionName: "FactionName",
  backstory: "Backstory",
  additionalFeatures: "Feat+Traits",
  // Page 3 spellcasting header
  spellcastingClass: "Spellcasting Class 2",
  spellcastingAbility: "SpellcastingAbility 2",
  spellSaveDC: "SpellSaveDC 2",
  spellAttackBonus: "SpellAtkBonus 2"
};
