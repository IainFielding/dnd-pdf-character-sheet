/**
 * Build script for templates/DnD_Fantasy_2024_Character-Sheet.pdf
 *
 * Generates an original, form-fillable "5th Edition" character sheet in a monochrome, hand-drawn
 * "Inked Tome" style: sepia ink on aged parchment, sketchy double-stroked boxes, a heater-shield
 * Armor Class, dice-hexagon ability scores, wax-seal stats, ribbon-banner section headers and a
 * faint d20 watermark in the masthead. The layout and artwork are entirely our own so the sheet can
 * be distributed as Fan Content. Like the Fan Sheet it reuses the field names expected by
 * scripts/field-map-2024.mjs (so Sheet2024Filler / FanSheet2024Filler fill it unchanged) and adds a
 * "CHARACTER IMAGE" portrait button.
 *
 * All randomness is seeded, so the output is byte-for-byte reproducible. Run from the repo root:
 *   node tools/build-fantasy-sheet-2024.mjs
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
const { PDFDocument, StandardFonts, rgb, TextAlignment } = PDFLib;

const HERE = path.dirname(fileURLToPath(import.meta.url));
// WHITE_BG=1 renders the identical sheet on a clean white page instead of aged parchment.
const WHITE = process.env.WHITE_BG === "1" || process.env.WHITE_BG === "true";
// Writes the real template by default (a "-White" variant in white mode); set OUT_PDF to override.
const OUT = process.env.OUT_PDF
  ? path.resolve(process.env.OUT_PDF)
  : path.resolve(HERE, `../templates/DnD_Fantasy_2024_Character-Sheet${WHITE ? "-White" : ""}.pdf`);

/** Push-button field that receives the actor portrait (not part of the 2024 field map). */
export const PORTRAIT_FIELD = "CHARACTER IMAGE";

/* -------------------------------------------- */
/*  Monochrome design system                     */
/* -------------------------------------------- */

const INK      = rgb(0.14, 0.12, 0.10);   // dark sepia-black — the single ink
// White mode swaps the parchment tones for white / light greys; everything else is unchanged.
const PARCH     = WHITE ? rgb(1, 1, 1)         : rgb(0.925, 0.892, 0.820); // page
const PARCH_HI  = WHITE ? rgb(0.975, 0.975, 0.975) : rgb(0.955, 0.930, 0.870); // lighter wells
const PARCH_LO  = WHITE ? rgb(0.905, 0.905, 0.905) : rgb(0.890, 0.850, 0.762); // banner / panel fills
const FIELD_BG  = null; // field wells are transparent so the parchment (and its grain) shows through

const PAGE_W = 612;
const PAGE_H = 792;

/** Deterministic PRNG (mulberry32) so every build is identical. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------- */
/*  Sheet helper (top-left coordinate system)   */
/* -------------------------------------------- */

class Sheet {
  constructor(doc, page, fonts, rng) {
    this.doc = doc;
    this.page = page;
    this.form = doc.getForm();
    this.f = fonts;
    this.rng = rng;
  }

  jit(amp) { return (this.rng() * 2 - 1) * amp; }
  yBox(top, h) { return PAGE_H - top - h; }

  /* ---- primitives (top-origin) ---- */

  rect(x, top, w, h, { fill, stroke, lineWidth = 1, opacity } = {}) {
    if ( !fill && !stroke ) return; // transparent well — let the parchment show through
    this.page.drawRectangle({
      x, y: this.yBox(top, h), width: w, height: h,
      color: fill ?? undefined, borderColor: stroke, borderWidth: stroke ? lineWidth : 0, opacity,
      borderOpacity: opacity
    });
  }

  line(x1, top1, x2, top2, { color = INK, width = 1, opacity = 1 } = {}) {
    this.page.drawLine({
      start: { x: x1, y: PAGE_H - top1 }, end: { x: x2, y: PAGE_H - top2 },
      thickness: width, color, opacity
    });
  }

  txt(str, x, top, { size = 8, font = "reg", color = INK, spacing = 0, opacity = 1 } = {}) {
    const f = this.f[font];
    if ( spacing ) {
      let cx = x;
      for ( const ch of String(str) ) {
        this.page.drawText(ch, { x: cx, y: PAGE_H - top - size, size, font: f, color, opacity });
        cx += f.widthOfTextAtSize(ch, size) + spacing;
      }
      return;
    }
    this.page.drawText(String(str), { x, y: PAGE_H - top - size, size, font: f, color, opacity });
  }

  width(str, size, font = "reg") { return this.f[font].widthOfTextAtSize(String(str), size); }
  widthTracked(str, { size = 8, font = "reg", spacing = 0 } = {}) {
    const base = this.f[font].widthOfTextAtSize(String(str), size);
    return base + (spacing ? spacing * Math.max(0, String(str).length - 1) : 0);
  }
  txtC(str, cx, top, opts = {}) { this.txt(str, cx - this.widthTracked(str, opts) / 2, top, opts); }
  txtR(str, rx, top, opts = {}) { this.txt(str, rx - this.widthTracked(str, opts), top, opts); }

