/**
 * Unit tests for the public API surface other modules call into.
 *
 * The API functions read the Foundry globals when they run rather than when the file loads, so
 * these tests stand up just enough of `game`, `ui` and `Hooks` inside each test. Timing matters
 * for `Hooks`: main.mjs registers the module's own hooks behind a `globalThis.Hooks` guard as it
 * loads, and the import above has already run by the time any test body stubs it — so the stub is
 * only ever the bus these tests listen on, never a trigger for the module's real registrations.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { API, getTemplates, isTemplateAvailable, resolveActor } from "../scripts/main.mjs";

/**
 * Stub the Foundry globals the API touches.
 * @param {object} [options]
 * @param {Record<string, string>} [options.settings]  Client settings, keyed by setting name.
 * @param {Actor[]} [options.actors]                   Stand-in actor documents.
 */
function stubFoundry({ settings={}, actors=[] }={}) {
  globalThis.game = {
    settings: { get: (module, key) => settings[key] ?? "" },
    i18n: { localize: key => key, format: (key, data) => `${key}:${JSON.stringify(data)}` },
    actors: {
      get: id => actors.find(a => a.id === id) ?? undefined,
      getName: name => actors.find(a => a.name === name) ?? null
    }
  };
}

/** A minimal stand-in for an Actor document, as far as {@link resolveActor} is concerned. */
function stubActor(id, name) {
  return { id, name, documentName: "Actor" };
}

test.afterEach(() => {
  delete globalThis.game;
  delete globalThis.fromUuidSync;
});

/* -------------------------------------------- */

test("the API exposes the documented surface", () => {
  for ( const key of ["promptPdf", "generatePdf", "createPdf", "downloadPdf", "getTemplates",
    "isTemplateAvailable", "resolveActor", "errors", "debug"] ) {
    assert.ok(key in API, `API is missing ${key}`);
  }
  assert.equal(typeof API.generatePdf, "function");
  assert.equal(typeof API.createPdf, "function");
  assert.equal(typeof API.debug.generateFieldMap, "function");
  assert.equal(API.MODULE_ID, "sogrom-dnd5e-character-sheet-pdf");
  assert.equal(API.DEFAULT_TEMPLATE, "2024");
  assert.equal(API.errors.TemplateNotConfiguredError.name, "TemplateNotConfiguredError");
  assert.equal(API.errors.TemplateUnavailableError.name, "TemplateUnavailableError");
});

/* -------------------------------------------- */

test("resolveActor accepts a document, an id, a name and a token", () => {
  const actor = stubActor("abc123", "Tordek");
  stubFoundry({ actors: [actor] });

  assert.equal(resolveActor(actor), actor, "an Actor passes straight through");
  assert.equal(resolveActor("abc123"), actor, "an id is looked up");
  assert.equal(resolveActor("Tordek"), actor, "a name is looked up");
  assert.equal(resolveActor({ actor }), actor, "a token stands in for its actor");
});

/* -------------------------------------------- */

test("resolveActor resolves a UUID, and survives one that does not", () => {
  const actor = stubActor("abc123", "Tordek");
  stubFoundry({ actors: [actor] });

  globalThis.fromUuidSync = () => actor;
  assert.equal(resolveActor("Actor.abc123"), actor);

  // A UUID for a pack that is not loaded throws rather than returning null, and must not take the
  // caller down with it.
  globalThis.fromUuidSync = () => { throw new Error("pack not loaded"); };
  assert.equal(resolveActor("Compendium.world.heroes.Actor.abc123"), null);
});

/* -------------------------------------------- */

test("resolveActor returns null for anything it cannot match", () => {
  stubFoundry();
  assert.equal(resolveActor("nobody"), null);
  assert.equal(resolveActor(undefined), null);
  assert.equal(resolveActor(null), null);
  assert.equal(resolveActor(42), null);
  assert.equal(resolveActor({ name: "not a document" }), null);
});

/* -------------------------------------------- */

test("a layout is only available once the user has supplied that sheet", () => {
  stubFoundry({ settings: { officialPath2024: "worlds/test/sheet-2024.pdf" } });

  assert.equal(isTemplateAvailable("2024"), true);
  assert.equal(isTemplateAvailable("2014"), false, "no path supplied yet");
  assert.equal(isTemplateAvailable("2099"), false, "an unknown layout is never available");
  assert.equal(isTemplateAvailable(undefined), false);
});

