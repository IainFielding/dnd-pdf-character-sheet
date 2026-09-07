# Integrating with this module

Other modules can ask this one to export a character sheet PDF: open the export window for the
user, or generate a sheet straight away and either download it or take the raw bytes.

Everything below is stable and safe to call from another module.

---

## Getting the API

The API is published during `init` at:

```js
const sdpdf = game.modules.get("sogrom-dnd5e-character-sheet-pdf")?.api;
```

`?.api` is `undefined` when the module is not installed or not active, which is the check to make
before offering an export in your own UI:

```js
if ( game.modules.get("sogrom-dnd5e-character-sheet-pdf")?.active ) {
  // Offer a "Export PDF" button.
}
```

If you need the API earlier than your own `setup`/`ready`, listen for the `sdpdf.ready` hook, which
fires once on `ready` and hands over the same object:

```js
Hooks.once("sdpdf.ready", api => {
  // api === game.modules.get("sogrom-dnd5e-character-sheet-pdf").api
});
```

You can also declare the relationship in your `module.json`, so Foundry warns the user if the module
is missing:

```json
"relationships": {
  "optional": [
    { "id": "sogrom-dnd5e-character-sheet-pdf", "type": "module" }
  ]
}
```

---

## The important caveat: the user supplies the sheet

The official Wizards of the Coast sheets are copyrighted, so this module cannot bundle them. Each
layout only works once **that user** has downloaded the official PDF and pointed the module at their
own copy. Until then an export of that layout fails with `TemplateNotConfiguredError`.

So an export is never guaranteed to succeed. Two ways to handle it:

- Call `promptPdf()` and let this module's own window walk the user through supplying the file.
- Check `isTemplateAvailable()` / `getTemplates()` first, and only offer a silent export when a
  layout is ready.

```js
const ready = sdpdf.getTemplates().filter(t => t.available);
if ( !ready.length ) await sdpdf.promptPdf(actor);   // Let the module ask for the file.
else await sdpdf.generatePdf(actor);                 // Straight to a download.
```

---

## Anything that identifies an actor works

Every function that takes an actor accepts an `Actor` document, a token or `TokenDocument`, or an
actor id, UUID or name:

```js
sdpdf.generatePdf(actor);                       // A document
sdpdf.generatePdf("kR4pQ2vN8sT1xW7y");          // An id
sdpdf.generatePdf("Actor.kR4pQ2vN8sT1xW7y");    // A UUID
sdpdf.generatePdf(token);                       // A token, linked or not
```

Only the synchronous UUID lookup is used, so for an actor in an unloaded compendium, `await
fromUuid(uuid)` yourself and pass the document.

---

## `promptPdf(actor, options?)`