  micro(str, x, top, { color = INK, align = "left", size = 6, opacity = 0.85 } = {}) {
    const opts = { size, font: "bold", color, spacing: 0.7, opacity };
    if ( align === "center" ) this.txtC(str, x, top, opts);
    else if ( align === "right" ) this.txtR(str, x, top, opts);
    else this.txt(str, x, top, opts);
  }

  /* ---- hand-drawn strokes ---- */

  /** A single jittered stroke between two points (subdivided, deviated along the normal). */
  roughSeg(x1, t1, x2, t2, { width = 1, rough = 1.1, opacity = 1 } = {}) {
    const dx = x2 - x1, dt = t2 - t1;
    const len = Math.hypot(dx, dt) || 1;
    const n = Math.max(2, Math.round(len / 15));
    const nx = -dt / len, nt = dx / len;
    let px = x1, pt = t1;
    for ( let i = 1; i <= n; i++ ) {
      const f = i / n;
      const bow = Math.sin(f * Math.PI) * this.jit(rough * 0.6);
      const off = this.jit(rough) * 0.5 + bow;
      const cx = i === n ? x2 : x1 + dx * f + nx * off;
      const ct = i === n ? t2 : t1 + dt * f + nt * off;
      this.line(px, pt, cx, ct, { width, opacity });
      px = cx; pt = ct;
    }
  }

  /** A sketchy rectangle: two offset passes of jittered edges. */
  roughRect(x, top, w, h, { width = 1, rough = 1.0, passes = 2, opacity = 1 } = {}) {
    for ( let p = 0; p < passes; p++ ) {
      const a = () => this.jit(rough);
      this.roughSeg(x + a(), top + a(), x + w + a(), top + a(), { width, rough, opacity });
      this.roughSeg(x + w + a(), top + a(), x + w + a(), top + h + a(), { width, rough, opacity });
      this.roughSeg(x + w + a(), top + h + a(), x + a(), top + h + a(), { width, rough, opacity });
      this.roughSeg(x + a(), top + h + a(), x + a(), top + a(), { width, rough, opacity });
    }
  }

  /** A sketchy circle: jittered polygon, two passes. */
  roughCircle(cx, ct, r, { width = 1, rough = 0.8, passes = 2, opacity = 1 } = {}) {
    for ( let p = 0; p < passes; p++ ) {
      const start = this.rng() * Math.PI * 2;
      const n = 22;
      let prev = null;
      for ( let i = 0; i <= n; i++ ) {
        const ang = start + (i / n) * Math.PI * 2;
        const rr = r + this.jit(rough);
        const x = cx + Math.cos(ang) * rr, t = ct + Math.sin(ang) * rr;
        if ( prev ) this.line(prev[0], prev[1], x, t, { width, opacity });
        prev = [x, t];
      }
    }
  }

  /** Fill a rectangle with faint 45° hatching (clipped to the box). Adds inky depth. */
  hatch(x, top, w, h, { gap = 4, opacity = 0.1, width = 0.4 } = {}) {
    for ( let c = -h; c < w; c += gap ) {
      const x1 = Math.max(x, x + c), x2 = Math.min(x + w, x + c + h);
      if ( x2 <= x1 ) continue;
      const y1 = top + h - (x1 - x - c), y2 = top + h - (x2 - x - c);
      this.line(x1 + this.jit(0.3), y1, x2 + this.jit(0.3), y2, { width, opacity });
    }
  }

  /** Draw an SVG path expressed in top-left local coords, placed at absolute (x, top). */
  svgShape(pathLocal, x, top, { fill, stroke, width = 1, opacity = 1 } = {}) {
    this.page.drawSvgPath(pathLocal, {
      x, y: PAGE_H - top, color: fill, borderColor: stroke,
      borderWidth: stroke ? width : 0, opacity, borderOpacity: opacity
    });
  }

  /** Faint d20 (icosahedron) line-art watermark centred at (cx, topCentre). */
  d20(cx, topC, r, { opacity = 0.1, width = 0.7 } = {}) {
    const pts = {
      T: [0, -r], UR: [0.866 * r, -0.5 * r], LR: [0.866 * r, 0.5 * r],
      B: [0, r], LL: [-0.866 * r, 0.5 * r], UL: [-0.866 * r, -0.5 * r]
    };
    const P = ([px, py]) => [cx + px, topC + py];
    const seg = (a, b) => { const A = P(a), B = P(b); this.line(A[0], A[1], B[0], B[1], { width, opacity }); };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // outer hexagon
    const hex = [pts.T, pts.UR, pts.LR, pts.B, pts.LL, pts.UL];
    for ( let i = 0; i < hex.length; i++ ) seg(hex[i], hex[(i + 1) % hex.length]);
    // big upward face triangle + inner (top) face + spokes to the other vertices
    seg(pts.T, pts.LL); seg(pts.LL, pts.LR); seg(pts.LR, pts.T);
    const e1 = mid(pts.T, pts.LL), e2 = mid(pts.LL, pts.LR), e3 = mid(pts.LR, pts.T);
    seg(e1, e2); seg(e2, e3); seg(e3, e1);
    seg(pts.UL, e1); seg(pts.B, e2); seg(pts.UR, e3);
  }

  /* ---- form fields ---- */

