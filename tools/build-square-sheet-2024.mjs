/**
 * Build script for templates/DnD_Square_2024_Character-Sheet.pdf
 *
 * Generates an original, form-fillable "5th Edition" character sheet in a "Modern Arcane" style
 * (off-white parchment, deep ink-blue + burnished gold, thin double-rule borders). The layout and
 * artwork are entirely our own so the sheet can be distributed as Fan Content; it is NOT a copy of
 * any Wizards of the Coast sheet. It intentionally reuses the *field names* expected by
 * scripts/field-map-2024.mjs so the existing Sheet2024Filler can populate it unchanged, and adds
 * one extra "CHARACTER IMAGE" push-button for the character portrait.
 *
 * Run from the repo root:
 *   node tools/build-square-sheet-2024.mjs
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  ABILITIES, SKILLS, DEATH_SAVES, ARMOR_TRAINING, WEAPON_ROWS,
  SPELL_SLOT_TOTALS, SPELL_ROWS, FIELDS
} from "../scripts/field-map-2024.mjs";

const require = createRequire(import.meta.url);
const PDFLib = require("../lib/pdf-lib.min.js");
const { PDFDocument, StandardFonts, rgb, degrees, TextAlignment } = PDFLib;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../templates/DnD_Square_2024_Character-Sheet.pdf");

/** Push-button field that receives the actor portrait (not part of the 2024 field map). */
export const PORTRAIT_FIELD = "CHARACTER IMAGE";

/* -------------------------------------------- */
/*  Design system                               */
/* -------------------------------------------- */

const INK       = rgb(0.086, 0.145, 0.271);   // deep ink-blue, primary line/heading colour
const INK_SOFT  = rgb(0.31, 0.36, 0.47);
const GOLD      = rgb(0.60, 0.47, 0.17);       // burnished gold accent
const GOLD_SOFT = rgb(0.80, 0.70, 0.44);
const PARCH     = rgb(0.984, 0.973, 0.945);    // page parchment
const PANEL     = rgb(0.968, 0.953, 0.918);    // panel fill
const PANEL2    = rgb(0.945, 0.925, 0.882);    // header-strip fill
const FIELD_BG  = rgb(0.999, 0.996, 0.988);    // subtle field wells
const LINE      = rgb(0.70, 0.66, 0.57);
const LINE_SOFT = rgb(0.83, 0.80, 0.72);
const LABEL     = rgb(0.36, 0.32, 0.26);       // muted brown for micro-labels
const WHITE     = rgb(1, 1, 1);

const PAGE_W = 612;
const PAGE_H = 792;

/* -------------------------------------------- */
/*  Sheet helper (top-left coordinate system)   */
/* -------------------------------------------- */

class Sheet {
  constructor(doc, page, fonts) {
    this.doc = doc;
    this.page = page;
    this.form = doc.getForm();
    this.f = fonts;
  }

  /** Convert a top-origin y to pdf-lib's bottom-origin y for a box of the given height. */
  yBox(top, h) { return PAGE_H - top - h; }

  /* ---- primitive drawing (all top-origin) ---- */

  rect(x, top, w, h, { fill, stroke, lineWidth = 1, opacity } = {}) {
    this.page.drawRectangle({
      x, y: this.yBox(top, h), width: w, height: h,
      color: fill, borderColor: stroke, borderWidth: stroke ? lineWidth : 0, opacity
    });
  }

  line(x1, top1, x2, top2, { color = LINE, width = 1, dash } = {}) {
    this.page.drawLine({
      start: { x: x1, y: PAGE_H - top1 }, end: { x: x2, y: PAGE_H - top2 },
      thickness: width, color, dashArray: dash
    });
  }

  /** Text with its baseline placed `size` below `top` (so `top` is the visual top of the caps). */
  txt(str, x, top, { size = 8, font = "reg", color = INK, spacing = 0 } = {}) {
    const f = this.f[font];
    if ( spacing ) {
      let cx = x;
      for ( const ch of String(str) ) {
        this.page.drawText(ch, { x: cx, y: PAGE_H - top - size, size, font: f, color });
        cx += f.widthOfTextAtSize(ch, size) + spacing;
      }
      return;
    }
    this.page.drawText(String(str), { x, y: PAGE_H - top - size, size, font: f, color });
  }

  width(str, size, font = "reg") { return this.f[font].widthOfTextAtSize(String(str), size); }

  txtC(str, cx, top, opts = {}) {
    const w = this.widthTracked(str, opts);
    this.txt(str, cx - w / 2, top, opts);
  }

