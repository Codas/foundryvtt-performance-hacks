import BatchRenderer from '../../batching/batch-renderer.mjs'
import BatchShaderGenerator from '../../batching/batch-shader-generator.mjs'
import AbstractBaseShader from '../base-shader.mjs'

/**
 * The base sampler shader exposes a simple sprite shader and all the framework to handle:
 * - Batched shaders and plugin subscription
 * - Configure method (for special processing done once or punctually)
 * - Update method (pre-binding, normally done each frame)
 * All other sampler shaders (batched or not) should extend BaseSamplerShader
 */
export default class BaseSamplerShader extends AbstractBaseShader {
	/**
	 * The named batch sampler plugin that is used by this shader, or null if no batching is used.
	 * @type {string|null}
	 */
	static classPluginName = 'batch'

	/**
	 * Is this shader pausable or not?
	 * @type {boolean}
	 */
	static pausable = true

	/**
	 * The plugin name associated for this instance, if any.
	 * Returns "batch" if the shader is disabled.
	 * @type {string|null}
	 */
	get pluginName() {
		return this.#pluginName
	}

	#pluginName = this.constructor.classPluginName

	/**
	 * Activate or deactivate this sampler. If set to false, the batch rendering is redirected to "batch".
	 * Otherwise, the batch rendering is directed toward the instance pluginName (might be null)
	 * @type {boolean}
	 */
	get enabled() {
		return this.#enabled
	}

	set enabled(enabled) {
		this.#pluginName = enabled ? this.constructor.classPluginName : 'batch'
		this.#enabled = enabled
	}

	#enabled = true

	/**
	 * Pause or Unpause this sampler. If set to true, the shader is disabled. Otherwise, it is enabled.
	 * Contrary to enabled, a shader might decide to refuse a pause, to continue to render animations per example.
	 * @see {enabled}
	 * @type {boolean}
	 */
	get paused() {
		return !this.#enabled
	}

	set paused(paused) {
		if (!this.constructor.pausable) {
			return
		}
		this.enabled = !paused
	}

	/**
	 * Contrast adjustment
	 * @type {string}
	 */
	static CONTRAST = `
    // Computing contrasted color
    if ( contrast != 0.0 ) {
      changedColor = (changedColor - 0.5) * (contrast + 1.0) + 0.5;
    }`

	/**
	 * Saturation adjustment
	 * @type {string}
	 */
	static SATURATION = `
    // Computing saturated color
    if ( saturation != 0.0 ) {
      vec3 grey = vec3(perceivedBrightness(changedColor));
      changedColor = mix(grey, changedColor, 1.0 + saturation);
    }`

	/**
	 * Exposure adjustment.
	 * @type {string}
	 */
	static EXPOSURE = `
    if ( exposure != 0.0 ) {
      changedColor *= (1.0 + exposure);
    }`

	/**
	 * The adjustments made into fragment shaders.
	 * @type {string}
	 */
	static get ADJUSTMENTS() {
		return `vec3 changedColor = baseColor.rgb;
      ${BaseSamplerShader.CONTRAST}
      ${BaseSamplerShader.SATURATION}
      ${BaseSamplerShader.EXPOSURE}
      baseColor.rgb = changedColor;`
	}

	/** @override */
	static _createVertexShader() {
		return `
    precision ${PIXI.settings.PRECISION_VERTEX} float;
    attribute vec2 aVertexPosition;
    attribute vec2 aTextureCoord;
    uniform mat3 projectionMatrix;
    varying vec2 vUvs;

    void main() {
      gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
      vUvs = aTextureCoord;
    }
    `
	}

	/** @override */
	static _createFragmentShader() {
		return `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    varying vec2 vUvs;

    void main() {
      gl_FragColor = texture2D(sampler, vUvs) * tintAlpha;
    }
    `
	}

	/**
	 * The batch vertex shader source.
	 * @type {string}
	 */
	static get batchVertexShader() {
		return `#version 300 es
    precision ${PIXI.settings.PRECISION_VERTEX} float;
    in vec2 aVertexPosition;
    in vec2 aTextureCoord;
    in vec4 aColor;
    in float aTextureId;
    uniform mat3 projectionMatrix;
    uniform mat3 translationMatrix;
    uniform vec4 tint;
    out vec2 vTextureCoord;
    flat out vec4 vColor;
    flat out float vTextureId;

    void main(void){
      gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
      vTextureCoord = aTextureCoord;
      vTextureId = aTextureId;
      vColor = aColor * tint;
    }
    `
	}

	/**
	 * The batch fragment shader source.
	 * @type {string}
	 */
	static get batchFragmentShader() {
		return `#version 300 es
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    in vec2 vTextureCoord;
    flat in vec4 vColor;
    flat in float vTextureId;
    uniform sampler2D uSamplers[%count%];
    out vec4 fragColor;

    #define texture2D texture

    void main(void){
      vec4 color;
      %forloop%
      fragColor = color * vColor;
    }
    `
	}

	/** @override */
	static get defaultUniforms() {
		return {
			sampler: 0,
			tintAlpha: [1, 1, 1, 1],
		}
	}

	/**
	 * Batch geometry associated with this sampler.
	 * @type {typeof PIXI.BatchGeometry|{id: string, size: number, normalized: boolean, type: PIXI.TYPES}[]}
	 */
	static batchGeometry = PIXI.BatchGeometry

