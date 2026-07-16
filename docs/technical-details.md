# Technical Details: How this module fills PDFs with `pdf-lib`

This document is for whoever would like to understand,
support, and extend the PDF-generation side of this module. It assumes you can read
JavaScript but have never worked with PDFs before.

Read this alongside the code. The three files that matter are:

| File | Role |
| --- | --- |
| [scripts/main.mjs](scripts/main.mjs) | All the PDF logic: loading, filling, drawing, saving, downloading. |
| [scripts/field-map-2014.mjs](scripts/field-map-2014.mjs) | Names of every form field on the official 2014 sheet. |
| [scripts/field-map-2024.mjs](scripts/field-map-2024.mjs) | Names of every form field on the official 2024 sheet. |

The module supports the two official Wizards of the Coast sheets and nothing else. Both are
copyrighted, so **no template PDF ships in this repo**: the user downloads their own copy and points
a client setting at it, and that path is what we load and fill.

---

## 1. The big picture in one paragraph

A D&D character sheet PDF is not a picture; it is a document with interactive **form
fields** (text boxes and checkboxes) drawn on top of printed artwork, exactly like a tax
form you can type into. Our job is: take a Foundry character (the `Actor`), read its data,
and write the right value into each named field of a blank template PDF, then hand the
finished PDF to the browser as a download. We never send anything to a server; the whole
PDF is built in the user's browser. The library that lets us open, edit, and save a PDF in
plain JavaScript is [`pdf-lib`](https://pdf-lib.js.org/).

---

## 2. What is `pdf-lib` and how is it loaded?

`pdf-lib` is a pure-JavaScript library for creating and modifying PDF documents. It runs in
both the browser and Node, with **no native dependencies**, which is why we can build the
whole sheet client-side.

We load a **pre-built, minified copy** rather than an npm import:

- [module.json](module.json) lists `lib/pdf-lib.min.js` under `"scripts"`. Foundry loads
  that file as a plain `<script>` before our ES module runs.
- That script attaches the library to the global variable **`PDFLib`**. So throughout
  [main.mjs](scripts/main.mjs) you will see `PDFLib.PDFDocument`, `PDFLib.StandardFonts`,
  `PDFLib.PDFTextField`, etc. There is no `import` for it.
- Because it is a global, the first thing `SheetFiller.create` does is guard against it
  being missing: `if ( !globalThis.PDFLib ) throw new Error("pdf-lib is not loaded")`.

> **Why a global and not an import?** Foundry modules load classic scripts and ES modules
> differently. Shipping the vendored `pdf-lib.min.js` as a classic script is the simplest
> way to make it available everywhere without a bundler. Anything running under Node instead
> pulls the same file in with `require("../lib/pdf-lib.min.js")`.

---

## 3. Core `pdf-lib` concepts you must know

These five concepts cover ~90% of what the module does.

### 3.1 `PDFDocument`: the whole file

```js
const doc = await PDFLib.PDFDocument.load(pdfBytes);  // open an existing PDF
const bytes = await doc.save();                       // serialise back to a Uint8Array
```

`load` takes the raw bytes of a PDF (an `ArrayBuffer`/`Uint8Array`) and gives you an
editable document object. `save` does the reverse. Almost everything else hangs off `doc`.

### 3.2 `PDFForm`: the collection of fillable fields

```js
const form = doc.getForm();
const fields = form.getFields();          // every field in the document
const field  = form.getTextField("Name"); // one field by its exact name
```

A PDF's interactive fields live in a structure called the **AcroForm**. `pdf-lib` wraps it
as a `PDFForm`. Every field has a **unique name** (unique across the whole document; this
matters later, see §6.3).

### 3.3 Field types

Each field is one of a few classes. We care about three:

- **`PDFTextField`**: a text box. `field.setText("Gandalf")`, `field.setFontSize(8)`,
  `field.enableMultiline()`.
- **`PDFCheckBox`**: a checkbox. `field.check()` / `field.uncheck()`.
- **`PDFButton`**: a push-button. We use it only for the portrait image slot:
  `button.setImage(image)`.

We frequently `instanceof`-check before acting, because a name might resolve to the wrong
type, e.g.:

```js
if ( !(field instanceof PDFLib.PDFTextField) ) { /* warn and skip */ }
```

### 3.4 Widgets, `acroField`, and rectangles

A *field* is the logical thing (the value "Strength save"). A **widget** is its visual
appearance on a page (the rectangle you see). A field can, in principle, have several
widgets. `pdf-lib`'s friendly `PDFTextField` wrapper hides the widget, but sometimes we
need the low-level details, so we drop down to `field.acroField`:

```js
const widget = field.acroField.getWidgets()[0];  // the first (usually only) widget
const rect   = widget.getRectangle();            // { x, y, width, height } in PDF points
const pageRef = widget.P();                       // which page the widget lives on
```

We use this to find out **exactly where a field sits on the page** so we can draw our own
text there, resize it, or hide it. See §5 and §6.

### 3.5 The coordinate system (this trips everyone up)

PDF coordinates are measured in **points** (1 point = 1/72 inch). A US-Letter page is
`612 × 792` points. Crucially, **the origin `(0,0)` is the bottom-left corner**, and `y`
increases *upward*, the opposite of screen/HTML coordinates. So when we draw text down a
box we *decrease* `y` line by line (see `drawFeatureBlocks`, `y -= lineHeight`).

---

## 4. The architecture: filler classes

All filling is done by a small class hierarchy in [main.mjs](scripts/main.mjs). Each class
knows how to populate one *layout* of sheet.

```
SheetFiller            ← base: 2014 official sheet + all shared low-level helpers
 └── Sheet2024Filler   ← 2024 official sheet (very different layout, 2 pages)
```

- **`SheetFiller`** holds the template-agnostic toolbox: `create`, `save`, `text`, `check`,
  `resizeField`, `drawFeatureBlocks`, `addTextField`, `embedPortrait`, etc. Its own
  `fillActor` fills the **2014** layout.
- **`Sheet2024Filler`** overrides `fillActor` for the 2024 sheet and adds the
  spell-overflow-page logic.

`templateConfig(key)` maps a layout key (`"2024"` or `"2014"`) to the right filler class and to
the PDF path, which is read from the client setting holding the user's own copy of that sheet. An
unrecognised key falls back to the default (`"2024"`), so a setting left behind by an older version
still resolves. The path is an empty string until the user supplies a file; `generatePdf` checks for
that and shows a notification rather than trying to fetch nothing.

### 4.1 The lifecycle of one export

`generatePdf(actor, template)` ([main.mjs:369](scripts/main.mjs#L369)) is the whole story:

```js
const { path, Filler } = templateConfig(template);
const filler = await Filler.create(path);   // 1. load template, read its fields
await filler.fillActor(actor);              // 2. write actor data into fields
const bytes  = await filler.save();         // 3. serialise the finished PDF
downloadBytes(bytes, `${actor.name} - Character Sheet.pdf`);  // 4. download
```

### 4.2 `create`: loading a template

`SheetFiller.create` ([main.mjs:466](scripts/main.mjs#L466)) does the setup work:

1. `fetch` the template bytes (via `foundry.utils.getRoute` so it works under a route
   prefix), unless bytes were passed directly via the optional `pdfBytes` argument.
2. `PDFDocument.load(pdfBytes)` → `filler.doc`.
3. `doc.getForm()` → `filler.form`.
4. Embed two standard fonts (Helvetica + Helvetica-Bold) for direct drawing (§5).
5. Build a **normalized field index** (`#index`); see §4.3.

### 4.3 Field maps and name normalization

We never hard-code field names inside the fill logic. Instead the **field-map** files
export objects that map a friendly key to the real PDF field name:

```js
// field-map-2014.mjs
export const ABILITIES = {
  str: { score: "STR", mod: "STRmod", save: "ST Strength", saveProf: "Check Box 11" },
  ...
};
```

The official WotC PDFs have messy field names, including **stray whitespace** like
`"Race "` or `"SpellSaveDC  2"`. To make lookups robust, `create` builds `#index`, a `Map`
keyed by the **normalized** name (`normalize` = lowercase + all whitespace stripped,
[main.mjs:489](scripts/main.mjs#L489)). Every helper looks fields up through this index, so
the maps can use clean names and still match a field named `"Race "`.

---

## 5. Two ways to put content on the page

This is the single most important idea in the module. There are **two fundamentally
different ways** we get content onto the PDF, and knowing which is being used explains most
of the code.

### 5.1 Filling a form field (the normal path)

Set the value of an existing field. The value stays **editable** in a PDF reader.

```js
this.text("STR", 18);          // text() helper → field.setText("18")
this.check("Check Box 11");    // check() helper → field.check()
```

- `text(name, value, { fontSize })` ([main.mjs:506](scripts/main.mjs#L506)) looks the
  field up in `#index`, verifies it is a `PDFTextField`, optionally sets a font size, and
  writes the string. **Silently warns and skips** unknown fields; this is deliberate, so a
  missing field on one template variant never aborts a whole export.
- `check(name, checked)` ([main.mjs:529](scripts/main.mjs#L529)) is the checkbox equivalent.

**Font size gotcha:** some template fields have no default appearance (`/DA`) entry, so
`field.setFontSize()` throws. `text()` catches that and writes a `/DA` string by hand:

```js
field.acroField.setDefaultAppearance(`/Helv ${fontSize} Tf 0 g`);
```

### 5.2 Drawing directly onto the page (the special path)

Sometimes a form field is not enough, and we paint text straight onto the page with
`page.drawText(...)`. This content is **baked into the page**, not editable afterwards.

We do this for the **Features & Traits** blocks (`drawFeatureBlocks`,
[main.mjs:761](scripts/main.mjs#L761)) for one reason: **a single form field can only use
one font**, but we want a **bold feature name followed by regular description text** in the
same box. Mixed fonts inside one field are impossible, so we draw the text ourselves using
the two fonts we embedded in `create`.

`drawFeatureBlocks` is worth reading closely because it demonstrates the manual-layout
techniques:

- **Find the box.** `#fieldBox(name)` ([main.mjs:817](scripts/main.mjs#L817)) resolves a
  field to `{ page, rect }` using the widget rectangle (§3.4), then **hides the field**
  (see §6.4) so the empty box art can't paint over our drawn text.
- **Flow across multiple boxes.** The 2014 sheet has a Features box on page 1 and an
  "Additional Features" box on page 2; content that fills the first continues in the second.
  The `carry` variable holds the leftover of a segment that didn't fit so the next box can
  resume it.
- **Word-wrap manually.** `wrapText(text, font, size, maxWidth)`
  ([main.mjs:1483](scripts/main.mjs#L1483)) is a greedy word-wrapper that measures each
  candidate line with `font.widthOfTextAtSize(...)`. It even hard-splits single words longer
  than a line. There is no automatic wrapping when you `drawText`, so we must do it ourselves.
- **Track `y` downward.** Remember the origin is bottom-left (§3.5), so each drawn line
  subtracts `lineHeight` from `y`, and we stop when `y` would drop below the box bottom.

The function returns the number of sections that **didn't fit**; the caller logs a console
warning so nothing silently disappears without a trace.

---

## 6. The advanced `pdf-lib` techniques, explained

These are the parts most likely to confuse a newcomer. Each solves a real limitation of the
PDF form model.

### 6.1 Embedding fonts

```js
filler.fonts = {
  regular: await doc.embedFont(PDFLib.StandardFonts.Helvetica),
  bold:    await doc.embedFont(PDFLib.StandardFonts.HelveticaBold)
};
```

The 14 "standard" PDF fonts (Helvetica, Times, Courier, …) need no font file. We embed them
once so `drawText` and `widthOfTextAtSize` can use them. **Caveat:** standard fonts are
**WinAnsi-encoded** and cannot render arbitrary Unicode, hence §6.6.

### 6.2 Embedding the portrait image

`embedPortrait` ([main.mjs:587](scripts/main.mjs#L587)) puts the actor's picture into a
push-button field named `"CHARACTER IMAGE"`:

```js
const image  = await doc.embedPng(png);
button.setImage(image);
```

`pdf-lib` can only embed **PNG or JPEG**. Foundry portraits can be webp, svg, etc., so
`loadImageAsPng` loads the image into an `<img>`, paints it onto a `<canvas>`, and re-encodes it as
PNG bytes via `canvas.toBlob`. Only the 2014 sheet has this button; the 2024 sheet has no portrait
slot, so `embedPortrait` finds no button and leaves the document alone.

### 6.3 Field names must be unique, and why that matters for overflow pages

Every field in a PDF must have a **globally unique name**. This becomes a real constraint on
the 2024 sheet: if an actor knows more than the 30 spells the printed table holds, we append
**extra copies of page 2**. But you cannot just copy a page and keep its fields; you'd have
two fields both named `"Spell 5 Name"`, which is invalid.

`#addSpellOverflowPages` ([main.mjs:1262](scripts/main.mjs#L1262)) solves this:

```js
// 1. Read the ORIGINAL page-2 field positions first (before copying anything).
const rowRects = SPELL_ROWS_24.map(row => ({ name: this.fieldRect(row.name), ... }));

// 2. Copy page 2 and strip its interactive fields (the page's "Annots").
const [copy] = await this.doc.copyPages(this.doc, [1]);
copy.node.delete(PDFLib.PDFName.of("Annots"));
const page = this.doc.addPage(copy);

// 3. Create fresh, uniquely-named fields at those same positions.
const prefix = `Overflow ${this.doc.getPageCount()}`;
this.addTextField(page, `${prefix} Spell ${i} Name`, rowRects[i].name, spellName);
```

Key points:

- We read the rectangles **before** copying, from the still-intact original page.
- `copyPages` duplicates the printed artwork; deleting the `Annots` array removes the
  interactive fields, leaving only the background.
- The page number in `prefix` guarantees uniqueness across several overflow pages.
- Every row gets a field, even blank ones, so the whole table stays fillable by hand.

### 6.4 Hiding a field's widget

When we draw feature text directly onto the page (§5.2), the empty form field would still be
there and, in some viewers, its opaque appearance paints a white rectangle over our text. So
in `#fieldBox` we set the widget's **annotation flags** to `2` (the "Hidden" bit) at the raw
dictionary level, and mark the field read-only:

```js
widget.dict.set(PDFLib.PDFName.of("F"), PDFLib.PDFNumber.of(2)); // F = flags, 2 = Hidden
field.enableReadOnly();
```

`PDFName` and `PDFNumber` are low-level `pdf-lib` object types used when you manipulate the
raw PDF dictionary directly. You only reach for them when the high-level API has no method
for what you need; here, setting a raw annotation flag.

### 6.5 Resizing and creating fields

- `resizeField(name, { x, y, width, height, multiline })` moves/grows an existing field's widget
  rectangle and optionally turns on multiline. Used where a template ships a single-line field
  inside a box printed for two lines — the 2024 Tools field is the one live case, grown in
  `Sheet2024Filler`'s `#fillProficiencies`.
- `addTextField(page, name, rect, value, opts)`
  ([main.mjs:882](scripts/main.mjs#L882)) and `addCheckBox`
  ([main.mjs:908](scripts/main.mjs#L908)) create **brand-new** fields (used on overflow
  pages). Note the transparent styling (`borderColor`/`backgroundColor` left `undefined`)
  so the printed template art shows through instead of a white box.

### 6.6 WinAnsi sanitization

Because our embedded standard fonts are WinAnsi-encoded, characters outside that set (smart
quotes, em-dashes, ellipses, emoji…) will make `pdf-lib` throw when drawn or, worse, render
as garbage. `sanitizeWinAnsi` ([main.mjs:1516](scripts/main.mjs#L1516)) replaces the common
offenders (`'` `'` → `'`, `—` → `-`, `…` → `...`) and drops anything still unrepresentable.
Always run text through it before `drawText`; `addTextField` and `wrapText` already do.

### 6.7 HTML → plain text

Foundry stores biographies, ideals, etc. as **rich-text HTML**. Form fields hold plain text
only, so `stripHtml` ([main.mjs:1562](scripts/main.mjs#L1562)) parses the HTML in a throwaway
`<div>`, turns `</p>`/`<br>` into newlines, and returns `textContent`.

---

## 7. Saving and downloading

`save()` ([main.mjs:493](scripts/main.mjs#L493)) is just `doc.save()`, returning a
`Uint8Array` of the finished PDF.

`downloadBytes(bytes, filename)` ([main.mjs:417](scripts/main.mjs#L417)) turns those bytes
into a browser download. Two subtleties are load-bearing and were bug fixes; **don't
"simplify" them away**:

- The Blob uses the real `type: "application/pdf"` (not `octet-stream`) so browsers honour
  the `.pdf` filename; Safari in particular drops it otherwise.
- The anchor element and object URL are cleaned up on a **40-second timeout**, not
  synchronously. Removing them immediately cancels the download in some browsers, causing the
  old "the PDF opens on screen but can't be saved" bug.

---

## 8. Debugging: `generateDebugPdf`

When you need to discover or verify the field names on a template, run this from the browser
console:

```js
game.modules.get("sogrom-dnd5e-character-sheet-pdf").api.generateDebugPdf("2024")
```

`generateDebugPdf` writes a sequential number into every text field, ticks every checkbox,
`console.table`s the number → field-name mapping, and downloads the result. Match the numbers you
see on the generated PDF against the table to map a printed box to its field name; this is how the
field maps were built. It fills the same user-supplied template as a normal export, so the sheet you
are debugging must already be provided.

---

## 9. Common pitfalls checklist

- **`pdf-lib is not loaded`**: the global `PDFLib` isn't present. Check `module.json`'s
  `scripts` array still lists `lib/pdf-lib.min.js` and that the file exists.
- **A value doesn't appear on the sheet**: almost always a field-name mismatch. Look for a
  `Unknown text field "…"` / `Unknown checkbox "…"` warning in the console, then fix the name
  in the relevant field map (remember lookups are whitespace/case-insensitive).
- **Text throws or renders as `□`**: a non-WinAnsi character reached a font. Route it through
  `sanitizeWinAnsi`.
- **Drawn text is invisible / covered by a white box**: the field widget wasn't hidden;
  ensure the box came from `#fieldBox` (which hides it) rather than `fieldRect`.
- **"field already exists" on overflow pages**: a duplicate field name. Every created field
  must be unique; keep the `Overflow <pageCount>` prefix.
- **Coordinates look upside-down**: remember `(0,0)` is bottom-left and `y` grows upward.
- **The download opens in the viewer but won't save**: don't shorten the cleanup timeout in
  `downloadBytes`; see §7.

---

## 10. Tests: what to run and when

The project is **dependency-free**: there is no `package.json`, no `npm install`, no build
step. Tests use **Node's built-in test runner**, so all you need is Node **18+** (CI pins
**20**). Run everything from the repo root with one command:

```
node --test
```

That discovers and runs every `*.test.mjs` file under [test/](test/). **Always run it before
you commit or open a PR**; it is exactly what CI runs (§11), so a green local run means a
green CI run.

### 10.1 The two test files

| File | What it guards |
| --- | --- |
| [test/helpers.test.mjs](test/helpers.test.mjs) | The pure formatting/parsing helpers exported from `main.mjs`: `signed`, `castingTimeAbbr`, `spellRowInfo`, `weaponNotes`, `damageSummary`, `sanitizeWinAnsi`, `wrapText`, and `SheetFiller.normalize`. |
| [test/field-map.test.mjs](test/field-map.test.mjs) | The 2014 and 2024 field-name maps: that they are internally consistent (no duplicate/typo'd names, expected keys present). |

### 10.2 Why the tests are shaped this way

- **Importing `main.mjs` in Node is safe.** Its Foundry hook registration is guarded behind
  `if ( globalThis.Hooks )`, and the `PdfExportDialog` class is only defined when the
  `foundry` global exists. Neither is present under Node, so `import`ing the module just
  gives you the exported pure functions and filler classes, no Foundry required.
- **There is no structural test of a template PDF, and there cannot be.** Both sheets are
  copyrighted and supplied by the user, so no template exists in the repo for a test to load.
  The field maps and the real PDFs agree *only* through field names, and nothing in CI verifies
  that agreement — a rename on WotC's side surfaces at runtime as an `Unknown text field "…"`
  console warning and a blank box on the sheet. That warning is the safety net; see §9.

### 10.3 A quick sanity checklist before pushing

1. `node --test`: all green.
2. If you touched a field map, export a real sheet in Foundry and check the console for
   `Unknown text field` / `Unknown checkbox` warnings.
3. If you touched `module.json` or a `lang/*.json`, they're still valid JSON (CI runs
   `jq empty` on them, see §11).

---

## 11. GitHub workflows (CI & release)

There are two GitHub Actions workflows, in [.github/workflows/](.github/workflows/). They do
completely different jobs and fire on different events.

### 11.1 `ci.yml`: runs on every push and pull request

[.github/workflows/ci.yml](.github/workflows/ci.yml) is the gate on all branches. It has one
`check` job on `ubuntu-latest` with Node 20, and mirrors §10's local checks so nothing
reaches `main` broken:

1. **Validate JSON**: `jq empty module.json` and every `lang/*.json`. Foundry parses these
   at load with no build step to catch a stray comma, so CI catches it first.
2. **Syntax-check scripts**: `node --check` on each `scripts/*.mjs` (does not execute them;
   `lib/` is skipped because it holds the minified `pdf-lib` vendor bundle).
3. **Run tests**: `node --test` (the §10 suite).

Because the toolchain is dependency-free, there is no `npm install` step and CI is fast. **If
CI is red, the fix is almost always reproducible locally** by running the same three commands.

### 11.2 `main.yml`: runs only when a GitHub Release is published

[.github/workflows/main.yml](.github/workflows/main.yml) builds and attaches the distributable
`module.zip`. It triggers **only** on `release: [published]`, not on pushes, not on tags
alone. Its steps:

1. **Extract the version from the release tag.** The tag must be `v<major>.<minor>.<patch>`
   or `<major>.<minor>.<patch>` (e.g. `v1.2.3` or `1.2.3`); the leading `v` is stripped.
2. **Token-replace `module.json`.** The committed manifest ships with placeholder tokens:
   `#{VERSION}#`, `#{URL}#`, `#{MANIFEST}#`, `#{DOWNLOAD}#`, which this step fills with the
   real version and the release's manifest/download URLs. This edit is in-CI only and is
   **not** committed back.
3. **Validate the manifest** again with `jq empty` after substitution.
4. **Zip the module**: `module.json`, `README.md`, `LICENSE`, `scripts/`, `lib/`, `lang/`,
   `styles/`. **Note what is *not* shipped:** `test/`, `docs/`, and this file. There is no
   `templates/` directory — the sheets are user-supplied (§1). If you add a new top-level
   directory the module needs at runtime, you must add it to the `zip` step or it won't reach
   users.
5. **Attach `module.json` + `module.zip`** to the GitHub release.

Foundry's install/update check reads the `latest_manifest_url`
(`…/releases/latest/download/module.json`), so that URL must stay stable across releases.

### 11.3 How to cut a release

1. Make sure `main` is green in CI.
2. On GitHub, **Draft a new release**, create a tag in the `1.2.3` / `v1.2.3` format, write
   the release notes, and **Publish**.
3. `main.yml` runs automatically, fills the manifest tokens, builds `module.zip`, and
   attaches both files to the release.
4. Update the module's entry on FoundryVTT's admin site if the manifest URL is new.

> There is **no version number to bump by hand** in `module.json`; it stays as the
> `#{VERSION}#` token and is filled from the release tag at build time. Editing it to a real
> number would break the release substitution.

### 11.4 Dependabot

[.github/dependabot.yml](.github/dependabot.yml) keeps the GitHub Actions versions (e.g.
`actions/checkout`, `actions/setup-node`) up to date via automated PRs. Those PRs run through
`ci.yml` like any other.

---

## 12. Further reading

- `pdf-lib` docs & API: <https://pdf-lib.js.org/>
- PDF form (AcroForm) basics: the concepts of *fields*, *widgets*, and *annotation flags* in
  the PDF spec map directly onto the `pdf-lib` objects described in §3-§6.
