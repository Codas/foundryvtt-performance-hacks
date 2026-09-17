import BatchShaderGenerator from './batch-shader-generator.mjs'

/**
 * A batch renderer with a customizable data transfer function to packed geometries.
 * @extends PIXI.AbstractBatchRenderer
 */
export default class BatchRenderer extends PIXI.BatchRenderer {
	/**
	 * The batch shader generator class.
	 * @type {typeof BatchShaderGenerator}
	 */
	static shaderGeneratorClass = BatchShaderGenerator

	/* -------------------------------------------- */

	/**
	 * The default uniform values for the batch shader.
	 * @type {object | (maxTextures: number) => object}
	 */
	static defaultUniforms = {}

	/* -------------------------------------------- */

	/**
	 * The PackInterleavedGeometry function provided by the sampler.
	 * @type {Function|undefined}
	 * @protected
	 */
	_packInterleavedGeometry

	/* -------------------------------------------- */

	/**
	 * The update function provided by the sampler and that is called just before a flush.
	 * @type {(batchRenderer: BatchRenderer) => void | undefined}
	 * @protected
	 */
	_preRenderBatch

	/* -------------------------------------------- */

	/**
	 * Get the uniforms bound to this abstract batch renderer.
	 * @returns {object|undefined}
	 */
	get uniforms() {
		return this._shader?.uniforms
	}

	/* -------------------------------------------- */

	/**
	 * The number of reserved texture units that the shader generator should not use (maximum 4).
	 * @param {number} val
	 * @protected
	 */
	set reservedTextureUnits(val) {
		// Some checks before...
		if (typeof val !== 'number') {
			throw new Error('BatchRenderer#reservedTextureUnits must be a number!')
		}
		if (val < 0 || val > 4) {
			throw new Error("BatchRenderer#reservedTextureUnits must be positive and can't exceed 4.")
		}
		this.#reservedTextureUnits = val
	}

	/**
	 * Number of reserved texture units reserved by the batch shader that cannot be used by the batch renderer.
	 * @returns {number}
	 */
	get reservedTextureUnits() {
		return this.#reservedTextureUnits
	}

	#reservedTextureUnits = 0

	/* -------------------------------------------- */

	/** @override */
	setShaderGenerator({
		vertex = this.constructor.defaultVertexSrc,
		fragment = this.constructor.defaultFragmentTemplate,
		uniforms = this.constructor.defaultUniforms,
	} = {}) {
		this.shaderGenerator = new this.constructor.shaderGeneratorClass(vertex, fragment, uniforms)
	}

	/* -------------------------------------------- */

	/**
	 * This override allows to allocate a given number of texture units reserved for a custom batched shader.
	 * These reserved texture units won't be used to batch textures for PIXI.Sprite or SpriteMesh.
	 * @override
	 */
	contextChange() {
		const gl = this.renderer.gl

		// First handle legacy environment
		if (PIXI.settings.PREFER_ENV === PIXI.ENV.WEBGL_LEGACY) {
			this.maxTextures = 1
		} else {
			// Step 1: first check max texture units the GPU can handle
			const gpuMaxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), 65536)

			// Step 2: Remove the number of reserved texture units that could be used by a custom batch shader
			const batchMaxTex = gpuMaxTex - this.#reservedTextureUnits

			// Step 3: Checking if remainder of texture units is at least 1. Should never happens on GPU < than 20 years old!
			if (batchMaxTex < 1) {
				const msg =
					'Impossible to allocate the required number of texture units in contextChange#BatchRenderer. ' +
					'Your GPU should handle at least 8 texture units. Currently, it is supporting: ' +
					`${gpuMaxTex} texture units.`
				throw new Error(msg)
			}

			// Step 4: Check with the maximum number of textures of the setting (webGL specifications)
			this.maxTextures = Math.min(batchMaxTex, PIXI.settings.SPRITE_MAX_TEXTURES)

			// Step 5: Check the maximum number of if statements the shader can have too..
			this.maxTextures = PIXI.checkMaxIfStatementsInShader(this.maxTextures, gl)
		}

		// Generate the batched shader
		this._shader = this.shaderGenerator?.generateShader(this.maxTextures) ?? null

		// Initialize packed geometries
		for (let i = 0; i < this._packedGeometryPoolSize; i++) {
			this._packedGeometries[i] = new this.geometryClass()
		}
		this.initFlushBuffers()
	}

	/* -------------------------------------------- */

	/** @inheritdoc */
	onPrerender() {
		if (!this.shaderGenerator) {
			this.setShaderGenerator()
		}
		this._shader ??= this.shaderGenerator.generateShader(this.maxTextures)
		super.onPrerender()
	}

	/* -------------------------------------------- */

	/** @override */
	start() {
		this._preRenderBatch?.(this)
		super.start()
	}

	/* -------------------------------------------- */

	/** @override */
	packInterleavedGeometry(element, attributeBuffer, indexBuffer, aIndex, iIndex) {
		// If we have a specific function to pack data into geometry, we call it
		if (this._packInterleavedGeometry) {
			this._packInterleavedGeometry(element, attributeBuffer, indexBuffer, aIndex, iIndex)
			return
		}
		// Otherwise, we call the parent method, with the classic packing
		super.packInterleavedGeometry(element, attributeBuffer, indexBuffer, aIndex, iIndex)
	}

	/* -------------------------------------------- */

	/**
	 * Verify if a PIXI plugin exists. Check by name.
	 * @param {string} name       The name of the pixi plugin to check.
	 * @returns {boolean}         True if the plugin exists, false otherwise.
	 */
	static hasPlugin(name) {
		return Object.keys(PIXI.Renderer.__plugins).some((k) => k === name)
	}
}
