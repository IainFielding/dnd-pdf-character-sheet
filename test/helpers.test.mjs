/**
 * Unit tests for the pure formatting/parsing helpers in scripts/main.mjs.
 *
 * These run under Node's built-in test runner (`node --test`) with no dependencies, matching the
 * project's dependency-free CI. The helpers are pure — they touch neither PDFLib, the DOM, nor the
 * Foundry globals — so importing main.mjs is safe here: its Foundry hook registration is guarded
 * behind `globalThis.Hooks`, which is undefined in Node.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SheetFiller, signed, castingTimeAbbr, spellRowInfo, weaponNotes, damageSummary, sanitizeWinAnsi, wrapText
} from "../scripts/main.mjs";

/* -------------------------------------------- */

test("signed formats modifiers with an explicit sign", () => {
  assert.equal(signed(3), "+3");
  assert.equal(signed(0), "+0");
  assert.equal(signed(-2), "-2");
  assert.equal(signed(undefined), "+0");
  assert.equal(signed(NaN), "+0");
  assert.equal(signed("5"), "+5");
});

/* -------------------------------------------- */

test("SheetFiller.normalize strips whitespace and lowercases", () => {
  assert.equal(SheetFiller.normalize("Race "), "race");
  assert.equal(SheetFiller.normalize("SpellSaveDC  2"), "spellsavedc2");
  assert.equal(SheetFiller.normalize("Wpn Name 3"), "wpnname3");
});

/* -------------------------------------------- */

const withActivation = label => ({ labels: { activation: label } });

test("castingTimeAbbr collapses actions and keeps durational counts", () => {
  assert.equal(castingTimeAbbr(withActivation("Bonus Action")), "BA");
  assert.equal(castingTimeAbbr(withActivation("Reaction")), "R");
  assert.equal(castingTimeAbbr(withActivation("Action")), "A");
  assert.equal(castingTimeAbbr(withActivation("1 Action")), "A");
  // Regression: a 1-minute cast used to render as a bare "Min" with no number.
  assert.equal(castingTimeAbbr(withActivation("1 Minute")), "1 Min");
  assert.equal(castingTimeAbbr(withActivation("10 Minutes")), "10 Min");
  assert.equal(castingTimeAbbr(withActivation("1 Hour")), "1 Hr");
  assert.equal(castingTimeAbbr(withActivation("8 Hours")), "8 Hr");
  assert.equal(castingTimeAbbr(withActivation("Special")), "Special");
  assert.equal(castingTimeAbbr(withActivation("")), "");
});

/* -------------------------------------------- */

const makeSpell = ({ level = 1, name = "Fireball", props = [], activation = "Action", range = "150 ft" } = {}) => ({
  name,
  system: { level, properties: new Set(props) },
  labels: { activation, range }
});

test("spellRowInfo abbreviates level and reads properties (Set)", () => {
  const info = spellRowInfo(makeSpell({ level: 0, name: "Fire Bolt", props: ["ritual"], range: "120 ft" }));
  assert.equal(info.level, "C");
  assert.equal(info.name, "Fire Bolt");
  assert.equal(info.range, "120 ft");
  assert.equal(info.ritual, true);
  assert.equal(info.concentration, false);
  assert.equal(info.material, false);

  assert.equal(spellRowInfo(makeSpell({ level: 3 })).level, "3");
});

test("spellRowInfo reads properties when they are a legacy Array", () => {
  const spell = makeSpell({ props: [] });
  spell.system.properties = ["concentration", "material"];  // older dnd5e shape
  const info = spellRowInfo(spell);
  assert.equal(info.concentration, true);
  assert.equal(info.material, true);
  assert.equal(info.ritual, false);
});

/* -------------------------------------------- */

test("weaponNotes lists only the called-out properties, in display order", () => {
  const weapon = { system: { properties: new Set(["rch", "mgc", "fin"]) } };
  // Order follows WEAPON_NOTE_PROPERTIES (Magical before Reach); "fin" is not surfaced.
  assert.equal(weaponNotes(weapon), "Magical, Reach");
  assert.equal(weaponNotes({ system: { properties: new Set() } }), "");
  assert.equal(weaponNotes({ system: {} }), "");
});

test("weaponNotes accepts a legacy Array of properties", () => {
  assert.equal(weaponNotes({ system: { properties: ["hvy", "sil"] } }), "Heavy, Silvered");
});

/* -------------------------------------------- */

test("damageSummary pairs each formula with an abbreviated type", () => {
  const weapon = { labels: { damages: [
    { formula: "1d8", damageType: "slashing" },
    { formula: "2d6", damageType: "fire" }
  ] } };
  assert.equal(damageSummary(weapon), "1d8 Slsh, 2d6 Fire");
});

test("damageSummary falls back to the part label for unknown types", () => {
  const weapon = { labels: { damages: [{ formula: "1d6", damageType: "weird", label: "1d6 weird" }] } };
  assert.equal(damageSummary(weapon), "1d6 weird");
  assert.equal(damageSummary({ labels: {} }), "");
});

/* -------------------------------------------- */

test("sanitizeWinAnsi replaces characters the standard fonts cannot render", () => {
  assert.equal(sanitizeWinAnsi("‘quote’"), "'quote'");
  assert.equal(sanitizeWinAnsi("“quote”"), '"quote"');
  assert.equal(sanitizeWinAnsi("a—b–c"), "a-b-c");
  assert.equal(sanitizeWinAnsi("more…"), "more...");
  assert.equal(sanitizeWinAnsi("a b"), "a b");   // non-breaking space -> space
  assert.equal(sanitizeWinAnsi("emoji \u{1F600} gone"), "emoji  gone");  // unsupported dropped
  assert.equal(sanitizeWinAnsi("café"), "café");  // Latin-1 accents kept
});

/* -------------------------------------------- */

// A stand-in for a pdf-lib font: width is proportional to character count so the tests are
// deterministic without embedding a real font. With size 1, one "point" == one character.
const mockFont = { widthOfTextAtSize: (text, size) => text.length * size };

test("wrapText greedily wraps at the available width", () => {
  const lines = wrapText("the quick brown fox", mockFont, 1, 9);
  for ( const line of lines ) assert.ok(line.length <= 9, `line "${line}" exceeds width`);
  assert.equal(lines.join(" "), "the quick brown fox");
});

test("wrapText preserves blank lines between paragraphs", () => {
  const lines = wrapText("a\n\nb", mockFont, 1, 20);
  assert.deepEqual(lines, ["a", "", "b"]);
});

test("wrapText terminates on a glyph wider than the whole line (no infinite loop)", () => {
  // maxWidth 5 with size 10 means even a single character (width 10) overflows. Before the guard
  // this looped forever; now it must split into one-character lines and return.
  const lines = wrapText("WWWW", mockFont, 10, 5);
  assert.equal(lines.length, 4);
  for ( const line of lines ) assert.equal(line.length, 1);
});