  textField(name, x, top, w, h, { size, align = "left", multiline = false } = {}) {
    const field = this.form.createTextField(name);
    if ( multiline ) field.enableMultiline();
    if ( align === "center" ) field.setAlignment(TextAlignment.Center);
    if ( align === "right" ) field.setAlignment(TextAlignment.Right);
    // Explicitly undefined colours keep the widget transparent — pdf-lib otherwise defaults the
    // widget background to white, which would hide the parchment and hand-drawn box.
    field.addToPage(this.page, {
      x, y: this.yBox(top, h), width: w, height: h,
      borderWidth: 0, borderColor: undefined, backgroundColor: undefined
    });
    if ( size != null ) field.setFontSize(size);
    return field;
  }

  checkBox(name, x, top, s = 10) {
    // A hand-inked ring behind a transparent checkbox; the tick shows when checked.
    this.roughCircle(x + s / 2, top + s / 2, s / 2, { width: 0.8, rough: 0.5 });
    const field = this.form.createCheckBox(name);
    field.addToPage(this.page, {
      x: x + 1, y: this.yBox(top + 1, s - 2), width: s - 2, height: s - 2,
      borderWidth: 0, borderColor: undefined, backgroundColor: undefined
    });
    return field;
  }

  button(name, x, top, w, h) {
    const field = this.form.createButton(name);
    field.addToPage("", this.page, {
      x, y: this.yBox(top, h), width: w, height: h,
      borderWidth: 0, borderColor: undefined, backgroundColor: undefined
    });
    return field;
  }

  /* ---- composite fantasy elements ---- */

  /** Ribbon-banner section header with a title and flanking diamonds. Returns y below it. */
  banner(x, top, w, title, { h = 17 } = {}) {
    const notch = 8;
    const p = `M 0 ${h / 2} L ${notch} 0 L ${w - notch} 0 L ${w} ${h / 2} L ${w - notch} ${h} L ${notch} ${h} Z`;
    this.svgShape(p, x, top, { fill: PARCH_LO });
    this.hatch(x + notch, top + 1, w - 2 * notch, h - 2, { gap: 3, opacity: 0.08 });
    this.svgShape(p, x + this.jit(0.4), top + this.jit(0.4), { stroke: INK, width: 1.1 });
    this.svgShape(p, x + this.jit(0.5), top + this.jit(0.5), { stroke: INK, width: 0.5, opacity: 0.7 });
    const size = 9.5;
    this.txtC(title, x + w / 2, top + (h - size) / 2 + 0.5, { size, font: "serifB", color: INK, spacing: 1.3 });
    return top + h + 5;
  }

  /** A hand-drawn labelled well: micro-label above a sketchy field box. Returns the field. */
  well(name, label, x, top, w, h, { labelAlign = "left", fieldAlign = "left", size, multiline = false } = {}) {
    if ( label ) this.micro(label, labelAlign === "center" ? x + w / 2 : x, top, { align: labelAlign });
    const boxTop = top + (label ? 8 : 0);
    const boxH = h - (label ? 8 : 0);
    this.rect(x, boxTop, w, boxH, { fill: FIELD_BG });
    this.roughRect(x, boxTop, w, boxH, { width: 0.8, rough: 0.9 });
    return this.textField(name, x + 3, boxTop + 1, w - 6, boxH - 2, { size, align: fieldAlign, multiline });
  }
}

/* -------------------------------------------- */
/*  Reference data                              */
/* -------------------------------------------- */

const ABILITY_META = [
  { id: "str", label: "STR", full: "STRENGTH" },
  { id: "dex", label: "DEX", full: "DEXTERITY" },
  { id: "con", label: "CON", full: "CONSTITUTION" },
  { id: "int", label: "INT", full: "INTELLIGENCE" },
  { id: "wis", label: "WIS", full: "WISDOM" },
  { id: "cha", label: "CHA", full: "CHARISMA" }
];

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
/*  Page backdrop & ornaments                    */
/* -------------------------------------------- */

const FRAME = 13;

function pageBackdrop(S) {
  S.rect(0, 0, PAGE_W, PAGE_H, { fill: PARCH });
  parchmentGrain(S);
  // Double sketchy frame
  S.roughRect(FRAME, FRAME, PAGE_W - 2 * FRAME, PAGE_H - 2 * FRAME, { width: 1.4, rough: 1.3, passes: 2 });
  S.roughRect(FRAME + 4, FRAME + 4, PAGE_W - 2 * FRAME - 8, PAGE_H - 2 * FRAME - 8, { width: 0.6, rough: 0.8, passes: 1 });
  cornerFiligree(S);
}

/** A sprinkle of faint ink flecks to age the parchment. Skipped on a clean white page. */
function parchmentGrain(S) {
  if ( WHITE ) return;
  for ( let i = 0; i < 340; i++ ) {
    const x = 8 + S.rng() * (PAGE_W - 16), y = 8 + S.rng() * (PAGE_H - 16);
    const r = 0.15 + S.rng() * 0.5;
    S.page.drawCircle({ x, y: PAGE_H - y, size: r, color: INK, opacity: 0.05 + S.rng() * 0.06 });
  }
}

