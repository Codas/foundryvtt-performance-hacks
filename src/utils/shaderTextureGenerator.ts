/**
 * Procedural noise/texture generation pipeline.
 *
 * - `ShaderTextureGenerator` renders fragment-shader-defined textures into
 *   `PIXI.RenderTexture`s on the main Pixi context. Generation is one-shot:
 *   call `.generate(renderer)` once, then `await ready` before any consumer
 *   asks for a texture via `getTexture(key)`.
 *
 * - `ShaderPatcher` applies regex-based source replacements declared in a
 *   `SHADER_REPLACEMENTS` table that references textures by key. It records
 *   per-class which replacements ran (idempotent re-application) and which
 *   textures need binding, so `patchUniforms(uniforms)` can wire them up.
 *
 * - Multiple `ShaderTextureGenerator` instances that share the same fragment
 *   shader source will return the same `RenderTexture` (deduplication by source).
 */

export interface NoiseTextureSpec {
	/** Fragment shader source. The default vertex shader draws a fullscreen NDC quad. */
	fragment: string
	/** Render-target width in texels. */
	width: number
	/** Render-target height in texels. */
	height: number
	/** Pixi format (e.g. PIXI.FORMATS.RED, RG, RGB, RGBA). Required. */
	format: PIXI.FORMATS
	/** Defaults to PIXI.WRAP_MODES.REPEAT. */
	wrapMode?: PIXI.WRAP_MODES
	/** Defaults to PIXI.SCALE_MODES.LINEAR. */
	scaleMode?: PIXI.SCALE_MODES
}

export type NoiseTextureMap = Record<string, NoiseTextureSpec>

/**
 * Spec for a 3D texture generated directly via raw WebGL calls
 * (framebufferTextureLayer per Z-slice), bypassing PIXI's 2D pipeline.
 *
 * The `generator` function is a factory — different textures (snoise,
 * voronoi, etc.) supply their own generation logic.
 */
export interface NoiseTextureSpec3D extends NoiseTextureSpec {
	/** Number of Z-slices (depth). */
	depth: number
	/** Wrap mode for the R (depth) axis. Defaults to PIXI.WRAP_MODES.CLAMP. */
	wrapModeR?: PIXI.WRAP_MODES
	/** Factory that renders the full 3D texture given a GL context. */
	generator: (gl: WebGL2RenderingContext, spec: NoiseTextureSpec3D) => WebGLTexture
}

export type NoiseTextureMap3D = Record<string, NoiseTextureSpec3D>

export interface ShaderReplacement<TKey extends string> {
	/** Optional list of texture keys this replacement needs bound as uniforms. */
	textures?: readonly TKey[]
	/**
	 * Subset of `textures` whose sampler uniform expects a 3D texture.
	 * When set, the patcher wraps the raw `WebGLTexture` in a `PIXI3DTexture`
	 * before assigning the uniform value.
	 */
	textures3D?: readonly TKey[]
	/**
	 * Pattern matched against the shader source.
	 * If omitted, the replacement is never applied implicitly by `apply()` with
	 * no arguments — it must be requested explicitly by key.
	 */
	regex?: RegExp
	/** Replacement source injected in place of the matched region. */
	optimizedShader: string
	/**
	 * Per-texture sampler uniform name override.
	 * Defaults to the texture key for each entry in `textures`.
	 */
	samplerNames?: Partial<Record<TKey, string>>
	/**
	 * If false, this replacement is never applied implicitly by `apply()` with
	 * no arguments — it must be requested explicitly by key, even when `regex`
	 * is set. Useful for opt-in variants (e.g. multiple octave counts of the
	 * same function). Defaults to true.
	 */
	autoApply?: boolean
}

export type ShaderReplacementMap<TKey extends string> = Record<string, ShaderReplacement<TKey>>

interface PatchRecord<RKey extends string> {
	applied: Partial<Record<RKey, boolean>>
}

type AnyConstructor = new (...args: unknown[]) => unknown

const PATCH_REGISTRY: WeakMap<AnyConstructor, PatchRecord<string>> = new WeakMap()

/**
 * Returns which replacement keys have been applied to the given shader class,
 * across all `ShaderPatcher` instances. `true` = applied, `false` = attempted
 * but did not match. Keys never attempted are absent from the result.
 */
export function debugShaderReplacements(ShaderClass: AnyConstructor): Record<string, boolean> | null {
	const record = PATCH_REGISTRY.get(ShaderClass)
	if (!record) {
		return null
	}
	const result: Record<string, boolean> = {}
	for (const [k, v] of Object.entries(record.applied)) {
		if (v !== undefined) {
			result[k] = v
		}
	}
	return result
}

// ============================================================================
// #region Fragment-source deduplication caches

