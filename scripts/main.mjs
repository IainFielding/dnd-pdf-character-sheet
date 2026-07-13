import { ABILITIES, SKILLS, DEATH_SAVES, WEAPON_ROWS, SPELL_LEVELS, slotFields, FIELDS } from "./field-map-2014.mjs";
import {
  ABILITIES as ABILITIES_24, SKILLS as SKILLS_24, DEATH_SAVES as DEATH_SAVES_24,
  WEAPON_ROWS as WEAPON_ROWS_24, ARMOR_TRAINING as ARMOR_TRAINING_24,
  SPELL_SLOT_TOTALS as SPELL_SLOT_TOTALS_24, SPELL_ROWS as SPELL_ROWS_24, FIELDS as F24
} from "./field-map-2024.mjs";

const MODULE_ID = "sogrom-dnd5e-character-sheet-pdf";
const TEMPLATE_DIR = `modules/${MODULE_ID}/templates`;
const DEFAULT_TEMPLATE = "fantasy2024";

/**
 * The two official Wizards of the Coast sheets. Their PDFs are copyrighted, so this module cannot
 * bundle them; instead the user downloads each from D&D Beyond and points the matching client
 * setting at their own copy. Each entry drives the export dialog (label, download link, which
 * setting stores the user's file); {@link templateConfig} pairs the key with its filler class.
 * @type {Record<string, {label: string, url: string, setting: string}>}
 */
const OFFICIAL_TEMPLATES = {
  "2024": {
    label: "SDPDF.Settings.Template.Choice2024",
    url: "https://media.dndbeyond.com/compendium-images/free-rules/ph/character-sheet.pdf",
    setting: "officialPath2024"
  },
  "2014": {
    label: "SDPDF.Settings.Template.Choice2014",
    url: "https://media.dndbeyond.com/compendium-images/marketing/dnd_5e_charactersheet_formfillable.pdf",
    setting: "officialPath2014"
  }
};

/**
 * Resolve a template key to its PDF file path and the filler class that understands its layout.
 * Looked up when a PDF is generated rather than at module load, because the filler classes are
 * defined further down this file and do not exist yet while the top of the file is evaluating.
 * The two Fan Content layouts ship with the module; the official 2014/2024 sheets cannot be
 * distributed, so their path comes from the client setting the user pointed at their own download.
 * @param {string} key  "2024", "2014", "square2024" or "fantasy2024".
 * @returns {{path: string, Filler: typeof SheetFiller, official: boolean}}
 */
