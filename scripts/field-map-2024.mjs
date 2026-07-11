/**
 * Field-name map for templates/DnD_2024_Character-Sheet.pdf (official WotC 2024 fillable sheet).
 *
 * Unlike the 2014 sheet, every form field on this template has a generic auto-generated name
 * ("Text1", "Check Box5", "Text105.0", …) that says nothing about what the field is for. The
 * constants below give each field a meaningful name; each entry corresponds to a specific box
 * on the printed layout, so a raw name like "Text64" can be referenced as ABILITIES.str.score.
 */

/** Ability score / modifier boxes, saving-throw totals and proficiency checkboxes. */
export const ABILITIES = {
  str: { mod: "Text21", score: "Text64", save: "Text91", saveProf: "Check Box37" },
  dex: { mod: "Text22", score: "Text66", save: "Text87", saveProf: "Check Box33" },
  con: { mod: "Text24", score: "Text67", save: "Text86", saveProf: "Check Box32" },
  int: { mod: "Text20", score: "Text63", save: "Text69", saveProf: "Check Box4" },
  wis: { mod: "Text23", score: "Text65", save: "Text75", saveProf: "Check Box21" },
  cha: { mod: "Text25", score: "Text68", save: "Text81", saveProf: "Check Box26" }
};

/** Skill totals and proficiency checkboxes, keyed by dnd5e skill id. */
export const SKILLS = {
  // Strength
  ath: { field: "Text92", prof: "Check Box38" },
  // Dexterity
  acr: { field: "Text88", prof: "Check Box34" },
  slt: { field: "Text89", prof: "Check Box35" },
  ste: { field: "Text90", prof: "Check Box36" },
  // Intelligence
  arc: { field: "Text70", prof: "Check Box16" },
  his: { field: "Text71", prof: "Check Box17" },
  inv: { field: "Text72", prof: "Check Box19" },
  nat: { field: "Text73", prof: "Check Box20" },
  rel: { field: "Text74", prof: "Check Box18" },
  // Wisdom
  ani: { field: "Text76", prof: "Check Box22" },
  ins: { field: "Text77", prof: "Check Box23" },
  med: { field: "Text78", prof: "Check Box25" },
  prc: { field: "Text79", prof: "Check Box31" },
  sur: { field: "Text80", prof: "Check Box24" },
  // Charisma
  dec: { field: "Text82", prof: "Check Box27" },
  itm: { field: "Text83", prof: "Check Box28" },
  prf: { field: "Text84", prof: "Check Box30" },
  per: { field: "Text85", prof: "Check Box29" }
};

export const DEATH_SAVES = {
  success: ["Check Box5", "Check Box6", "Check Box7"],
  failure: ["Check Box8", "Check Box9", "Check Box10"]
};

/** Armour-training proficiency checkboxes in the Equipment Training & Proficiencies block. */
export const ARMOR_TRAINING = {
  light: "Check Box13",
  medium: "Check Box14",
  heavy: "Check Box15",
  shield: "Check Box12"
};

/** The six rows of the Weapons & Damage Cantrips block (name / attack bonus / damage / notes). */
export const WEAPON_ROWS = [
  { name: "Text30", atk: "Text31", dmg: "Text32", notes: "Text33" },
  { name: "Text34", atk: "Text35", dmg: "Text36", notes: "Text37" },
  { name: "Text38", atk: "Text39", dmg: "Text40", notes: "Text41" },
  { name: "Text42", atk: "Text43", dmg: "Text44", notes: "Text45" },
  { name: "Text46", atk: "Text47", dmg: "Text48", notes: "Text49" },
  { name: "Text50", atk: "Text51", dmg: "Text52", notes: "Text53" }
];

/** Spell-slot "Total" boxes per level (levels 4-6 and 7-9 are laid out out-of-order in the source). */
export const SPELL_SLOT_TOTALS = {
  1: "Text112", 2: "Text113", 3: "Text114",
  4: "Text117", 5: "Text116", 6: "Text115",
  7: "Text118", 8: "Text119", 9: "Text120"
};

/**
 * The 30 rows of the unified "Cantrips & Prepared Spells" table, top to bottom. Each row has
 * level / name / casting-time / range / notes text fields and three "Concentration, Ritual &
 * Required Material" checkboxes. The checkbox field names are grouped into three inconsistent
 * blocks in the source PDF (rows 0-6, 7-19, 20-29), hence the helpers below.
 */
const NOTE_FIELDS = [
  "Text108", "Text208", "Text209", "Text210", "Text211", "Text212", "Text213", "Text214",
  "Text215", "Text216", "Text217", "Text218", "Text219", "Text220", "Text221", "Text222",
  "Text223", "Text224", "Text225", "Text227", "Text228", "Text229", "Text230", "Text244",
  "Text231", "Text232", "Text233", "Text234", "Text235", "Text236"
];
// Return the Concentration / Ritual / Material checkbox field name for table row `r` (0-29),
// picking the field-name block that covers that row and re-basing the index within it.
const concBox = r => (r <= 6) ? `Check Box252.${r}` : (r <= 19) ? `Check Box255.${r - 7}` : `Check Box258.${r - 20}`;
const ritBox = r => (r <= 6) ? `Check Box253.${r}` : (r <= 19) ? `Check Box256.${r - 7}` : `Check Box259.${r - 20}`;
const matBox = r => (r <= 6) ? `Check Box254.0.${r}` : (r <= 19) ? `Check Box257.${r - 7}` : `Check Box260.${r - 20}`;

export const SPELL_ROWS = Array.from({ length: 30 }, (_, r) => ({
  level: `Text105.${r}`,
  name: `Text106.${r}`,
  castingTime: `Text107.${r}`,
  range: `Text109.${r}`,
  notes: NOTE_FIELDS[r],
  concentration: concBox(r),
  ritual: ritBox(r),
  material: matBox(r)
}));

/** Simple one-to-one text fields and single checkboxes. */
export const FIELDS = {
  // Page 1 header
  characterName: "Text1",
  background: "Text6",
  class: "Text7",
  species: "Text8",
  subclass: "Text9",
  level: "Text11",
  xp: "Text12",
  ac: "Text13",
  hpCurrent: "Text14",
  hpTemp: "Text15",
  hpMax: "Text16",
  hdMax: "Text17",
  hdSpent: "Text18",
  heroicInspiration: "Check Box11",
  // Page 1 core stats
  profBonus: "Text19",
  initiative: "Text26",
  speed: "Text27",
  size: "Text28",
  passivePerception: "Text29",
  // Page 1 text blocks
  classFeatures: ["Text54", "Text55"],
  speciesTraits: "Text57",
  feats: "Text58",
  weaponProficiencies: "Text59",
  toolProficiencies: "Text60",
  // Currency
  cp: "Text226", sp: "Text267", ep: "Text268", gp: "Text269", pp: "Text270",
  // Page 2 spellcasting header
  spellcastingAbility: "Text111",
  spellcastingModifier: "Text93",
  spellSaveDC: "Text94",
  spellAttackBonus: "Text95",
  // Page 2 right column
  appearance: "Text96",
  backstory: "Text97",
  alignment: "Text100",
  languages: "Text98",
  equipment: "Text99",
  attunement: ["Text101", "Text102", "Text103"]
};
