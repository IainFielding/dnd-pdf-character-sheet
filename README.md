![](https://img.shields.io/badge/Foundry-v14-informational) ![Latest Release Download Count](https://img.shields.io/github/downloads/IainFielding/dnd-pdf-character-sheet/latest/module.zip?label=Downloads) <br>
# Simple D&D PDF Character Sheet

A Foundry VTT module that turns any D&D 5e player character into a completed, PDF character sheet with a single click. It reads everything straight from the actor's data, fills in an official-style sheet, and downloads
it to your computer ready to print or save.

Supports five layouts. Three are original, freely distributable designs of our own that carry all the
same fields as the official sheet plus an embedded character **portrait** — the **Fan Sheet (2024)**
("Modern Arcane": ink-blue and gold), the **Fantasy Sheet (2024)** ("Inked Tome": a monochrome,
hand-drawn woodcut style with a shield-shaped Armor Class, dice-hexagon ability scores and wax-seal
stats), and the **Fantasy Sheet (2014)** — the same "Inked Tome" style laid out for the 2014 rules,
with pennant banners, an open-book spellbook page and a clean white background. These three ship with
the module.

The other two are the official Wizards of the Coast **2024** and **2014** sheets. Those PDFs are
copyrighted, so they **cannot be bundled** with the module — but you can use your own copy. Download
each from D&D Beyond, upload it to Foundry, and select it in the export dialog (see
[Choosing the sheet layout](#choosing-the-sheet-layout) below).

---

## Requirements

- **Foundry VTT** version 14 or newer
- **D&D 5e** game system version 5.3.3 or newer

There is nothing else to install or configure. The module bundles everything it needs, and no data is ever sent anywhere. The PDF is built entirely inside your browser and saved directly to your device.

---

## Generating a character sheet

The module adds a **PDF Character Sheet** button in two places

### Actors Sidebar
menu of characters in the Actors sidebar.

1. In the **Actors** sidebar, find the character you want to export.
2. Right-click their name to open the context menu.
3. Click **PDF Character Sheet**.

![right click menu](docs/img/actor-context-window.png)

### Character Sheet Sidebar
in the menu system on the actors character sheet.

1. Open up the actors character sheet.
2. Click the ... menu at the top right of the sheet.
3. Click **PDF Character Sheet**.

![right click menu](docs/img/character-sheet-context-window.png)


---

## What ends up on the sheet

The module pulls the character's current data from Foundry and lays it out on
the sheet. This includes:

- **Header** — name, class and level (including subclass and multiclass),
  species/race, background, alignment, and experience points.
- **Ability scores and skills** — scores, modifiers, saving throws, skill
  totals, and proficiency markers, plus passive Perception.
- **Combat** — armour class, initiative, speed, hit points (max, current, and
  temporary), hit dice, proficiency bonus, and death saves.
- **Attacks** — your equipped weapons with their attack bonuses and damage.
  Extra weapons and a spell-attack summary flow into the notes area beneath.
- **Proficiencies and languages** — armour, weapon, and tool proficiencies, and
  known languages.
- **Features and traits** — class features, species traits, feats, and
  background features, each printed with its name.
- **Equipment and currency** — carried items (with quantities) and coins.
- **Character details** — personality traits, ideals, bonds, flaws, appearance,
  and backstory.
- **Spellcasting** — spellcasting ability, save DC, attack bonus, spell slots,
  and your known or prepared spells. Prepared spells are marked as such.
- **Portrait** — on the 2014 sheet, both Fantasy Sheets and the Fan Sheet (2024),
  the character's portrait image is embedded into the sheet.

The generated PDF remains editable in a PDF reader, so you can tweak values by hand after exporting, or fill in anything the sheet left blank.

![A completed 2024 character sheet PDF, page 1](docs/img/2024-character-sheet-page1.png)

---

## Choosing the sheet layout

Every time you export, a small window opens asking **which layout to export the data to**. Pick one
and click **Export**. Your choice is remembered and pre-selected next time.

The options are:

- **Fantasy Sheet (2024)** — the default; our original hand-drawn "Inked Tome" layout.
- **Fantasy Sheet (2014)** — the same "Inked Tome" style laid out for the 2014 rules.
- **Fan Sheet (2024)** — our original "Modern Arcane" layout.
- **2024 Official Sheet** and **2014 Official Sheet** — Wizards of the Coast's own sheets. These
  appear as choices **only once you have provided your own copy** (see below).

The **Fan Sheet (2024)**, **Fantasy Sheet (2024)** and **Fantasy Sheet (2014)** are original layouts
drawn by this project (see `tools/build-fan-sheet-2024.mjs`, `tools/build-fantasy-sheet-2024.mjs` and
`tools/build-fantasy-sheet-2014.mjs`). Each contains all the same fields as its edition's official
sheet, adds a portrait frame in the page-1 header, and — unlike the official templates — is our own
artwork, so it can be shared freely as Fan Content. All three generators
are deterministic; rerun them to rebuild the PDFs from source.

The layout you pick is per-user, so each person at the table can choose the one they prefer without
affecting anyone else.

### Using the official 2014 / 2024 sheets

The official sheets are copyrighted and are not distributed with the module. To use one:

1. Download the PDF from D&D Beyond:
   - **2024 sheet:** <https://media.dndbeyond.com/compendium-images/free-rules/ph/character-sheet.pdf>
   - **2014 sheet:** <https://media.dndbeyond.com/compendium-images/marketing/dnd_5e_charactersheet_formfillable.pdf>
2. In the export dialog, next to the official sheet you want, click **Choose file…**, then upload or
   browse to the PDF you downloaded.
3. That layout is now a selectable option and stays available for future exports.

---

## Notes on how content fits

Character sheets have a fixed amount of space, and some characters have more
detail than a printed sheet can hold. The module handles this gracefully:

- **Spells** that don't fit the printed spell table on the 2024 sheet continue
  on additional pages appended to the PDF, so nothing is lost.
- **Weapons, features, and other lists** that overflow their box are trimmed to
  what fits. If something is left off, a note is written to the browser console.
- Long descriptions are converted to plain text and sized to fit their boxes.

If you ever suspect something is missing, open the browser console (press
**F12**) after generating a sheet. Any content that could not fit is reported
there.

---

## Troubleshooting

**The "PDF Character Sheet" option doesn't appear.**
Make sure you are right-clicking a **player character** (not an NPC), and that
you have at least Observer permission on that character. The option is hidden
otherwise.

**I get an error notification instead of a download.**
A message reading _"Failed to generate the PDF character sheet"_ means something
went wrong while building the file. Open the browser console (**F12**) to see
the details, and please include that information if you report the issue.

**The download didn't start.**
Check your browser's pop-up or download settings. The file is delivered as a
normal browser download, so anything that blocks downloads will block it too.

---

## Support and feedback

This module is developed by **Iain Fielding** (Discord: _Sogrom_).

Bug reports and suggestions are welcome. Simply log them into the Github Issues. When reporting a problem, it helps to include the sheet layout you were using (2024 or 2014) and any messages from the
browser console.

---

## License

See the [LICENSE](LICENSE) file for details.