function templateConfig(key) {
  const official = OFFICIAL_TEMPLATES[key];
  if ( official ) {
    const Filler = (key === "2014") ? SheetFiller : Sheet2024Filler;
    return { path: game.settings.get(MODULE_ID, official.setting), Filler, official: true };
  }
  if ( key === "square2024" ) return { path: `${TEMPLATE_DIR}/DnD_Square_2024_Character-Sheet.pdf`, Filler: SquareSheet2024Filler, official: false };
  // Our own hand-drawn Fantasy Sheet for the 2014 rules: it reuses the 2014 field names, so the base
  // 2014 SheetFiller (which already embeds the portrait button) populates it unchanged.
  if ( key === "fantasy2014" ) return { path: `${TEMPLATE_DIR}/DnD_Fantasy_2014_Character-Sheet.pdf`, Filler: SheetFiller, official: false };
  // Fantasy Sheet (2024), the {@link DEFAULT_TEMPLATE}. An unrecognised key also lands here, so a
  // stale or malformed setting falls back to the default layout rather than failing to export.
  if ( key !== DEFAULT_TEMPLATE ) console.warn(`${MODULE_ID} | Unknown template "${key}", using ${DEFAULT_TEMPLATE}`);
  return { path: `${TEMPLATE_DIR}/DnD_Fantasy_2024_Character-Sheet.pdf`, Filler: SquareSheet2024Filler, official: false };
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

// Hooks only exist inside Foundry; the guard keeps this module importable from test harnesses.
if ( globalThis.Hooks ) {
  Hooks.once("init", () => {
    // Remembers the layout chosen last time so the export dialog can pre-select it. Not shown in the
    // settings UI (config: false) because the choice is made in the export dialog, where the two
    // official layouts only appear once the user has supplied their own copy of the PDF.
    game.settings.register(MODULE_ID, "template", {
      scope: "client",
      config: false,
      type: String,
      default: DEFAULT_TEMPLATE
    });

    // Paths to the user's own copies of the copyrighted official sheets, set via the file browser in
    // the export dialog. Empty until supplied, which is what hides those options in the dialog.
    for ( const { setting } of Object.values(OFFICIAL_TEMPLATES) ) {
      game.settings.register(MODULE_ID, setting, {
        scope: "client",
        config: false,
        type: String,
        default: ""
      });
    }

    const module = game.modules.get(MODULE_ID);
    module.api = {
      // Open the layout picker, then generate the chosen sheet.
      promptPdf: actor => PdfExportDialog.open(actor),
      // Generate straight to a chosen (or the remembered) layout, skipping the dialog.
      generatePdf: (actor, template) => generatePdf(actor, template),
      // Developer tooling, namespaced off the main surface so it reads as intentional rather than
      // part of the supported API. See {@link generateDebugPdf}.
      debug: { generateFieldMap: template => generateDebugPdf(template) }
    };
  });

  /** Add a "PDF Character Sheet" entry to the Actor directory context menu. */
  Hooks.on("getActorContextOptions", (application, options) => {
    options.push({
      name: "SDPDF.ContextMenuLabel",
      icon: '<i class="fa-solid fa-file-pdf"></i>',
      condition: li => {
        const actor = game.actors.get(li.dataset.entryId);
        return (actor?.type === "character") && actor.testUserPermission(game.user, "OBSERVER");
      },
      callback: li => {
        const actor = game.actors.get(li.dataset.entryId);
        if ( actor ) PdfExportDialog.open(actor);
      }
    });
  });

  /**
   * Add a matching "PDF Character Sheet" control to the actor sheet's own header menu. The hook
   * fires for every ApplicationV2, so it is guarded to character actor sheets the user can observe.
   * The icon class and label match the Actors sidebar entry above; `onClick` is honoured both when
   * the control renders as a header button and inside the dnd5e header controls dropdown menu.
   */
  Hooks.on("getHeaderControlsApplicationV2", (application, controls) => {
    const actor = application.document;
    if ( (actor?.documentName !== "Actor") || (actor.type !== "character") ) return;
    if ( !actor.testUserPermission(game.user, "OBSERVER") ) return;
    controls.push({
      icon: "fa-solid fa-file-pdf",
      label: "SDPDF.ContextMenuLabel",
      action: "generatePdfCharacterSheet",
      onClick: () => PdfExportDialog.open(actor)
    });
  });
}

/* -------------------------------------------- */
/*  Export dialog                               */
/* -------------------------------------------- */

/**
 * The layouts offered by the export dialog, grouped by rules edition and shown in this order. Within
 * each group the official WotC sheet comes first (a download/browse prompt until the user supplies
 * their own copy), followed by the bundled Fantasy/Square sheets. The 2024 group leads because the
 * default layout ({@link DEFAULT_TEMPLATE}) lives there.
 */
const EXPORT_GROUPS = [
  { label: "SDPDF.Export.Group2024", keys: ["2024", "fantasy2024", "square2024"] },
  { label: "SDPDF.Export.Group2014", keys: ["2014", "fantasy2014"] }
];

/** Non-official layouts always available for export, keyed by the same layout key. */
const BUNDLED_LABELS = {
  fantasy2024: "SDPDF.Settings.Template.ChoiceFantasy2024",
  fantasy2014: "SDPDF.Settings.Template.ChoiceFantasy2014",
  square2024: "SDPDF.Settings.Template.ChoiceSquare2024"
};

/**
 * Presentation metadata for each layout card in the export dialog: the Font Awesome icon that
 * fronts the card, the localization key for its one-line description, and the badge tone
 * ("ready" for the bundled sheets, "official" for the WotC ones). Kept separate from the
 * label/availability logic so the visuals can be tweaked without touching the picker behaviour.
 */
const LAYOUT_META = {
  fantasy2024: { icon: "fa-dragon", desc: "SDPDF.Export.DescFantasy2024", badge: "ready" },
  fantasy2014: { icon: "fa-shield-halved", desc: "SDPDF.Export.DescFantasy2014", badge: "ready" },
  square2024:  { icon: "fa-feather-pointed", desc: "SDPDF.Export.DescSquare2024", badge: "ready" },
  "2024":      { icon: "fa-scroll", desc: "SDPDF.Export.Desc2024", badge: "official" },
  "2014":      { icon: "fa-book-open", desc: "SDPDF.Export.Desc2014", badge: "official" }
};

/**
 * ApplicationV2 window shown when the user asks to export a sheet. It lists the layouts they can
 * generate — the two bundled Fan Content sheets always, plus either official sheet the user has
 * supplied a copy of — and, for an official sheet not yet supplied, a download link and a file
 * browser button so they can point the module at their own copy. Only defined inside Foundry, where
 * the ApplicationV2 base class exists; the module is also imported by the Node test harness, which
 * has no `foundry` global.
 */
let PdfExportDialog;
if ( globalThis.foundry?.applications?.api?.ApplicationV2 ) {
  PdfExportDialog = class PdfExportDialog extends foundry.applications.api.ApplicationV2 {
    /**
     * @param {Actor} actor  Character actor whose sheet will be exported.
     * @param {object} [options]
     */
    constructor(actor, options={}) {
      super(options);
      this.actor = actor;
      // The layout to pre-select: the one remembered from last time if it is currently available,
      // otherwise the default. Updated as the user browses for or picks a layout.
      this.selected = game.settings.get(MODULE_ID, "template");
      if ( !this.#available(this.selected) ) this.selected = DEFAULT_TEMPLATE;
    }

    /** Open the export dialog for an actor. */
    static open(actor) {
      if ( !actor ) return;
      new PdfExportDialog(actor).render(true);
    }

    /* -------------------------------------------- */

    /** Whether a layout key can be generated right now (bundled sheets always; official only if supplied). */
    #available(key) {
      const official = OFFICIAL_TEMPLATES[key];
      return official ? !!game.settings.get(MODULE_ID, official.setting) : (key in BUNDLED_LABELS);
    }

    /* -------------------------------------------- */

    async _renderHTML() {
      const L = key => game.i18n.localize(key);
      const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      const badge = (tone, key) => `<span class="sdpdf-badge sdpdf-badge--${tone}">${L(key)}</span>`;

      // One card per layout: a selectable radio card when it can be generated, or a
      // download/browse prompt for an official sheet the user has not supplied yet.
      const card = key => {
        const official = OFFICIAL_TEMPLATES[key];
        const meta = LAYOUT_META[key];
        const label = L(official ? official.label : BUNDLED_LABELS[key]);
        const desc = L(meta.desc);
        const icon = `<span class="sdpdf-card-icon"><i class="fa-solid ${meta.icon}"></i></span>`;

        if ( this.#available(key) ) {
          const checked = (key === this.selected) ? " checked" : "";
          const tone = official ? "official" : "ready";
          const badgeKey = official ? "SDPDF.Export.BadgeOfficial" : "SDPDF.Export.BadgeReady";
          // A supplied official sheet shows the file it points at plus a "Change" control, so a
          // wrong pick can be re-pointed here (the Browse button on the locked card is gone once
          // a file is set). The button reuses the same browse action as the locked card.
          let fileRow = "";
          if ( official ) {
            const filePath = game.settings.get(MODULE_ID, official.setting);
            const fileName = filePath.split(/[\\/]/).pop();
            fileRow = `<span class="sdpdf-card-file">
              <i class="fa-solid fa-paperclip"></i>
              <span class="sdpdf-card-filename" title="${esc(filePath)}">${esc(fileName)}</span>
              <button type="button" class="sdpdf-card-change" data-action="browse" data-key="${key}">${L("SDPDF.Export.Change")}</button>
            </span>`;
          }
          return `<label class="sdpdf-card">
            <input type="radio" name="template" value="${key}"${checked}>
            ${icon}
            <span class="sdpdf-card-body">
              <span class="sdpdf-card-head">
                <span class="sdpdf-card-name">${label}</span>
                ${badge(tone, badgeKey)}
              </span>
              <span class="sdpdf-card-desc">${desc}</span>
              ${fileRow}
            </span>
            <span class="sdpdf-card-check"><i class="fa-solid fa-circle-check"></i></span>
          </label>`;
        }

        return `<div class="sdpdf-card is-locked">
          ${icon}
          <span class="sdpdf-card-body">
            <span class="sdpdf-card-head">
              <span class="sdpdf-card-name">${label}</span>
              ${badge("locked", "SDPDF.Export.BadgeLocked")}
            </span>
            <span class="sdpdf-card-desc">${L("SDPDF.Export.NotProvided")}
              <a href="${official.url}" target="_blank" rel="noopener">${L("SDPDF.Export.Download")}</a>
            </span>
            <span class="sdpdf-card-actions">
              <button type="button" class="sdpdf-btn sdpdf-btn-ghost" data-action="browse" data-key="${key}">
                <i class="fa-solid fa-folder-open"></i> ${L("SDPDF.Export.Browse")}
              </button>
            </span>
          </span>
        </div>`;
      };

      const groups = EXPORT_GROUPS.map(group => `<section class="sdpdf-group">
          <h3 class="sdpdf-group-title">${L(group.label)}</h3>
          <div class="sdpdf-options">${group.keys.map(card).join("")}</div>
        </section>`).join("");

      const name = esc(this.actor?.name);

      return `<header class="sdpdf-hero">
          <span class="sdpdf-hero-icon"><i class="fa-solid fa-file-pdf"></i></span>
          <span class="sdpdf-hero-text">
            <span class="sdpdf-hero-title">${L("SDPDF.Export.HeroTitle")}</span>
            <span class="sdpdf-hero-sub">${game.i18n.format("SDPDF.Export.HeroSub", { name })}</span>
          </span>
        </header>
        ${groups}
        <footer class="sdpdf-footer">
          <button type="button" class="sdpdf-btn sdpdf-btn-ghost" data-action="cancel">
            <i class="fa-solid fa-xmark"></i> ${L("Cancel")}
          </button>
          <button type="button" class="sdpdf-btn sdpdf-btn-primary" data-action="export">
            <i class="fa-solid fa-file-arrow-down"></i> ${L("SDPDF.Export.Confirm")}
          </button>
        </footer>`;
    }

    /* -------------------------------------------- */

    _replaceHTML(result, content) {
      content.innerHTML = result;
    }

    /* -------------------------------------------- */

    /** Read the layout the user currently has selected in the form, if any, into {@link selected}. */
    #syncSelection() {
      const checked = this.element?.querySelector('input[name="template"]:checked');
      if ( checked ) this.selected = checked.value;
    }

    /* -------------------------------------------- */

    /**
     * Browse for a downloaded official-sheet PDF and, once chosen, store its path so the layout
     * becomes an available option and re-render with it selected.
     * @this {PdfExportDialog}
     */
    static async _onBrowse(_event, target) {
      const key = target.dataset.key;
      const official = OFFICIAL_TEMPLATES[key];
      if ( !official ) return;
      this.#syncSelection();
      const current = game.settings.get(MODULE_ID, official.setting);
      const picker = new foundry.applications.apps.FilePicker.implementation({
        type: "any",
        current: current || undefined,
        callback: async path => {
          await game.settings.set(MODULE_ID, official.setting, path);
          this.selected = key;
          this.render();
        }
      });
      await picker.browse();
    }

    /* -------------------------------------------- */

    /**
     * Remember the chosen layout, close the dialog and generate the sheet.
     * @this {PdfExportDialog}
     */
    static async _onExport() {
      this.#syncSelection();
      const template = this.selected;
      await game.settings.set(MODULE_ID, "template", template);
      const actor = this.actor;
      await this.close();
      generatePdf(actor, template);
    }

    /* -------------------------------------------- */

    /** @this {PdfExportDialog} */
    static _onCancel() {
      this.close();
    }

    /* -------------------------------------------- */

    // Declared last so it can reference the static action handlers defined above.
    static DEFAULT_OPTIONS = {
      id: "sdpdf-export-dialog",
      tag: "div",
      classes: ["sdpdf-export-dialog"],
      window: { title: "SDPDF.Export.Title", icon: "fa-solid fa-file-pdf" },
      position: { width: 540, height: "auto" },
      actions: {
        browse: PdfExportDialog._onBrowse,
        export: PdfExportDialog._onExport,
        cancel: PdfExportDialog._onCancel
      }
    };
  };
}

/* -------------------------------------------- */
/*  PDF generation                              */
/* -------------------------------------------- */

/**
 * Generate a filled character sheet PDF for the given actor and offer it as a download.
 * @param {Actor} actor
 * @param {string} [template]  Layout key ("2024", "2014", "square2024", "fantasy2024"). Defaults to the
 *                             layout remembered from the last export.
 */
async function generatePdf(actor, template=game.settings.get(MODULE_ID, "template")) {
  try {
    const { path, Filler, official } = templateConfig(template);
    if ( official && !path ) {
      ui.notifications.error(game.i18n.localize("SDPDF.Export.MissingOfficial"));
      return;
    }
    ui.notifications.info(game.i18n.format("SDPDF.Generating", { name: actor.name }));
    const filler = await Filler.create(path);
    await filler.fillActor(actor);
    const bytes = await filler.save();
    downloadBytes(bytes, `${actor.name} - Character Sheet.pdf`);
    ui.notifications.info(game.i18n.format("SDPDF.Done", { name: actor.name }));
  } catch(err) {
    console.error(`${MODULE_ID} | Failed to generate PDF`, err);
    ui.notifications.error(game.i18n.localize("SDPDF.Error"));
  }
}

