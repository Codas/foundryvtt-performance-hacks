/**
 * Hack to allow using WebGL 3D textures in PixiJS shaders by monkey-patching PIXI.ShaderSystem.
 */

/**
 * Wrapper for a raw WebGL 3D texture intended to be passed as a uniform in PIXIs shader system
 */
export class PIXI3DTexture {
	constructor(
		public glTexture: WebGLTexture,
		public target: number,
	) {}
}

let patchApplied = false
const patchedGLContexts = new WeakSet<WebGL2RenderingContext>()

export function applyPixi3DPatch(): void {
	if (patchApplied) {
		return
	}
	patchApplied = true

	patchShaderSystem()
	console.log('[PrimePerformance] 3D texture monkey-patches applied')
}

/**
 * Patch ShaderSystem.prototype.syncUniformGroup to:
 * 1. Detect our PIXI3DTexture instances in uniforms
 * 2. Bind them as TEXTURE_3D to their reserved unit
 * 3. Upload them directly with gl.uniform1i (BYPASSING PixiJS uniform sync) because PixiJS doesn't
 *    know about sampler3D uniforms
 */

/**
 * Per-ShaderSystem-instance record of texture units that were last occupied with a TEXTURE_3D.
 * Needed to unbind them before PIXI can reuse those units for TEXTURE_2D.
 */
const prev3DUnitsMap = new WeakMap<InstanceType<typeof PIXI.ShaderSystem>, number[]>()

function patchShaderSystem(): void {
	const ShaderSystem = PIXI.ShaderSystem

	const origSyncUniformGroup = ShaderSystem.prototype.syncUniformGroup

	ShaderSystem.prototype.syncUniformGroup = function (
		this: InstanceType<typeof PIXI.ShaderSystem>,
		group: any,
		syncData?: any,
	) {
		const gl = this.gl as WebGL2RenderingContext
		const textureSystem = (this as any).renderer?.texture

		// Unbind TEXTURE_3D from units used in the previous draw. As PIXI does not know about our
		// 3d textures, it will freely reuse these for 2d texture bindings, causing gl errors
		const prev3DUnits = prev3DUnitsMap.get(this) ?? []
		for (const unit of prev3DUnits) {
			gl.activeTexture(gl.TEXTURE0 + unit)
			gl.bindTexture(gl.TEXTURE_3D, null)
		}
		prev3DUnitsMap.delete(this)
		if (prev3DUnits.length > 0) {
			textureSystem.currentLocation = -1
		}

		// remove PIXI3DTexture entries from uniforms so that the original syncUniformGroup doesn't
		// see them
		const removed: Array<{ key: string; val: any }> = []
		if (group?.uniforms) {
			for (const key of Object.keys(group.uniforms)) {
				const val = group.uniforms[key]
				if (!(val instanceof PIXI3DTexture)) {
					continue
				}
				removed.push({ key, val })
				delete group.uniforms[key]
			}
		}

		// Call original uniform sync (binds regular textures, allocates units)
		origSyncUniformGroup.call(this, group, syncData)

		for (const { key, val } of removed) {
			group.uniforms[key] = val
		}

		if (removed.length === 0) {
			return
		}

		// Upload 3d textures
		const ctxUID = (this as any).renderer?.CONTEXT_UID
		const glProgram = ctxUID ? (this as any).shader?.program?.glPrograms?.[ctxUID] : undefined
		const webglProgram = glProgram?.program as WebGLProgram | undefined
		if (!webglProgram) {
			console.warn('[Prime Performance] No WebGLProgram found for 3D textures')
			return
		}

		// Pixi assigns sampler units sequentially through syncData.textureCount for the current shader.
		// Its boundTextures array also contains stale bindings from prior draws and cannot be used here.
		let cursor = syncData?.textureCount ?? 0
		const maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number
		if (cursor + removed.length > maxTextureUnits) {
			throw new Error('[PrimePerformance] No texture units available for 3D shader textures')
		}
		const used3DUnits: number[] = []

		for (const { key, val } of removed) {
			const unit = cursor++
			used3DUnits.push(unit)

			gl.activeTexture(gl.TEXTURE0 + unit)
			gl.bindTexture(val.target, val.glTexture)

			const loc = gl.getUniformLocation(webglProgram, key)
			if (loc) {
				gl.uniform1i(loc, unit)
			} else {
				console.warn('[pixi-patch] getUniformLocation returned null for', key)
			}
		}
		if (syncData) {
			syncData.textureCount = cursor
		}
		textureSystem.currentLocation = -1

		// Remember which units we occupied so they can be cleared before the next draw.
		prev3DUnitsMap.set(this, used3DUnits)
	}
}
