/**
 * Structural checks on the generated "Fantasy Sheet (2014)"
 * (templates/DnD_Fantasy_2014_Character-Sheet.pdf). It is our own hand-drawn artwork but
 * deliberately reuses the official 2014 field names, so the base 2014 SheetFiller can fill it
 * unchanged; if a field is missing or the wrong type, data silently drops onto the sheet. The tests
 * load the built PDF and assert every name the 2014 field map expects is present with the correct
 * widget type, plus the extra "CHARACTER IMAGE" portrait button, and that there are no stray extra
 * fields.
 *
 * Regenerate the template with:
 *   node tools/build-fantasy-sheet-2014.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ABILITIES, SKILLS, DEATH_SAVES, WEAPON_ROWS, SPELL_LEVELS, slotFields, FIELDS
} from "../scripts/field-map-2014.mjs";
import { PORTRAIT_FIELD } from "../tools/build-fantasy-sheet-2014.mjs";

const require = createRequire(import.meta.url);
const PDFLib = require("../lib/pdf-lib.min.js");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = "DnD_Fantasy_2014_Character-Sheet.pdf";

/** Same whitespace-insensitive normalisation SheetFiller uses to look fields up. */
const normalize = name => name.replace(/\s+/g, "").toLowerCase();

/** Collect the expected field names from the 2014 field map, grouped by widget type. */
function expectedFields() {
  const texts = new Set();
  const checks = new Set();
  for ( const a of Object.values(ABILITIES) ) {
    texts.add(a.score); texts.add(a.mod); texts.add(a.save); checks.add(a.saveProf);
  }
  for ( const s of Object.values(SKILLS) ) { texts.add(s.field); checks.add(s.prof); }
  [...DEATH_SAVES.success, ...DEATH_SAVES.failure].forEach(c => checks.add(c));
  for ( const w of WEAPON_ROWS ) ["name", "atk", "dmg"].forEach(k => texts.add(w[k]));
  for ( let level = 0; level <= 9; level++ ) {
    const map = SPELL_LEVELS[level];
    map.lines.forEach(l => texts.add(l));
    map.checks.forEach(c => checks.add(c));
    if ( level >= 1 ) {
      const { total, remaining } = slotFields(level);
      texts.add(total); texts.add(remaining);
    }
  }
  // Every simple field is a text field (Inspiration holds an "X", not a checkbox, on the 2014 sheet).
  for ( const value of Object.values(FIELDS) ) {
    const names = Array.isArray(value) ? value : [value];
    names.forEach(t => texts.add(t));
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

test("Fantasy Sheet (2014) has every 2014 field-map text field with the right type", async () => {
  const index = await loadFormIndex(FILE);
  for ( const name of expectedFields().texts ) {
    const field = index.get(normalize(name));
    assert.ok(field, `missing text field "${name}"`);
    assert.ok(field instanceof PDFLib.PDFTextField, `"${name}" is not a text field`);
  }
});

test("Fantasy Sheet (2014) has every 2014 field-map checkbox with the right type", async () => {
  const index = await loadFormIndex(FILE);
  for ( const name of expectedFields().checks ) {
    const field = index.get(normalize(name));
    assert.ok(field, `missing checkbox "${name}"`);
    assert.ok(field instanceof PDFLib.PDFCheckBox, `"${name}" is not a checkbox`);
  }
});

test("Fantasy Sheet (2014) carries a CHARACTER IMAGE portrait button", async () => {
  const index = await loadFormIndex(FILE);
  const field = index.get(normalize(PORTRAIT_FIELD));
  assert.ok(field, "missing portrait button");
  assert.ok(field instanceof PDFLib.PDFButton, "portrait field is not a push-button");
});

test("Fantasy Sheet (2014) has no stray extra form fields", async () => {
  const index = await loadFormIndex(FILE);
  const { texts, checks } = expectedFields();
  const expected = new Set([...texts, ...checks, PORTRAIT_FIELD].map(normalize));
  const extra = [...index.keys()].filter(k => !expected.has(k));
  assert.deepEqual(extra, [], `unexpected fields: ${extra.join(", ")}`);
});