/**
 * Debug helper: writes a sequential number into every text field, checks every checkbox and
 * logs the number -> field name mapping. Pass "2024" (default) or "2014" to pick the template.
 * Run from console:
 *   game.modules.get("sogrom-dnd5e-character-sheet-pdf").api.debug.generateFieldMap("2024")
 */
async function generateDebugPdf(template=DEFAULT_TEMPLATE) {
  const { path, Filler } = templateConfig(template);
  const filler = await Filler.create(path);
  const rows = [];
  let n = 1;
  for ( const field of filler.form.getFields() ) {
    try {
      if ( field instanceof PDFLib.PDFTextField ) {
        field.setText(String(n));
        rows.push({ number: n, field: field.getName() });
        n++;
      }
      else if ( field instanceof PDFLib.PDFCheckBox ) field.check();
    } catch(err) { /* Ignore un-fillable fields */ }
  }
  console.table(rows);
  downloadBytes(await filler.save(), "field-map-debug.pdf");
}

/**
 * Trigger a browser download of raw PDF bytes.
 * Works across Chrome, Edge, Firefox and Safari on Windows and macOS.
 */
function downloadBytes(bytes, filename) {
  if ( !filename.toLowerCase().endsWith(".pdf") ) filename += ".pdf";
  // Use the real application/pdf type so the download attribute's name and .pdf extension
  // are honoured (octet-stream / data: URLs make some browsers, notably Safari, drop them).
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  // Dispatch a full MouseEvent rather than a.click() for the widest browser support.
  a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  // Keep the anchor and object URL alive well past the click. Removing them synchronously
  // cancels the download, so the browser instead navigates to the blob and renders the PDF
  // inline with no way to save it — the original "opens on screen but can't save" symptom.
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 40_000);
}

/* -------------------------------------------- */
/*  Sheet filler                                */
/* -------------------------------------------- */

/**
 * Base filler plus the 2014-layout `fillActor`. The low-level helpers (`create`, `text`, `check`,
 * `drawFeatureBlocks`, …) are template-agnostic; {@link Sheet2024Filler} extends this class and
 * overrides `fillActor` for the very different 2024 layout.
 */
export class SheetFiller {
  /** @type {import("pdf-lib").PDFDocument} */
  doc;

  /** @type {import("pdf-lib").PDFForm} */
  form;

  /** Embedded standard fonts used for text drawn directly onto the page. */
  fonts;

  /** Whitespace-insensitive field lookup: some template field names have stray spaces. */
  #index = new Map();

  /**
   * @param {string} [templatePath]              Module-relative path to the template PDF to fill.
   * @param {ArrayBuffer|Uint8Array} [pdfBytes]  Template bytes; fetched from `templatePath` when omitted.
   */
  static async create(templatePath, pdfBytes) {
    if ( !globalThis.PDFLib ) throw new Error("pdf-lib is not loaded");
    if ( !pdfBytes ) {
      const response = await fetch(foundry.utils.getRoute(templatePath));
      if ( !response.ok ) throw new Error(`Could not load PDF template (${response.status})`);
      pdfBytes = await response.arrayBuffer();
    }
    const filler = new this();
    filler.doc = await PDFLib.PDFDocument.load(pdfBytes);
    filler.form = filler.doc.getForm();
    filler.fonts = {
      regular: await filler.doc.embedFont(PDFLib.StandardFonts.Helvetica),
      bold: await filler.doc.embedFont(PDFLib.StandardFonts.HelveticaBold)
    };
    for ( const field of filler.form.getFields() ) filler.#index.set(SheetFiller.normalize(field.getName()), field);
    return filler;
  }

  /**
   * Reduce a field name to a canonical lookup key: lowercase with all whitespace removed.
   * Some template field names contain stray spaces ("Race ", "SpellSaveDC  2"), so matching
   * on the normalized form lets the field maps use clean names.
   */
  static normalize(name) {
    return name.replace(/\s+/g, "").toLowerCase();
  }

  async save() {
    return this.doc.save();
  }

  /* -------------------------------------------- */

