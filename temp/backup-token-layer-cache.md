# Token UI Layer Cache (disabled — backup)

This file contains the README section for the **Cache Token UI Layer** feature, extracted so it can be restored later.

---

#### Caching the entire UI layer

<table>
<tr><th>Setting disabled</th><th>Setting enabled</th></tr>
<tr>
<td>

| Target                    | GPU ms | CPU ms |
| ------------------------- | ------ | ------ |
| **Total**                 | 23.150 | 8.367  |
| **Interface Layer**       | 9.297  | 2.933  |
| &nbsp;&nbsp;TokenLayer    | 9.110  | 1.067  |

</td>
<td>

| Target                    | GPU ms | CPU ms |
| ------------------------- | ------ | ------ |
| **Total**                 | 13.569 | 6.767  |
| **Interface Layer**       | 0.836  | 1.500  |
| &nbsp;&nbsp;TokenLayer    | 0.573  | 0.100  |

</td>
</tr>
</table>

Even after all the previous optimizations, the full interface still re-renders every frame only to (usually) produce the exact same output. Token UI rarely changes only on HP updates, status effects, movement, or canvas pan/zoom.

This hack bakes the interface pass into two viewport-sized textures: a void mask and a token UI layer. On unchanged frames those two textures replace the entire interface pass with two GPU blits. When something does change, the cache is invalidated and the full render runs once to rebake both. Scenes with animated content (video tokens, ember dynamic tokens) bypass the cache automatically.

Setting: **Cache Token UI Layer**.

<details>
<summary>Performance Snapshot</summary>

| Target                                        | GPU ms | CPU ms |
| --------------------------------------------- | ------ | ------ |
| **PrimaryCanvasGroup**                        | 9.225  | 0.800  |
| **CanvasVisibility**                          | 0.000  | 0.000  |
| **Canvas Effects**                            | 3.509  | 4.466  |
| &nbsp;&nbsp;CanvasBackgroundAlterationEffects | 1.531  | 1.533  |
| &nbsp;&nbsp;CanvasIlluminationEffects         | 0.348  | 1.333  |
| &nbsp;&nbsp;CanvasColorationEffects           | 1.418  | 1.500  |
| &nbsp;&nbsp;CanvasDarknessEffects             | 0.212  | 0.100  |
| **Interface Layer**                           | 0.836  | 1.500  |
| &nbsp;&nbsp;GridLayer                         | 0.263  | 0.000  |
| &nbsp;&nbsp;RegionLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;TokenLayer                        | 0.573  | 0.100  |
| &nbsp;&nbsp;TilesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;TemplatesLayer                    | 0.000  | 0.067  |
| &nbsp;&nbsp;DrawingsLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;WallsLayer                        | 0.000  | 1.033  |
| &nbsp;&nbsp;NotesLayer                        | 0.000  | 0.000  |
| &nbsp;&nbsp;SoundsLayer                       | 0.000  | 0.000  |
| &nbsp;&nbsp;LightingLayer                     | 0.000  | 0.000  |
| &nbsp;&nbsp;ControlsLayer                     | 0.000  | 0.300  |
| **Total**                                     | 13.569 | 6.767  |

</details>