	/**
	 * The size of a vertex with all its packed attributes.
	 * @type {number}
	 */
	static batchVertexSize = 6

	/**
	 * Pack interleaved geometry custom function.
	 * @type {Function|undefined}
	 * @protected
	 */
	static _packInterleavedGeometry

	/**
	 * A prerender function happening just before the batch renderer is flushed.
	 * @type {(batchRenderer: BatchRenderer) => void | undefined}
	 * @protected
	 */
	static _preRenderBatch

	/**
	 * Returns default uniforms associated with the batched version of this sampler.
	 * @type {object|((maxTextures: number) => object)}
	 */
	static batchDefaultUniforms = {}

	/**
	 * The number of reserved texture units for this shader that cannot be used by the batch renderer.
	 * @type {number}
	 */
	static reservedTextureUnits = 0

	/**
	 * Initialize the batch geometry with custom properties.
	 */
	static initializeBatchGeometry() {}

	/**
	 * The batch renderer to use.
	 * @type {typeof BatchRenderer}
	 */
	static batchRendererClass = BatchRenderer

	/**
	 * The batch generator to use.
	 * @type {typeof BatchShaderGenerator}
	 */
	static batchShaderGeneratorClass = BatchShaderGenerator

	/* ---------------------------------------- */

	/**
	 * Create a batch plugin for this sampler class.
	 * @returns {typeof BatchPlugin}            The batch plugin class linked to this sampler class.
	 */
	static createPlugin() {
		const shaderClass = BaseSamplerShader
		const geometryClass = Array.isArray(shaderClass.batchGeometry)
			? class BatchGeometry extends PIXI.Geometry {
					constructor(_static = false) {
						super()
						this._buffer = new PIXI.Buffer(null, _static, false)
						this._indexBuffer = new PIXI.Buffer(null, _static, true)
						for (const { id, size, normalized, type } of shaderClass.batchGeometry) {
							this.addAttribute(id, this._buffer, size, normalized, type)
						}
						this.addIndex(this._indexBuffer)
					}
				}
			: shaderClass.batchGeometry
		return class BatchPlugin extends shaderClass.batchRendererClass {
			/** @override */
			static get shaderGeneratorClass() {
				return shaderClass.batchShaderGeneratorClass
			}

			/* ---------------------------------------- */

			/** @override */
			static get defaultVertexSrc() {
				return shaderClass.batchVertexShader
			}

			/* ---------------------------------------- */

			/** @override */
			static get defaultFragmentTemplate() {
				return shaderClass.batchFragmentShader
			}

			/* ---------------------------------------- */

			/** @override */
			static get defaultUniforms() {
				return shaderClass.batchDefaultUniforms
			}

			/* ---------------------------------------- */

			/**
			 * The batch plugin constructor.
			 * @param {PIXI.Renderer} renderer    The renderer
			 */
			constructor(renderer) {
				super(renderer)
				this.geometryClass = geometryClass
				this.vertexSize = shaderClass.batchVertexSize
				this.reservedTextureUnits = shaderClass.reservedTextureUnits
				this._packInterleavedGeometry = shaderClass._packInterleavedGeometry
				this._preRenderBatch = shaderClass._preRenderBatch
			}

			/* ---------------------------------------- */

			/** @inheritdoc */
			setShaderGenerator(options) {
				if (!canvas.performance) {
					return
				}
				super.setShaderGenerator(options)
			}

			/* ---------------------------------------- */

			/** @inheritdoc */
			contextChange() {
				this.shaderGenerator = null
				super.contextChange()
			}
		}
	}

	/* ---------------------------------------- */

	/**
	 * Register the plugin for this sampler.
	 * @param {object} [options]                The options
	 * @param {object} [options.force=false]    Override the plugin of the same name that is already registered?
	 */
	static registerPlugin({ force = false } = {}) {
		const pluginName = BaseSamplerShader.classPluginName

		// Checking the pluginName
		if (!(pluginName && typeof pluginName === 'string' && pluginName.length > 0)) {
			const msg =
				`Impossible to create a PIXI plugin for ${BaseSamplerShader.name}. ` +
				`The plugin name is invalid: [pluginName=${pluginName}]. ` +
				'The plugin name must be a string with at least 1 character.'
			throw new Error(msg)
		}

		// Checking for existing plugins
		if (!force && BatchRenderer.hasPlugin(pluginName)) {
			const msg =
				`Impossible to create a PIXI plugin for ${BaseSamplerShader.name}. ` +
				`The plugin name is already associated to a plugin in PIXI.Renderer: [pluginName=${pluginName}].`
			throw new Error(msg)
		}

		// Initialize custom properties for the batch geometry
		BaseSamplerShader.initializeBatchGeometry()

		// Create our custom batch renderer for this geometry
		const plugin = BaseSamplerShader.createPlugin()

		// Register this plugin with its batch renderer
		PIXI.extensions.add({
			name: pluginName,
			type: PIXI.ExtensionType.RendererPlugin,
			ref: plugin,
		})
	}

	/* ---------------------------------------- */

	/** @override */
	_preRender(mesh, _renderer) {
		const uniforms = this.uniforms
		uniforms.sampler = mesh.texture
		uniforms.tintAlpha = mesh._cachedTint
	}
}