const FRAGMENT_TEXTURE_CACHE: Map<string, PIXI.RenderTexture> = new Map()
const FRAGMENT_TEXTURE_3D_CACHE: Map<string, WebGLTexture> = new Map()

// #endregion

import { PIXI3DTexture } from '../hacks/pixi3DPatch.ts'

// Starting with #version causes PIXI to skip its own header injection, leaving
// the fragment shader untouched so our own #version 300 es stays at line 0.
const FULLSCREEN_VERT = `#version 300 es
in vec2 aVertexPosition;
out vec2 vTextureCoord;
void main(void) {
	vTextureCoord = aVertexPosition * 0.5 + 0.5;
	gl_Position = vec4(aVertexPosition, 0.0, 1.0);
}
`

export class ShaderTextureGenerator<TKey extends string> {
	readonly specs: Readonly<Record<TKey, NoiseTextureSpec>>
	private textures: Partial<Record<TKey, PIXI.RenderTexture>> = {}
	private resolveReady!: () => void
	private rejectReady!: (err: unknown) => void

	/**
	 * Promise that resolves once `generate(renderer)` has finished rendering
	 * every spec into a `RenderTexture`. Consumers must await this before
	 * calling `getTexture()`.
	 */
	readonly ready: Promise<void>

	constructor(specs: Record<TKey, NoiseTextureSpec>) {
		this.specs = specs
		this.ready = new Promise((resolve, reject) => {
			this.resolveReady = resolve
			this.rejectReady = reject
		})
	}

	/**
	 * Render every spec into a `PIXI.RenderTexture` using the given renderer's
	 * GL context. Specs whose fragment source was already rendered by any
	 * generator instance reuse the cached texture. Safe to call exactly once.
	 * Resolves `ready` on completion.
	 */
	generate(renderer: PIXI.Renderer): void {
		try {
			const geometry = ShaderTextureGenerator.fullscreenQuadGeometry()

			for (const key of Object.keys(this.specs) as TKey[]) {
				const spec = this.specs[key]

				const cached = FRAGMENT_TEXTURE_CACHE.get(spec.fragment)
				if (cached) {
					this.textures[key] = cached
					continue
				}

				const renderTexture = PIXI.RenderTexture.create({
					width: spec.width,
					height: spec.height,
					format: spec.format,
					wrapMode: spec.wrapMode ?? PIXI.WRAP_MODES.REPEAT,
					scaleMode: spec.scaleMode ?? PIXI.SCALE_MODES.LINEAR,
					mipmap: PIXI.MIPMAP_MODES.OFF,
					resolution: 1,
				})

				const program = PIXI.Program.from(FULLSCREEN_VERT, spec.fragment)
				const shader = new PIXI.Shader(program, {})
				const mesh = new PIXI.Mesh(geometry, shader as unknown as PIXI.MeshMaterial)

				renderer.render(mesh, { renderTexture, clear: true })

				shader.destroy?.()
				mesh.destroy()

				FRAGMENT_TEXTURE_CACHE.set(spec.fragment, renderTexture)
				this.textures[key] = renderTexture
			}

			geometry.destroy()
			this.resolveReady()
		} catch (err) {
			this.rejectReady(err)
			throw err
		}
	}

	/**
	 * Sync access to a generated texture. Throws if `generate` has not yet
	 * completed for `key` or if `key` is unknown.
	 */
	getTexture(key: TKey): PIXI.RenderTexture {
		const tex = this.textures[key]
		if (!tex) {
			throw new Error(
				`[ShaderTextureGenerator] getTexture("${String(key)}") called before generation completed (await generator.ready first).`,
			)
		}
		return tex
	}

	private static fullscreenQuadGeometry(): PIXI.Geometry {
		return new PIXI.Geometry()
			.addAttribute('aVertexPosition', [-1, -1, 1, -1, 1, 1, -1, 1], 2)
			.addIndex([0, 1, 2, 0, 2, 3])
	}
}

/**
 * Generates procedural 3D textures (WebGLTexture) via raw WebGL calls.
 *
 * Each spec carries a `generator` factory that renders into a 3D texture
 * using framebufferTextureLayer per Z-slice. Deduplication is by fragment
 * source, shared across all `ShaderTextureGenerator3D` instances.
 */
export class ShaderTextureGenerator3D<TKey extends string> {
	readonly specs: Readonly<Record<TKey, NoiseTextureSpec3D>>
	private textures: Partial<Record<TKey, WebGLTexture>> = {}
	private resolveReady!: () => void
	private rejectReady!: (err: unknown) => void

	/**
	 * Promise that resolves once `generate(renderer)` has finished rendering
	 * every spec into a `WebGLTexture`. Consumers must await this before
	 * calling `getTexture()`.
	 */
	readonly ready: Promise<void>