  /**
   * Set a text field, silently skipping unknown fields.
   * @param {string} name                Canonical field name.
   * @param {*} value                    Value to write. Nullish values are skipped.
   * @param {object} [options]
   * @param {number} [options.fontSize]  Fixed font size for large multiline blocks.
   */
  text(name, value, { fontSize } = {}) {
    if ( (value === null) || (value === undefined) ) return;
    const field = this.#index.get(SheetFiller.normalize(name));
    if ( !(field instanceof PDFLib.PDFTextField) ) {
      console.warn(`${MODULE_ID} | Unknown text field "${name}"`);
      return;
    }
    try {
      if ( fontSize ) {
        try {
          field.setFontSize(fontSize);
        } catch(err) {
          // Some template fields have no /DA entry; write one directly instead
          field.acroField.setDefaultAppearance(`/Helv ${fontSize} Tf 0 g`);
        }
      }
      field.setText(String(value));
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not fill field "${name}"`, err);
    }
  }

  /** Check (or uncheck) a checkbox field. */
  check(name, checked=true) {
    const field = this.#index.get(SheetFiller.normalize(name));
    if ( !(field instanceof PDFLib.PDFCheckBox) ) {
      console.warn(`${MODULE_ID} | Unknown checkbox "${name}"`);
      return;
    }
    try {
      if ( checked ) field.check();
      else field.uncheck();
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not set checkbox "${name}"`, err);
    }
  }

  /**
   * Adjust a text field's widget rectangle and/or enable multiline wrapping. Used where the
   * template ships a field smaller than the box printed around it. Omitted rectangle components
   * keep their current value. Call before {@link SheetFiller#text} so the appearance is regenerated.
   */
  resizeField(name, { x, y, width, height, multiline } = {}) {
    const field = this.#index.get(SheetFiller.normalize(name));
    if ( !(field instanceof PDFLib.PDFTextField) ) {
      console.warn(`${MODULE_ID} | Unknown text field "${name}"`);
      return;
    }
    try {
      if ( multiline ) field.enableMultiline();
      const widget = field.acroField.getWidgets()[0];
      const rect = widget.getRectangle();
      widget.setRectangle({ x: x ?? rect.x, y: y ?? rect.y, width: width ?? rect.width, height: height ?? rect.height });
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not resize field "${name}"`, err);
    }
  }

  /* -------------------------------------------- */

  /** Populate the form from a dnd5e character actor. */
  async fillActor(actor) {
    const system = actor.system;
    await this.embedPortrait(actor);
    this.#fillHeader(actor, system);
    this.#fillAbilitiesAndSkills(system);
    this.#fillCombat(actor, system);
    this.#fillWeapons(actor, system);
    this.#fillCurrencyAndInventory(actor, system);
    this.#fillProficiencies(actor, system);
    this.#fillFeatures(actor);
    this.#fillPersonality(actor, system);
    this.#fillSpellcasting(actor, system);
  }

  /* -------------------------------------------- */

  /**
   * Embed the actor's portrait into the "CHARACTER IMAGE" push-button, if the template has one.
   * Used by the 2014 sheet and the Square Sheet (2024); templates without the button are left alone.
   */
  async embedPortrait(actor) {
    const src = actor.img;
    if ( !src || (src === CONST.DEFAULT_TOKEN) ) return;
    try {
      const png = await loadImageAsPng(src);
      if ( !png ) return;
      const image = await this.doc.embedPng(png);
      const button = this.#index.get(SheetFiller.normalize("CHARACTER IMAGE"));
      if ( !(button instanceof PDFLib.PDFButton) ) return;
      button.setImage(image);
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not embed portrait image "${src}"`, err);
    }
  }

  /* -------------------------------------------- */

  #fillHeader(actor, system) {
    const details = system.details;
    const classes = sortedClasses(actor);
    const classLevel = classes.map(cls => {
      const subclass = cls.subclass?.name ? ` (${cls.subclass.name})` : "";
      return `${cls.name}${subclass} ${cls.system.levels}`;
    }).join(" / ");
    const player = game.users.find(u => !u.isGM && actor.testUserPermission(u, "OWNER"));

    this.text(FIELDS.characterName, actor.name);
    this.text(FIELDS.characterName2, actor.name);
    this.text(FIELDS.classLevel, classLevel);
    this.text(FIELDS.background, details.background?.name ?? details.background ?? "");
    this.text(FIELDS.playerName, player?.name ?? "");
    this.text(FIELDS.race, details.race?.name ?? details.race ?? "");
    this.text(FIELDS.alignment, details.alignment ?? "");
    this.text(FIELDS.xp, details.xp?.value ?? "");
  }

  /* -------------------------------------------- */

  #fillAbilitiesAndSkills(system) {
    for ( const [key, map] of Object.entries(ABILITIES) ) {
      const ability = system.abilities?.[key];
      if ( !ability ) continue;
      this.text(map.score, ability.value);
      this.text(map.mod, signed(ability.mod));
      const saveTotal = (typeof ability.save === "object") ? ability.save.value : ability.save;
      this.text(map.save, signed(saveTotal ?? 0));
      if ( ability.proficient >= 1 ) this.check(map.saveProf);
    }
    for ( const [key, map] of Object.entries(SKILLS) ) {
      const skill = system.skills?.[key];
      if ( !skill ) continue;
      this.text(map.field, signed(skill.total ?? 0));
      if ( (skill.proficient ?? skill.value) >= 1 ) this.check(map.prof);
    }
    this.text(FIELDS.passivePerception, system.skills?.prc?.passive ?? "");
  }

  /* -------------------------------------------- */

  #fillCombat(actor, system) {
    const attributes = system.attributes;
    this.text(FIELDS.inspiration, attributes.inspiration ? "X" : "");
    this.text(FIELDS.profBonus, signed(attributes.prof ?? 0));
    this.text(FIELDS.ac, attributes.ac?.value ?? "");
    this.text(FIELDS.initiative, signed(attributes.init?.total ?? 0));
    const walk = attributes.movement?.walk;
    this.text(FIELDS.speed, walk ? `${walk} ${attributes.movement.units ?? "ft"}` : "");
    this.text(FIELDS.hpMax, attributes.hp?.max ?? "");
    this.text(FIELDS.hpCurrent, attributes.hp?.value ?? "");
    this.text(FIELDS.hpTemp, attributes.hp?.temp || "");

    // Hit dice: total by denomination (e.g. "4d8"), remaining count in the large box
    const { total, remaining } = hitDice(actor);
    this.text(FIELDS.hdTotal, total);
    this.text(FIELDS.hd, remaining || "");

    const death = attributes.death ?? {};
    DEATH_SAVES.success.forEach((name, i) => this.check(name, i < (death.success ?? 0)));
    DEATH_SAVES.failure.forEach((name, i) => this.check(name, i < (death.failure ?? 0)));
  }

  /* -------------------------------------------- */

  #fillWeapons(actor, system) {
    const weapons = actor.items.filter(i => i.type === "weapon")
      .sort((a, b) => (b.system.equipped - a.system.equipped) || a.name.localeCompare(b.name));
    const describe = weapon => ({
      name: weapon.name,
      atk: weapon.labels?.toHit ?? "",
      dmg: damageSummary(weapon)
    });

    weapons.slice(0, WEAPON_ROWS.length).forEach((weapon, i) => {
      const { name, atk, dmg } = describe(weapon);
      this.text(WEAPON_ROWS[i].name, name);
      this.text(WEAPON_ROWS[i].atk, atk);
      this.text(WEAPON_ROWS[i].dmg, dmg);
    });

    // Overflow weapons and the spellcasting summary go into the free-text block below the rows
    const lines = [];
    for ( const weapon of weapons.slice(WEAPON_ROWS.length) ) {
      const { name, atk, dmg } = describe(weapon);
      lines.push(`${name}: ${atk} to hit, ${dmg}`);
    }
    const spell = system.attributes.spell;
    if ( system.attributes.spellcasting && spell ) {
      lines.push(`Spell Attack: ${signed(spell.attack ?? 0)}, Spell Save DC: ${spell.dc ?? ""}`);
    }
    this.text(FIELDS.attacksSpellcasting, lines.join("\n"), { fontSize: 8 });
  }

  /* -------------------------------------------- */

  #fillCurrencyAndInventory(actor, system) {
    const currency = system.currency ?? {};
    for ( const denomination of ["cp", "sp", "ep", "gp", "pp"] ) this.text(FIELDS[denomination], currency[denomination] ?? 0);

    const physical = ["weapon", "equipment", "consumable", "tool", "container", "loot"];
    // Skip items stored inside a container: the container itself is already listed, and its
    // contents would otherwise appear a second time at the top level.
    const items = actor.items.filter(i => physical.includes(i.type) && !i.system.container)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => (i.system.quantity > 1) ? `${i.name} x${i.system.quantity}` : i.name);
    this.text(FIELDS.equipment, items.join("\n"), { fontSize: 8 });
  }

  /* -------------------------------------------- */

  #fillProficiencies(actor, system) {
    const traits = system.traits;
    const sections = [];
    const languages = withCustomTraits(traitLabels(traits.languages?.value, "languages"), traits.languages?.custom);
    const armor = withCustomTraits(traitLabels(traits.armorProf?.value, "armor"), traits.armorProf?.custom);
    const weapons = withCustomTraits(traitLabels(traits.weaponProf?.value, "weapon"), traits.weaponProf?.custom);
    const tools = traitLabels(Object.keys(system.tools ?? {}), "tool");
    if ( languages.length ) sections.push(`Languages: ${languages.join(", ")}`);
    if ( armor.length ) sections.push(`Armor: ${armor.join(", ")}`);
    if ( weapons.length ) sections.push(`Weapons: ${weapons.join(", ")}`);
    if ( tools.length ) sections.push(`Tools: ${tools.join(", ")}`);
    this.text(FIELDS.proficienciesLang, sections.join("\n\n"), { fontSize: 8 });
  }

  /* -------------------------------------------- */

  #fillFeatures(actor) {
    const groups = groupFeats(actor);

    // Bold name + plain description blocks, flowing from the page 1 box into the page 2 box
    const blocks = [];
    const add = (heading, items) => {
      if ( !items.length ) return;
      blocks.push({ heading });
      for ( const item of items ) blocks.push({ title: item.name });
    };
    add("Class Features", groups.class);
    add("Species Traits", groups.race);
    add("Feats", groups.feat);
    add("Background", groups.background);
    add("Other", groups.other);
    const unrendered = this.drawFeatureBlocks(blocks);
    if ( unrendered ) console.warn(`${MODULE_ID} | ${unrendered} feature text sections did not fit on the sheet.`);
  }

  /* -------------------------------------------- */

  /**
   * Draw feature blocks (bold title + regular description) directly onto the page, inside the
   * rectangles of the given text fields. Form fields cannot mix fonts, hence direct drawing.
   * Content flows from one box to the next when a box is full.
   * @param {Array<{heading: string}|{title: string, text: string}>} blocks
   * @param {string[]} [fieldNames]  Boxes to fill, in order.
   * @returns {number}               Number of text sections that did not fit.
   */
  drawFeatureBlocks(blocks, fieldNames=[FIELDS.featuresTraits, FIELDS.additionalFeatures]) {
    const boxes = fieldNames.map(name => this.#fieldBox(name)).filter(_ => _);
    if ( !boxes.length ) return blocks.length;
    const PAD = 4;

    // Flatten blocks into styled text segments
    const segments = [];
    for ( const block of blocks ) {
      if ( block.heading ) segments.push({ text: block.heading, bold: true, size: 8, spaceBefore: 6 });
      else {
        segments.push({ text: block.title, bold: false, size: 7, spaceBefore: 4 });
        if ( block.text ) segments.push({ text: block.text, bold: false, size: 7, spaceBefore: 1 });
      }
    }

    let index = 0;
    let carry = null;  // Remainder of a segment that did not fit in the previous box
    for ( const box of boxes ) {
      const width = box.rect.width - (2 * PAD);
      const bottom = box.rect.y + PAD;
      let y = box.rect.y + box.rect.height - PAD;
      let atTop = true;
      while ( index < segments.length ) {
        const segment = segments[index];
        const font = segment.bold ? this.fonts.bold : this.fonts.regular;
        const lineHeight = segment.size * 1.25;
        if ( (carry === null) && !atTop ) y -= segment.spaceBefore;
        const lines = wrapText(carry ?? segment.text, font, segment.size, width);
        let drawn = 0;
        for ( const line of lines ) {
          if ( (y - lineHeight) < bottom ) break;
          y -= lineHeight;
          if ( line ) box.page.drawText(line, { x: box.rect.x + PAD, y, size: segment.size, font });
          drawn++;
          atTop = false;
        }
        if ( drawn < lines.length ) {
          carry = lines.slice(drawn).join(" ");
          break;  // This box is full; continue in the next one
        }
        carry = null;
        index++;
      }
      if ( index >= segments.length ) break;
    }
    return segments.length - index;
  }

  /* -------------------------------------------- */

  /**
   * Resolve a form field to its page and widget rectangle for direct drawing, and make the
   * field read-only so users cannot type over the drawn text.
   * @param {string} name
   * @returns {{page: import("pdf-lib").PDFPage, rect: {x: number, y: number, width: number, height: number}}|null}
   */
  #fieldBox(name) {
    const field = this.#index.get(SheetFiller.normalize(name));
    if ( !field ) {
      console.warn(`${MODULE_ID} | Unknown field "${name}"`);
      return null;
    }
    try {
      const widget = field.acroField.getWidgets()[0];
      const rect = widget.getRectangle();
      const pageRef = widget.P();
      const page = this.doc.getPages().find(p => p.ref === pageRef);
      if ( !page ) return null;
      // The feature text is drawn straight onto the page; hide the field's widget (annotation
      // flag 2 = Hidden) so its empty appearance cannot paint over that text in viewers that
      // render form fields opaquely. enableReadOnly keeps the (now hidden) field non-interactive.
      try {
        widget.dict.set(PDFLib.PDFName.of("F"), PDFLib.PDFNumber.of(2));
      } catch(flagErr) {
        console.warn(`${MODULE_ID} | Could not hide widget for "${name}"`, flagErr);
      }
      field.enableReadOnly();
      return { page, rect };
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not resolve drawing area for "${name}"`, err);
      return null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Look up the rectangle (position and size, in PDF points) that a form field occupies on its
   * page. Used to draw text at a field's printed position on pages where the field itself no
   * longer exists (see {@link Sheet2024Filler}'s spell overflow pages).
   * @param {string} name  Canonical field name.
   * @returns {{x: number, y: number, width: number, height: number}|null}
   */
  fieldRect(name) {
    const field = this.#index.get(SheetFiller.normalize(name));
    if ( !field ) {
      console.warn(`${MODULE_ID} | Unknown field "${name}"`);
      return null;
    }
    try {
      return field.acroField.getWidgets()[0].getRectangle();
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not read the rectangle of field "${name}"`, err);
      return null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Create a brand-new fillable text field on a page, positioned by the given rectangle, and
   * optionally pre-fill it. Used on spell overflow pages, where the copied page keeps its printed
   * layout but loses its original form fields (every field name must be unique in a document).
   * @param {import("pdf-lib").PDFPage} page
   * @param {string} name              Field name; must not already exist in the document.
   * @param {{x: number, y: number, width: number, height: number}|null} rect
   * @param {*} [value]                Initial text. Nullish/empty leaves the field blank.
   * @param {object} [options]
   * @param {number} [options.fontSize]  Font size in points.
   * @param {boolean} [options.center]   Center the text instead of left-aligning it.
   */
  addTextField(page, name, rect, value, { fontSize=8, center=false } = {}) {
    if ( !rect ) return;
    try {
      const field = this.form.createTextField(name);
      if ( center ) field.setAlignment(PDFLib.TextAlignment.Center);
      // Explicitly undefined colours make the widget transparent, so the printed
      // box art of the template shows through instead of a white rectangle
      field.addToPage(page, {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        borderWidth: 0, borderColor: undefined, backgroundColor: undefined
      });
      field.setFontSize(fontSize);
      const text = (value === null) || (value === undefined) ? "" : sanitizeWinAnsi(String(value));
      if ( text ) field.setText(text);
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not create text field "${name}"`, err);
    }
  }

  /**
   * Create a brand-new checkbox on a page, positioned by the given rectangle.
   * @param {import("pdf-lib").PDFPage} page
   * @param {string} name    Field name; must not already exist in the document.
   * @param {{x: number, y: number, width: number, height: number}|null} rect
   * @param {boolean} [checked]
   */
  addCheckBox(page, name, rect, checked=false) {
    if ( !rect ) return;
    try {
      const box = this.form.createCheckBox(name);
      box.addToPage(page, {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        borderWidth: 0, borderColor: undefined, backgroundColor: undefined
      });
      if ( checked ) box.check();
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not create checkbox "${name}"`, err);
    }
  }

  /* -------------------------------------------- */

  #fillPersonality(actor, system) {
    const details = system.details;
    this.text(FIELDS.personalityTraits, stripHtml(details.trait ?? ""), { fontSize: 8 });
    this.text(FIELDS.ideals, stripHtml(details.ideal ?? ""), { fontSize: 8 });
    this.text(FIELDS.bonds, stripHtml(details.bond ?? ""), { fontSize: 8 });
    this.text(FIELDS.flaws, stripHtml(details.flaw ?? ""), { fontSize: 8 });
    this.text(FIELDS.age, details.age ?? "");
    this.text(FIELDS.height, details.height ?? "");
    this.text(FIELDS.weight, details.weight ?? "");
    this.text(FIELDS.eyes, details.eyes ?? "");
    this.text(FIELDS.skin, details.skin ?? "");
    this.text(FIELDS.hair, details.hair ?? "");
    this.text(FIELDS.factionName, details.faith ?? "");
    this.text(FIELDS.backstory, stripHtml(details.biography?.value ?? ""), { fontSize: 8 });
    this.text(FIELDS.allies, stripHtml(details.biography?.public ?? ""), { fontSize: 8 });
  }

  /* -------------------------------------------- */

  #fillSpellcasting(actor, system) {
    const attributes = system.attributes;
    const spellcasters = Object.values(actor.classes ?? {})
      .filter(cls => (cls.spellcasting?.progression ?? cls.system.spellcasting?.progression ?? "none") !== "none");
    const hasSpells = actor.items.some(i => i.type === "spell");
    if ( !spellcasters.length && !hasSpells ) return;

    this.text(FIELDS.spellcastingClass, spellcasters.map(cls => cls.name).join(" / "));
    const abilityKey = attributes.spellcasting;
    this.text(FIELDS.spellcastingAbility, CONFIG.DND5E.abilities[abilityKey]?.label ?? abilityKey ?? "");
    this.text(FIELDS.spellSaveDC, attributes.spell?.dc ?? "");
    this.text(FIELDS.spellAttackBonus, signed(attributes.spell?.attack ?? 0));

    // Slot totals per level, including Warlock Pact Magic (kept separately under spells.pact and
    // folded into the matching level's row so a Warlock's slots are not left blank)
    const slotTotals = {};
    for ( let level = 1; level <= 9; level++ ) {
      const slots = system.spells?.[`spell${level}`];
      if ( slots?.max ) slotTotals[level] = { max: slots.max, value: slots.value ?? 0 };
    }
    const pact = system.spells?.pact;
    if ( pact?.max && pact.level ) {
      const existing = slotTotals[pact.level] ?? { max: 0, value: 0 };
      slotTotals[pact.level] = { max: existing.max + pact.max, value: existing.value + (pact.value ?? 0) };
    }
    for ( const [level, { max, value }] of Object.entries(slotTotals) ) {
      const fields = slotFields(level);
      this.text(fields.total, max);
      this.text(fields.remaining, value);
    }

    // Spell names grouped by level; the prepared circle is checked for prepared/always-prepared spells
    const byLevel = {};
    for ( const spell of actor.items.filter(i => i.type === "spell") ) {
      const level = spell.system.level ?? 0;
      (byLevel[level] ??= []).push(spell);
    }
    for ( const [level, spells] of Object.entries(byLevel) ) {
      const map = SPELL_LEVELS[level];
      if ( !map ) continue;
      spells.sort((a, b) => a.name.localeCompare(b.name));
      const overflow = spells.length - map.lines.length;
      spells.slice(0, map.lines.length).forEach((spell, i) => {
        let name = spell.name;
        if ( (overflow > 0) && (i === map.lines.length - 1) ) name += ` (+${overflow + 1} more)`;
        this.text(map.lines[i], name);
        if ( map.checks[i] && (spell.system.prepared >= 1) ) this.check(map.checks[i]);
      });
      if ( overflow > 0 ) console.warn(`${MODULE_ID} | ${overflow} level ${level} spells did not fit on the sheet.`);
    }
  }
}

