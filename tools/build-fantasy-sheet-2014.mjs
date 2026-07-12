/**
 * Build script for templates/DnD_Fantasy_2014_Character-Sheet.pdf
 *
 * Generates an original, form-fillable character sheet for the 2014 rules in the same hand-drawn
 * "Inked Tome" style as the 2024 Fantasy Sheet, but laid out for the 2014 field set: sepia ink on a
 * clean white page, sketchy double-stroked boxes, a heater-shield Armor Class, dice-hexagon ability
 * scores, wax-seal stats, swallowtail-pennant flags and open-book motifs, and a faint d20 watermark.
 * The layout and artwork are entirely our own so the sheet can be distributed as Fan Content.
 *
 * It reuses the exact field names expected by scripts/field-map-2014.mjs, so the base 2014
 * {@link SheetFiller} fills it unchanged, and adds a "CHARACTER IMAGE" portrait button.
 *
 * All randomness is seeded, so the output is byte-for-byte reproducible. Run from the repo root:
 *   node tools/build-fantasy-sheet-2014.mjs
 *
 * The sheet is white by default (the design brief calls for a white background). Set PARCHMENT=1 to
 * render the same layout on aged parchment instead.
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  ABILITIES, SKILLS, DEATH_SAVES, WEAPON_ROWS, SPELL_LEVELS, slotFields, FIELDS
} from "../scripts/field-map-2014.mjs";

const require = createRequire(import.meta.url);
const PDFLib = require("../lib/pdf-lib.min.js");
const { PDFDocument, StandardFonts, rgb, TextAlignment } = PDFLib;

const HERE = path.dirname(fileURLToPath(import.meta.url));
// White by default; PARCHMENT=1 renders the identical sheet on aged parchment instead.
const WHITE = !(process.env.PARCHMENT === "1" || process.env.PARCHMENT === "true");
// Writes the real template by default (a "-Parchment" variant in parchment mode); OUT_PDF overrides.
const OUT = process.env.OUT_PDF
  ? path.resolve(process.env.OUT_PDF)
  : path.resolve(HERE, `../templates/DnD_Fantasy_2014_Character-Sheet${WHITE ? "" : "-Parchment"}.pdf`);

/** Push-button field that receives the actor portrait (not part of the 2014 field map). */
export const PORTRAIT_FIELD = "CHARACTER IMAGE";

/* -------------------------------------------- */
/*  Monochrome design system                     */
/* -------------------------------------------- */

