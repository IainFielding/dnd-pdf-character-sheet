/**
 * Structural checks on the generated Fan Content templates — the "Fan Sheet (2024)" and the
 * hand-drawn "Fantasy Sheet (2024)". Both are our own artwork but deliberately reuse the official
 * 2024 field names so Sheet2024Filler / FanSheet2024Filler can fill them unchanged; if a field is
 * missing or the wrong type, data silently drops onto the sheet. Each test loads the built PDF and
 * asserts every name the 2024 field map expects is present with the correct widget type, plus the
 * extra "CHARACTER IMAGE" portrait button, and that there are no stray extra fields.
 *
 * Regenerate the templates with:
 *   node tools/build-fan-sheet-2024.mjs
 *   node tools/build-fantasy-sheet-2024.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ABILITIES, SKILLS, DEATH_SAVES, ARMOR_TRAINING, WEAPON_ROWS,
  SPELL_SLOT_TOTALS, SPELL_ROWS, FIELDS
} from "../scripts/field-map-2024.mjs";
import { PORTRAIT_FIELD as FAN_PORTRAIT } from "../tools/build-fan-sheet-2024.mjs";
import { PORTRAIT_FIELD as FANTASY_PORTRAIT } from "../tools/build-fantasy-sheet-2024.mjs";

const require = createRequire(import.meta.url);
const PDFLib = require("../lib/pdf-lib.min.js");
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The generated templates to check, each with the portrait button it carries. */
const SHEETS = [
  { label: "Fan Sheet (2024)", file: "DnD_Fan_2024_Character-Sheet.pdf", portrait: FAN_PORTRAIT },
  { label: "Fantasy Sheet (2024)", file: "DnD_Fantasy_2024_Character-Sheet.pdf", portrait: FANTASY_PORTRAIT }
];

/** Same whitespace-insensitive normalisation SheetFiller uses to look fields up. */
const normalize = name => name.replace(/\s+/g, "").toLowerCase();

/** Collect the expected field names from the 2024 field map, grouped by widget type. */
function expectedFields() {
  const texts = new Set();
  const checks = new Set();
  for ( const a of Object.values(ABILITIES) ) {
    texts.add(a.mod); texts.add(a.score); texts.add(a.save); checks.add(a.saveProf);
  }
  for ( const s of Object.values(SKILLS) ) { texts.add(s.field); checks.add(s.prof); }
  [...DEATH_SAVES.success, ...DEATH_SAVES.failure].forEach(c => checks.add(c));
  Object.values(ARMOR_TRAINING).forEach(c => checks.add(c));
  for ( const w of WEAPON_ROWS ) ["name", "atk", "dmg", "notes"].forEach(k => texts.add(w[k]));
  Object.values(SPELL_SLOT_TOTALS).forEach(t => texts.add(t));
  for ( const r of SPELL_ROWS ) {
    ["level", "name", "castingTime", "range", "notes"].forEach(k => texts.add(r[k]));
    ["concentration", "ritual", "material"].forEach(k => checks.add(r[k]));
  }
  for ( const [key, value] of Object.entries(FIELDS) ) {
    const names = Array.isArray(value) ? value : [value];
    if ( key === "heroicInspiration" ) names.forEach(c => checks.add(c));
    else names.forEach(t => texts.add(t));
  }
  return { texts, checks };
}

async function loadFormIndex(file) {
  const bytes = readFileSync(path.resolve(HERE, "../templates", file));
  const form = (await PDFLib.PDFDocument.load(bytes)).getForm();
  const index = new Map();
  for ( const field of form.getFields() ) index.set(normalize(field.getName()), field);
  return index;
}

for ( const sheet of SHEETS ) {
  test(`${sheet.label} has every 2024 field-map text field with the right type`, async () => {
    const index = await loadFormIndex(sheet.file);
    for ( const name of expectedFields().texts ) {
      const field = index.get(normalize(name));
      assert.ok(field, `missing text field "${name}"`);
      assert.ok(field instanceof PDFLib.PDFTextField, `"${name}" is not a text field`);
    }
  });

  test(`${sheet.label} has every 2024 field-map checkbox with the right type`, async () => {
    const index = await loadFormIndex(sheet.file);
    for ( const name of expectedFields().checks ) {
      const field = index.get(normalize(name));
      assert.ok(field, `missing checkbox "${name}"`);
      assert.ok(field instanceof PDFLib.PDFCheckBox, `"${name}" is not a checkbox`);
    }
  });

  test(`${sheet.label} carries a CHARACTER IMAGE portrait button`, async () => {
    const index = await loadFormIndex(sheet.file);
    const field = index.get(normalize(sheet.portrait));
    assert.ok(field, "missing portrait button");
    assert.ok(field instanceof PDFLib.PDFButton, "portrait field is not a push-button");
  });

  test(`${sheet.label} has no stray extra form fields`, async () => {
    const index = await loadFormIndex(sheet.file);
    const { texts, checks } = expectedFields();
    const expected = new Set([...texts, ...checks, sheet.portrait].map(normalize));
    const extra = [...index.keys()].filter(k => !expected.has(k));
    assert.deepEqual(extra, [], `unexpected fields: ${extra.join(", ")}`);
  });
}