/* -------------------------------------------- */
/*  2024 sheet filler                           */
/* -------------------------------------------- */

/**
 * Fills the 2024 official character sheet (templates/DnD_2024_Character-Sheet.pdf). The 2024 layout
 * differs substantially from the 2014 sheet: a two-page sheet, a Size box, an Appearance text block
 * instead of a portrait button, armour-training checkboxes, split Class Features / Species Traits /
 * Feats boxes, and a single unified 30-row "Cantrips & Prepared Spells" table. When an actor knows
 * more than 30 spells, extra copies of page 2 with their own fillable spell tables are appended
 * to list the remainder.
 */
export class Sheet2024Filler extends SheetFiller {
  /**
   * How to grow the single-line Tools field into its printed box. The official 2024 template ships
   * a small single-line field, so it is repositioned and made multiline; a subclass whose template
   * already provides a full-size multiline Tools field can override this to `null` to skip the move.
   */
  get toolsFieldRect() { return { y: 27, height: 24, multiline: true }; }

  /** Populate the form from a dnd5e character actor. */
  async fillActor(actor) {
    const system = actor.system;
    this.#fillHeader(actor, system);
    this.#fillAbilitiesAndSkills(system);
    this.#fillCombat(actor, system);
    this.#fillWeapons(actor);
    this.#fillProficiencies(system);
    this.#fillFeatures(actor);
    this.#fillEquipmentAndCurrency(actor, system);
    this.#fillAppearance(system);
    await this.#fillSpellcasting(actor, system);
  }

