/**
 * Structural invariants for the two field-name maps. These maps are the most error-prone part of
 * the module: a single mistyped or duplicated PDF field name silently drops data onto the sheet.
 * The tests below do not need Foundry or PDFLib — they only assert the shape and internal
 * consistency of the maps, which is exactly where a copy/paste slip would show up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ABILITIES as A14, SKILLS as S14, DEATH_SAVES as D14, WEAPON_ROWS as W14,
  SPELL_LEVELS, slotFields
} from "../scripts/field-map-2014.mjs";
import {
  ABILITIES as A24, SKILLS as S24, DEATH_SAVES as D24, WEAPON_ROWS as W24,
  SPELL_SLOT_TOTALS as SLOTS24, SPELL_ROWS as ROWS24, FIELDS as F24
} from "../scripts/field-map-2024.mjs";

/** The 18 dnd5e skill ids both sheets must cover. */
const SKILL_IDS = [
  "acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv",
  "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"
];
const ABILITY_IDS = ["str", "dex", "con", "int", "wis", "cha"];

const assertUnique = (values, label) =>
  assert.equal(new Set(values).size, values.length, `${label} contains duplicate field names`);

/* -------------------------------------------- 2014 -------------------------------------------- */

test("2014 abilities cover all six with the expected sub-fields", () => {
  assert.deepEqual(Object.keys(A14).sort(), [...ABILITY_IDS].sort());
  for ( const [id, map] of Object.entries(A14) ) {
    for ( const part of ["score", "mod", "save", "saveProf"] ) {
      assert.equal(typeof map[part], "string", `2014 ability ${id} is missing ${part}`);
    }
  }
});

test("2014 skills cover all eighteen dnd5e skills with unique boxes", () => {
  assert.deepEqual(Object.keys(S14).sort(), [...SKILL_IDS].sort());
  assertUnique(Object.values(S14).map(s => s.field), "2014 skill fields");
  assertUnique(Object.values(S14).map(s => s.prof), "2014 skill proficiency boxes");
});

test("2014 death saves and weapon rows are well-formed", () => {
  assert.equal(D14.success.length, 3);
  assert.equal(D14.failure.length, 3);
  assertUnique([...D14.success, ...D14.failure], "2014 death save boxes");
  assert.equal(W14.length, 3);
  for ( const row of W14 ) for ( const part of ["name", "atk", "dmg"] ) assert.equal(typeof row[part], "string");
});

test("2014 spell levels: every prepared checkbox lines up with a spell line", () => {
  const allLines = [];
  const allChecks = [];
  for ( let level = 0; level <= 9; level++ ) {
    const map = SPELL_LEVELS[level];
    assert.ok(map, `2014 spell level ${level} is missing`);
    assert.ok(Array.isArray(map.lines) && map.lines.length > 0, `level ${level} has no lines`);
    if ( level === 0 ) assert.equal(map.checks.length, 0, "cantrips have no prepared checkbox");
    else assert.equal(map.checks.length, map.lines.length,
      `level ${level}: ${map.checks.length} checkboxes for ${map.lines.length} spell lines`);
    allLines.push(...map.lines);
    allChecks.push(...map.checks);
  }
  assertUnique(allLines, "2014 spell lines");
  assertUnique(allChecks, "2014 prepared checkboxes");
});

test("2014 slotFields maps levels 1-9 onto SlotsTotal 19-27", () => {
  assert.deepEqual(slotFields(1), { total: "SlotsTotal 19", remaining: "SlotsRemaining 19" });
  assert.deepEqual(slotFields(9), { total: "SlotsTotal 27", remaining: "SlotsRemaining 27" });
});

/* -------------------------------------------- 2024 -------------------------------------------- */

test("2024 abilities and skills cover the full set with unique boxes", () => {
  assert.deepEqual(Object.keys(A24).sort(), [...ABILITY_IDS].sort());
  assert.deepEqual(Object.keys(S24).sort(), [...SKILL_IDS].sort());
  assertUnique(Object.values(A24).map(a => a.score), "2024 ability score boxes");
  assertUnique(Object.values(A24).map(a => a.saveProf), "2024 save proficiency boxes");
  assertUnique(Object.values(S24).map(s => s.field), "2024 skill fields");
  assertUnique(Object.values(S24).map(s => s.prof), "2024 skill proficiency boxes");
});

test("2024 death saves are well-formed and spell slot totals cover 1-9", () => {
  assert.equal(D24.success.length, 3);
  assert.equal(D24.failure.length, 3);
  assertUnique([...D24.success, ...D24.failure], "2024 death save boxes");
  assert.deepEqual(Object.keys(SLOTS24).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assertUnique(Object.values(SLOTS24), "2024 spell slot total boxes");
});

test("2024 weapon rows are complete and unique", () => {
  assert.equal(W24.length, 6);
  const names = [];
  for ( const row of W24 ) {
    for ( const part of ["name", "atk", "dmg", "notes"] ) assert.equal(typeof row[part], "string");
    names.push(row.name);
  }
  assertUnique(names, "2024 weapon name boxes");
});

test("2024 spell table has 30 fully-populated, unique rows", () => {
  assert.equal(ROWS24.length, 30);
  for ( const key of ["level", "name", "castingTime", "range", "notes", "concentration", "ritual", "material"] ) {
    const values = ROWS24.map(row => row[key]);
    assert.ok(values.every(v => typeof v === "string" && v.length), `2024 spell rows missing ${key}`);
    assertUnique(values, `2024 spell row ${key}`);
  }
});

test("2024 concentration/ritual/material checkboxes re-base across their field blocks", () => {
  // The source PDF groups these checkboxes into three blocks (rows 0-6, 7-19, 20-29); the map's
  // helpers re-index within each block, so the boundaries are the place a mistake would hide.
  assert.equal(ROWS24[6].concentration, "Check Box252.6");
  assert.equal(ROWS24[7].concentration, "Check Box255.0");
  assert.equal(ROWS24[19].concentration, "Check Box255.12");
  assert.equal(ROWS24[20].concentration, "Check Box258.0");
  assert.equal(ROWS24[29].concentration, "Check Box258.9");

  assert.equal(ROWS24[6].material, "Check Box254.0.6");
  assert.equal(ROWS24[7].material, "Check Box257.0");
  assert.equal(ROWS24[20].material, "Check Box260.0");
});

test("2024 FIELDS: no dead entries collide and class-feature columns are a pair", () => {
  assert.equal(F24.classFeatures.length, 2);
  assert.equal(F24.attunement.length, 3);
  assertUnique(F24.attunement, "2024 attunement boxes");
});
