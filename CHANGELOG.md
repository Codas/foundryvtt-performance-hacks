## 0.5.3

- Fix token effect duplication in case of async \_drawEffect base implementation

## 0.5.2

- Add support for modules overriding the token effects ui

## 0.5.1

- Add support for barbrawl module
- This module now requires libwrapper to be installed

## 0.4.0

- Batch tokens with dynamic token ring together to minimize draw calls in void mesh
  drawing phase
- Fix typos in readme and english translation

## 0.3.7

- Add french translation. Thank you @Dolgrenn!

## 0.3.6

- Add polish translation. Thank you @Lioheart!

## 0.3.5

- Update module compatibility fields

## 0.3.4

- Rename Module

## 0.3.3

- Fix token hp bar resolution not scaling based on performance setting

## 0.3.2

- Fix Token effect caching being enabled even for dorako UX radial token hud, leading to lower than expected fidelity.
- Make texture cache resolution depend on performance setting. Increases fidelity on medium and maximum settings.

## 0.3.1

- Enable culling when rendering children in batches

## 0.3.0

- More intelligent batching by grouping tokens in sets of token that don't overlap with eachother

## 0.2.2

- Fix blank canvas after deleting a token

## 0.2.1

- Fix token ui elements being drawn when token itself should be invisible

## 0.2.0

- New setting! Optimize Token UI Render Batching. Has the same impact as the old
  Optimize Interface Clipping option, but is more generall applicable,
  performant and does not require as many hacks and workarounds.
- New setting! Cache Token Effects. This enables texture caching for token effect
  icons and improves the batch rendering.
- Remove Cache Token Nameplate setting. It turns out text rendering can be efficiently
  batched on its own.
- Remove Optimize Interface Clipping setting as the new Token UI Render Batchinging setting
  is a much cleaner solution and just as fast and with fewer problems.
- Add German localization.
- This module should now work for all systems and was for PF2e and D&D 5e specifically.

## 0.1.2

- More fixes for errors that might result in a black canvas.

## 0.1.1

- Fix token dragging sometimes rersulting in a black canvas.

## 0.1.0

Initial Release!

- Provide settings to activate or disable certain performance hacks in foundry.
- All settings are enabled by default