/* -------------------------------------------- */

test("getTemplates reports every layout and where its file came from", () => {
  stubFoundry({ settings: { officialPath2024: "worlds/test/sheet-2024.pdf" } });
  const templates = getTemplates();

  assert.deepEqual(templates.map(t => t.key), ["2024", "2014"], "2024 leads, as in the dialog");
  const supplied = templates.find(t => t.key === "2024");
  assert.equal(supplied.available, true);
  assert.equal(supplied.path, "worlds/test/sheet-2024.pdf");
  assert.ok(supplied.url.startsWith("https://"), "the download link is offered for each layout");

  const missing = templates.find(t => t.key === "2014");
  assert.equal(missing.available, false);
  assert.equal(missing.path, "");
});

/* -------------------------------------------- */

/**
 * Stub the globals `generatePdf` reaches for beyond {@link stubFoundry}: the hook bus and the
 * notification banners. Returns the calls made to each, for the assertions below.
 */
function stubUi() {
  const notifications = { info: [], warn: [], error: [] };
  globalThis.ui = {
    notifications: {
      info: message => notifications.info.push(message),
      warn: message => notifications.warn.push(message),
      error: message => notifications.error.push(message)
    }
  };
  return notifications;
}

/**
 * @param {Record<string, Function>} listeners  Hook name -> listener, as `Hooks.call` would run it.
 */
function stubHooks(listeners={}) {
  const called = [];
  globalThis.Hooks = {
    call: (hook, ...args) => {
      called.push(hook);
      return listeners[hook] ? listeners[hook](...args) : true;
    },
    callAll: (hook, ...args) => {
      called.push(hook);
      listeners[hook]?.(...args);
    }
  };
  return called;
}

test.afterEach(() => {
  delete globalThis.ui;
  delete globalThis.Hooks;
});

/* -------------------------------------------- */

test("sdpdf.preExportPdf can cancel an export", async () => {
  const actor = stubActor("abc123", "Tordek");
  stubFoundry({ settings: { officialPath2024: "worlds/test/sheet-2024.pdf", template: "2024" }, actors: [actor] });
  const notifications = stubUi();
  let seen = null;
  const called = stubHooks({ "sdpdf.preExportPdf": (_actor, context) => {
    seen = context;
    return false;
  } });

  assert.equal(await API.generatePdf(actor), null, "a cancelled export resolves null");
  assert.deepEqual(seen, {
    template: "2024",
    filename: "Tordek - Character Sheet.pdf",
    download: true
  }, "the hook is handed the layout, filename and download flag to change");
  assert.ok(!called.includes("sdpdf.exportPdf"), "nothing was exported, so nothing is announced");
  assert.deepEqual(notifications.info, [], "a cancelled export says nothing to the user");
});

/* -------------------------------------------- */

test("exporting a layout the user has not supplied fails cleanly", async () => {
  const actor = stubActor("abc123", "Tordek");
  stubFoundry({ settings: { template: "2024" }, actors: [actor] });
  const notifications = stubUi();
  stubHooks();

  assert.equal(await API.generatePdf(actor), null);
  assert.deepEqual(notifications.error, ["SDPDF.Export.MissingOfficial"],
    "the user is pointed at the export dialog, not the console");
  assert.deepEqual(notifications.info, [], "and is not told a sheet is being generated first");
});

/* -------------------------------------------- */

test("notify: false keeps a failed export off the user's screen", async () => {
  const actor = stubActor("abc123", "Tordek");
  stubFoundry({ settings: { template: "2024" }, actors: [actor] });
  const notifications = stubUi();
  stubHooks();

  assert.equal(await API.generatePdf(actor, { notify: false }), null);
  assert.deepEqual(notifications.error, []);
});

/* -------------------------------------------- */

test("exporting an actor that does not exist resolves null", async () => {
  stubFoundry({ settings: { officialPath2024: "worlds/test/sheet-2024.pdf", template: "2024" } });
  const notifications = stubUi();
  stubHooks();

  assert.equal(await API.generatePdf("nobody"), null);
  assert.deepEqual(notifications.error, ["SDPDF.Error"]);
});
