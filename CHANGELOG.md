## 0.11.4

- Fix issue with control icons in Foundry v12

## 0.11.3

- Fix an issue with control icons not being optimized in certain cases

## 0.11.2

- Update Polish translations (thanks @Lioheart)
- Add Japanese translations (thanks @ryotai-trpg)

## 0.11.1

- Fix typo in module settings (thanks @nschoenwald)

## 0.11.0

- Simplify animated lights optimizations
- Improve quality of precomputed noise textures

## 0.10.6

- Make spritesheet based control icon drawing less intrusive to other modules

## 0.10.5

- Make custom render scale settings menu available to non-gm users

## 0.10.4

- Fix radial gradients in dynamic tokens when using spritesheets for subject textures in v12
- Update german translations
- Update polish translations (thanks @Lioheart)

## 0.10.3

- Fix setting defaults and v12 issues

## 0.10.2

- Fix application templates not being included in module package

## 0.10.1

- Fix styles not being included in module package

## 0.10.0

- Add reduced render scaling option for lighting passes.
  - By default, only illumination and darkness effects are rendered with reduced resolution. This should have no visible impact at all as illumination passes don't have detailed features anyway.
- Tweak noise textures for improved fidelity
- Add option to disable blurred window backgrounds in Application V2

## 0.9.2

- Update polish translations (thanks @Lioheart)
- Improve noise textures fidelity and size
- Add optimized light shaders for black hole, roiling darkness, and light dome animations

## 0.9.1

- Fix Foundry v12 compatibility

## 0.9.0

- Add animated lights shader optimizations. The following animations have been optimized: Bewitching Wave, Fairy Light, Ghostly Light, Smoke Patch, Swirling Fog, Vortex

## 0.8.3

- Update polish translations (thanks @Lioheart)

## 0.8.2

- Re-Enable spritesheet based texture replacement
- Improve render batching of ambient sounds and light overlays
- Add settings menu to register custom spritesheets
- Patch dynamic ring rendering code to support spritesheet token subject images

## 0.8.1

- Revert 0.8.0 for now

## 0.8.0

- Add spritesheet based icon replacement

## 0.7.0

- Confirmed working in Foundry VTT v13

## 0.6.7

- Increase texture caching size further for very small grid sizes

## 0.6.6

- Increase resolution of cached textures for lowest performance setting

## 0.6.5

- Fix issues with bar brawl module
- Fix issues with effect hider module

## 0.6.4

- Update polish translations (thanks @Lioheart)

## 0.6.3

- Really Fix vision/light/etc calculation not working for certain walls (created bottom-to-top or right-to-left)

## 0.6.2

- Fix vision/light/etc calculation not working for certain walls (created bottom-to-top or right-to-left)

## 0.6.1

- Fix vision/light/etc calculation not working in when no bounding enclosing walls are in range

## 0.6.0

- Improve performance of collision checks in foundry. This greatly improves occlusion checks for the levels
  module and calculation of aura templates for the pf2e system.

## 0.5.6

- Fix bounds calculation for tokens.
  This should fix cases where interface elements were not covered correctly by token images

## 0.5.5

- Fix token effects caching issues with modules that prevent refreshEffects render flag from being set

## 0.5.4

- Fix token effects caching issues with Token Variant Art and potentially other modules

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
