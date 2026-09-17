import AbstractBaseShader from '../../rendering/shaders/base-shader.mjs'

/**
 * A basic rectangular mesh with a shader only. Does not natively handle textures (but a bound shader can).
 * Bounds calculations are simplified and the geometry does not need to handle texture coords.
 */
export default class QuadMesh extends PIXI.Container {
	/**
	 * @param {typeof AbstractBaseShader} shaderClass     The shader class to use.
	 */
	constructor(shaderClass) {
		super()
		// Assign shader, state and properties
		if (!AbstractBaseShader.isPrototypeOf(shaderClass)) {
			throw new Error('QuadMesh shader class must inherit from AbstractBaseShader.')
		}
		this.#shader = shaderClass.create()
	}

	/**
	 * Geometry bound to this QuadMesh.
	 * @type {PIXI.Geometry}
	 */
	#geometry = new PIXI.Geometry()
		.addAttribute('aVertexPosition', [0, 0, 1, 0, 1, 1, 0, 1], 2)
		.addIndex([0, 1, 2, 0, 2, 3])

	/* ---------------------------------------- */

	/**
	 * The shader bound to this mesh.
	 * @type {AbstractBaseShader}
	 */
	get shader() {
		return this.#shader
	}

	/**
	 * @type {AbstractBaseShader}
	 */
	#shader

	/* ---------------------------------------- */

	/**
	 * Assigned blend mode to this mesh.
	 * @type {PIXI.BLEND_MODES}
	 */
	get blendMode() {
		return this.#state.blendMode
	}

	set blendMode(value) {
		this.#state.blendMode = value
	}

	/**
	 * State bound to this QuadMesh.
	 * @type {PIXI.State}
	 */
	#state = PIXI.State.for2d()

	/* ---------------------------------------- */

	/**
	 * Initialize shader based on the shader class type.
	 * @param {typeof AbstractBaseShader} shaderClass         Shader class used. Must inherit from AbstractBaseShader.
	 */
	setShaderClass(shaderClass) {
		// Escape conditions
		if (!AbstractBaseShader.isPrototypeOf(shaderClass)) {
			throw new Error('QuadMesh shader class must inherit from AbstractBaseShader.')
		}
		if (this.#shader.constructor === shaderClass) {
			return
		}

		// Create shader program
		this.#shader = shaderClass.create()
	}

	/* ---------------------------------------- */

	/** @override */
	_render(renderer) {
		this.#shader._preRender(this, renderer)
		this.#shader.uniforms.translationMatrix = this.transform.worldTransform.toArray(true)

		// Flush batch renderer
		renderer.batch.flush()

		// Set state
		renderer.state.set(this.#state)

		// Bind shader and geometry
		renderer.shader.bind(this.#shader)
		renderer.geometry.bind(this.#geometry, this.#shader)

		// Draw the geometry
		renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLES)
	}

	/* ---------------------------------------- */

	/** @override */
	_calculateBounds() {
		this._bounds.addFrame(this.transform, 0, 0, 1, 1)
	}

	/* ---------------------------------------- */

	/**
	 * Tests if a point is inside this QuadMesh.
	 * @param {PIXI.IPointData} point
	 * @returns {boolean}
	 */
	containsPoint(point) {
		return this.getBounds().contains(point.x, point.y)
	}

	/* ---------------------------------------- */

	/** @override */
	destroy(options) {
		super.destroy(options)
		this.#geometry.dispose()
		this.#geometry = null
		this.#shader = null
		this.#state = null
	}
}
