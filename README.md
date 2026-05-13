# Foundry VTT Prime Performance

<a href='https://ko-fi.com/J3J6YWWB4' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi3.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

Multiply your Foundry VTT Performance by your favorite prime number![^1][^2] Without impact on the visual fidelity[^3]

| Default Performance                                                                                                          | Prime Performance                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [![default-performance](img/readmev2/comparison/default-performance.webp)](img/readmev2/comparison/default-performance.webp) | [![Prime Performance](img/readmev2/comparison/prime-performance.webp)](img/readmev2/comparison/prime-performance.webp) |

Or going from 25 FPS to 74 FPS.

> [!NOTE]
> The above scene is a crop from the [levels demo scene module](https://foundryvtt.com/packages/restored-keep-levels) provided for Foundry VTT v14. I added 31 Tokens with dynamic token rings, all with HP and name Tag active, some with elevation markers visible and status effects applied. Walls Layer active and 16 notes placed in various rooms. Unmodified scene otherwise (showing the first floor)
> _Meassurements taken on a MacBook Pro M1 Max (24 GPU cores)_

[^1]: If your favorite prime number is one of 2, 3, 5, or somewhere inbetween.

[^2]: Greatest speedup in scenes with many animated lights, tokens with visible UI, or the walls layer.

[^3]: HP bars and status effects might look a bit blurry on the lowest Foundry performance setting.

## DISCLAIMER

This should be safe and has been tested to the best of my ability. BUT Foundry might switch around stuff in future updates that makes these hacks obsolete (which would be the best case) or just breaks the module.

Please use this module at your own risk and if you notice visual glitches (names, resource bars not working or other token-related stuff) please [let me know](https://github.com/Codas/foundryvtt-performance-hacks/issues/new) so I can fix it!

This module does not persist any data except for settings, so a simple reload with the module or individual settings disabled should revert everything back to normal.

## Supported Foundry Versions

The current version of this module supports Foundry VTT version 13 and 14.

## Expected performance gains

The exact gain depends heavily on the scene. The module targets a number of specific bottlenecks, and you will notice the most improvement in scenes with:

- Many animated lights using effects like Bewitching Wave, Fairy Light, or Swirling Fog
- Many tokens with resource bars, status effects, and/or nameplates visible
- Many notes, lights, sounds, or other control icons on the map
- The walls layer active
- Running the ember campaign

## How it works

The module is a collection of independent hacks that each target one specific bottleneck in Foundry's renderer. Every feature ships **on by default** unless noted otherwise. The section that describes each hack also names the setting that controls it.

If you just want it to work, you can stop here. The rest is for the curious.

## Give me the details

Below is a detailed list of all implemented "hacks" or improvements to the foundry rendering pipeline. Almost all or focused on GPU performance, but many also reduce CPU overhead.
Each section comes with a performance capture formatted as a markdown table.

### Establishing the Baseline

Foundry renders various canvas elements in grpups layers. The notable ones are:

- Primary Canvas Gruoup: Token images, tiles and weather effects
- Canvas Visibility: Masking layer for canvas visibility
- Canvas Effects: Various lighting related effects. Think animated lights, scene darkness level etc.
- Interface Layer: The grid, token UI, regions, map notes, controls for lights and sounds, tiles, walls, ...

This module mainly improves rendering performance of the interface and canvas effects (lighting) layer, with some minor improvements to the Token rendering in the primary canvas group.

<details>
<summary>Performance Snapshot</summary>

| Target                                        | GPU ms | CPU ms |
| --------------------------------------------- | ------ | ------ |
| **PrimaryCanvasGroup**                        | 9.463  | 0.800  |
| **CanvasVisibility**                          | 0.000  | 0.000  |
| **Canvas Effects**                            | 6.732  | 4.433  |
| &nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.556  | 1.300  |
| &nbsp;&nbsp;CanvasIlluminationEffects         | 0.699  | 1.433  |
| &nbsp;&nbsp;CanvasColorationEffects           | 4.131  | 1.600  |
| &nbsp;&nbsp;CanvasDarknessEffects             | 0.346  | 0.100  |
| **Interface Layer**                           | 21.731 | 31.934 |
| &nbsp;&nbsp;GridLayer                         | 0.180  | 0.000  |
| &nbsp;&nbsp;RegionLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;TokenLayer                        | 17.428 | 4.967  |
| &nbsp;&nbsp;TilesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;TemplatesLayer                    | 0.021  | 0.133  |
| &nbsp;&nbsp;DrawingsLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;WallsLayer                        | 2.438  | 25.067 |
| &nbsp;&nbsp;NotesLayer                        | 1.664  | 1.767  |
| &nbsp;&nbsp;SoundsLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;LightingLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;ControlsLayer                     | 0.000  | 0.000  |
| **Total**                                     | 37.927 | 37.167 |

</details>

### Cache Wall Graphics as Sprites

<table>
<tr><th>Setting disabled</th><th>Setting enabled</th></tr>
<tr>
<td>

| Target                 | GPU ms | CPU ms |
| ---------------------- | ------ | ------ |
| **Total**              | 37.927 | 37.167 |
| &nbsp;&nbsp;WallsLayer | 2.438  | 25.067 |

</td>
<td>

| Target                 | GPU ms | CPU ms |
| ---------------------- | ------ | ------ |
| **Total**              | 35.492 | 15.900 |
| &nbsp;&nbsp;WallsLayer | 0.000  | 1.333  |

</td>
</tr>
</table>
Lets start with the big one, especially for the CPU: The walls layer.
Foundry draws each wall as two `PIXI.Graphics` objects: one for the line body and one for the two endpoint circles. Graphics objects are not batched in PIXI's renderin pipeline, so every wall needs two draw calls. A scene with a few hundred wall segments can spend 600+ draw calls just on drawing the wall controls.

The hack pre-bakes a small set of wall textures (line body plus endpoint circle in normal and hover sizes) and renders walls as plain sprites tinted to their per-wall colour. All walls batch into one draw call (almost) regardless of count and are rendered with just 6 triangles per wall segment.

Setting: **Cache Wall Graphics as Sprites**.

<details>
<summary>Performance Snapshot</summary>

| Target                                        | GPU ms | CPU ms |
| --------------------------------------------- | ------ | ------ |
| **PrimaryCanvasGroup**                        | 9.758  | 1.067  |
| **CanvasVisibility**                          | 0.000  | 0.000  |
| **Canvas Effects**                            | 6.670  | 5.233  |
| &nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.588  | 1.633  |
| &nbsp;&nbsp;CanvasIlluminationEffects         | 0.527  | 1.667  |
| &nbsp;&nbsp;CanvasColorationEffects           | 4.184  | 1.833  |
| &nbsp;&nbsp;CanvasDarknessEffects             | 0.371  | 0.100  |
| **Interface Layer**                           | 19.064 | 9.599  |
| &nbsp;&nbsp;GridLayer                         | 0.162  | 0.000  |
| &nbsp;&nbsp;RegionLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;TokenLayer                        | 17.120 | 5.700  |
| &nbsp;&nbsp;TilesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;TemplatesLayer                    | 0.020  | 0.133  |
| &nbsp;&nbsp;DrawingsLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;WallsLayer                        | 0.000  | 1.333  |
| &nbsp;&nbsp;NotesLayer                        | 1.762  | 2.367  |
| &nbsp;&nbsp;SoundsLayer                       | 0.000  | 0.033  |
| &nbsp;&nbsp;LightingLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;ControlsLayer                     | 0.000  | 0.033  |
| **Total**                                     | 35.492 | 15.900 |

</details>

### Control icons (Cache Control Icons)

<table>
<tr><th>Setting disabled</th><th>Setting enabled</th></tr>
<tr>
<td>

| Target                 | GPU ms | CPU ms |
| ---------------------- | ------ | ------ |
| **Total**              | 35.492 | 15.900 |
| &nbsp;&nbsp;NotesLayer | 1.664  | 1.767  |

</td>
<td>

| Target                 | GPU ms | CPU ms |
| ---------------------- | ------ | ------ |
| **Total**              | 33.824 | 12.900 |
| &nbsp;&nbsp;NotesLayer | 0.000  | 0.033  |

</td>
</tr>
</table>

A `ControlIcon` in Foundry VTT the small interactive icon used by notes, lights, sounds, and drawings on the canvas. Each one is a container holding two `PIXI.Graphics` objects (background, border) plus a sprite for the icon and a `PreciseText` tooltip that is only active on hover by default. Together these cost about four draw calls per icon and none of them batch with anything else since graphics and sprites are different shaders. Graphics are also, as we learned, quite expensive to render both on the CPU and GPU.

The hack caches each `ControlIcon` to a temporary texture after its initial draw so it flattens into a single sprite. All icons on screen then batch into regular texture drawing batches. The cache is automatically dropped while you hover over an icon, so the highlight state still animates correctly.

Setting: **Cache Control Icons**.

<details>
<summary>Performance Snapshot</summary>

| Target                                        | GPU ms | CPU ms |
| --------------------------------------------- | ------ | ------ |
| **PrimaryCanvasGroup**                        | 9.985  | 0.967  |
| **CanvasVisibility**                          | 0.000  | 0.000  |
| **Canvas Effects**                            | 6.691  | 4.800  |
| &nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.673  | 1.567  |
| &nbsp;&nbsp;CanvasIlluminationEffects         | 0.513  | 1.433  |
| &nbsp;&nbsp;CanvasColorationEffects           | 4.154  | 1.800  |
| &nbsp;&nbsp;CanvasDarknessEffects             | 0.351  | 0.000  |
| **Interface Layer**                           | 17.147 | 7.132  |
| &nbsp;&nbsp;GridLayer                         | 0.160  | 0.033  |
| &nbsp;&nbsp;RegionLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;TokenLayer                        | 16.877 | 5.100  |
| &nbsp;&nbsp;TilesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;TemplatesLayer                    | 0.027  | 0.067  |
| &nbsp;&nbsp;DrawingsLayer                     | 0.000  | 0.033  |
| &nbsp;&nbsp;WallsLayer                        | 0.000  | 1.333  |
| &nbsp;&nbsp;NotesLayer                        | 0.000  | 0.033  |
| &nbsp;&nbsp;SoundsLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;LightingLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;ControlsLayer                     | 0.083  | 0.533  |
| **Total**                                     | 33.824 | 12.900 |

</details>

### Optimize animated lights

<table>
<tr><th>Setting disabled</th><th>Setting enabled</th></tr>
<tr>
<td>

| Target                                                    | GPU ms | CPU ms |
| --------------------------------------------------------- | ------ | ------ |
| **Total**                                                 | 33.824 | 12.900 |
| &nbsp;&nbsp;**Canvas Effects**                            | 6.691  | 4.800  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.673  | 1.567  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasIlluminationEffects         | 0.513  | 1.433  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasColorationEffects           | 4.154  | 1.800  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasDarknessEffects             | 0.351  | 0.000  |

</td>
<td>

| Target                                                    | GPU ms | CPU ms |
| --------------------------------------------------------- | ------ | ------ |
| **Total**                                                 | 31.439 | 12.333 |
| &nbsp;&nbsp;**Canvas Effects**                            | 4.655  | 4.567  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.732  | 1.400  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasIlluminationEffects         | 0.759  | 1.367  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasColorationEffects           | 1.849  | 1.667  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasDarknessEffects             | 0.315  | 0.133  |

</td>
</tr>
</table>

Several built-in animated light effects (Bewitching Wave, Fairy Light, Ghostly Light, Smoke Patch, Swirling Fog, Vortex, and a few more) compute a type of noise pattern (Fractal Brownian Motion, or FBM) in their shaders - on demand and sometimes multiple times per pixel. FBM is expensive, especially on integrated and lower-end GPUs.

The hack patches the shaders to sample a precomputed tiling noise FBM texture instead. Visually indistinguishable from the original and dramatically cheaper to render. The texture costs a few additional MB of VRAM per client, probably less than one extra token on the canvas. This setting affects mainly the CanvasColorationEffects layer with only a select few animated lights also using FBM on the CanvasIlluminationEffects layer.

The Restored Keep scene only has a very limited amount of animated lights that make use of this noise pattern, so the gains are somewhat muted but still nice to see.

Setting: **Optimize animated lights**.

<details>
<summary>Performance Snapshot</summary>

| Target                                        | GPU ms | CPU ms |
| --------------------------------------------- | ------ | ------ |
| **PrimaryCanvasGroup**                        | 10.305 | 0.967  |
| **CanvasVisibility**                          | 0.000  | 0.000  |
| **Canvas Effects**                            | 4.655  | 4.567  |
| &nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.732  | 1.400  |
| &nbsp;&nbsp;CanvasIlluminationEffects         | 0.759  | 1.367  |
| &nbsp;&nbsp;CanvasColorationEffects           | 1.849  | 1.667  |
| &nbsp;&nbsp;CanvasDarknessEffects             | 0.315  | 0.133  |
| **Interface Layer**                           | 16.479 | 6.800  |
| &nbsp;&nbsp;GridLayer                         | 0.177  | 0.033  |
| &nbsp;&nbsp;RegionLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;TokenLayer                        | 16.186 | 4.967  |
| &nbsp;&nbsp;TilesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;TemplatesLayer                    | 0.022  | 0.033  |
| &nbsp;&nbsp;DrawingsLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;WallsLayer                        | 0.000  | 1.400  |
| &nbsp;&nbsp;NotesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;SoundsLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;LightingLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;ControlsLayer                     | 0.094  | 0.367  |
| **Total**                                     | 31.439 | 12.333 |

</details>

### Lighting effects resolution (Scale Lighting Effects Resolution)

<table>
<tr><th>Setting disabled</th><th>Setting enabled</th></tr>
<tr>
<td>

| Target                                                    | GPU ms | CPU ms |
| --------------------------------------------------------- | ------ | ------ |
| **Total**                                                 | 31.439 | 12.333 |
| &nbsp;&nbsp;**Canvas Effects**                            | 4.655  | 4.567  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.732  | 1.400  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasIlluminationEffects         | 0.759  | 1.367  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasColorationEffects           | 1.849  | 1.667  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasDarknessEffects             | 0.315  | 0.133  |

</td>
<td>

| Target                                                    | GPU ms | CPU ms |
| --------------------------------------------------------- | ------ | ------ |
| **Total**                                                 | 30.666 | 12.100 |
| &nbsp;&nbsp;**Canvas Effects**                            | 3.965  | 4.500  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.834  | 1.600  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasIlluminationEffects         | 0.256  | 1.300  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasColorationEffects           | 1.666  | 1.600  |
| &nbsp;&nbsp;&nbsp;&nbsp;CanvasDarknessEffects             | 0.209  | 0.000  |

</td>
</tr>
</table>

Lighting effects render at full canvas resolution by default (in v13). Some layers, especially illumination and darkness, have very smooth gradients and lose nothing at lower internal resolution. Others (coloration for example) can be very noticable in certain circumstances.

Foundry v14 already renderes the illumination layer at 50% resolution on all performance settings below maximum. Prime Performance extends this to give you individual control over each lighting layer and makes the option available regardless of your performance setting.

The defaults are:

- **Illumination:** 40%. Almost no visible impact, decent performance gain.
- **Darkness:** 50%. Minimal visible impact.
- **Background:** 100%. High visual impact, low performance impact.
- **Coloration:** 100%. Highly variable visual impact depending on the lights in the scene.

You can override every layer individually via the **Configure Render Scale** menu (accessible from the **Lighting Effects Render Scale** button in settings). 100 means full resolution, 50 means half, and so on.

Setting: **Scale Lighting Effects Resolution** (plus the Render Scale configuration menu).

<details>
<summary>Performance Snapshot</summary>

| Target                                        | GPU ms | CPU ms |
| --------------------------------------------- | ------ | ------ |
| **PrimaryCanvasGroup**                        | 10.647 | 0.900  |
| **CanvasVisibility**                          | 0.000  | 0.000  |
| **Canvas Effects**                            | 3.965  | 4.500  |
| &nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.834  | 1.600  |
| &nbsp;&nbsp;CanvasIlluminationEffects         | 0.256  | 1.300  |
| &nbsp;&nbsp;CanvasColorationEffects           | 1.666  | 1.600  |
| &nbsp;&nbsp;CanvasDarknessEffects             | 0.209  | 0.000  |
| **Interface Layer**                           | 16.252 | 6.700  |
| &nbsp;&nbsp;GridLayer                         | 0.202  | 0.100  |
| &nbsp;&nbsp;RegionLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;TokenLayer                        | 16.030 | 5.033  |
| &nbsp;&nbsp;TilesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;TemplatesLayer                    | 0.020  | 0.067  |
| &nbsp;&nbsp;DrawingsLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;WallsLayer                        | 0.000  | 1.067  |
| &nbsp;&nbsp;NotesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;SoundsLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;LightingLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;ControlsLayer                     | 0.090  | 0.433  |
| **Total**                                     | 30.666 | 12.100 |

</details>

#### Mesh geometry fitting

<table>
<tr><th>Setting disabled</th><th>Setting enabled</th></tr>
<tr>
<td>

| Target                             | GPU ms | CPU ms |
| ---------------------------------- | ------ | ------ |
| **Total**                          | 30.666 | 12.100 |
| &nbsp;&nbsp;**PrimaryCanvasGroup** | 11.247 | 0.900  |
| &nbsp;&nbsp;TokenLayer             | 16.030 | 5.033  |

</td>
<td>

| Target                             | GPU ms | CPU ms |
| ---------------------------------- | ------ | ------ |
| **Total**                          | 30.300 | 12.367 |
| &nbsp;&nbsp;**PrimaryCanvasGroup** | 10.831 | 0.833  |
| &nbsp;&nbsp;TokenLayer             | 15.167 | 5.167  |

</td>
</tr>
</table>

By default every token and tile is drawn as a simple rectangle, wasting GPU time on fully transparent edges. Mesh geometry fitting replaces that rectangle with a tight convex hull (up to 8 vertices) that closely follows the visible area of the texture, cutting rendered area by 50–85% for typical circular token art and reducing overdraw proportionally.

[![Librarian - 15% of original area](./img/readmev2/overdraw.webp)](./img/readmev2/overdraw.webp)

The white outline is the original quad, cyan is the fitted polygon, and the percentage is the fraction of the original area still being drawn. The fitting applies to both the token mesh in the primary canvas group and the ERASE pass in the interface layer, hence the improved performance in both the primary canvas group and the interface layer.

Skipped automatically for animated (video) tokens and tiles.

> [!NOTE]
> The debug mesh outlines can be enabled in the developer console with the command
>
> ```
> PrimePerformance.meshGeometryFitting.toggleDebug(true)
> ```

Setting: **Fit Token & Tile Mesh Geometry**.

<details>
<summary>Performance Snapshot</summary>

| Target                                        | GPU ms | CPU ms |
| --------------------------------------------- | ------ | ------ |
| **PrimaryCanvasGroup**                        | 10.831 | 0.833  |
| **CanvasVisibility**                          | 0.000  | 0.000  |
| **Canvas Effects**                            | 3.871  | 4.734  |
| &nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.866  | 1.600  |
| &nbsp;&nbsp;CanvasIlluminationEffects         | 0.338  | 1.400  |
| &nbsp;&nbsp;CanvasColorationEffects           | 1.449  | 1.667  |
| &nbsp;&nbsp;CanvasDarknessEffects             | 0.218  | 0.067  |
| **Interface Layer**                           | 15.600 | 6.801  |
| &nbsp;&nbsp;GridLayer                         | 0.169  | 0.033  |
| &nbsp;&nbsp;RegionLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;TokenLayer                        | 15.167 | 5.167  |
| &nbsp;&nbsp;TilesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;TemplatesLayer                    | 0.107  | 0.067  |
| &nbsp;&nbsp;DrawingsLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;WallsLayer                        | 0.000  | 1.067  |
| &nbsp;&nbsp;NotesLayer                        | 0.000  | 0.067  |
| &nbsp;&nbsp;SoundsLayer                       | 0.000  | 0.033  |
| &nbsp;&nbsp;LightingLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;ControlsLayer                     | 0.157  | 0.367  |
| **Total**                                     | 30.300 | 12.367 |

</details>

### Token UI rendering

All other settings focus on improving the Rendering of the Token UI layer. In the example scene Token UI rendering still takes up about 13ms on the GPU, 5ms on the GPU, so almost half of the time spent rendering the scene respectively.

The hacks that follow together help to bring this down to close to 0ms for most frames and about half the current time otherwise.

To understand the following concepts, let us take a brief look at how Foundry renders token UIs. This is the final image as foundry renders it. A scene with four River Drakes with status effects and one Gug:

![Final image with one Gug in the center and 2 river drakes each to the left and right](./img/readmev2/explanation/00-full-ui.webp)

To actually render this scene as above, several steps are necessary

1. Rendering the background. Token art, litghting etc\
   ![Tokens on white background](./img/readmev2/explanation/01-background.webp)
2. Rendering the grid on a new transparent layer (background kept 50% transparent for reference in this example)\
   ![Grid on top of the tokens](./img/readmev2/explanation/02-grid.webp)
3. Now the grid is on top of the tokens, which is not our intended final result. So the tokens are drawn again in ERASE mode (this is called the void mesh phase), removing the grid and everything else in the UI layer underneath them. First one River Drake.\
   ![Hole punched through the bottom left UI in form of the river drake token](./img/readmev2/explanation/03-hole-punch.webp)
4. Then that River Drake's UI is drawn\
   ![UI for the river drake on the bottom left](./img/readmev2/explanation/04-first-ui.webp)
5. Then one by one, all the other tokens are drawn in erase mode with UI elements being drawn in between until all river drakes are done\
   ![UI for all the river drakes](./img/readmev2/explanation/05-drake-uis.webp)
6. Finally, the big token in the center is drawn in erase mode and the UI added\
   ![UI for all the river drakes](./img/readmev2/explanation/07-gug-ui.webp)

After that, other UI elements like notes and Walls are draw on this texture, which is finally composited with the background to acive the result above.

#### Token Effect caching

<table>
<tr><th>Setting disabled</th><th>Setting enabled</th></tr>
<tr>
<td>

| Target                 | GPU ms | CPU ms |
| ---------------------- | ------ | ------ |
| **Total**              | 30.300 | 12.367 |
| &nbsp;&nbsp;TokenLayer | 15.167 | 5.167  |

</td>
<td>

| Target                 | GPU ms | CPU ms |
| ---------------------- | ------ | ------ |
| **Total**              | 27.419 | 11.333 |
| &nbsp;&nbsp;TokenLayer | 13.418 | 4.433  |

</td>
</tr>
</table>

Token status effect icons are rendered as a mixed bag of `PIXI.Graphics` objects (borders, circular backgrounds) and sprites (the actual icon textures). Graphics objects are expensive to draw and, critically, break PIXI's sprite batching: every graphics object forces a batch flush, so a row of ten status icons can cost ten or more separate draw calls even though they are visually tiny.

The hack wraps `Token._applyRenderFlags` and, after any redraw that touches the effects container, calls PIXI's `cacheAsBitmap` on it. This renders the entire effects container into a texture once and replaces subsequent draws with a single sprite. The cache is dropped and rebuilt the next time the effects actually change (status applied, removed, token refreshed).

Not applied when Dorako UX's radial token HUD or pf2e-effects-halo is active, as those modules replace the effect icons with their own pre-rendered textures and do not benefit from an extra caching pass.

<details>
<summary>Performance Snapshot</summary>

| Target                                        | GPU ms | CPU ms |
| --------------------------------------------- | ------ | ------ |
| **PrimaryCanvasGroup**                        | 10.086 | 0.700  |
| **CanvasVisibility**                          | 0.000  | 0.000  |
| **Canvas Effects**                            | 3.603  | 4.566  |
| &nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.500  | 1.633  |
| &nbsp;&nbsp;CanvasIlluminationEffects         | 0.359  | 1.100  |
| &nbsp;&nbsp;CanvasColorationEffects           | 1.496  | 1.733  |
| &nbsp;&nbsp;CanvasDarknessEffects             | 0.248  | 0.100  |
| **Interface Layer**                           | 13.730 | 6.066  |
| &nbsp;&nbsp;GridLayer                         | 0.191  | 0.000  |
| &nbsp;&nbsp;RegionLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;TokenLayer                        | 13.418 | 4.433  |
| &nbsp;&nbsp;TilesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;TemplatesLayer                    | 0.029  | 0.033  |
| &nbsp;&nbsp;DrawingsLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;WallsLayer                        | 0.000  | 1.167  |
| &nbsp;&nbsp;NotesLayer                        | 0.000  | 0.033  |
| &nbsp;&nbsp;SoundsLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;LightingLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;ControlsLayer                     | 0.092  | 0.400  |
| **Total**                                     | 27.419 | 11.333 |

</details>

#### Token Resource Bar caching

<table>
<tr><th>Setting disabled</th><th>Setting enabled</th></tr>
<tr>
<td>

| Target                 | GPU ms | CPU ms |
| ---------------------- | ------ | ------ |
| **Total**              | 27.419 | 11.333 |
| &nbsp;&nbsp;TokenLayer | 13.418 | 4.433  |

</td>
<td>

| Target                 | GPU ms | CPU ms |
| ---------------------- | ------ | ------ |
| **Total**              | 25.989 | 10.500 |
| &nbsp;&nbsp;TokenLayer | 11.700 | 3.167  |

</td>
</tr>
</table>

Token resource bars are drawn as `PIXI.Graphics`. At least one for the bar background, one for the colored fill, and sometimes more for border or segmentation. Like all graphics objects these do not batch with sprites and each bar triggers its own draw call, adding up quickly in a scene full of tokens.

This hack once again employs caching to only re-draw the resource bars when they have been changed and otherwise simply copy a texture of the cached resource bar to the canvas.

<details>
<summary>Performance Snapshot</summary>

| Target                                        | GPU ms | CPU ms |
| --------------------------------------------- | ------ | ------ |
| **PrimaryCanvasGroup**                        | 10.240 | 0.833  |
| **CanvasVisibility**                          | 0.000  | 0.000  |
| **Canvas Effects**                            | 3.744  | 4.566  |
| &nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.565  | 1.600  |
| &nbsp;&nbsp;CanvasIlluminationEffects         | 0.376  | 1.300  |
| &nbsp;&nbsp;CanvasColorationEffects           | 1.547  | 1.633  |
| &nbsp;&nbsp;CanvasDarknessEffects             | 0.256  | 0.033  |
| **Interface Layer**                           | 12.005 | 5.101  |
| &nbsp;&nbsp;GridLayer                         | 0.212  | 0.067  |
| &nbsp;&nbsp;RegionLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;TokenLayer                        | 11.700 | 3.167  |
| &nbsp;&nbsp;TilesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;TemplatesLayer                    | 0.016  | 0.067  |
| &nbsp;&nbsp;DrawingsLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;WallsLayer                        | 0.000  | 1.200  |
| &nbsp;&nbsp;NotesLayer                        | 0.000  | 0.067  |
| &nbsp;&nbsp;SoundsLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;LightingLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;ControlsLayer                     | 0.077  | 0.533  |
| **Total**                                     | 25.989 | 10.500 |

</details>

#### Optimize Token UI Render Batching

<table>
<tr><th>Setting disabled</th><th>Setting enabled</th></tr>
<tr>
<td>

| Target                 | GPU ms | CPU ms |
| ---------------------- | ------ | ------ |
| **Total**              | 25.989 | 10.500 |
| &nbsp;&nbsp;TokenLayer | 11.700 | 3.167  |

</td>
<td>

| Target                 | GPU ms | CPU ms |
| ---------------------- | ------ | ------ |
| **Total**              | 23.150 | 8.367  |
| &nbsp;&nbsp;TokenLayer | 9.110  | 1.067  |

</td>
</tr>
</table>

We are almost there. Every token UI element now is a simple sprite. Except for the void mesh. but

After that, we start a new batch and check for more token UIs we can group together. This is also where more tightly fitted token meshes help us again. Having a tight outline means we can quite accurately determine if a token texture actually overlaps a UI element, greatly reducing false positives.

In the case of the Restored Keep example, we can now render all 31 tokens in just 10 batches instead of over 100 (five for erase, five for the actual UI elements).

Setting: **Optimize Token UI Render Batching**.

<details>
<summary>Performance Snapshot</summary>

| Target                                        | GPU ms | CPU ms |
| --------------------------------------------- | ------ | ------ |
| **PrimaryCanvasGroup**                        | 10.272 | 0.967  |
| **CanvasVisibility**                          | 0.000  | 0.000  |
| **Canvas Effects**                            | 3.583  | 4.466  |
| &nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.541  | 1.533  |
| &nbsp;&nbsp;CanvasIlluminationEffects         | 0.366  | 1.033  |
| &nbsp;&nbsp;CanvasColorationEffects           | 1.460  | 1.833  |
| &nbsp;&nbsp;CanvasDarknessEffects             | 0.216  | 0.067  |
| **Interface Layer**                           | 9.297  | 2.933  |
| &nbsp;&nbsp;GridLayer                         | 0.187  | 0.033  |
| &nbsp;&nbsp;RegionLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;TokenLayer                        | 9.110  | 1.067  |
| &nbsp;&nbsp;TilesLayer                        | 0.000  | 0.033  |
| &nbsp;&nbsp;TemplatesLayer                    | 0.000  | 0.267  |
| &nbsp;&nbsp;DrawingsLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;WallsLayer                        | 0.000  | 1.100  |
| &nbsp;&nbsp;NotesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;SoundsLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;LightingLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;ControlsLayer                     | 0.000  | 0.433  |
| **Total**                                     | 23.150 | 8.367  |

</details>
#### The result

In a heavy scene with many tokens, resource bars, and effects all visible, these four optimizations together typically take the interface pass from roughly 85 draw calls and 1000+ WebGL commands per frame down to roughly 36 calls and 440 commands. That saves about 8 ms per frame on the test setup. In FPS terms that has been the difference between a stuttery 55 FPS and a comfortable 100+ FPS.

Hardware varies. The numbers above are one data point from a heavy late-stage encounter scene. Gains on your machine could be smaller or larger.

## Module-specific hacks

### D&D 5e region markers

Foundry's D&D 5e system provides a special note type: Map Location. These are rendered using expensive PIXI graphics object and more importantly, each with their own blur filter applied, making them very expensive to render.

This hack replaces the graphics + filter stack with an graphics-based approximation that canb e cached, collapsing all region markers in a scene into a single batched draw call.

Setting: **Enable D&D 5 specific optimizations**.

### Ember campaign (experimental)

The [Ember campaign](https://foundryvtt.com/packages/ember) ships with a rich set of animated weather and environment shaders. Several of them are implemented in ways that are very expensive on the GPU, especially when multiple of these shaders are active in the same scene. This module replaces a number of those shaders with optimized variants that produce visually practically identical output at a fraction of the GPU cost:

- **Region and world weather** — the animated weather effects applied to the region and world scenes (rain, clouds, …)
- **Kaleidoscope** — the kaleidoscope effect in the region map and some area maps
- **Pollen** — floating particle effect used in outdoor and forest scenes and the region map
- **Stars / Cosmos** — the animated star field and nebula backgrounds used in the cosmos map and some area scenes
- **Magical Platforms** — Light bridges and similar objects in area scenes

Setting: **Optimize Ember Shaders**.

> [!WARNING]
> Ember is still in active development and rapidly evolving. Ember specific optimzations should work well with the current version 0.5.1 but future versions can and very likely will bring changes that clash with (some) of the optimizations made by this module.

**World map** (world weather shader)

| Default | Prime Performance |
| ------- | ----------------- |
| [![ember-world-default](img/readmev2/ember/world-default.webp)](img/readmev2/ember/world-default.webp) | [![ember-world-prime](img/readmev2/ember/world-prime.webp)](img/readmev2/ember/world-prime.webp) |

**Cosmos scene** (stars)

| Default | Prime Performance |
| ------- | ----------------- |
| [![ember-cosmos-default](img/readmev2/ember/cosmos-default.webp)](img/readmev2/ember/cosmos-default.webp) | [![ember-cosmos-prime](img/readmev2/ember/cosmos-prime.webp)](img/readmev2/ember/cosmos-prime.webp) |

**Region start scene** (pollen + region weather + kaleidoscope)

| Default | Prime Performance |
| ------- | ----------------- |
| [![ember-region-start-default](img/readmev2/ember/region-start-default.webp)](img/readmev2/ember/region-start-default.webp) | [![ember-region-start-prime](img/readmev2/ember/region-start-prime.webp)](img/readmev2/ember/region-start-prime.webp) |

**Region water scene** (region weather)

| Default | Prime Performance |
| ------- | ----------------- |
| [![ember-region-water-default](img/readmev2/ember/region-water-default.webp)](img/readmev2/ember/region-water-default.webp) | [![ember-region-water-prime](img/readmev2/ember/region-water-prime.webp)](img/readmev2/ember/region-water-prime.webp) |

**Lightless Halls** (stars + magical platform)

| Default | Prime Performance |
| ------- | ----------------- |
| [![ember-lightless-halls-default](img/readmev2/ember/lightless-halls-default.webp)](img/readmev2/ember/lightless-halls-default.webp) | [![ember-lightless-halls-prime](img/readmev2/ember/lightless-halls-prime.webp)](img/readmev2/ember/lightless-halls-prime.webp) |

### Disable application background blur

A pure CSS toggle. Turns off the `backdrop-filter: blur()` on Application V2 windows and other UI surfaces. On macOS and Apple Silicon this can be a surprisingly large win, often several full milliseconds per frame just for having a settings window open.

Setting: **Disable background blur effects**.

### Performance overlay

Always available when the module is loaded. To enable it, open the browser dev tools (F12 on windows) and run:

```js
PrimePerformance.overlay.open(); // open the overlay
PrimePerformance.overlay.close(); // close it
PrimePerformance.overlay.snapshot(); // returns the current snapshot as a markdown formatted string
```

The overlay shows per-layer **GPU** time (sampled via `EXT_disjoint_timer_query_webgl2` where supported) and **CPU** time, averaged over a rolling window of about one second. To enable this in firefox, the `webgl.enable-privileged-extensions` setting has to be enabled in `about:config`. If you do not know what this is, you probably should not enable it.