  /* -------------------------------------------- */

  #fillHeader(actor, system) {
    const details = system.details;
    const classes = sortedClasses(actor);
    const classNames = classes.map(cls => `${cls.name} ${cls.system.levels}`).join(" / ");
    const subclasses = classes.map(cls => cls.subclass?.name).filter(_ => _).join(" / ");
    const totalLevel = details.level ?? classes.reduce((sum, cls) => sum + (cls.system.levels ?? 0), 0);

    this.text(F24.characterName, actor.name);
    this.text(F24.class, classNames);
    this.text(F24.subclass, subclasses);
    this.text(F24.background, details.background?.name ?? details.background ?? "");
    this.text(F24.species, details.race?.name ?? details.race ?? "");
    this.text(F24.level, totalLevel || "");
    this.text(F24.xp, details.xp?.value ?? "");
  }

  /* -------------------------------------------- */

  #fillAbilitiesAndSkills(system) {
    for ( const [key, map] of Object.entries(ABILITIES_24) ) {
      const ability = system.abilities?.[key];
      if ( !ability ) continue;
      this.text(map.score, ability.value);
      this.text(map.mod, signed(ability.mod));
      const saveTotal = (typeof ability.save === "object") ? ability.save.value : ability.save;
      this.text(map.save, signed(saveTotal ?? 0));
      if ( ability.proficient >= 1 ) this.check(map.saveProf);
    }
    for ( const [key, map] of Object.entries(SKILLS_24) ) {
      const skill = system.skills?.[key];
      if ( !skill ) continue;
      this.text(map.field, signed(skill.total ?? 0));
      if ( (skill.proficient ?? skill.value) >= 1 ) this.check(map.prof);
    }
  }

  /* -------------------------------------------- */

  #fillCombat(actor, system) {
    const attributes = system.attributes;
    this.check(F24.heroicInspiration, !!attributes.inspiration);
    this.text(F24.profBonus, signed(attributes.prof ?? 0));
    this.text(F24.ac, attributes.ac?.value ?? "");
    this.text(F24.initiative, signed(attributes.init?.total ?? 0));
    const walk = attributes.movement?.walk;
    this.text(F24.speed, walk ? `${walk} ${attributes.movement.units ?? "ft"}` : "");
    const size = system.traits?.size;
    const sizeCfg = CONFIG.DND5E?.actorSizes?.[size];
    this.text(F24.size, sizeCfg?.label ?? sizeCfg ?? size ?? "", { fontSize: 8 });
    this.text(F24.passivePerception, system.skills?.prc?.passive ?? "");
    this.text(F24.hpMax, attributes.hp?.max ?? "");
    this.text(F24.hpCurrent, attributes.hp?.value ?? "");
    this.text(F24.hpTemp, attributes.hp?.temp || "");

    // Hit dice: max by denomination (e.g. "4d8"), spent count in the SPENT box
    const { total, spent } = hitDice(actor);
    this.text(F24.hdMax, total);
    this.text(F24.hdSpent, spent || "");

    const death = attributes.death ?? {};
    DEATH_SAVES_24.success.forEach((name, i) => this.check(name, i < (death.success ?? 0)));
    DEATH_SAVES_24.failure.forEach((name, i) => this.check(name, i < (death.failure ?? 0)));
  }

  /* -------------------------------------------- */

  #fillWeapons(actor) {
    const weapons = actor.items.filter(i => i.type === "weapon")
      .sort((a, b) => (b.system.equipped - a.system.equipped) || a.name.localeCompare(b.name));
    weapons.slice(0, WEAPON_ROWS_24.length).forEach((weapon, i) => {
      const row = WEAPON_ROWS_24[i];
      this.text(row.name, weapon.name, { fontSize: 8 });
      this.text(row.atk, weapon.labels?.toHit ?? "", { fontSize: 8 });
      this.text(row.dmg, damageSummary(weapon), { fontSize: 8 });
      this.text(row.notes, weaponNotes(weapon), { fontSize: 8 });
    });
    if ( weapons.length > WEAPON_ROWS_24.length ) {
      console.warn(`${MODULE_ID} | ${weapons.length - WEAPON_ROWS_24.length} weapons did not fit on the sheet.`);
    }
  }

  /* -------------------------------------------- */

  #fillProficiencies(system) {
    const traits = system.traits;
    const armor = new Set(traits.armorProf?.value ?? []);
    this.check(ARMOR_TRAINING_24.light, armor.has("lgt"));
    this.check(ARMOR_TRAINING_24.medium, armor.has("med"));
    this.check(ARMOR_TRAINING_24.heavy, armor.has("hvy"));
    this.check(ARMOR_TRAINING_24.shield, armor.has("shl"));

    const weapons = withCustomTraits(traitLabels(traits.weaponProf?.value, "weapon"), traits.weaponProf?.custom);
    this.text(F24.weaponProficiencies, weapons.join(", "), { fontSize: 8 });
    const tools = traitLabels(Object.keys(system.tools ?? {}), "tool");
    // The printed Tools box holds two lines, but the field ships as a single line; grow it down
    // into the available space and let it wrap. Templates that already ship a full-size multiline
    // Tools field set toolsFieldRect to null so it is left in place.
    if ( this.toolsFieldRect ) this.resizeField(F24.toolProficiencies, this.toolsFieldRect);
    this.text(F24.toolProficiencies, tools.join(", "), { fontSize: 8 });
    const languages = withCustomTraits(traitLabels(traits.languages?.value, "languages"), traits.languages?.custom);
    this.text(F24.languages, languages.join(", "), { fontSize: 8 });
  }

  /* -------------------------------------------- */

  #fillFeatures(actor) {
    const groups = groupFeats(actor);
    const toBlocks = items => items.map(item => ({ title: item.name }));

    // Class features (plus background and any stray features) flow across the two Class Features columns
    const classBlocks = toBlocks(groups.class);
    if ( groups.background.length ) classBlocks.push({ heading: "Background" }, ...toBlocks(groups.background));
    if ( groups.other.length ) classBlocks.push({ heading: "Other" }, ...toBlocks(groups.other));
    const unrendered = this.drawFeatureBlocks(classBlocks, F24.classFeatures)
      + this.drawFeatureBlocks(toBlocks(groups.race), [F24.speciesTraits])
      + this.drawFeatureBlocks(toBlocks(groups.feat), [F24.feats]);
    if ( unrendered ) console.warn(`${MODULE_ID} | ${unrendered} feature text sections did not fit on the sheet.`);
  }

  /* -------------------------------------------- */

  #fillEquipmentAndCurrency(actor, system) {
    const currency = system.currency ?? {};
    for ( const denomination of ["cp", "sp", "ep", "gp", "pp"] ) this.text(F24[denomination], currency[denomination] ?? 0);

    const physical = ["weapon", "equipment", "consumable", "tool", "container", "loot"];
    // Skip items stored inside a container: the container itself is already listed, and its
    // contents would otherwise appear a second time at the top level.
    const items = actor.items.filter(i => physical.includes(i.type) && !i.system.container)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => (i.system.quantity > 1) ? `${i.name} x${i.system.quantity}` : i.name);
    this.text(F24.equipment, items.join(", "), { fontSize: 8 });

    // Magic-item attunement slots
    const attuned = actor.items.filter(i => (i.system.attuned === true) || (i.system.attunement === 2)).map(i => i.name);
    F24.attunement.forEach((field, i) => this.text(field, attuned[i] ?? null));
  }

  /* -------------------------------------------- */

  #fillAppearance(system) {
    const details = system.details;
    this.text(F24.alignment, details.alignment ?? "");

    const parts = [];
    const add = (label, value) => { if ( value ) parts.push(`${label}: ${value}`); };
    add("Age", details.age);
    add("Height", details.height);
    add("Weight", details.weight);
    add("Eyes", details.eyes);
    add("Skin", details.skin);
    add("Hair", details.hair);
    const appearance = [parts.join(", "), stripHtml(details.appearance ?? "")].filter(_ => _).join("\n");
    this.text(F24.appearance, appearance, { fontSize: 8 });

    const personality = [];
    const trait = stripHtml(details.trait ?? "");
    const ideal = stripHtml(details.ideal ?? "");
    const bond = stripHtml(details.bond ?? "");
    const flaw = stripHtml(details.flaw ?? "");
    if ( trait ) personality.push(`Personality Traits: ${trait}`);
    if ( ideal ) personality.push(`Ideals: ${ideal}`);
    if ( bond ) personality.push(`Bonds: ${bond}`);
    if ( flaw ) personality.push(`Flaws: ${flaw}`);
    const backstory = [personality.join("\n"), stripHtml(details.biography?.value ?? "")].filter(_ => _).join("\n\n");
    this.text(F24.backstory, backstory, { fontSize: 8 });
  }

  /* -------------------------------------------- */

  async #fillSpellcasting(actor, system) {
    const attributes = system.attributes;
    const spellcasters = Object.values(actor.classes ?? {})
      .filter(cls => (cls.spellcasting?.progression ?? cls.system.spellcasting?.progression ?? "none") !== "none");
    const spells = actor.items.filter(i => i.type === "spell");
    if ( !spellcasters.length && !spells.length ) return;

    // The spellcasting header values are gathered into one object because they are also
    // repeated on every overflow page added below.
    const abilityKey = attributes.spellcasting;
    const abilityMod = system.abilities?.[abilityKey]?.mod;
    const header = {
      ability: CONFIG.DND5E.abilities[abilityKey]?.label ?? abilityKey ?? "",
      modifier: (abilityMod != null) ? signed(abilityMod) : "",
      saveDC: attributes.spell?.dc ?? "",
      attackBonus: signed(attributes.spell?.attack ?? 0)
    };
    this.text(F24.spellcastingAbility, header.ability);
    this.text(F24.spellcastingModifier, header.modifier);
    this.text(F24.spellSaveDC, header.saveDC);
    this.text(F24.spellAttackBonus, header.attackBonus);

    // Spell slot totals per level (players track expended slots by hand, so only totals are filled).
    // Warlock Pact Magic lives separately under spells.pact; fold it into the matching level so a
    // Warlock's slots are not left blank.
    const slotTotals = {};
    for ( let level = 1; level <= 9; level++ ) {
      const slots = system.spells?.[`spell${level}`];
      if ( slots?.max ) slotTotals[level] = (slotTotals[level] ?? 0) + slots.max;
    }
    const pact = system.spells?.pact;
    if ( pact?.max && pact.level ) slotTotals[pact.level] = (slotTotals[pact.level] ?? 0) + pact.max;
    for ( const [level, max] of Object.entries(slotTotals) ) this.text(SPELL_SLOT_TOTALS_24[level], max);

    // The unified table lists cantrips first, then spells by level, then by name
    const sorted = spells.slice().sort((a, b) =>
      ((a.system.level ?? 0) - (b.system.level ?? 0)) || a.name.localeCompare(b.name));
    sorted.slice(0, SPELL_ROWS_24.length).forEach((spell, i) => {
      const row = SPELL_ROWS_24[i];
      const info = spellRowInfo(spell);
      this.text(row.level, info.level);
      this.text(row.name, info.name, { fontSize: 8 });
      this.text(row.castingTime, info.castingTime, { fontSize: 8 });
      this.text(row.range, info.range, { fontSize: 8 });
      if ( info.concentration ) this.check(row.concentration);
      if ( info.ritual ) this.check(row.ritual);
      if ( info.material ) this.check(row.material);
    });

    // Spells that do not fit into the 30 printed rows continue on extra copies of page 2
    const overflow = sorted.slice(SPELL_ROWS_24.length);
    if ( overflow.length ) await this.#addSpellOverflowPages(overflow, header);
  }

  /* -------------------------------------------- */

  /**
   * Append extra copies of the spell page (page 2) until every overflow spell is listed, 30 per
   * page. PDF form field names must be unique within a document, so the copied pages cannot keep
   * working duplicates of the original fields; instead each copy is stripped of its fields and
   * fresh, uniquely named fillable fields are created at the exact positions the originals occupy.
   * All 30 rows get fields (blank rows stay editable), but only the spellcasting header and the
   * spell table are recreated — spell slots, appearance, backstory, languages, equipment and coins
   * belong to the first instance of the page and remain printed background here.
   * @param {Item[]} spells  Spells that did not fit on the first page, in display order.
   * @param {{ability: string, modifier: string, saveDC: *, attackBonus: string}} header
   *                         Spellcasting header values, repeated on every overflow page.
   */
  async #addSpellOverflowPages(spells, header) {
    // Field positions must be read from the original page 2 before any copies are added
    const headerRects = {
      ability: this.fieldRect(F24.spellcastingAbility),
      modifier: this.fieldRect(F24.spellcastingModifier),
      saveDC: this.fieldRect(F24.spellSaveDC),
      attackBonus: this.fieldRect(F24.spellAttackBonus)
    };
    const rowRects = SPELL_ROWS_24.map(row => ({
      level: this.fieldRect(row.level),
      name: this.fieldRect(row.name),
      castingTime: this.fieldRect(row.castingTime),
      range: this.fieldRect(row.range),
      notes: this.fieldRect(row.notes),
      concentration: this.fieldRect(row.concentration),
      ritual: this.fieldRect(row.ritual),
      material: this.fieldRect(row.material)
    }));

    for ( let start = 0; start < spells.length; start += SPELL_ROWS_24.length ) {
      // Duplicate page 2 and remove its interactive form fields (the page's widget
      // "annotations"), leaving only the printed layout to place new fields onto
      const [copy] = await this.doc.copyPages(this.doc, [1]);
      copy.node.delete(PDFLib.PDFName.of("Annots"));
      const page = this.doc.addPage(copy);
      // Page number makes the new field names unique across multiple overflow pages
      const prefix = `Overflow ${this.doc.getPageCount()}`;

      this.addTextField(page, `${prefix} Spellcasting Ability`, headerRects.ability, header.ability);
      this.addTextField(page, `${prefix} Spellcasting Modifier`, headerRects.modifier, header.modifier, { center: true });
      this.addTextField(page, `${prefix} Spell Save DC`, headerRects.saveDC, header.saveDC, { center: true });
      this.addTextField(page, `${prefix} Spell Attack Bonus`, headerRects.attackBonus, header.attackBonus, { center: true });

      const pageSpells = spells.slice(start, start + SPELL_ROWS_24.length);
      rowRects.forEach((rects, i) => {
        // Rows without a spell still get empty fields so the whole table stays fillable
        const info = pageSpells[i] ? spellRowInfo(pageSpells[i]) : null;
        this.addTextField(page, `${prefix} Spell ${i} Level`, rects.level, info?.level, { center: true });
        this.addTextField(page, `${prefix} Spell ${i} Name`, rects.name, info?.name);
        this.addTextField(page, `${prefix} Spell ${i} Time`, rects.castingTime, info?.castingTime);
        this.addTextField(page, `${prefix} Spell ${i} Range`, rects.range, info?.range);
        this.addTextField(page, `${prefix} Spell ${i} Notes`, rects.notes, null);
        this.addCheckBox(page, `${prefix} Spell ${i} Concentration`, rects.concentration, info?.concentration);
        this.addCheckBox(page, `${prefix} Spell ${i} Ritual`, rects.ritual, info?.ritual);
        this.addCheckBox(page, `${prefix} Spell ${i} Material`, rects.material, info?.material);
      });
    }
  }
}