Opens this module's export window: the user picks a layout (or supplies the official PDF for one)
and clicks **Export**. Resolves with the [result](#the-result-object) once the sheet has been
generated, or `null` if they closed the window without exporting.

```js
const result = await sdpdf.promptPdf(actor);
if ( result ) console.log(`Exported ${result.filename}`);
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `template` | `string` | remembered | Layout to pre-select: `"2024"` or `"2014"`. |
| `export` | `object` | `{}` | Options forwarded to `generatePdf` when the user confirms — `filename`, `download`, `notify`. |

Anything else you pass is handed to `ApplicationV2`, so `position`, `window` and the rest work as
usual.

```js
// Show the picker, but keep the bytes instead of downloading them.
const result = await sdpdf.promptPdf(actor, { export: { download: false } });
if ( result ) await myUpload(result.bytes, result.filename);
```

---

## `generatePdf(actor, template?, options?)`

Generates and downloads a sheet with no window in the way — the same thing that happens when the
user picks **PDF Character Sheet** from the sidebar, minus the layout picker. Uses the layout
remembered from the user's last export unless you name one.

Progress, errors and any font warnings are reported to the user as notifications. On failure it
resolves `null` rather than throwing, because the user has already been told.

```js
await sdpdf.generatePdf(actor);                            // Remembered layout
await sdpdf.generatePdf(actor, "2014");                    // A specific layout
await sdpdf.generatePdf(actor, { template: "2014" });      // The same, as options
await sdpdf.generatePdf(actor, { filename: "Tordek.pdf" });
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `template` | `string` | remembered | `"2024"` or `"2014"`. An unknown key falls back to the remembered layout. |
| `filename` | `string` | `"<name> - Character Sheet.pdf"` | `.pdf` is appended if missing. |
| `download` | `boolean` | `true` | `false` returns the bytes without saving a file. |
| `notify` | `boolean` | `true` | `false` suppresses this module's notifications. |

---

## `createPdf(actor, options?)`

Builds the PDF and hands back the bytes without touching the UI: no notifications, no download.
Use this when the file is going somewhere other than the user's downloads folder — a server upload,
a chat message attachment, your own preview.

Unlike `generatePdf`, it **throws** on failure, so you can decide what the user sees.

```js
try {
  const { bytes, filename } = await sdpdf.createPdf(actor, { template: "2024" });
  const file = new File([bytes], filename, { type: "application/pdf" });
  await foundry.applications.apps.FilePicker.implementation.upload("data", "worlds/my-world/sheets", file);
} catch(err) {
  if ( err instanceof sdpdf.errors.TemplateNotConfiguredError ) {
    // The user has not supplied this official sheet yet — let the module ask them for it.
    await sdpdf.promptPdf(actor, { template: err.template });
  }
  else throw err;
}
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `template` | `string` | remembered | `"2024"` or `"2014"`. |
| `filename` | `string` | `"<name> - Character Sheet.pdf"` | Only a suggestion; nothing is written. |

Errors thrown, all available on `sdpdf.errors`:

| Error | Means |
| --- | --- |
| `TemplateNotConfiguredError` | The user has not supplied that official sheet. `.template` is the layout key. |
| `TemplateUnavailableError` | The file they supplied could not be loaded — moved, renamed or deleted. `.path` is the stored path. |
| `Error` | No actor matched what you passed, or the PDF could not be built. |

---

## The result object

`promptPdf`, `generatePdf` and `createPdf` all resolve with the same shape:

| Property | Type | Meaning |
| --- | --- | --- |
| `actor` | `Actor` | The actor the sheet was built from. |
| `template` | `string` | The layout used, `"2024"` or `"2014"`. |
| `bytes` | `Uint8Array` | The finished PDF, present whether or not it was downloaded. |
| `filename` | `string` | Suggested filename, always ending in `.pdf`. |
| `droppedCharacters` | `string[]` | Characters no available font could draw, so they are missing from the sheet. Empty for almost every sheet. |
| `downloaded` | `boolean` | Whether the file was handed to the browser to save. |

---

## The rest of the API

| Member | Returns | Purpose |
| --- | --- | --- |
| `getTemplates()` | `Array<{key, label, url, path, available}>` | Every layout, in the order the export window lists them. `label` is localized, `url` is where the official sheet is downloaded from, `path` is the user's copy, `available` is whether an export would work. |
| `isTemplateAvailable(key)` | `boolean` | Whether that one layout can be exported right now. |
| `resolveActor(target)` | `Actor \| null` | The same lookup the API uses on whatever you pass it. |
| `downloadPdf(bytes, filename)` | — | Save PDF bytes to the user's device, for when you have modified the bytes yourself. |
| `errors` | `{TemplateNotConfiguredError, TemplateUnavailableError}` | The error types above. |
| `MODULE_ID` | `string` | `"sogrom-dnd5e-character-sheet-pdf"`. |
| `DEFAULT_TEMPLATE` | `string` | The layout used when the user has no preference: `"2024"`. |

`api.debug` also exists. It is development tooling for this module, not part of the supported
surface, and may change at any time.

---

## Hooks

### `sdpdf.ready`

Fires once on `ready`, with the API object. See [Getting the API](#getting-the-api).

### `sdpdf.preExportPdf`

Fires before a sheet is built by `generatePdf` (so also for the export window, the sidebar entry and
the sheet header button — but *not* for a direct `createPdf` call, which is yours to control).

```js
Hooks.on("sdpdf.preExportPdf", (actor, context) => {
  context.filename = `${actor.name} (level ${actor.system.details.level}).pdf`;
  context.template = "2014";   // Force a layout
  context.download = false;    // Keep the file out of the downloads folder
  // return false;             // Cancel the export entirely
});
```

| Argument | Meaning |
| --- | --- |
| `actor` | The actor about to be exported. |
| `context.template` | Layout key. Mutable. |
| `context.filename` | Suggested filename. Mutable. |
| `context.download` | Whether the file will be saved to the device. Mutable. |

Returning `false` cancels the export, and the call resolves `null`.

### `sdpdf.exportPdf`

Fires after a sheet has been generated by `generatePdf`, whether or not it was downloaded. The
second argument is the [result object](#the-result-object), so `result.bytes` is the file.

```js
Hooks.on("sdpdf.exportPdf", async (actor, result) => {
  await ChatMessage.create({ content: `${actor.name}'s sheet was exported as ${result.filename}.` });
});
```

Both hooks are called synchronously by the module: it does not wait on an async listener, so do
long work after the export rather than expecting it to block.

---

## Permissions

This module does not check permissions on the API path — its own UI entry points only appear for
character actors the user can observe, and a caller is expected to apply its own rules. Generation
happens entirely in the calling user's browser, so an export only ever contains data that user's
client already has.