const INK      = rgb(0.14, 0.12, 0.10);   // dark sepia-black — the single ink
// Parchment mode swaps the white tones for aged paper; everything else is unchanged.
const PARCH     = WHITE ? rgb(1, 1, 1)             : rgb(0.925, 0.892, 0.820); // page
const PARCH_HI  = WHITE ? rgb(0.975, 0.975, 0.975) : rgb(0.955, 0.930, 0.870); // lighter wells
const PARCH_LO  = WHITE ? rgb(0.905, 0.905, 0.905) : rgb(0.890, 0.850, 0.762); // banner / panel fills
const FIELD_BG  = null; // field wells are transparent so the page (and any grain) shows through

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
    if ( !fill && !stroke ) return; // transparent well — let the page show through
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
    const hex = [pts.T, pts.UR, pts.LR, pts.B, pts.LL, pts.UL];
    for ( let i = 0; i < hex.length; i++ ) seg(hex[i], hex[(i + 1) % hex.length]);
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
    // widget background to white, which would hide any page grain and the hand-drawn box.
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

  /** Ribbon-banner (flag) section header with a title and swallowtail ends. Returns y below it. */
  banner(x, top, w, title, { h = 17, size = 9.5, spacing = 1.3 } = {}) {
    const notch = 8;
    const p = `M 0 ${h / 2} L ${notch} 0 L ${w - notch} 0 L ${w} ${h / 2} L ${w - notch} ${h} L ${notch} ${h} Z`;
    this.svgShape(p, x, top, { fill: PARCH_LO });
    this.hatch(x + notch, top + 1, w - 2 * notch, h - 2, { gap: 3, opacity: 0.08 });
    this.svgShape(p, x + this.jit(0.4), top + this.jit(0.4), { stroke: INK, width: 1.1 });
    this.svgShape(p, x + this.jit(0.5), top + this.jit(0.5), { stroke: INK, width: 0.5, opacity: 0.7 });
    // Shrink the title (and, if still too wide, its letter-spacing) so it never spills past the flag.
    const avail = w - 2 * notch - 6;
    while ( (size > 5) && (this.widthTracked(title, { size, font: "serifB", spacing }) > avail) ) size -= 0.5;
    while ( (spacing > 0) && (this.widthTracked(title, { size, font: "serifB", spacing }) > avail) ) spacing -= 0.2;
    this.txtC(title, x + w / 2, top + (h - size) / 2 + 0.5, { size, font: "serifB", color: INK, spacing });
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

  /** Small filled diamond accent (symmetric, so orientation is irrelevant). */
  diamond(cx, topC, r, { opacity = 1 } = {}) {
    const d = `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
    this.page.drawSvgPath(d, { x: cx, y: PAGE_H - topC, color: INK, opacity });
  }

  /**
   * A swallowtail pennant flag on a short pole, drawn as decoration. `dir` = 1 flies right, -1 left.
   * Small hatched banner with a forked (swallowtail) fly end and a diamond finial atop the pole.
   */
  pennant(x, top, len, h, dir = 1) {
    const tail = len * 0.32;
    this.line(x, top - 4, x, top + h + 6, { width: 1.1 });          // pole
    this.diamond(x, top - 6, 2.4);                                   // finial
    const p = dir === 1
      ? `M 0 0 L ${len} 0 L ${len - tail} ${h / 2} L ${len} ${h} L 0 ${h} Z`
      : `M 0 0 L ${-len} 0 L ${-len + tail} ${h / 2} L ${-len} ${h} L 0 ${h} Z`;
    this.svgShape(p, x, top, { fill: PARCH_LO });
    this.hatch(dir === 1 ? x : x - len, top + 1, len - tail, h - 2, { gap: 3, opacity: 0.08 });
    this.svgShape(p, x + this.jit(0.3), top + this.jit(0.3), { stroke: INK, width: 1.0 });
  }

  /**
   * An open-book motif centred at (cx, topC): two curved pages meeting at a spine, with a couple of
   * text rules on each leaf. Purely decorative line art.
   */
  openBook(cx, topC, w, h, { opacity = 1, width = 1.1 } = {}) {
    const hw = w / 2;
    // Left leaf
    const left = `M 0 ${h} Q ${-hw * 0.9} ${h - 2} ${-hw} ${h * 0.15} Q ${-hw * 0.55} ${-1} 0 ${h * 0.12} Z`;
    // Right leaf (mirror)
    const right = `M 0 ${h} Q ${hw * 0.9} ${h - 2} ${hw} ${h * 0.15} Q ${hw * 0.55} ${-1} 0 ${h * 0.12} Z`;
    this.svgShape(left, cx, topC, { fill: PARCH_HI, stroke: INK, width, opacity });
    this.svgShape(right, cx, topC, { fill: PARCH_HI, stroke: INK, width, opacity });
    this.line(cx, topC + h * 0.12, cx, topC + h, { width: width * 0.9, opacity });     // spine
    for ( let i = 1; i <= 3; i++ ) {                                                     // page rules
      const ry = topC + h * 0.28 + i * (h * 0.16);
      this.roughSeg(cx - hw * 0.72, ry, cx - hw * 0.14, ry - 1, { width: 0.4, rough: 0.4, opacity: 0.5 });
      this.roughSeg(cx + hw * 0.14, ry - 1, cx + hw * 0.72, ry, { width: 0.4, rough: 0.4, opacity: 0.5 });
    }
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
  { id: "acr", label: "Acrobatics", ab: "Dex" },
  { id: "ani", label: "Animal Handling", ab: "Wis" },
  { id: "arc", label: "Arcana", ab: "Int" },
  { id: "ath", label: "Athletics", ab: "Str" },
  { id: "dec", label: "Deception", ab: "Cha" },
  { id: "his", label: "History", ab: "Int" },
  { id: "ins", label: "Insight", ab: "Wis" },
  { id: "itm", label: "Intimidation", ab: "Cha" },
  { id: "inv", label: "Investigation", ab: "Int" },
  { id: "med", label: "Medicine", ab: "Wis" },
  { id: "nat", label: "Nature", ab: "Int" },
  { id: "prc", label: "Perception", ab: "Wis" },
  { id: "prf", label: "Performance", ab: "Cha" },
  { id: "per", label: "Persuasion", ab: "Cha" },
  { id: "rel", label: "Religion", ab: "Int" },
  { id: "slt", label: "Sleight of Hand", ab: "Dex" },
  { id: "ste", label: "Stealth", ab: "Dex" },
  { id: "sur", label: "Survival", ab: "Wis" }
];

// Spell blocks laid across three columns on the spellbook page, in printed order.
const SPELL_BLOCKS = [
  { level: 0, title: "CANTRIPS" },
  { level: 1, title: "1ST LEVEL" },
  { level: 2, title: "2ND LEVEL" },
  { level: 3, title: "3RD LEVEL" },
  { level: 4, title: "4TH LEVEL" },
  { level: 5, title: "5TH LEVEL" },
  { level: 6, title: "6TH LEVEL" },
  { level: 7, title: "7TH LEVEL" },
  { level: 8, title: "8TH LEVEL" },
  { level: 9, title: "9TH LEVEL" }
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
    const p = `M 0 0 C ${18 * sx} ${2 * sy} ${20 * sx} ${18 * sy} ${8 * sx} ${20 * sy} C ${14 * sx} ${16 * sy} ${12 * sx} ${6 * sy} 0 ${8 * sy} Z`;
    S.svgShape(p, x, y, { stroke: INK, width: 0.8, opacity: 0.7 });
    S.diamond(x + 5 * sx, y + 5 * sy, 2);
  }
}

/** Masthead: a d20 watermark, a spaced title with flanking pennant flags and a subtitle rule. */
function masthead(S, title, subtitle, { flags = true } = {}) {
  S.d20(306, 42, 30, { opacity: 0.09, width: 0.8 });
  S.d20(306, 42, 20, { opacity: 0.07, width: 0.5 });
  if ( flags ) {
    S.pennant(150, 24, 44, 22, 1);
    S.pennant(462, 24, 44, 22, -1);
  }
  S.txtC(title, 306, 27, { size: 12, font: "serifB", color: INK, spacing: 2 });
  S.txtC(subtitle, 306, 44, { size: 7.5, font: "serifI", color: INK, opacity: 0.7, spacing: 0.5 });
  S.roughSeg(210, 58, 402, 58, { width: 0.8, rough: 0.7 });
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
/*  Build                                       */
/* -------------------------------------------- */

/**
 * Give the AcroForm a Default Resources (/DR) font dictionary and a default appearance (/DA).
 * pdf-lib names the field font "/Helvetica" in each field's /DA but does not add a matching /DR
 * entry; without it, strict viewers such as Adobe Acrobat cannot build an editing context and blank
 * fields are not editable.
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
  doc.setTitle("5e (2014) Fantasy Character Sheet");
  doc.setSubject("An original, Fan Content compatible 2014 Fifth Edition character sheet (Inked Tome).");
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
  buildPage1(new Sheet(doc, p1, fonts, mulberry32(0x2014A1)));
  const p2 = doc.addPage([PAGE_W, PAGE_H]);
  buildPage2(new Sheet(doc, p2, fonts, mulberry32(0x2014A2)));
  const p3 = doc.addPage([PAGE_W, PAGE_H]);
  buildPage3(new Sheet(doc, p3, fonts, mulberry32(0x2014A3)));

  ensureFormResources(doc);
  const bytes = await doc.save();
  writeFileSync(OUT, bytes);
  return OUT;
}

/* -------------------------------------------- */
/*  Page 1 — The Adventurer                      */
/* -------------------------------------------- */

function buildPage1(S) {
  pageBackdrop(S);
  masthead(S, "T H E   C H A R A C T E R", "~ an inked chronicle ~");

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
  S.well(FIELDS.classLevel, "CLASS & LEVEL", 34, 100, 214, 24);
  S.well(FIELDS.race, "RACE", 254, 100, 210, 24);
  S.well(FIELDS.background, "BACKGROUND", 34, 130, 130, 24);
  S.well(FIELDS.alignment, "ALIGNMENT", 172, 130, 100, 24);
  S.well(FIELDS.playerName, "PLAYER", 280, 130, 100, 24);
  S.well(FIELDS.xp, "EXP.", 388, 130, 76, 24, { labelAlign: "center", fieldAlign: "center" });

  const colTop = 166;

  /* ---- Column A: Abilities (hexagons) ---- */
  S.banner(22, colTop, 104, "ABILITIES");
  let aTop = colTop + 22;
  for ( const meta of ABILITY_META ) { abilityHex(S, meta.id, meta, 22, aTop, 104, 44); aTop += 48; }

  /* ---- Column B: Saving Throws + Proficiencies & Languages ---- */
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
  const plTop = S.banner(bX, sTop + 6, bW, "PROFICIENCIES");
  fantasyBox(S, FIELDS.proficienciesLang, bX, plTop, bW, 476 - plTop);

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

  /* ---- Column D: Prowess (shield AC + seals + HP + hit dice + death saves) ---- */
  const dX = 424, dW = 166;
  S.banner(dX, colTop, dW, "PROWESS");
  const dTop = colTop + 22;
  // Armor Class heater shield
  inkedShape(S, shieldPath, dX + 4, dTop, 58, 70);
  S.micro("ARMOR", dX + 33, dTop + 10, { align: "center", size: 5.5 });
  S.micro("CLASS", dX + 33, dTop + 17, { align: "center", size: 5.5 });
  S.textField(FIELDS.ac, dX + 12, dTop + 26, 42, 24, { align: "center", size: 20 });
  // Inspiration well below the shield
  S.well(FIELDS.inspiration, "INSPIRATION", dX + 4, dTop + 74, 58, 22, { labelAlign: "center", fieldAlign: "center", size: 11 });
  // Seals: initiative / speed / prof / passive
  sealStat(S, FIELDS.initiative, "INITIATIVE", dX + 100, dTop + 26, 18);
  sealStat(S, FIELDS.speed, "SPEED", dX + 144, dTop + 26, 18, { size: 10 });
  sealStat(S, FIELDS.profBonus, "PROF", dX + 100, dTop + 76, 18);
  sealStat(S, FIELDS.passivePerception, "PASSIVE", dX + 144, dTop + 76, 18);
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
  S.well(FIELDS.hdTotal, "TOTAL", dX + 5, hdTop + 12, 48, 34, { labelAlign: "center", fieldAlign: "center", size: 9 });
  S.well(FIELDS.hd, "LEFT", dX + 57, hdTop + 12, 18, 34, { labelAlign: "center", fieldAlign: "center", size: 11 });
  const dsX = dX + 86;
  S.rect(dsX, hdTop, 80, 50, { fill: FIELD_BG }); S.roughRect(dsX, hdTop, 80, 50, { width: 1.0, rough: 0.9 });
  S.micro("DEATH SAVES", dsX + 40, hdTop + 3, { align: "center" });
  S.micro("LIFE", dsX + 5, hdTop + 15, { size: 5, opacity: 0.7 });
  DEATH_SAVES.success.forEach((n, i) => S.checkBox(n, dsX + 38 + i * 13, hdTop + 12, 11));
  S.micro("DOOM", dsX + 5, hdTop + 33, { size: 5, opacity: 0.7 });
  DEATH_SAVES.failure.forEach((n, i) => S.checkBox(n, dsX + 38 + i * 13, hdTop + 30, 11));

  /* ---- Attacks & Spellcasting (weapon table + free-text) ---- */
  const wTop = 486;
  S.banner(22, wTop, 568, "ARMS  &  SPELLCASTING");
  const cols = [
    { key: "name", label: "WEAPON", x: 28, w: 300 },
    { key: "atk", label: "ATK BONUS", x: 334, w: 96 },
    { key: "dmg", label: "DAMAGE & TYPE", x: 436, w: 148 }
  ];
  roughTable(S, 22, wTop + 20, 568, 15, 3, cols, (row, r, c) => WEAPON_ROWS[r][c.key]);
  // Free-text notes area (overflow weapons + spell attack summary)
  const asTop = wTop + 20 + 15 + 3 * 15 + 4;
  fantasyBox(S, FIELDS.attacksSpellcasting, 22, asTop, 568, 34);

  /* ---- Bottom band: Features & Traits | Equipment + Coin ---- */
  const fTop = asTop + 42;
  S.banner(22, fTop, 356, "FEATURES  &  TRAITS");
  const fb = fTop + 22, fbH = 772 - fb;
  S.rect(22, fb, 356, fbH, { fill: FIELD_BG });
  S.roughRect(22, fb, 356, fbH, { width: 1.0, rough: 1.0 });
  S.roughSeg(200, fb + 4, 200, fb + fbH - 4, { width: 0.5, rough: 0.6, opacity: 0.6 });
  S.openBook(200, fb + fbH - 30, 40, 24, { opacity: 0.16 });
  S.textField(FIELDS.featuresTraits, 27, fb + 3, 346, fbH - 6, { multiline: true, size: 8 });

  // Equipment + currency
  const eX = 388, eW = 202;
  const eqTop = S.banner(eX, fTop, eW, "EQUIPMENT");
  const coinH = 30;
  const eqH = 772 - eqTop - coinH - 8;
  fantasyBox(S, FIELDS.equipment, eX, eqTop, eW, eqH);
  // Coin purse row
  const coinTop = eqTop + eqH + 8;
  const coinW = (eW - 8) / 5;
  ["cp", "sp", "ep", "gp", "pp"].forEach((key, i) => {
    const cx = eX + i * (coinW + 2);
    S.roughCircle(cx + coinW / 2, coinTop + 15, coinW / 2 - 1, { width: 0.8, rough: 0.5 });
    S.micro(key.toUpperCase(), cx + coinW / 2, coinTop + 2, { align: "center", size: 5.5 });
    S.textField(FIELDS[key], cx + 3, coinTop + 9, coinW - 6, 13, { align: "center", size: 9 });
  });

  footer(S, "Leaf I  ·  the Adventurer");
}

/* -------------------------------------------- */
/*  Page 2 — Chronicle                           */
/* -------------------------------------------- */

function buildPage2(S) {
  pageBackdrop(S);
  masthead(S, "N A M E   &   C H R O N I C L E", "~ the tale so far ~");

  // Character name echo + appearance wells
  S.well(FIELDS.characterName2, "CHARACTER NAME", 34, 66, 556, 24, { size: 14 });

  const apTop = 100;
  const apCols = [
    [FIELDS.age, "AGE"], [FIELDS.height, "HEIGHT"], [FIELDS.weight, "WEIGHT"],
    [FIELDS.eyes, "EYES"], [FIELDS.skin, "SKIN"], [FIELDS.hair, "HAIR"]
  ];
  const apW = (556 - 5 * 8) / 6;
  apCols.forEach(([name, label], i) => {
    S.well(name, label, 34 + i * (apW + 8), apTop, apW, 24, { labelAlign: "center", fieldAlign: "center", size: 9 });
  });

  /* ---- Left column: Personality + Allies ---- */
  const lX = 34, lW = 264;
  let ly = S.banner(lX, 138, lW, "PERSONALITY TRAITS");
  fantasyBox(S, FIELDS.personalityTraits, lX, ly, lW, 66); ly += 66 + 6;
  ly = S.banner(lX, ly, lW, "IDEALS");
  fantasyBox(S, FIELDS.ideals, lX, ly, lW, 54); ly += 54 + 6;
  ly = S.banner(lX, ly, lW, "BONDS");
  fantasyBox(S, FIELDS.bonds, lX, ly, lW, 54); ly += 54 + 6;
  ly = S.banner(lX, ly, lW, "FLAWS");
  fantasyBox(S, FIELDS.flaws, lX, ly, lW, 54); ly += 54 + 6;
  ly = S.banner(lX, ly, lW, "ALLIES & ORGANISATIONS");
  S.well(FIELDS.factionName, "FACTION / FAITH", lX, ly, lW, 22, { size: 10 });
  ly += 24;
  fantasyBox(S, FIELDS.allies, lX, ly, lW, 772 - ly);

  /* ---- Right column: Backstory + Additional Features ---- */
  const rX = 314, rW = 276;
  let ry = S.banner(rX, 138, rW, "CHARACTER BACKSTORY");
  fantasyBox(S, FIELDS.backstory, rX, ry, rW, 300); ry += 300 + 8;
  ry = S.banner(rX, ry, rW, "ADDITIONAL FEATURES & TRAITS");
  const afH = 772 - ry;
  S.rect(rX, ry, rW, afH, { fill: FIELD_BG });
  S.roughRect(rX, ry, rW, afH, { width: 1.0, rough: 1.0 });
  S.openBook(rX + rW - 34, ry + afH - 26, 36, 22, { opacity: 0.16 });
  S.textField(FIELDS.additionalFeatures, rX + 5, ry + 3, rW - 10, afH - 6, { multiline: true, size: 8 });

  footer(S, "Leaf II  ·  Chronicle");
}

/* -------------------------------------------- */
/*  Page 3 — Spellbook                           */
/* -------------------------------------------- */

function buildPage3(S) {
  pageBackdrop(S);
  masthead(S, "T H E   S P E L L B O O K", "~ words of power ~");
  S.openBook(306, 66, 60, 30, { opacity: 0.12 });

  // Spellcasting header wells
  const hy = 66;
  S.well(FIELDS.spellcastingClass, "SPELLCASTING CLASS", 34, hy, 190, 26, { labelAlign: "center", fieldAlign: "center", size: 11 });
  S.well(FIELDS.spellcastingAbility, "ABILITY", 232, hy, 120, 26, { labelAlign: "center", fieldAlign: "center", size: 11 });
  S.well(FIELDS.spellSaveDC, "SAVE DC", 360, hy, 100, 26, { labelAlign: "center", fieldAlign: "center", size: 13 });
  S.well(FIELDS.spellAttackBonus, "ATK BONUS", 468, hy, 110, 26, { labelAlign: "center", fieldAlign: "center", size: 13 });

  // Three columns of spell-level blocks
  const colX = [24, 216, 408];
  const colW = 178;
  const layout = [
    [SPELL_BLOCKS[0], SPELL_BLOCKS[1], SPELL_BLOCKS[2]],           // cantrips, 1, 2
    [SPELL_BLOCKS[3], SPELL_BLOCKS[4], SPELL_BLOCKS[5]],           // 3, 4, 5
    [SPELL_BLOCKS[6], SPELL_BLOCKS[7], SPELL_BLOCKS[8], SPELL_BLOCKS[9]] // 6, 7, 8, 9
  ];
  const blocksTop = 108;
  layout.forEach((column, ci) => {
    let y = blocksTop;
    for ( const block of column ) y = spellLevelBlock(S, block, colX[ci], y, colW) + 8;
  });

  footer(S, "Leaf III  ·  the Spellbook");
}

/**
 * A single spell-level block: a flag header (with slot Total/Left boxes for levels 1-9), then a
 * ruled list of spell-name fields, each with a "prepared" ring for levels 1-9. Returns the bottom y.
 */
function spellLevelBlock(S, { level, title }, x, top, w) {
  const map = SPELL_LEVELS[level];
  const cantrip = level === 0;
  let y = S.banner(x, top, w, title, { h: 15, size: 8 });

  if ( !cantrip ) {
    const { total, remaining } = slotFields(level);
    S.micro("SLOTS", x + 2, y + 2, { size: 5 });
    S.rect(x + 40, y, 30, 13, { fill: FIELD_BG }); S.roughRect(x + 40, y, 30, 13, { width: 0.6, rough: 0.5 });
    S.textField(total, x + 41, y + 0.5, 28, 12, { align: "center", size: 9 });
    S.micro("TOTAL", x + 40, y - 5.5, { size: 4.5, opacity: 0.7 });
    S.rect(x + 78, y, 30, 13, { fill: FIELD_BG }); S.roughRect(x + 78, y, 30, 13, { width: 0.6, rough: 0.5 });
    S.textField(remaining, x + 79, y + 0.5, 28, 12, { align: "center", size: 9 });
    S.micro("LEFT", x + 78, y - 5.5, { size: 4.5, opacity: 0.7 });
    y += 18;
  }

  const lineH = 13;
  map.lines.forEach((name, i) => {
    const ringOrBullet = cantrip;
    if ( cantrip ) S.diamond(x + 5, y + 6, 1.8, { opacity: 0.8 });
    else if ( map.checks[i] ) S.checkBox(map.checks[i], x + 1, y + 1, 10);
    const fx = x + 14;
    S.textField(name, fx, y, w - 14, 11, { size: 8 });
    S.roughSeg(fx, y + 11, x + w, y + 11, { width: 0.4, rough: 0.4, opacity: 0.5 });
    y += lineH;
  });
  return y;
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