  txtR(str, rx, top, opts = {}) {
    const w = this.widthTracked(str, opts);
    this.txt(str, rx - w, top, opts);
  }

  widthTracked(str, { size = 8, font = "reg", spacing = 0 } = {}) {
    const f = this.f[font];
    const base = f.widthOfTextAtSize(String(str), size);
    return base + (spacing ? spacing * Math.max(0, String(str).length - 1) : 0);
  }

  /** A small burnished-gold lozenge (diamond) accent centred at (cx, topCentre). */
  diamond(cx, topCentre, r, { fill = GOLD, stroke } = {}) {
    // drawSvgPath maps path (px,py) -> device (x+px, y-py); origin at the diamond centre.
    const d = `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
    this.page.drawSvgPath(d, { x: cx, y: PAGE_H - topCentre, color: fill, borderColor: stroke, borderWidth: stroke ? 0.6 : 0 });
  }

  /* ---- composite elements ---- */

  /** Double-rule rounded panel with parchment fill. */
  panel(x, top, w, h, { fill = PANEL, radius = 5 } = {}) {
    this.page.drawRectangle({
      x, y: this.yBox(top, h), width: w, height: h, color: fill,
      borderColor: LINE, borderWidth: 1
    });
    // inner hairline for the "double rule" feel
    this.page.drawRectangle({
      x: x + 2.4, y: this.yBox(top + 2.4, h - 4.8), width: w - 4.8, height: h - 4.8,
      borderColor: LINE_SOFT, borderWidth: 0.5
    });
  }

  /** Section header: gold-flanked small-caps serif title on an ink rule. Returns y below the rule. */
  sectionHead(x, top, w, title, { align = "left" } = {}) {
    const size = 9.5;
    const opts = { size, font: "serifB", color: INK, spacing: 1.4 };
    const tw = this.widthTracked(title, opts);
    let tx = x + 10;
    if ( align === "center" ) tx = x + (w - tw) / 2;
    this.diamond(tx - 6, top + size / 2 + 0.5, 2.4);
    this.txt(title, tx, top, opts);
    this.diamond(tx + tw + 6, top + size / 2 + 0.5, 2.4);
    const ruleY = top + size + 3.5;
    this.line(x, ruleY, x + w, ruleY, { color: GOLD, width: 1 });
    this.line(x, ruleY + 1.6, x + w, ruleY + 1.6, { color: GOLD_SOFT, width: 0.4 });
    return ruleY + 5;
  }

  /** Tiny uppercase micro-label. */
  micro(str, x, top, { color = LABEL, align = "left", size = 6 } = {}) {
    const opts = { size, font: "bold", color, spacing: 0.6 };
    if ( align === "center" ) this.txtC(str, x, top, opts);
    else if ( align === "right" ) this.txtR(str, x, top, opts);
    else this.txt(str, x, top, opts);
  }

  /* ---- form fields (top-origin) ---- */

  textField(name, x, top, w, h, { size, align = "left", multiline = false, bg = false } = {}) {
    const field = this.form.createTextField(name);
    if ( multiline ) field.enableMultiline();
    if ( align === "center" ) field.setAlignment(TextAlignment.Center);
    if ( align === "right" ) field.setAlignment(TextAlignment.Right);
    field.addToPage(this.page, {
      x, y: this.yBox(top, h), width: w, height: h,
      borderWidth: 0, backgroundColor: bg ? FIELD_BG : undefined
    });
    // setFontSize requires a /DA entry, which only exists once the widget is on a page.
    if ( size != null ) field.setFontSize(size);
    return field;
  }

  checkBox(name, x, top, s = 9) {
    const field = this.form.createCheckBox(name);
    field.addToPage(this.page, {
      x, y: this.yBox(top, s), width: s, height: s,
      borderColor: INK, borderWidth: 0.9, backgroundColor: WHITE
    });
    return field;
  }

  button(name, x, top, w, h) {
    const field = this.form.createButton(name);
    field.addToPage("", this.page, { x, y: this.yBox(top, h), width: w, height: h, borderWidth: 0 });
    return field;
  }

  /**
   * A labelled "well": a micro-label above a lightly-filled underlined field box.
   * `mode` = "line" (bottom rule) or "box" (full box). Returns the field.
   */
  well(name, label, x, top, w, h, { labelAlign = "left", fieldAlign = "left", size, mode = "line", micro = true } = {}) {
    if ( micro && label ) this.micro(label, labelAlign === "center" ? x + w / 2 : x, top, { align: labelAlign });
    const boxTop = top + (micro && label ? 8 : 0);
    const boxH = h - (micro && label ? 8 : 0);
    if ( mode === "box" ) {
      this.rect(x, boxTop, w, boxH, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
    } else {
      this.rect(x, boxTop, w, boxH, { fill: FIELD_BG });
      this.line(x, boxTop + boxH, x + w, boxTop + boxH, { color: LINE, width: 0.8 });
    }
    return this.textField(name, x + 3, boxTop + 1, w - 6, boxH - 2, { size, align: fieldAlign });
  }
}

/* -------------------------------------------- */
/*  Reference data                              */
/* -------------------------------------------- */

const ABILITY_META = [
  { id: "str", label: "STRENGTH" },
  { id: "dex", label: "DEXTERITY" },
  { id: "con", label: "CONSTITUTION" },
  { id: "int", label: "INTELLIGENCE" },
  { id: "wis", label: "WISDOM" },
  { id: "cha", label: "CHARISMA" }
];

// Skills grouped by governing ability, in the conventional printed order.
const SKILL_META = [
  { id: "ath", label: "Athletics", ab: "Str" },
  { id: "acr", label: "Acrobatics", ab: "Dex" },
  { id: "slt", label: "Sleight of Hand", ab: "Dex" },
  { id: "ste", label: "Stealth", ab: "Dex" },
  { id: "arc", label: "Arcana", ab: "Int" },
  { id: "his", label: "History", ab: "Int" },
  { id: "inv", label: "Investigation", ab: "Int" },
  { id: "nat", label: "Nature", ab: "Int" },
  { id: "rel", label: "Religion", ab: "Int" },
  { id: "ani", label: "Animal Handling", ab: "Wis" },
  { id: "ins", label: "Insight", ab: "Wis" },
  { id: "med", label: "Medicine", ab: "Wis" },
  { id: "prc", label: "Perception", ab: "Wis" },
  { id: "sur", label: "Survival", ab: "Wis" },
  { id: "dec", label: "Deception", ab: "Cha" },
  { id: "itm", label: "Intimidation", ab: "Cha" },
  { id: "prf", label: "Performance", ab: "Cha" },
  { id: "per", label: "Persuasion", ab: "Cha" }
];

/* -------------------------------------------- */
/*  Page frame & masthead                       */
/* -------------------------------------------- */

const MARGIN = 20;
const FRAME = 12;

function pageBackdrop(S, { title, subtitle, pageLabel }) {
  S.rect(0, 0, PAGE_W, PAGE_H, { fill: PARCH });
  // Double-rule outer frame
  S.rect(FRAME, FRAME, PAGE_W - 2 * FRAME, PAGE_H - 2 * FRAME, { stroke: INK, lineWidth: 1.3 });
  S.rect(FRAME + 3, FRAME + 3, PAGE_W - 2 * FRAME - 6, PAGE_H - 2 * FRAME - 6, { stroke: GOLD, lineWidth: 0.6 });
  cornerFlourishes(S);
}

function cornerFlourishes(S) {
  const inset = FRAME + 3;
  const L = 16;
  const corners = [
    [inset, inset, 1, 1], [PAGE_W - inset, inset, -1, 1],
    [inset, PAGE_H - inset, 1, -1], [PAGE_W - inset, PAGE_H - inset, -1, -1]
  ];
  for ( const [x, y, sx, sy] of corners ) {
    S.line(x, y, x + L * sx, y, { color: GOLD, width: 1.1 });
    S.line(x, y, x, y + L * sy, { color: GOLD, width: 1.1 });
    S.diamond(x + 5 * sx, y + 5 * sy, 2.2);
  }
}

export async function build() {
  const doc = await PDFDocument.create();
  doc.setTitle("5e Square Character Sheet");
  doc.setSubject("An original, Fan Content compatible Fifth Edition character sheet.");
  doc.setCreator("Simple D&D PDF Character Sheet (Square Sheet generator)");
  doc.setProducer("pdf-lib");

  const fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    obl: await doc.embedFont(StandardFonts.HelveticaOblique),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifB: await doc.embedFont(StandardFonts.TimesRomanBold),
    serifBI: await doc.embedFont(StandardFonts.TimesRomanBoldItalic)
  };

  const page1 = doc.addPage([PAGE_W, PAGE_H]);
  buildPage1(new Sheet(doc, page1, fonts));

  const page2 = doc.addPage([PAGE_W, PAGE_H]);
  buildPage2(new Sheet(doc, page2, fonts));

  ensureFormResources(doc);
  const bytes = await doc.save();
  writeFileSync(OUT, bytes);
  return OUT;
}

/**
 * Give the AcroForm a Default Resources (/DR) font dictionary and a default appearance (/DA).
 * pdf-lib names the field font "/Helvetica" in each field's /DA but does not add a matching /DR
 * entry; without it, strict viewers such as Adobe Acrobat cannot build an editing context and the
 * fields (most visibly blank ones, like appended spell-overflow rows) are not editable.
 */
function ensureFormResources(doc) {
  const form = doc.getForm();
  const helvetica = form.getDefaultFont();
  const fontDict = doc.context.obj({});
  fontDict.set(PDFLib.PDFName.of("Helvetica"), helvetica.ref);
  const dr = doc.context.obj({});
  dr.set(PDFLib.PDFName.of("Font"), fontDict);
  const acro = form.acroForm.dict;
  acro.set(PDFLib.PDFName.of("DR"), dr);
  acro.set(PDFLib.PDFName.of("DA"), PDFLib.PDFString.of("/Helvetica 0 Tf 0 g"));
}

/* -------------------------------------------- */
/*  Page 1 — Adventurer                          */
/* -------------------------------------------- */

/** A stat "stone": panel with a micro-label and one big centred field (fixed size to avoid overflow). */
function stone(S, name, label, x, top, w, h, { size = 18 } = {}) {
  S.panel(x, top, w, h);
  S.micro(label, x + w / 2, top + 4, { align: "center", size: 5.5 });
  return S.textField(name, x + 4, top + 11, w - 8, h - 14, { align: "center", size });
}

function buildPage1(S) {
  pageBackdrop(S, {});

  /* ---- Masthead / identity header ---- */
  const hTop = 24, hH = 120;
  S.panel(22, hTop, 568, hH, { fill: PANEL2 });
  S.txtC("F I F T H   E D I T I O N   ·   C H A R A C T E R   R E C O R D", 296, hTop + 8,
    { size: 7, font: "serifB", color: GOLD, spacing: 0.5 });
  S.line(150, hTop + 20, 442, hTop + 20, { color: GOLD_SOFT, width: 0.5 });

  // Portrait frame (top-right) — the CHARACTER IMAGE push-button lives inside it.
  const pX = 478, pTop = 30, pS = 100;
  S.rect(pX, pTop, pS, pS, { fill: FIELD_BG, stroke: LINE, lineWidth: 1 });
  S.rect(pX + 2.4, pTop + 2.4, pS - 4.8, pS - 4.8, { stroke: LINE_SOFT, lineWidth: 0.5 });
  S.button(PORTRAIT_FIELD, pX + 3, pTop + 3, pS - 6, pS - 6);
  S.micro("PORTRAIT", pX + pS / 2, pTop + pS - 9, { align: "center", size: 5, color: INK_SOFT });
  for ( const [dx, dy] of [[6, 6], [pS - 6, 6], [6, pS - 6], [pS - 6, pS - 6]] ) S.diamond(pX + dx, pTop + dy, 1.8);

  // Name
  S.micro("CHARACTER NAME", 34, hTop + 20);
  S.well(FIELDS.characterName, null, 34, hTop + 28, 430, 22, { fieldAlign: "left", size: 15 });

  // Class / Subclass row
  const r2 = hTop + 60;
  S.well(FIELDS.class, "CLASS & LEVEL", 34, r2, 214, 24);
  S.well(FIELDS.subclass, "SUBCLASS", 254, r2, 210, 24);

  // Species / Background / Level / XP row
  const r3 = hTop + 92;
  S.well(FIELDS.species, "SPECIES", 34, r3, 138, 24);
  S.well(FIELDS.background, "BACKGROUND", 178, r3, 140, 24);
  S.well(FIELDS.level, "LEVEL", 324, r3, 62, 24, { fieldAlign: "center", labelAlign: "center" });
  S.well(FIELDS.xp, "EXP. POINTS", 392, r3, 72, 24, { fieldAlign: "center", labelAlign: "center" });

  /* ---- Column A: Abilities ---- */
  const colTop = 156;
  S.sectionHead(22, colTop, 104, "ABILITIES");
  let aTop = colTop + 20;
  for ( const { id, label } of ABILITY_META ) {
    abilityStone(S, id, label, 22, aTop, 104, 44);
    aTop += 50;
  }

  /* ---- Column B: Saving Throws + Species Traits + Feats ---- */
  const bX = 132, bW = 126;
  S.sectionHead(bX, colTop, bW, "SAVING THROWS");
  let sTop = colTop + 22;
  for ( const { id, label } of ABILITY_META ) {
    S.checkBox(ABILITIES[id].saveProf, bX + 3, sTop + 1, 9);
    S.rect(bX + 16, sTop, 30, 12, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
    S.textField(ABILITIES[id].save, bX + 17, sTop + 0.5, 28, 11, { align: "center" });
    S.txt(titleCase(label), bX + 52, sTop + 2, { size: 8, font: "reg", color: INK });
    sTop += 15;
  }
  // Species Traits + Feats fill the rest of the column. Species usually holds 1-4 short traits while
  // Feats grows past level 1, so split the space evenly instead of giving Species a fat fixed box that
  // starves Feats (the overflow fault this replaced). Both keep an 8pt gap and share the column bottom.
  let btTop = sTop + 8;
  btTop = S.sectionHead(bX, btTop, bW, "SPECIES TRAITS");
  S.rect(bX, btTop, bW, 60, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
  S.textField(FIELDS.speciesTraits, bX + 3, btTop + 2, bW - 6, 56, { multiline: true, size: 8 });
  let feTop = btTop + 68;
  feTop = S.sectionHead(bX, feTop, bW, "FEATS");
  const feH = 466 - feTop;
  S.rect(bX, feTop, bW, feH, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
  S.textField(FIELDS.feats, bX + 3, feTop + 2, bW - 6, feH - 4, { multiline: true, size: 8 });

  /* ---- Column C: Skills ---- */
  const cX = 266, cW = 150;
  S.sectionHead(cX, colTop, cW, "SKILLS");
  let kTop = colTop + 22;
  for ( const { id, label, ab } of SKILL_META ) {
    S.checkBox(SKILLS[id].prof, cX + 3, kTop + 1, 9);
    S.rect(cX + 16, kTop, 28, 12, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
    S.textField(SKILLS[id].field, cX + 17, kTop + 0.5, 26, 11, { align: "center" });
    S.txt(label, cX + 48, kTop + 2, { size: 7.6, font: "reg", color: INK });
    S.micro(ab.toUpperCase(), cX + cW, kTop + 2.6, { align: "right", size: 5.5, color: INK_SOFT });
    kTop += 15;
  }

  /* ---- Column D: Combat & Vitals ---- */
  const dX = 424, dW = 166;
  S.sectionHead(dX, colTop, dW, "COMBAT & VITALS");
  const dTop = colTop + 20;
  // Row 1: AC / Initiative / Speed
  stone(S, FIELDS.ac, "ARMOR CLASS", dX, dTop, 52, 44);
  stone(S, FIELDS.initiative, "INITIATIVE", dX + 57, dTop, 52, 44);
  stone(S, FIELDS.speed, "SPEED", dX + 114, dTop, 52, 44, { size: 12 });
  // Row 2: Proficiency / Passive Perception / Size
  const d2 = dTop + 50;
  stone(S, FIELDS.profBonus, "PROF. BONUS", dX, d2, 52, 44);
  stone(S, FIELDS.passivePerception, "PASSIVE PERC.", dX + 57, d2, 52, 44);
  stone(S, FIELDS.size, "SIZE", dX + 114, d2, 52, 44, { size: 9 });
  // Hit Points
  const hpTop = d2 + 52;
  S.panel(dX, hpTop, dW, 52);
  S.micro("HIT POINTS", dX + dW / 2, hpTop + 4, { align: "center" });
  S.well(FIELDS.hpCurrent, "CURRENT", dX + 6, hpTop + 12, 70, 34, { fieldAlign: "center", labelAlign: "center", size: 16 });
  S.well(FIELDS.hpMax, "MAX", dX + 82, hpTop + 12, 38, 32, { fieldAlign: "center", labelAlign: "center" });
  S.well(FIELDS.hpTemp, "TEMP", dX + 124, hpTop + 12, 38, 32, { fieldAlign: "center", labelAlign: "center" });
  // Hit Dice + Death Saves
  const hdTop = hpTop + 60;
  S.panel(dX, hdTop, 80, 52);
  S.micro("HIT DICE", dX + 40, hdTop + 4, { align: "center" });
  S.well(FIELDS.hdMax, "TOTAL", dX + 6, hdTop + 12, 48, 34, { fieldAlign: "center", labelAlign: "center", size: 9 });
  S.well(FIELDS.hdSpent, "SPENT", dX + 58, hdTop + 12, 16, 34, { fieldAlign: "center", labelAlign: "center", size: 11 });
  const dsX = dX + 86;
  S.panel(dsX, hdTop, 80, 52);
  S.micro("DEATH SAVES", dsX + 40, hdTop + 4, { align: "center" });
  S.micro("SUCCESS", dsX + 4, hdTop + 16, { size: 5, color: INK_SOFT });
  DEATH_SAVES.success.forEach((n, i) => S.checkBox(n, dsX + 40 + i * 12, hdTop + 13, 9));
  S.micro("FAILURE", dsX + 4, hdTop + 34, { size: 5, color: INK_SOFT });
  DEATH_SAVES.failure.forEach((n, i) => S.checkBox(n, dsX + 40 + i * 12, hdTop + 31, 9));
  // Heroic Inspiration chip
  const hiTop = hdTop + 58;
  S.rect(dX, hiTop, dW, 16, { fill: PANEL2, stroke: LINE, lineWidth: 0.7 });
  S.checkBox(FIELDS.heroicInspiration, dX + 6, hiTop + 3.5, 9);
  S.txt("HEROIC INSPIRATION", dX + 22, hiTop + 5, { size: 7.5, font: "bold", color: INK, spacing: 0.4 });

  /* ---- Weapons & Attacks ---- */
  const wTop = 476;
  S.sectionHead(22, wTop, 568, "WEAPONS  &  DAMAGE CANTRIPS");
  const tTop = wTop + 20;
  const cols = [
    { key: "name", label: "NAME", x: 26, w: 250 },
    { key: "atk", label: "ATK BONUS", x: 280, w: 70 },
    { key: "dmg", label: "DAMAGE & TYPE", x: 352, w: 120 },
    { key: "notes", label: "NOTES", x: 474, w: 112 }
  ];
  S.rect(22, tTop, 568, 14, { fill: PANEL2, stroke: LINE, lineWidth: 0.6 });
  for ( const c of cols ) S.micro(c.label, c.x, tTop + 4.5);
  let rowTop = tTop + 14;
  WEAPON_ROWS.forEach((row, i) => {
    if ( i % 2 ) S.rect(22, rowTop, 568, 15, { fill: rgb(0.958, 0.94, 0.9) });
    for ( const c of cols ) S.textField(row[c.key], c.x, rowTop + 1.5, c.w, 12, { size: 8 });
    S.line(22, rowTop + 15, 590, rowTop + 15, { color: LINE_SOFT, width: 0.4 });
    rowTop += 15;
  });
  S.rect(22, tTop, 568, rowTop - tTop, { stroke: LINE, lineWidth: 0.9 });
  for ( const c of cols.slice(1) ) S.line(c.x - 4, tTop, c.x - 4, rowTop, { color: LINE_SOFT, width: 0.5 });

  /* ---- Class Features (2 columns) ---- */
  const fTop = rowTop + 10;
  S.sectionHead(22, fTop, 356, "CLASS FEATURES");
  const fBoxTop = fTop + 20, fBoxH = 772 - fBoxTop;
  S.rect(22, fBoxTop, 356, fBoxH, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
  S.line(200, fBoxTop, 200, fBoxTop + fBoxH, { color: LINE_SOFT, width: 0.5 });
  S.textField(FIELDS.classFeatures[0], 26, fBoxTop + 2, 170, fBoxH - 4, { multiline: true, size: 8 });
  S.textField(FIELDS.classFeatures[1], 204, fBoxTop + 2, 170, fBoxH - 4, { multiline: true, size: 8 });

  /* ---- Equipment Training & Proficiencies ---- */
  const eX = 388, eW = 202;
  S.sectionHead(eX, fTop, eW, "TRAINING & PROFICIENCY");
  let eTop = fTop + 20;
  // Armour training checkboxes (2 x 2)
  const arm = [["light", "LIGHT"], ["medium", "MEDIUM"], ["heavy", "HEAVY"], ["shield", "SHIELDS"]];
  S.micro("ARMOR TRAINING", eX, eTop);
  arm.forEach(([key, lab], i) => {
    const ax = eX + (i % 2) * 100, ay = eTop + 9 + Math.floor(i / 2) * 15;
    S.checkBox(ARMOR_TRAINING[key], ax, ay, 9);
    S.txt(lab, ax + 13, ay + 1.5, { size: 7.5, font: "reg", color: INK });
  });
  eTop += 42;
  // Weapon proficiencies
  S.micro("WEAPONS", eX, eTop);
  S.rect(eX, eTop + 8, eW, 52, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
  S.textField(FIELDS.weaponProficiencies, eX + 3, eTop + 10, eW - 6, 48, { multiline: true, size: 8 });
  eTop += 66;
  // Tool proficiencies (native multiline — SquareSheet2024Filler skips the base resize)
  S.micro("TOOLS", eX, eTop);
  const toolH = 772 - (eTop + 8);
  S.rect(eX, eTop + 8, eW, toolH, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
  S.textField(FIELDS.toolProficiencies, eX + 3, eTop + 10, eW - 6, toolH - 4, { multiline: true, size: 8 });

  footer(S, "Page 1 of 2  ·  Adventurer");
}

/** One of the six ability "stones": name, big modifier, and a score pill. */
function abilityStone(S, id, label, x, top, w, h) {
  S.panel(x, top, w, h);
  S.micro(label, x + w / 2, top + 3.5, { align: "center", size: 5.5 });
  const pillW = 34, pillH = 13, pillX = x + (w - pillW) / 2, pillTop = top + h - pillH - 3;
  S.textField(ABILITIES[id].mod, x + 8, top + 10, w - 16, pillTop - (top + 12), { align: "center", size: 16 });
  S.rect(pillX, pillTop, pillW, pillH, { fill: PANEL2, stroke: LINE, lineWidth: 0.7 });
  S.textField(ABILITIES[id].score, pillX + 2, pillTop + 1, pillW - 4, pillH - 2, { align: "center", size: 9 });
}

/* -------------------------------------------- */
/*  Page 2 — Chronicle & Spells                  */
/* -------------------------------------------- */

function buildPage2(S) {
  pageBackdrop(S, {});

  /* ---- Spellcasting header ---- */
  const hTop = 24, hH = 56;
  S.panel(22, hTop, 568, hH, { fill: PANEL2 });
  S.txtC("F I F T H   E D I T I O N   ·   S P E L L S   &   C H R O N I C L E", 306, hTop + 7,
    { size: 7, font: "serifB", color: GOLD, spacing: 0.5 });
  const hy = hTop + 20;
  S.well(FIELDS.spellcastingAbility, "SPELLCASTING ABILITY", 30, hy, 168, 26, { labelAlign: "center", fieldAlign: "center" });
  S.well(FIELDS.spellcastingModifier, "MODIFIER", 208, hy, 92, 26, { labelAlign: "center", fieldAlign: "center", size: 12 });
  S.well(FIELDS.spellSaveDC, "SPELL SAVE DC", 306, hy, 92, 26, { labelAlign: "center", fieldAlign: "center", size: 12 });
  S.well(FIELDS.spellAttackBonus, "SPELL ATTACK", 406, hy, 174, 26, { labelAlign: "center", fieldAlign: "center", size: 12 });

  /* ---- Left column: spell slots + 30-row table ---- */
  const lX = 22, lW = 360;
  let y = S.sectionHead(lX, 92, lW, "SPELL SLOTS");
  const slotW = 38, slotGap = 2;
  for ( let lvl = 1; lvl <= 9; lvl++ ) {
    const sx = lX + (lvl - 1) * (slotW + slotGap);
    S.rect(sx, y, slotW, 26, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
    S.micro(String(lvl), sx + slotW / 2, y + 2, { align: "center", size: 6, color: GOLD });
    S.textField(SPELL_SLOT_TOTALS[lvl], sx + 2, y + 9, slotW - 4, 15, { align: "center", size: 11 });
  }
  y += 34;

  const tableTop = S.sectionHead(lX, y, lW, "CANTRIPS  &  PREPARED SPELLS");
  const scols = [
    { key: "level", label: "LV", x: lX + 2, w: 18, center: true },
    { key: "name", label: "SPELL NAME", x: lX + 24, w: 148 },
    { key: "castingTime", label: "TIME", x: lX + 176, w: 44 },
    { key: "range", label: "RANGE", x: lX + 224, w: 42 }
  ];
  const crmX = { concentration: lX + 272, ritual: lX + 288, material: lX + 304 };
  const notesX = lX + 322, notesW = lX + lW - notesX;
  // Header strip
  S.rect(lX, tableTop, lW, 15, { fill: PANEL2, stroke: LINE, lineWidth: 0.6 });
  for ( const c of scols ) S.micro(c.label, c.center ? c.x + c.w / 2 : c.x, tableTop + 5, { align: c.center ? "center" : "left" });
  S.micro("C", crmX.concentration + 4.5, tableTop + 5, { align: "center", size: 5.5, color: INK_SOFT });
  S.micro("R", crmX.ritual + 4.5, tableTop + 5, { align: "center", size: 5.5, color: INK_SOFT });
  S.micro("M", crmX.material + 4.5, tableTop + 5, { align: "center", size: 5.5, color: INK_SOFT });
  S.micro("NOTES", notesX, tableTop + 5);

  let rTop = tableTop + 15;
  const rowH = 19;
  SPELL_ROWS.forEach((row, i) => {
    if ( i % 2 ) S.rect(lX, rTop, lW, rowH, { fill: rgb(0.958, 0.94, 0.9) });
    for ( const c of scols ) S.textField(row[c.key], c.x, rTop + 3, c.w, 13, { size: 8, align: c.center ? "center" : "left" });
    S.checkBox(row.concentration, crmX.concentration, rTop + 4.5, 9);
    S.checkBox(row.ritual, crmX.ritual, rTop + 4.5, 9);
    S.checkBox(row.material, crmX.material, rTop + 4.5, 9);
    S.textField(row.notes, notesX, rTop + 3, notesW, 13, { size: 7 });
    S.line(lX, rTop + rowH, lX + lW, rTop + rowH, { color: LINE_SOFT, width: 0.35 });
    rTop += rowH;
  });
  S.rect(lX, tableTop, lW, rTop - tableTop, { stroke: LINE, lineWidth: 0.9 });
  S.line(scols[1].x - 4, tableTop, scols[1].x - 4, rTop, { color: LINE_SOFT, width: 0.5 });
  S.line(crmX.concentration - 4, tableTop, crmX.concentration - 4, rTop, { color: LINE_SOFT, width: 0.5 });
  S.line(notesX - 4, tableTop, notesX - 4, rTop, { color: LINE_SOFT, width: 0.5 });

  /* ---- Right column: chronicle ---- */
  const rX = 392, rW = 198;
  let ry = S.sectionHead(rX, 92, rW, "CHRONICLE");
  ry = titledField(S, FIELDS.alignment, "ALIGNMENT", rX, ry + 2, rW, 16, { multiline: false });
  ry = titledField(S, FIELDS.appearance, "APPEARANCE & DETAILS", rX, ry + 8, rW, 96);
  ry = titledField(S, FIELDS.languages, "LANGUAGES", rX, ry + 8, rW, 48);
  ry = titledField(S, FIELDS.equipment, "EQUIPMENT", rX, ry + 8, rW, 118);

  // Attunement
  ry = S.sectionHead(rX, ry + 8, rW, "ATTUNED MAGIC ITEMS");
  FIELDS.attunement.forEach((f, i) => {
    const ay = ry + i * 17;
    S.diamond(rX + 4, ay + 7, 2, { fill: GOLD_SOFT });
    S.rect(rX + 12, ay, rW - 12, 13, { fill: FIELD_BG });
    S.line(rX + 12, ay + 13, rX + rW, ay + 13, { color: LINE_SOFT, width: 0.6 });
    S.textField(f, rX + 15, ay + 1, rW - 18, 11, { size: 8 });
  });
  ry += FIELDS.attunement.length * 17 + 6;

  // Currency
  ry = S.sectionHead(rX, ry, rW, "COINAGE");
  const coins = [["cp", "CP"], ["sp", "SP"], ["ep", "EP"], ["gp", "GP"], ["pp", "PP"]];
  const coinW = (rW - 8) / 5;
  coins.forEach(([key, lab], i) => {
    const cx = rX + i * (coinW + 2);
    S.rect(cx, ry, coinW, 28, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
    S.micro(lab, cx + coinW / 2, ry + 2, { align: "center", size: 6, color: GOLD });
    S.textField(FIELDS[key], cx + 2, ry + 10, coinW - 4, 15, { align: "center", size: 10 });
  });
  ry += 36;

  // Backstory fills the remainder (the section header itself consumes ~18pt)
  titledField(S, FIELDS.backstory, "BACKSTORY & ALLIES", rX, ry, rW, 772 - 18 - ry);

  footer(S, "Page 2 of 2  ·  Chronicle & Spells");
}

/** Section header + a bordered (optionally multiline) text field. Returns bottom y. */
function titledField(S, name, title, x, top, w, boxH, { multiline = true, size = 8 } = {}) {
  const bt = S.sectionHead(x, top, w, title);
  S.rect(x, bt, w, boxH, { fill: FIELD_BG, stroke: LINE_SOFT, lineWidth: 0.6 });
  S.textField(name, x + 3, bt + 2, w - 6, boxH - 4, { multiline, size });
  return bt + boxH;
}

/* -------------------------------------------- */
/*  Shared bits                                  */
/* -------------------------------------------- */

function footer(S, label) {
  S.txtC(label, 306, 778, { size: 6, font: "serifBI", color: INK_SOFT, spacing: 0.3 });
}

function titleCase(upper) {
  return upper.charAt(0) + upper.slice(1).toLowerCase();
}

// Executed when run directly.
if ( process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ) {
  build().then(out => console.log("Wrote", out)).catch(err => { console.error(err); process.exit(1); });
}
