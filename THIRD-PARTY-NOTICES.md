# Third-Party Notices

This module ships with the third-party components listed below. Each is redistributed under its
own licence, which grants you rights that the module's own [LICENSE](LICENSE) does not — see
clause 2 of that file. Nothing here is authored by the module's author.

| Component | Version | Licence | Shipped as |
| --- | --- | --- | --- |
| pdf-lib | 1.17.1 | MIT | `lib/pdf-lib.min.js` |
| tslib (bundled inside pdf-lib) | — | Apache-2.0 | `lib/pdf-lib.min.js` |
| @pdf-lib/fontkit | 1.1.1 | MIT | `lib/fontkit.umd.min.js` |
| pako (bundled inside fontkit) | — | MIT AND Zlib | `lib/fontkit.umd.min.js` |
| PT Sans | — | SIL Open Font License 1.1 | `fonts/PTSans-Regular.ttf`, `fonts/PTSans-Bold.ttf` |

---

## pdf-lib

Reads and writes the PDF documents this module fills.
Upstream: <https://github.com/Hopding/pdf-lib>

> MIT License
>
> Copyright (c) 2019 Andrew Dillon
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The minified bundle also contains the TypeScript runtime helpers (`tslib`), which carry their own
Apache-2.0 header inside `lib/pdf-lib.min.js`. Full text: <https://www.apache.org/licenses/LICENSE-2.0>

## @pdf-lib/fontkit

Parses TrueType fonts so pdf-lib can embed one. Loaded on demand, only when a sheet contains text
the PDF standard fonts cannot render.
Upstream: <https://github.com/Hopding/fontkit> (a repackaging of <https://github.com/foliojs/fontkit>)

Licensed under the MIT License, as declared by the published package. The MIT terms are reproduced
in full under *pdf-lib* above; they apply here with fontkit's own copyright holders.

The bundle embeds `pako`, licensed MIT AND Zlib:

> Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

## PT Sans

Embedded into generated PDFs when a character sheet contains text the PDF standard fonts cannot
render — Cyrillic, and the Latin Extended letters used by Polish, Czech, Hungarian, Turkish,
Romanian and Croatian. Designed by ParaType for the languages of Russia.

> Copyright (c) 2010, ParaType Ltd. (http://www.paratype.com/public),
> with Reserved Font Names "PT Sans" and "ParaType".
>
> This Font Software is licensed under the SIL Open Font License, Version 1.1.

The complete licence text is shipped alongside the fonts in [`fonts/OFL.txt`](fonts/OFL.txt).

Two points worth stating plainly, because they are the ones people ask about:

- **Generated character sheets are not encumbered.** The OFL says so explicitly: *"The requirement
  for fonts to remain under this license does not apply to any document created using the Font
  Software."* A player can do whatever they like with a sheet exported from this module.
- **The font is redistributed unmodified.** pdf-lib subsets it in the browser at export time, which
  affects only the generated document, so the Reserved Font Name and modified-version clauses are
  never engaged.
