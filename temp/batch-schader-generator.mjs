/**
 * A batch shader generator that could handle extra uniforms during initialization.
 * @param {string} vertexSrc              The vertex shader source
 * @param {string} fragTemplate           The fragment shader source template
 * @param {object | (maxTextures: number) => object} [uniforms]    Additional uniforms
 */
export default class BatchShaderGenerator extends PIXI.BatchShaderGenerator {
	constructor(vertexSrc, fragTemplate, uniforms = {}) {
		super(vertexSrc, fragTemplate)
		this.#uniforms = uniforms
	}

	/**
	 * Extra uniforms used to create the batch shader.
	 * @type {object | (maxTextures: number) => object}
	 */
	#uniforms

	/* -------------------------------------------- */

	/** @override */
	generateShader(maxTextures) {
		if (!this.programCache[maxTextures]) {
			const sampleValues = Int32Array.from({ length: maxTextures }, (_n, i) => i)
			this.defaultGroupCache[maxTextures] = PIXI.UniformGroup.from({ uSamplers: sampleValues }, true)
			let fragmentSrc = this.fragTemplate
			fragmentSrc = fragmentSrc.replace(/%count%/gi, `${maxTextures}`)
			fragmentSrc = fragmentSrc.replace(/%forloop%/gi, this.generateSampleSrc(maxTextures))
			this.programCache[maxTextures] = new PIXI.Program(this.vertexSrc, fragmentSrc)
		}
		let uniforms = this.#uniforms
		if (typeof uniforms === 'function') {
			uniforms = uniforms.call(this, maxTextures)
		} else {
			uniforms = foundry.utils.deepClone(uniforms)
		}
		return new PIXI.Shader(this.programCache[maxTextures], {
			...uniforms,
			tint: new Float32Array([1, 1, 1, 1]),
			translationMatrix: new PIXI.Matrix(),
			default: this.defaultGroupCache[maxTextures],
		})
	}
}
