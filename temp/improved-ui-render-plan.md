# Custom batched UI pass — MRT mask, no cache

## Context

The previous full-layer cache ([src/hacks/tokenLayerCache.ts](src/hacks/tokenLayerCache.ts)) tried to bake the UI framebuffer and blit it with ERASE + NORMAL. It broke on too many per-frame-changing cases (animated turn markers, video meshes, dynamic rings, filters, animations). Caching the rendered tokens turned out to be the main source of brittleness, so any new design must **win on perf even without caching**.

This plan attacks two costs without introducing any caches:

1. **Batch breaks** in the UI pass — today, every token does `void mesh (ERASE)` → flush → `UI (NORMAL)` → flush. ~2 flushes per token per frame.
2. **Double rasterization of token mesh shapes** — token meshes already rasterize once into the board, and a near-identical shape rasterizes again as the void mesh into the UI layer. We can eliminate the second rasterization by capturing the mask **as a free byproduct of the board pass** using MRT.

## Confirmed scene model

```text
root
├── game-board layer  (rendered first, into board-RT)
│   └── background, Token A mesh, Token B mesh, ...
└── UI layer          (rendered into UI-RT, then composited over board-RT)
 ├── grid
 ├── Token A UI (bars, nameplate, ring, effects, turn marker, control icon)
 └── Token B UI ...
```

Goal: UI-RT pixels get correctly attenuated (down to fully transparent) wherever a higher-z token's mesh covers them — exactly as today's per-token ERASE void-mesh pass produces — but with one blend mode throughout the UI pass and no second rasterization of the mesh shapes.

## Alpha semantics (must preserve)

Today's void mesh in ERASE blend gives `dst *= (1 - α)` per token. Tokens make heavy use of partial alpha (50%-visible, soft ring edges, fades). A binary discard is not acceptable. The replacement must apply smooth multiplicative attenuation.

## Approach — MRT board pass + sampler-attenuate UI pass

### Idea in one sentence

Add two extra color attachments to the board framebuffer — one capturing `(topTokenIndex, topMeshAlpha)` for token UI and one capturing the **chained transparency** `∏(1 - α_i)` for the grid — both produced as free byproducts of the existing token-mesh draws via the MRT trick that each attachment uses its own `gl_FragData[i].a` as `SRC_ALPHA` under one shared NORMAL blend func.

### Phase 1 — Board pass produces the mask via MRT (3 color attachments)

We need to encode two different per-pixel facts:

- For **token UI** attenuation: the topmost token's `(index, meshAlpha)` so a UI fragment can ask "is something above me, and how opaque is it". Approximation is acceptable.
- For the **grid** (and anything with `tokenIndex = 0`): the **chained** transparency `T = ∏(1 - α_i)` across ALL covering token meshes, so a fully-opaque token below a nearly-transparent token still fully hides the grid where vanilla does.