	constructor(specs: Record<TKey, NoiseTextureSpec3D>) {
		this.specs = specs
		this.ready = new Promise((resolve, reject) => {
			this.resolveReady = resolve
			this.rejectReady = reject
		})
	}

	/**
	 * Generate every 3D texture spec using the given renderer's GL context.
	 * Specs sharing the same fragment source reuse the cached `WebGLTexture`.
	 * Safe to call exactly once. Resolves `ready` on completion.
	 */
	generate(renderer: PIXI.Renderer): void {
		try {
			const gl = renderer.gl as WebGL2RenderingContext | undefined
			if (!gl) {
				throw new Error('[ShaderTextureGenerator3D] renderer has no WebGL2 context')
			}

			for (const key of Object.keys(this.specs) as TKey[]) {
				const spec = this.specs[key]

				const cached = FRAGMENT_TEXTURE_3D_CACHE.get(spec.fragment)
				if (cached) {
					this.textures[key] = cached
					continue
				}

				// Save viewport and scissor state so PixiJS isn't disrupted
				const prevViewport = gl.getParameter(gl.VIEWPORT)
				const prevScissor = gl.getParameter(gl.SCISSOR_TEST)
				if (prevScissor) {
					gl.disable(gl.SCISSOR_TEST)
				}

				const tex = spec.generator(gl, spec)

				// Restore PixiJS state
				gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3])
				if (prevScissor) {
					gl.enable(gl.SCISSOR_TEST)
				}

				FRAGMENT_TEXTURE_3D_CACHE.set(spec.fragment, tex)
				this.textures[key] = tex
			}

			this.resolveReady()
		} catch (err) {
			this.rejectReady(err)
			throw err
		}
	}

	/**
	 * Sync access to a generated 3D texture. Throws if `generate` has not yet
	 * completed for `key` or if `key` is unknown.
	 */
	getTexture(key: TKey): WebGLTexture {
		const tex = this.textures[key]
		if (!tex) {
			throw new Error(
				`[ShaderTextureGenerator3D] getTexture("${String(key)}") called before generation completed (await generator.ready first).`,
			)
		}
		return tex
	}
}

export class ShaderPatcher<TKey extends string, RKey extends string> {
	private readonly generator: ShaderTextureGenerator<TKey>
	private readonly generator3D: ShaderTextureGenerator3D<TKey> | undefined
	private readonly replacements: ShaderReplacementMap<TKey>
	private source: string | undefined
	private readonly shaderClass: AnyConstructor

	/** Sampler-name → texture-key, populated by `apply()`. Deduplicated. */
	readonly bindings: Map<string, TKey> = new Map()
	/** Texture keys that are 3D (need PIXI3DTexture wrapping). */
	readonly textures3D: Set<TKey> = new Set()
	private appliedKeys: Set<RKey> = new Set()
	private hasApplied = false

	/**
	 * @param generator    Source of 2D textures referenced by replacements.
	 * @param generator3D  Optional source of 3D textures for `textures3D` entries.
	 * @param replacements Replacement table keyed by stable replacement id.
	 * @param shaderClass  Class constructor used as the WeakMap registry key for
	 *                     idempotency tracking and `debugShaderReplacements`.
	 * @param source       Original fragment shader source to patch. Can be set later via `setSource`.
	 */
	constructor(
		generator: ShaderTextureGenerator<TKey>,
		replacements: ShaderReplacementMap<TKey>,
		shaderClass: AnyConstructor,
		source?: string,
		generator3D?: ShaderTextureGenerator3D<TKey>,
	) {
		this.generator = generator
		this.generator3D = generator3D
		this.replacements = replacements
		this.shaderClass = shaderClass
		this.source = source
	}

	/**
	 * Set (or update) the fragment source before calling `apply()`.
	 * Useful when the patcher is created in an outer scope but the source is
	 * only available inside a deferred callback (e.g. `_createFragmentShader`).
	 * Resets applied state so the new source is patched fresh.
	 */
	setSource(source: string): this {
		this.source = source
		this.appliedKeys = new Set()
		this.hasApplied = false
		return this
	}