/* -------------------------------------------- */
/*  Square Sheet (2024) filler                  */
/* -------------------------------------------- */

/**
 * Fills our own Fan Content templates — the "Square Sheet (2024)"
 * (templates/DnD_Square_2024_Character-Sheet.pdf) and the hand-drawn "Fantasy Sheet (2024)"
 * (templates/DnD_Fantasy_2024_Character-Sheet.pdf). Both are original layouts that reuse the same
 * field names as the official 2024 sheet, so the {@link Sheet2024Filler} logic populates them
 * unchanged. They differ from the official sheet in two ways: each carries a "CHARACTER IMAGE"
 * portrait button (embedded here), and its Tools field is authored at full size, so the base Tools
 * reposition is skipped.
 */
export class SquareSheet2024Filler extends Sheet2024Filler {
  /** These templates ship a full-size, multiline Tools field, so leave it where it is. */
  get toolsFieldRect() { return null; }

  /** Populate the form, then embed the character portrait into the header image button. */
  async fillActor(actor) {
    await super.fillActor(actor);
    await this.embedPortrait(actor);
  }
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * The subset of weapon properties surfaced in the 2024 sheet's Notes column, in display order.
 * Keys are dnd5e `system.properties` ids (see DND5E.itemProperties); labels are the printed text.
 */
const WEAPON_NOTE_PROPERTIES = [
  ["mgc", "Magical"], ["ret", "Returning"], ["hvy", "Heavy"],
  ["sil", "Silvered"], ["ada", "Adamantine"], ["rch", "Reach"]
];

/**
 * Damage-type abbreviations for the weapon damage box, where the full type name (e.g. "Piercing")
 * overflows once combined with a multi-part formula and the field renders nothing but the "+".
 * Keys are dnd5e `damageType`/`healingType` ids (see DND5E.damageTypes).
 */
const DAMAGE_TYPE_ABBR = {
  acid: "Acid", bludgeoning: "Bldg", cold: "Cold", fire: "Fire", force: "Force",
  lightning: "Lght", necrotic: "Necr", piercing: "Prc", poison: "Pois", psychic: "Psy",
  radiant: "Rad", slashing: "Slsh", thunder: "Thdr", healing: "Heal"
};

/**
 * Build the compact damage summary for a weapon row, pairing each damage part's formula with an
 * abbreviated type (e.g. "1d8 + 2d6 + 2 Prc") so it fits the sheet's narrow damage box. Falls back
 * to the system's full label when a part has no single resolved type (e.g. mixed damage types).
 * @param {Item} weapon
 * @returns {string}
 */
export function damageSummary(weapon) {
  return (weapon.labels?.damages ?? []).map(part => {
    const formula = part.formula ?? part.label ?? "";
    if ( !formula ) return "";
    const abbr = DAMAGE_TYPE_ABBR[part.damageType];
    return abbr ? `${formula} ${abbr}` : (part.label ?? formula);
  }).filter(_ => _).join(", ");
}

/**
 * Build the Notes-column text for a weapon row from its properties, listing only the attributes
 * the 2024 sheet calls out (Magical, Returning, Heavy, Silvered, Adamantine, Reach).
 * @param {Item} weapon
 * @returns {string}
 */
export function weaponNotes(weapon) {
  // `properties` is a Set in current dnd5e versions but was an Array in older ones
  const props = weapon.system?.properties;
  const has = p => props?.has ? props.has(p) : Array.isArray(props) ? props.includes(p) : false;
  return WEAPON_NOTE_PROPERTIES.filter(([key]) => has(key)).map(([, label]) => label).join(", ");
}

/** Format a number as a signed modifier string. */
export function signed(value) {
  const n = Number(value) || 0;
  return n >= 0 ? `+${n}` : `${n}`;
}

/* -------------------------------------------- */
/*  Shared actor readers                        */
/*  (used by both the 2014 and 2024 fillers)    */
/* -------------------------------------------- */

/** An actor's classes ordered by level, highest first. */
function sortedClasses(actor) {
  return Object.values(actor.classes ?? {}).sort((a, b) => (b.system.levels ?? 0) - (a.system.levels ?? 0));
}

/** Group an actor's feature items by source type ("class", "race", …), each group sorted by name. */
function groupFeats(actor) {
  const groups = { class: [], race: [], background: [], feat: [], other: [] };
  for ( const item of actor.items ) {
    if ( item.type !== "feat" ) continue;
    const type = item.system.type?.value;
    (groups[type] ?? groups.other).push(item);
  }
  for ( const items of Object.values(groups) ) items.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

/**
 * Total hit dice across all classes, handling both current (`hd.denomination`/`hd.spent`) and
 * legacy (`hitDice`/`hitDiceUsed`) dnd5e data shapes.
 * @returns {{total: string, spent: number, remaining: number}}  `total` is a printable summary
 *          ("4d8 + 2d6"); `spent`/`remaining` are the used and unused dice counts.
 */
function hitDice(actor) {
  const byDenom = {};
  let spent = 0;
  let levels = 0;
  for ( const cls of Object.values(actor.classes ?? {}) ) {
    const denomination = cls.system.hd?.denomination ?? cls.system.hitDice ?? "d8";
    const classLevels = cls.system.levels ?? 0;
    byDenom[denomination] = (byDenom[denomination] ?? 0) + classLevels;
    levels += classLevels;
    spent += cls.system.hd?.spent ?? cls.system.hitDiceUsed ?? 0;
  }
  const total = Object.entries(byDenom).map(([denomination, count]) => `${count}${denomination}`).join(" + ");
  return { total, spent, remaining: levels - spent };
}

/** Localize a set of dnd5e trait keys (languages, armor, weapon, tool) to their display labels. */
function traitLabels(keys, trait) {
  const Trait = dnd5e?.documents?.Trait;
  return Array.from(keys ?? []).map(key => {
    try {
      return Trait?.keyLabel(key, { trait }) ?? key;
    } catch(err) {
      return key;
    }
  });
}

/** Append semicolon-separated custom trait entries to a list of localized trait labels. */
function withCustomTraits(values, custom) {
  return values.concat((custom ?? "").split(";").map(s => s.trim()).filter(_ => _));
}

/**
 * Extract the values shown in one row of the 2024 "Cantrips & Prepared Spells" table. Shared by
 * the form-field rows on page 2 and the drawn rows on any spell overflow pages, so both render
 * spells identically.
 * @param {Item} spell
 * @returns {{level: string, name: string, castingTime: string, range: string,
 *            concentration: boolean, ritual: boolean, material: boolean}}
 */
export function spellRowInfo(spell) {
  const level = spell.system.level ?? 0;
  // `properties` is a Set in current dnd5e versions but was an Array in older ones
  const props = spell.system.properties;
  const has = p => props?.has ? props.has(p) : Array.isArray(props) ? props.includes(p) : false;
  return {
    level: (level === 0) ? "C" : String(level),
    name: spell.name,
    castingTime: castingTimeAbbr(spell),
    range: spell.labels?.range ?? "",
    concentration: has("concentration"),
    ritual: has("ritual"),
    material: has("material")
  };
}

/**
 * Abbreviate a spell's casting time to fit the very narrow 2024 "Casting Time" column, where full
 * words like "Reaction" or "Bonus Action" overflow at any legible size (e.g. "Bonus Action" -> "BA",
 * "Reaction" -> "R", "10 Minutes" -> "10 Min"). Falls back to the full label if nothing matches.
 */
export function castingTimeAbbr(spell) {
  const label = spell.labels?.activation ?? "";
  // Order matters: "Bonus Action" and "Reaction" both contain "action", so test them first.
  const rules = [[/bonus/i, "BA"], [/reaction/i, "R"], [/action/i, "A"], [/minute/i, "Min"], [/hour/i, "Hr"], [/day/i, "Day"]];
  for ( const [pattern, abbr] of rules ) {
    if ( !pattern.test(label) ) continue;
    // Keep the count for durational casts ("10 Min", "1 Hr"); the instantaneous actions
    // (BA/R/A) never carry a number so they collapse to the bare abbreviation.
    const count = label.match(/\d+/);
    const durational = (abbr === "Min") || (abbr === "Hr") || (abbr === "Day");
    return (count && durational) ? `${count[0]} ${abbr}` : abbr;
  }
  return label;
}

/**
 * Greedy word-wrap for direct page drawing with a WinAnsi-encoded standard font.
 * @param {string} text       Text to wrap; embedded newlines are honoured.
 * @param {PDFFont} font      Embedded pdf-lib font used to measure widths.
 * @param {number} size       Font size in points.
 * @param {number} maxWidth   Available line width in points.
 * @returns {string[]}
 */
export function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for ( const paragraph of sanitizeWinAnsi(text).split("\n") ) {
    if ( !paragraph.trim() ) {
      lines.push("");
      continue;
    }
    let line = "";
    for ( const word of paragraph.split(/\s+/) ) {
      const candidate = line ? `${line} ${word}` : word;
      if ( font.widthOfTextAtSize(candidate, size) <= maxWidth ) {
        line = candidate;
        continue;
      }
      if ( line ) lines.push(line);
      // Hard-split words that are longer than a whole line
      line = word;
      while ( font.widthOfTextAtSize(line, size) > maxWidth ) {
        let i = line.length - 1;
        while ( (i > 1) && (font.widthOfTextAtSize(line.slice(0, i), size) > maxWidth) ) i--;
        // Always consume at least one character, otherwise a single glyph wider than the
        // whole line would loop forever (slice(0, 0) === "" leaves `line` unchanged).
        const cut = Math.max(1, i);
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if ( line ) lines.push(line);
  }
  return lines;
}

/** Replace or drop characters the WinAnsi-encoded standard fonts cannot render. */
export function sanitizeWinAnsi(text) {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, "\"")
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\u00A0\t]/g, " ")
    .replace(/\r/g, "")
    .replace(/[^\x20-\x7E\n¡-ÿ]/g, "");
}

/**
 * Load any browser-supported image (png, jpg, webp, svg, …) and re-encode it as PNG bytes,
 * since pdf-lib can only embed PNG and JPEG.
 * @param {string} src  Image path or URL as stored on the actor.
 * @returns {Promise<Uint8Array|null>}
 */
async function loadImageAsPng(src) {
  const url = /^(?:https?:|data:|blob:)/.test(src) ? src : foundry.utils.getRoute(src);
  const response = await fetch(url);
  if ( !response.ok ) return null;
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error(`Could not decode image ${src}`));
      img.src = objectUrl;
    });
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if ( !width || !height ) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if ( !pngBlob ) return null;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Convert stored rich-text HTML to plain text suitable for a PDF text field. */
export function stripHtml(html) {
  if ( !html ) return "";
  const el = document.createElement("div");
  el.innerHTML = html.replace(/<\/p>|<br\s*\/?>/gi, "$&\n");
  return el.textContent.replace(/\n{3,}/g, "\n\n").trim();
}