Trick: under one shared NORMAL blend func (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`), each color attachment uses **its own** `gl_FragData[i].a` as `SRC_ALPHA`. So one fragment shader can produce different effective blend behaviors per attachment by writing different alpha values to each `gl_FragData[i]`. No `OES_draw_buffers_indexed` needed.

1. Board framebuffer gets three color attachments:
   - `COLOR0` = existing board image (RGBA8).
   - `COLOR1` = "top token mask" (RG8 used; R = `tokenIndex/255`, G = `topMeshAlpha`).
   - `COLOR2` = "chained transparency" (R8 used; R = `T = ∏(1 - α_i)`).
2. **Clears at frame start:** `gl.clearBufferfv(COLOR, 0, [0,0,0,0])`, `gl.clearBufferfv(COLOR, 1, [0,0,0,0])`, `gl.clearBufferfv(COLOR, 2, [1,0,0,0])` (T starts at 1.0 = fully transparent = no occlusion).
3. Patch `TokenRingSamplerShader` so its fragment shader writes all three outputs:

   ```glsl
   gl_FragData[0] = vec4(boardRgb, meshAlpha);                   // standard board blend
   gl_FragData[1] = vec4(uTokenIndex/255.0, meshAlpha, 0.0, 1.0); // α=1 → REPLACE-via-NORMAL
   gl_FragData[2] = vec4(0.0, 0.0, 0.0, meshAlpha);              // α=mesh α → chains T
   ```

   Per-attachment blend math under NORMAL blend (`src.A` taken from each attachment's own alpha):
   - **COLOR0:** `dst' = src*meshα + dst*(1-meshα)` — standard board alpha blend.
   - **COLOR1:** `dst' = src*1 + dst*0 = src` — REPLACE; painter's order → highest-z token wins.
   - **COLOR2:** `dst.R' = 0 * meshα + dst.R * (1 - meshα) = dst.R * (1 - meshα)` — chains `T`. Order-independent (commutative).

   Verify with concrete numbers: tokens with α = 0.7 then 0.5, COLOR2.R starts at 1. After token 1: `1*0.3 = 0.3`. After token 2: `0.3*0.5 = 0.15 = (1-0.7)(1-0.5)`. ✓
4. **`drawBuffers` switching** keeps non-token batches from touching `COLOR1`/`COLOR2`: call `gl.drawBuffers([COLOR0, COLOR1, COLOR2])` around token-mesh batches, `gl.drawBuffers([COLOR0])` for everything else. One hook around the token batch start/end.

### Phase 2 — UI pass via a custom batch renderer + pluginName swap

Key insight (per user): we should NOT patch every UI shader. Almost every UI child is rendered as a PIXI `Sprite` (or PIXI `Text`, which compiles to a sprite). The only "not a sprite" UI element is the grid. So:

- Build **one** custom PIXI batch plugin ("`tokenUiBatch`") whose fragment shader = the default sprite batch shader **plus** the topIdx/topAlpha attenuation epilogue (samples `COLOR1`). This is the only "new" shader we author.
- For every token UI sprite, temporarily set `sprite.pluginName = 'tokenUiBatch'` so it routes through our batch renderer instead of PIXI's default. No edits to PIXI's default batch shader; no edits to bars/nameplate/effects/turn-marker/control-icon individually.
- For the grid (only non-sprite UI element): patch its shader once to inject a **different** epilogue that samples `COLOR2.R` (chained transparency `T`) and multiplies `gl_FragColor *= T`. This handles the "opaque token below a near-transparent top token" case correctly — that case is only meaningful for the grid (token UI almost always sits at its parent token's mesh, where the topAlpha approximation matches vanilla anyway).

Custom batch plugin details:

1. **Geometry layout:** start from PIXI's standard `BatchGeometry` (positions, uvs, color, textureId) and **append one extra per-vertex byte attribute `aTokenIndex`** (8-bit, 0–255). Each batched sprite contributes its parent token's index across its 4 vertices.
2. **Fragment shader** (single shader, written once):

   ```glsl
   // default batch shader body produces outColor as usual
   vec4 outColor = sampleAndTint();
   vec2 mp = texture2D(uTokenMaskMap, gl_FragCoord.xy / uViewportSize).rg; // COLOR1
   float topIdx = mp.r * 255.0;
   float topAlpha = mp.g;
   if (topIdx > vTokenIndex + 0.5) {
    outColor *= (1.0 - topAlpha);
   }
   gl_FragColor = outColor;
   ```

   Grid shader (different epilogue, samples `COLOR2`):

   ```glsl
   float T = texture2D(uChainedTransparency, gl_FragCoord.xy / uViewportSize).r;
   gl_FragColor *= T; // T = ∏(1-α_i); 0 = fully erased, 1 = untouched
   ```

   `vTokenIndex` is `aTokenIndex` carried through the vertex shader.
3. **Per-sprite tokenIndex wiring:** add a `tokenIndex` field on the sprite (just a JS property — read at batch-packing time). Set it once when each token's UI subtree is built (e.g. via a `refreshToken` hook or by walking children at flush time from the parent Token container). 0 for the grid.
4. **PluginName swap:** the simplest path is to set `pluginName = 'tokenUiBatch'` on each token UI sprite at creation time (via a hook on Token UI children construction), and restore to default on destroy. Alternative: a wrapper around the Token UI container's `render` that temporarily swaps `pluginName` on each child before rendering and restores after — heavier per-frame but zero hooks on child construction.

This gives us:

- **One** new shader (the custom batch).
- **One** patched stock shader (the grid).
- Zero patches to bars/nameplate/effects/ring/turn-marker/control-icon shaders.
- Full PIXI batching preserved across all token UI sprites in the entire scene (one draw call for all UI sprites of all tokens, plus one for the grid).

### Phase 3 — Fallback for elements we can't batch (filters, custom shaders)

Some UI elements may not fit our batch plugin: anything with a PIXI filter, or a `Mesh`/custom-shader element. Per user, the strategy is **promote-to-sprite via RenderTexture**:

1. Detect at render time: a UI child of a token has `filters.length > 0`, isn't a `Sprite` we control, or otherwise opts out of our plugin.
2. Render it into a small `RenderTexture` sized to its local bounds, using its own (unmodified) shaders/filters. This is exactly how PIXI's filter pipeline already works internally for filtered objects.
3. Wrap the result in a `Sprite` (or reuse a pooled sprite) whose `pluginName = 'tokenUiBatch'` and `tokenIndex = parent.tokenIndex`. This sprite joins the batch with everyone else and gets the mask attenuation uniformly.
4. The promoted sprite is re-baked when the underlying element invalidates. For v1, re-bake every frame the element is dirty/visible. A per-element invalidation hook (matching the element's own update events) can be added later if the bake cost is meaningful.

This makes the design **fully general**: anything renderable to a texture can be made to participate. Even animated turn markers, dynamic ring fades, video meshes work — they just bake to their RT every frame (same cost as today's direct render) and the batch picks them up.

Net result of Phase 2 + Phase 3: the UI pass collapses to roughly **two batched draws** (one for the grid, one for the entire `tokenUiBatch`), no blend-mode switches, no void meshes.

### Accuracy

- **Grid:** EXACT. `COLOR2` stores the full chained transparency `T = ∏(1 - α_i)` across every covering token mesh, regardless of z-order. Matches vanilla pixel-for-pixel (within 8-bit quantization).
- **Token UI:** approximation that records the topmost token's `(idx, α)` only. True attenuation for token N's UI is `∏_{i > N}(1 - α_i)`, which would need per-N prefix products and an extra attachment per index level — not feasible. The approximation is:
  - Exact when 0 or 1 tokens are above the UI fragment (overwhelmingly common case).
  - Approximate (UI underneath slightly brighter than vanilla) when 2+ semi-transparent tokens stack above the same UI fragment.
  - Visually negligible where it differs: the topmost token's own art already dominates that pixel.
- Quantization: 8 bits per channel = 256 steps. User said 16–64 steps is fine, so plenty of headroom.

### Expected perf

Every frame, unconditionally:

- Board pass cost increases by ≈ one extra `vec4` write per token-mesh fragment + the mask clear. No new geometry, no extra draw calls.
- UI pass: no void-mesh rasterization (saves 1 raster of mesh shape per token), zero blend-mode switches, ~1–2 batched draws total.
- Net per 30-token scene: ~60 batch flushes/frame → ~2; eliminates 30 mesh-shape rasterizations/frame entirely. No invalidation logic, no edge cases, no cache bypass list.

### Drawbacks

- Modifying the board framebuffer is invasive: we need to attach a second color texture and wrap the renderer to manage `drawBuffers`. This is the biggest implementation risk. PIXI v7's `Framebuffer.addColorTexture(index, baseTexture)` supports it directly, but Foundry's board RT setup needs to be hooked.
- Shader-edit surface is small: patch only `TokenRingSamplerShader` (board side) + the grid shader. The rest is one new custom batch plugin we own.
- A token MESH that has a PIXI filter on the board side: the filter renders the mesh into its own RT first and the blit back uses a generic sprite shader that won't carry our MRT output — so a filtered token's mask is dropped for that pixel. Acceptable: such tokens are rare and the user has previously accepted bypassing them. (A future enhancement could re-route filter blits through a mask-aware shader, similar to the UI Phase 3 promote-to-sprite path.)
- UI elements with filters / custom shaders pay an RT bake per frame (Phase 3 path). Same per-frame cost as today; gain is from elimination of blend-mode switching and double mesh rasterization, not from caching these.
- WebGL2 is required for MRT. Foundry on the targeted versions is WebGL2 — verify in spike.
- Token index limited to 255 (8-bit channel). If a scene has >255 tokens, fall back to disabling the hack and warning (handled by setting). Unlikely to hit in practice.

## Alternatives considered and rejected

### Separate pre-pass that rasterizes the mask itself

Earlier draft. Rejected because (a) it duplicates the work the board pass already does on the same geometry — exactly the cost the user wants to avoid, and (b) wiring it without caching would mean an extra geometry pass per frame. MRT-during-board-pass beats it on both axes.

### Stencil-based occlusion

Rejected: stencil is binary, cannot attenuate by partial alpha. The user requires partial-alpha behavior to be preserved.

### Front-to-back depth with NORMAL blend

Rejected: front-to-back compositing breaks partial-alpha blending of overlapping semi-transparent UI elements (first writer wins → can't blend below).

## Critical files

- [src/hacks/voidMeshCaching.ts](src/hacks/voidMeshCaching.ts) — example of an existing custom batch plugin in this codebase (`pluginName`-based shader swap); the new `tokenUiBatch` plugin follows the same pattern.
- [src/hacks/generalizedOooRendering.ts](src/hacks/generalizedOooRendering.ts) — current child-reordering for void meshes; obsolete once UI shaders read the mask.
- [src/utils/patchShader.ts](src/utils/patchShader.ts:100) — `patchShaderV14` for injecting GLSL into Foundry's static shader factories (used for `TokenRingSamplerShader` + grid).
- [src/hacks/tokenLayerCache.ts](src/hacks/tokenLayerCache.ts) — wrapper-hook lifecycle pattern to mirror; the cache itself is dropped.
- Foundry shaders we touch: `TokenRingSamplerShader` (board-side, emit `gl_FragData[1]`), grid shader (UI-side, inline attenuation epilogue). That's it for stock shaders.

## Implementation outline

1. **Spike (1–2 hours):** stand up MRT on a copy of Foundry's board framebuffer. Verify `gl.drawBuffers` switching works around token-mesh batches without breaking the board image. Verify the "alpha=1 → REPLACE via NORMAL blend" trick produces highest-z-wins on `COLOR1`.
2. **`src/hacks/tokenMaskMrt.ts`** (new):
   - Hook board framebuffer creation: attach `COLOR1` RG8 texture sized to the board RT. Resize alongside it.
   - Wrap board pass start: clear both attachments. Manage `drawBuffers` around token-mesh batches.
   - Patch `TokenRingSamplerShader` (`patchShaderV14`) to add `uTokenIndex` uniform and emit `gl_FragData[1] = vec4(idx/255, meshAlpha, 0, 1)`.
   - Hook token render path to set `uTokenIndex` from each token's sort key before its mesh draws.
   - Public: `getMaskTexture()` for the UI batch plugin and grid shader to bind.
3. **`src/hacks/tokenUiBatch.ts`** (new): custom batch plugin.
   - Extend PIXI's standard batch geometry with `aTokenIndex` (single byte per vertex).
   - Fragment shader = default sprite batch body + the 6-line mask attenuation epilogue.
   - Register the plugin under name `'tokenUiBatch'`.
   - At Token UI sprite creation (hook on Token's child construction in [src/hacks/tokenLayerCache.ts](src/hacks/tokenLayerCache.ts) style), set `child.pluginName = 'tokenUiBatch'` and stamp `child.tokenIndex = token.sortIndex`. Restore on destroy.
4. **Grid shader patch:** single `patchShaderV14` call adding the attenuation epilogue with `uMyTokenIndex = 0.0`.
5. **Phase 3 fallback (promote-to-sprite):** hook the per-Token-UI render walk; for any child that is not a Sprite-compatible PIXI object or has filters, render it into a small pooled RT, wrap in a sprite with `pluginName = 'tokenUiBatch'`, and add to the parent in place of the original. Rebuild on the source element's invalidation; for v1, every frame the element is visible.
6. **Mutual exclusion:** when enabled, disable `tokenLayerCache`, `voidMeshCaching`, and the void-mesh handling in `generalizedOooRendering` (they would conflict / double-attenuate).
7. **Setting toggle** in [src/settings/constants.ts](src/settings/constants.ts) + wiring in [src/hacks/index.ts](src/hacks/index.ts), with a clean disable path that restores vanilla `pluginName` values, vanilla `TokenRingSamplerShader`/grid shaders, and the original board framebuffer (no extra attachments).

## Verification plan

1. **Visual regression scenes:**
   - 2 fully-opaque overlapping tokens → upper covers lower's HP bar pixel-perfectly.
   - 50%-alpha token over another token's bars → bars dim ~50%, not fully hidden. Diff vs vanilla < a few %.
   - DnD5e dynamic ring invisibility fade → smooth attenuation throughout the fade.
   - Animated turn marker visible everywhere except under higher-z token meshes; animates every frame.
   - Pan + token movement: no flicker, no stale mask (everything per-frame).
   - Stacked 3+ semi-transparent tokens: known approximation; UI underneath slightly brighter than vanilla; documented.
2. **Perf:** Use [src/hacks/gpuTimingDebug.ts](src/hacks/gpuTimingDebug.ts) on a 30-token scene; expect UI pass to drop from ~`2N + grid` flushes to ~2, with no extra board-side draws.
3. **Compatibility:** DnD5e default tokens, Ember dynamic tokens, pf2e default tokens, scenes with token filters (should still render — mask just becomes 0 under the filter, falling back to no attenuation locally, which is acceptable degradation).
4. **Disable path:** setting toggle restores vanilla shaders, removes the second color attachment, and leaves no PIXI state behind.