/** Scrollwork flourishes at each inner corner. */
function cornerFiligree(S) {
  const inset = FRAME + 4;
  const corners = [[inset, inset, 1, 1], [PAGE_W - inset, inset, -1, 1], [inset, PAGE_H - inset, 1, -1], [PAGE_W - inset, PAGE_H - inset, -1, -1]];
  for ( const [x, y, sx, sy] of corners ) {
    // little curl
    const p = `M 0 0 C ${18 * sx} ${2 * sy} ${20 * sx} ${18 * sy} ${8 * sx} ${20 * sy} C ${14 * sx} ${16 * sy} ${12 * sx} ${6 * sy} 0 ${8 * sy} Z`;
    S.svgShape(p, x, y, { stroke: INK, width: 0.8, opacity: 0.7 });
    S.diamond(x + 5 * sx, y + 5 * sy, 2);
  }
}

// Small filled diamond accent (symmetric, so orientation is irrelevant).
Sheet.prototype.diamond = function (cx, topC, r, { opacity = 1 } = {}) {
  const d = `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
  this.page.drawSvgPath(d, { x: cx, y: PAGE_H - topC, color: INK, opacity });
};

/* -------------------------------------------- */
/*  Build                                       */
/* -------------------------------------------- */

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

export async function build() {
  const doc = await PDFDocument.create();
  doc.setTitle("5e Fantasy Character Sheet");
  doc.setSubject("An original, Fan Content compatible Fifth Edition character sheet (Inked Tome).");
  doc.setCreator("Simple D&D PDF Character Sheet (Fantasy Sheet generator)");
  doc.setProducer("pdf-lib");

  const fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifB: await doc.embedFont(StandardFonts.TimesRomanBold),
    serifI: await doc.embedFont(StandardFonts.TimesRomanItalic),
    serifBI: await doc.embedFont(StandardFonts.TimesRomanBoldItalic)
  };

  const p1 = doc.addPage([PAGE_W, PAGE_H]);
  buildPage1(new Sheet(doc, p1, fonts, mulberry32(0x5EED01)));
  const p2 = doc.addPage([PAGE_W, PAGE_H]);
  buildPage2(new Sheet(doc, p2, fonts, mulberry32(0x5EED02)));

  ensureFormResources(doc);
  const bytes = await doc.save();
  writeFileSync(OUT, bytes);
  return OUT;
}

/* -------------------------------------------- */
/*  Shaped stats                                */
/* -------------------------------------------- */

function shieldPath(w, h) {
  return `M 0 0 L ${w} 0 L ${w} ${h * 0.52} Q ${w} ${h * 0.9} ${w / 2} ${h} Q 0 ${h * 0.9} 0 ${h * 0.52} Z`;
}
function hexPath(w, h) {
  return `M ${w * 0.25} 0 L ${w * 0.75} 0 L ${w} ${h / 2} L ${w * 0.75} ${h} L ${w * 0.25} ${h} L 0 ${h / 2} Z`;
}

/** Draw a filled shape with a sketchy double outline. */
function inkedShape(S, pathFn, x, top, w, h, { fill = PARCH_HI } = {}) {
  const p = pathFn(w, h);
  S.svgShape(p, x, top, { fill });
  S.hatch(x + 2, top + 2, w - 4, h - 4, { gap: 3.5, opacity: 0.06 });
  S.svgShape(p, x + S.jit(0.4), top + S.jit(0.4), { stroke: INK, width: 1.2 });
  S.svgShape(p, x + S.jit(0.5), top + S.jit(0.5), { stroke: INK, width: 0.5, opacity: 0.65 });
}

/** Ability score as a dice-hexagon: abbreviation, big modifier, and a small score gem. */
function abilityHex(S, id, meta, x, top, w, h) {
  inkedShape(S, hexPath, x, top, w, h);
  S.micro(meta.label, x + w / 2, top + 5, { align: "center", size: 6.5 });
  S.textField(ABILITIES[id].mod, x + w / 2 - 22, top + 12, 44, 18, { align: "center", size: 16 });
  // score gem (small rough box) at the bottom
  const gw = 30, gh = 13, gx = x + (w - gw) / 2, gt = top + h - gh - 2;
  S.rect(gx, gt, gw, gh, { fill: FIELD_BG });
  S.roughRect(gx, gt, gw, gh, { width: 0.7, rough: 0.5 });
  S.textField(ABILITIES[id].score, gx + 2, gt + 1, gw - 4, gh - 2, { align: "center", size: 9 });
}

/** A single-number stat rendered as a wax seal (ring), label above, value centred. */
function sealStat(S, name, label, cx, ct, r, { size = 13 } = {}) {
  S.roughCircle(cx, ct, r, { width: 1.1, rough: 0.7 });
  S.roughCircle(cx, ct, r - 3, { width: 0.5, rough: 0.4, opacity: 0.55 });
  S.micro(label, cx, ct - r - 7.5, { align: "center", size: 5.5 });
  S.textField(name, cx - r + 3, ct - 8, 2 * r - 6, 16, { align: "center", size });
}

/* -------------------------------------------- */
/*  Page 1 — Adventurer                          */
/* -------------------------------------------- */

function buildPage1(S) {
  pageBackdrop(S);

  /* ---- Masthead (d20 watermark) + identity ---- */
  S.d20(306, 42, 30, { opacity: 0.09, width: 0.8 });
  S.d20(306, 42, 20, { opacity: 0.07, width: 0.5 });
  S.diamond(196, 34, 2.5); S.diamond(416, 34, 2.5);
  S.txtC("T H E   C H A R A C T E R", 306, 27, { size: 12, font: "serifB", color: INK, spacing: 2 });
  S.txtC("~ an inked chronicle ~", 306, 44, { size: 7.5, font: "serifI", color: INK, opacity: 0.7, spacing: 0.5 });
  S.roughSeg(210, 58, 402, 58, { width: 0.8, rough: 0.7 });

  // Portrait — ornate sketchy frame, top-right
  const pX = 480, pTop = 30, pS = 104;
  S.rect(pX, pTop, pS, pS, { fill: FIELD_BG });
  S.hatch(pX, pTop, pS, pS, { gap: 5, opacity: 0.05 });
  S.button(PORTRAIT_FIELD, pX + 3, pTop + 3, pS - 6, pS - 6);
  S.roughRect(pX, pTop, pS, pS, { width: 1.2, rough: 1.0 });
  S.roughRect(pX + 3, pTop + 3, pS - 6, pS - 6, { width: 0.5, rough: 0.6, opacity: 0.6 });
  for ( const [dx, dy] of [[0, 0], [pS, 0], [0, pS], [pS, pS]] ) S.diamond(pX + dx, pTop + dy, 2.6);
  S.micro("PORTRAIT", pX + pS / 2, pTop + pS + 3, { align: "center", size: 5, opacity: 0.7 });

  // Identity wells (left of portrait)
  S.well(FIELDS.characterName, "CHARACTER NAME", 34, 66, 430, 24, { size: 15 });
  S.well(FIELDS.class, "CLASS & LEVEL", 34, 100, 214, 24);
  S.well(FIELDS.subclass, "SUBCLASS", 254, 100, 210, 24);
  S.well(FIELDS.species, "SPECIES", 34, 130, 130, 24);
  S.well(FIELDS.background, "BACKGROUND", 172, 130, 138, 24);
  S.well(FIELDS.level, "LEVEL", 318, 130, 62, 24, { labelAlign: "center", fieldAlign: "center" });
  S.well(FIELDS.xp, "EXP.", 388, 130, 76, 24, { labelAlign: "center", fieldAlign: "center" });

  const colTop = 166;

  /* ---- Column A: Abilities (hexagons) ---- */
  S.banner(22, colTop, 104, "ABILITIES");
  let aTop = colTop + 22;
  for ( const meta of ABILITY_META ) { abilityHex(S, meta.id, meta, 22, aTop, 104, 44); aTop += 48; }

  /* ---- Column B: Saving Throws + Species + Feats ---- */
  const bX = 132, bW = 126;
  S.banner(bX, colTop, bW, "SAVING THROWS");
  let sTop = colTop + 24;
  for ( const meta of ABILITY_META ) {
    S.checkBox(ABILITIES[meta.id].saveProf, bX + 2, sTop, 11);
    S.rect(bX + 18, sTop, 28, 12, { fill: FIELD_BG });
    S.roughRect(bX + 18, sTop, 28, 12, { width: 0.6, rough: 0.5 });
    S.textField(ABILITIES[meta.id].save, bX + 19, sTop + 0.5, 26, 11, { align: "center" });
    S.txt(titleCase(meta.full), bX + 52, sTop + 2.5, { size: 8, font: "serif", color: INK });
    sTop += 15.5;
  }
  // Species Traits usually holds 1-4 short traits; Feats grows past level 1 (a character can hold
  // several ASI/general feats plus fighting styles). Give the two boxes an even split of the sidebar
  // rather than a fat fixed Species box, so mid-level characters' feats don't overflow (see the
  // starved-Feats fault this replaced). Both boxes keep an 8pt gap and share the same column bottom.
  let btTop = S.banner(bX, sTop + 6, bW, "SPECIES TRAITS");
  fantasyBox(S, FIELDS.speciesTraits, bX, btTop, bW, 56);
  let feTop = S.banner(bX, btTop + 64, bW, "FEATS");
  fantasyBox(S, FIELDS.feats, bX, feTop, bW, 474 - feTop);

  /* ---- Column C: Skills ---- */
  const cX = 266, cW = 150;
  S.banner(cX, colTop, cW, "SKILLS");
  let kTop = colTop + 24;
  for ( const { id, label, ab } of SKILL_META ) {
    S.checkBox(SKILLS[id].prof, cX + 2, kTop, 11);
    S.rect(cX + 18, kTop, 26, 12, { fill: FIELD_BG });
    S.roughRect(cX + 18, kTop, 26, 12, { width: 0.6, rough: 0.5 });
    S.textField(SKILLS[id].field, cX + 19, kTop + 0.5, 24, 11, { align: "center" });
    S.txt(label, cX + 48, kTop + 2.5, { size: 7.8, font: "serif", color: INK });
    S.micro(ab.toUpperCase(), cX + cW, kTop + 3, { align: "right", size: 5.2, opacity: 0.6 });
    kTop += 15.4;
  }

  /* ---- Column D: Prowess (shield AC + seals) ---- */
  const dX = 424, dW = 166;
  S.banner(dX, colTop, dW, "PROWESS");
  const dTop = colTop + 22;
  // Armor Class heater shield
  inkedShape(S, shieldPath, dX + 4, dTop, 58, 70);
  S.micro("ARMOR", dX + 33, dTop + 10, { align: "center", size: 5.5 });
  S.micro("CLASS", dX + 33, dTop + 17, { align: "center", size: 5.5 });
  S.textField(FIELDS.ac, dX + 12, dTop + 26, 42, 24, { align: "center", size: 20 });
  // Seals: initiative / speed / prof / passive
  sealStat(S, FIELDS.initiative, "INITIATIVE", dX + 100, dTop + 26, 18);
  sealStat(S, FIELDS.speed, "SPEED", dX + 144, dTop + 26, 18, { size: 10 });
  sealStat(S, FIELDS.profBonus, "PROF", dX + 100, dTop + 76, 18);
  sealStat(S, FIELDS.passivePerception, "PASSIVE", dX + 144, dTop + 76, 18);
  // Size
  S.well(FIELDS.size, "SIZE", dX + 4, dTop + 76, 58, 20, { labelAlign: "center", fieldAlign: "center", size: 9 });
  // Hit Points banner
  const hpTop = dTop + 104;
  S.rect(dX, hpTop, dW, 50, { fill: FIELD_BG });
  S.roughRect(dX, hpTop, dW, 50, { width: 1.0, rough: 0.9 });
  S.micro("HIT POINTS", dX + dW / 2, hpTop + 3, { align: "center" });
  S.well(FIELDS.hpCurrent, "CURRENT", dX + 6, hpTop + 12, 68, 34, { labelAlign: "center", fieldAlign: "center", size: 16 });
  S.well(FIELDS.hpMax, "MAX", dX + 82, hpTop + 12, 38, 34, { labelAlign: "center", fieldAlign: "center" });
  S.well(FIELDS.hpTemp, "TEMP", dX + 124, hpTop + 12, 38, 34, { labelAlign: "center", fieldAlign: "center" });
  // Hit dice + death saves
  const hdTop = hpTop + 58;
  S.rect(dX, hdTop, 80, 50, { fill: FIELD_BG }); S.roughRect(dX, hdTop, 80, 50, { width: 1.0, rough: 0.9 });
  S.micro("HIT DICE", dX + 40, hdTop + 3, { align: "center" });
  S.well(FIELDS.hdMax, "TOTAL", dX + 5, hdTop + 12, 48, 34, { labelAlign: "center", fieldAlign: "center", size: 9 });
  S.well(FIELDS.hdSpent, "USED", dX + 57, hdTop + 12, 18, 34, { labelAlign: "center", fieldAlign: "center", size: 11 });
  const dsX = dX + 86;
  S.rect(dsX, hdTop, 80, 50, { fill: FIELD_BG }); S.roughRect(dsX, hdTop, 80, 50, { width: 1.0, rough: 0.9 });
  S.micro("DEATH SAVES", dsX + 40, hdTop + 3, { align: "center" });
  S.micro("LIFE", dsX + 5, hdTop + 15, { size: 5, opacity: 0.7 });
  DEATH_SAVES.success.forEach((n, i) => S.checkBox(n, dsX + 38 + i * 13, hdTop + 12, 11));
  S.micro("DOOM", dsX + 5, hdTop + 33, { size: 5, opacity: 0.7 });
  DEATH_SAVES.failure.forEach((n, i) => S.checkBox(n, dsX + 38 + i * 13, hdTop + 30, 11));
  // Heroic inspiration
  const hiTop = hdTop + 58;
  S.rect(dX, hiTop, dW, 18, { fill: PARCH_LO }); S.roughRect(dX, hiTop, dW, 18, { width: 0.9, rough: 0.8 });
  S.checkBox(FIELDS.heroicInspiration, dX + 6, hiTop + 4, 10);
  S.txt("HEROIC INSPIRATION", dX + 24, hiTop + 5.5, { size: 8, font: "serifB", color: INK, spacing: 0.4 });

  /* ---- Weapons ---- */
  const wTop = 486;
  S.banner(22, wTop, 568, "ARMS  &  DAMAGE CANTRIPS");
  const cols = [
    { key: "name", label: "WEAPON", x: 28, w: 246 },
    { key: "atk", label: "ATK", x: 280, w: 66 },
    { key: "dmg", label: "DAMAGE & TYPE", x: 350, w: 118 },
    { key: "notes", label: "NOTES", x: 472, w: 112 }
  ];
  roughTable(S, 22, wTop + 20, 568, 15, 6, cols, (row, r, c) => WEAPON_ROWS[r][c.key]);

  /* ---- Class Features ---- */
  const fTop = wTop + 20 + 15 * 7 + 12;
  S.banner(22, fTop, 356, "CLASS FEATURES");
  const fb = fTop + 22, fbH = 772 - fb;
  S.rect(22, fb, 356, fbH, { fill: FIELD_BG });
  S.roughRect(22, fb, 356, fbH, { width: 1.0, rough: 1.0 });
  S.roughSeg(200, fb + 4, 200, fb + fbH - 4, { width: 0.5, rough: 0.6, opacity: 0.6 });
  S.textField(FIELDS.classFeatures[0], 27, fb + 3, 168, fbH - 6, { multiline: true, size: 8 });
  S.textField(FIELDS.classFeatures[1], 205, fb + 3, 168, fbH - 6, { multiline: true, size: 8 });

  /* ---- Training & Proficiencies ---- */
  const eX = 388, eW = 202;
  S.banner(eX, fTop, eW, "TRAINING & PROFICIENCY");
  let eTop = fTop + 24;
  S.micro("ARMOR TRAINING", eX, eTop);
  [["light", "LIGHT"], ["medium", "MEDIUM"], ["heavy", "HEAVY"], ["shield", "SHIELDS"]].forEach(([key, lab], i) => {
    const ax = eX + (i % 2) * 100, ay = eTop + 9 + Math.floor(i / 2) * 16;
    S.checkBox(ARMOR_TRAINING[key], ax, ay, 11);
    S.txt(lab, ax + 15, ay + 2, { size: 7.5, font: "serif", color: INK });
  });
  // Weapon proficiencies sit in a compact box; Tools then fills all the way to the bottom rule.
  const wpLabel = eTop + 40;
  S.micro("WEAPONS", eX, wpLabel);
  fantasyBox(S, FIELDS.weaponProficiencies, eX, wpLabel + 8, eW, 22);
  const tlLabel = wpLabel + 36;
  S.micro("TOOLS", eX, tlLabel);
  fantasyBox(S, FIELDS.toolProficiencies, eX, tlLabel + 8, eW, 770 - (tlLabel + 8));

  footer(S, "Leaf I  ·  the Adventurer");
}

/* -------------------------------------------- */
/*  Page 2 — Chronicle & Spells                  */
/* -------------------------------------------- */

function buildPage2(S) {
  pageBackdrop(S);

  /* ---- Masthead + spellcasting ---- */
  S.d20(306, 40, 26, { opacity: 0.09, width: 0.8 });
  S.diamond(180, 32, 2.5); S.diamond(432, 32, 2.5);
  S.txtC("S P E L L S   &   C H R O N I C L E", 306, 26, { size: 12, font: "serifB", color: INK, spacing: 2 });
  S.roughSeg(200, 50, 412, 50, { width: 0.8, rough: 0.7 });
  const hy = 62;
  S.well(FIELDS.spellcastingAbility, "SPELLCASTING ABILITY", 30, hy, 168, 26, { labelAlign: "center", fieldAlign: "center" });
  S.well(FIELDS.spellcastingModifier, "MODIFIER", 208, hy, 92, 26, { labelAlign: "center", fieldAlign: "center", size: 12 });
  S.well(FIELDS.spellSaveDC, "SPELL SAVE DC", 306, hy, 92, 26, { labelAlign: "center", fieldAlign: "center", size: 12 });
  S.well(FIELDS.spellAttackBonus, "SPELL ATTACK", 406, hy, 174, 26, { labelAlign: "center", fieldAlign: "center", size: 12 });

  /* ---- Left: spell slots + table ---- */
  const lX = 22, lW = 360;
  let y = S.banner(lX, 100, lW, "SPELL SLOTS");
  const slotW = 38, slotGap = 2;
  for ( let lvl = 1; lvl <= 9; lvl++ ) {
    const sx = lX + (lvl - 1) * (slotW + slotGap);
    S.rect(sx, y, slotW, 26, { fill: FIELD_BG });
    S.roughRect(sx, y, slotW, 26, { width: 0.7, rough: 0.6 });
    S.micro(String(lvl), sx + slotW / 2, y + 2, { align: "center", size: 6 });
    S.textField(SPELL_SLOT_TOTALS[lvl], sx + 2, y + 9, slotW - 4, 15, { align: "center", size: 11 });
  }
  y += 34;

  const tableTop = S.banner(lX, y, lW, "CANTRIPS  &  PREPARED SPELLS");
  const scols = [
    { key: "level", label: "LV", x: lX + 2, w: 18, center: true },
    { key: "name", label: "SPELL NAME", x: lX + 24, w: 148 },
    { key: "castingTime", label: "TIME", x: lX + 176, w: 44 },
    { key: "range", label: "RANGE", x: lX + 224, w: 42 }
  ];
  const crmX = { concentration: lX + 272, ritual: lX + 288, material: lX + 304 };
  const notesX = lX + 322, notesW = lX + lW - notesX;
  const rowH = 19, rows = SPELL_ROWS.length;
  // header
  S.rect(lX, tableTop, lW, 15, { fill: PARCH_LO });
  S.hatch(lX, tableTop, lW, 15, { gap: 3, opacity: 0.06 });
  for ( const c of scols ) S.micro(c.label, c.center ? c.x + c.w / 2 : c.x, tableTop + 5, { align: c.center ? "center" : "left" });
  S.micro("C", crmX.concentration + 5, tableTop + 5, { align: "center", size: 5.5 });
  S.micro("R", crmX.ritual + 5, tableTop + 5, { align: "center", size: 5.5 });
  S.micro("M", crmX.material + 5, tableTop + 5, { align: "center", size: 5.5 });
  S.micro("NOTES", notesX, tableTop + 5);
  // rows
  let rTop = tableTop + 15;
  SPELL_ROWS.forEach((row, i) => {
    for ( const c of scols ) S.textField(row[c.key], c.x, rTop + 3, c.w, 13, { size: 8, align: c.center ? "center" : "left" });
    S.checkBox(row.concentration, crmX.concentration, rTop + 4, 10);
    S.checkBox(row.ritual, crmX.ritual, rTop + 4, 10);
    S.checkBox(row.material, crmX.material, rTop + 4, 10);
    S.textField(row.notes, notesX, rTop + 3, notesW, 13, { size: 7 });
    if ( i < rows - 1 ) S.roughSeg(lX + 2, rTop + rowH, lX + lW - 2, rTop + rowH, { width: 0.4, rough: 0.5, opacity: 0.55 });
    rTop += rowH;
  });
  S.roughRect(lX, tableTop, lW, rTop - tableTop, { width: 1.1, rough: 1.0 });
  for ( const gx of [scols[1].x - 4, crmX.concentration - 5, notesX - 5] ) {
    S.roughSeg(gx, tableTop, gx, rTop, { width: 0.5, rough: 0.5, opacity: 0.55 });
  }

  /* ---- Right: chronicle ---- */
  const rX = 392, rW = 198;
  let ry = S.banner(rX, 100, rW, "CHRONICLE");
  ry = fantasyTitled(S, FIELDS.alignment, "ALIGNMENT", rX, ry, rW, 16, { multiline: false });
  ry = fantasyTitled(S, FIELDS.appearance, "APPEARANCE & DETAILS", rX, ry + 6, rW, 92);
  ry = fantasyTitled(S, FIELDS.languages, "LANGUAGES", rX, ry + 6, rW, 46);
  ry = fantasyTitled(S, FIELDS.equipment, "EQUIPMENT", rX, ry + 6, rW, 116);
  ry = S.banner(rX, ry + 6, rW, "ATTUNED ITEMS");
  FIELDS.attunement.forEach((f, i) => {
    const ay = ry + i * 17;
    S.diamond(rX + 5, ay + 7, 2);
    S.rect(rX + 12, ay, rW - 12, 13, { fill: FIELD_BG });
    S.roughSeg(rX + 12, ay + 13, rX + rW, ay + 13, { width: 0.6, rough: 0.5 });
    S.textField(f, rX + 15, ay + 1, rW - 18, 11, { size: 8 });
  });
  ry += FIELDS.attunement.length * 17 + 6;
  ry = S.banner(rX, ry, rW, "COINAGE");
  const coinW = (rW - 8) / 5;
  ["cp", "sp", "ep", "gp", "pp"].forEach((key, i) => {
    const cx = rX + i * (coinW + 2);
    S.roughCircle(cx + coinW / 2, ry + 15, coinW / 2 - 1, { width: 0.8, rough: 0.5 });
    S.micro(key.toUpperCase(), cx + coinW / 2, ry + 2, { align: "center", size: 5.5 });
    S.textField(FIELDS[key], cx + 3, ry + 9, coinW - 6, 13, { align: "center", size: 9 });
  });
  ry += 36;
  fantasyTitled(S, FIELDS.backstory, "BACKSTORY & ALLIES", rX, ry, rW, 772 - 22 - ry);

  footer(S, "Leaf II  ·  Chronicle & Spells");
}

/* -------------------------------------------- */
/*  Shared helpers                              */
/* -------------------------------------------- */

/** A sketchy multiline field box (no label). */
function fantasyBox(S, name, x, top, w, h) {
  S.rect(x, top, w, h, { fill: FIELD_BG });
  S.roughRect(x, top, w, h, { width: 0.9, rough: 0.9 });
  S.textField(name, x + 3, top + 2, w - 6, h - 4, { multiline: true, size: 8 });
}

/** Banner header + a sketchy multiline field box. Returns the bottom y. */
function fantasyTitled(S, name, title, x, top, w, boxH) {
  const bt = S.banner(x, top, w, title);
  fantasyBox(S, name, x, bt, w, boxH);
  return bt + boxH;
}

/** A rough-ruled table: outer sketchy rect, header strip, N rows, column rules. */
function roughTable(S, x, top, w, rowH, nRows, cols, valueFor) {
  S.rect(x, top, w, 15, { fill: PARCH_LO });
  S.hatch(x, top, w, 15, { gap: 3, opacity: 0.06 });
  for ( const c of cols ) S.micro(c.label, c.x, top + 5);
  let rTop = top + 15;
  for ( let r = 0; r < nRows; r++ ) {
    for ( const c of cols ) S.textField(valueFor(null, r, c), c.x, rTop + 2, c.w, 12, { size: 8 });
    if ( r < nRows - 1 ) S.roughSeg(x + 2, rTop + rowH, x + w - 2, rTop + rowH, { width: 0.4, rough: 0.5, opacity: 0.55 });
    rTop += rowH;
  }
  S.roughRect(x, top, w, rTop - top, { width: 1.1, rough: 1.0 });
  for ( const c of cols.slice(1) ) S.roughSeg(c.x - 4, top, c.x - 4, rTop, { width: 0.5, rough: 0.5, opacity: 0.55 });
}

function footer(S, label) {
  S.txtC(label, 306, 778, { size: 6.5, font: "serifBI", color: INK, opacity: 0.6, spacing: 0.4 });
}

function titleCase(upper) { return upper.charAt(0) + upper.slice(1).toLowerCase(); }

if ( process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ) {
  build().then(out => console.log("Wrote", out)).catch(err => { console.error(err); process.exit(1); });
}