	/**
	 * Apply replacements and return the patched source.
	 *
	 * - If `replacementKeys` is omitted, every replacement that has a `regex`
	 *   is attempted. Replacements without a `regex` are silently skipped unless
	 *   listed explicitly in `replacementKeys`.
	 * - Replacements already recorded in the global registry for this class are
	 *   skipped (idempotent re-application across `ShaderPatcher` instances).
	 * - A replacement whose `regex` does not match emits a `console.warn` and
	 *   is recorded as `false` in the registry.
	 *
	 * Records sampler→texture-key bindings so `patchUniforms` and `textureCount`
	 * reflect what was actually applied.
	 */
	apply(...replacementKeys: readonly RKey[]): string {
		if (!this.source) {
			throw new Error('[ShaderPatcher] apply() called before source was set — call setContext() first.')
		}
		const record = this.getOrCreateRecord()
		// When called without explicit keys, only try replacements that have a regex
		// AND are not opted out via `autoApply: false`.
		let keys: readonly RKey[]
		if (replacementKeys.length > 0) {
			keys = replacementKeys
		} else {
			keys = (Object.keys(this.replacements) as RKey[]).filter((k) => {
				const r = this.replacements[k]
				return r?.regex != null && r.autoApply !== false
			})
		}
		let patched: string = this.source

		for (const key of keys) {
			const replacement = this.replacements[key] as ShaderReplacement<TKey> | undefined
			if (!replacement) {
				console.warn(`[ShaderPatcher] unknown replacement key "${String(key)}" — skipping.`)
				continue
			}
			if (record.applied[key] === true) {
				// Already applied by a prior ShaderPatcher on this class; still record
				// bindings so patchUniforms works correctly.
				this.recordBindings(replacement)
				this.appliedKeys.add(key)
				continue
			}

			if (!replacement.regex) {
				// Explicit key, no regex — treat as unconditional replacement.
				patched = replacement.optimizedShader
				record.applied[key] = true
				this.recordBindings(replacement)
				this.appliedKeys.add(key)
				continue
			}

			if (!replacement.regex.test(patched)) {
				record.applied[key] = false
				continue
			}

			patched = patched.replace(replacement.regex, replacement.optimizedShader)
			record.applied[key] = true
			this.recordBindings(replacement)
			this.appliedKeys.add(key)
		}

		this.hasApplied = true
		if (keys.length > 0 && this.appliedKeys.size === 0) {
			console.warn(`[ShaderPatcher] no replacements matched for ${this.shaderClass?.name ?? '(unknown class)'}.`)
		}
		// GLSL ES 3.00 removed texture2D() in favour of texture(). Normalise after
		// all replacements so individual replacement snippets don't need two versions.
		if (/^\s*#version\s+300\s+es\b/.test(patched)) {
			patched = patched.replace(/\btexture2D\s*\(/g, 'texture(')
		}

		return patched
	}

	/**
	 * Write every texture recorded by `apply()` into the given uniforms object.
	 * Accepts `shader.uniforms`, `ShaderClass.defaultUniforms`, or any plain record.
	 *
	 * For 3D texture keys (listed in `textures3D`), the raw `WebGLTexture` is
	 * wrapped in a `PIXI3DTexture` so the monkey-patched ShaderSystem can bind
	 * it as `TEXTURE_3D`. Requires a `WebGL2RenderingContext` for `gl.TEXTURE_3D`.
	 * Throws if called before `apply()`.
	 *
	 * @param uniforms  Target uniforms dictionary.
	 * @param gl        WebGL2 context — needed only when `textures3D` is non-empty.
	 */
	patchUniforms(uniforms: Record<string, unknown>, gl?: WebGL2RenderingContext): void {
		if (!this.hasApplied) {
			throw new Error('[ShaderPatcher] patchUniforms() called before apply().')
		}
		for (const [samplerName, textureKey] of this.bindings) {
			if (this.textures3D.has(textureKey)) {
				if (this.generator3D) {
					const glTex = this.generator3D.getTexture(textureKey)
					// gl.TEXTURE_3D = 0x806F; fall back to the constant when gl is not yet available
					uniforms[samplerName] = new PIXI3DTexture(glTex, gl?.TEXTURE_3D ?? 0x806f)
				}
				// If no generator3D, skip — the 2D generator doesn't hold 3D keys
			} else {
				uniforms[samplerName] = this.generator.getTexture(textureKey)
			}
		}
	}

	/** Distinct sampler-uniform count introduced by `apply()`. */
	get textureCount(): number {
		return this.bindings.size
	}

	/** Replacement keys that were successfully applied (or already applied) to this class. */
	get applied(): readonly RKey[] {
		return [...this.appliedKeys]
	}

	private recordBindings(replacement: ShaderReplacement<TKey>): void {
		if (replacement.textures) {
			for (const textureKey of replacement.textures) {
				const samplerName = replacement.samplerNames?.[textureKey] ?? textureKey
				this.bindings.set(samplerName, textureKey)
			}
		}
		if (replacement.textures3D) {
			for (const textureKey of replacement.textures3D) {
				this.textures3D.add(textureKey)
			}
		}
	}

	private getOrCreateRecord(): PatchRecord<RKey> {
		let record = PATCH_REGISTRY.get(this.shaderClass) as PatchRecord<RKey> | undefined
		if (!record) {
			record = { applied: {} }
			PATCH_REGISTRY.set(this.shaderClass, record as PatchRecord<string>)
		}
		return record
	}
}
