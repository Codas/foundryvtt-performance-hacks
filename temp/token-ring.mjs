import PrimaryBaseSamplerShader from './primary.mjs'

/**
 * The shader definition which powers the TokenRing.
 */
export default class TokenRingSamplerShader extends PrimaryBaseSamplerShader {
	/** @override */
	static classPluginName = 'tokenRingBatch'

	/* -------------------------------------------- */

	/** @override */
	static pausable = false

	/* -------------------------------------------- */

	/** @inheritdoc */
	static batchGeometry = [
		...(super.batchGeometry ?? []),
		{ id: 'aRingTextureCoord', size: 2, normalized: false, type: PIXI.TYPES.FLOAT },
		{ id: 'aBackgroundTextureCoord', size: 2, normalized: false, type: PIXI.TYPES.FLOAT },
		{ id: 'aMaskTextureCoord', size: 2, normalized: false, type: PIXI.TYPES.FLOAT },
		{ id: 'aRingColor', size: 4, normalized: true, type: PIXI.TYPES.UNSIGNED_BYTE },
		{ id: 'aBackgroundColor', size: 4, normalized: true, type: PIXI.TYPES.UNSIGNED_BYTE },
		{ id: 'aStates', size: 1, normalized: false, type: PIXI.TYPES.FLOAT },
		{ id: 'aScaleCorrection', size: 2, normalized: false, type: PIXI.TYPES.FLOAT },
		{ id: 'aRingColorBand', size: 2, normalized: false, type: PIXI.TYPES.FLOAT },
		{ id: 'aTextureScaleCorrection', size: 1, normalized: false, type: PIXI.TYPES.FLOAT },
	]

	/* -------------------------------------------- */

	/** @inheritdoc */
	static batchVertexSize = super.batchVertexSize + 14

	/* -------------------------------------------- */

	/** @inheritdoc */
	static reservedTextureUnits = super.reservedTextureUnits + 1

	/* -------------------------------------------- */

	/**
	 * A null UVs array used for nulled texture position.
	 * @type {Float32Array}
	 */
	static nullUvs = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0])

	/* -------------------------------------------- */

	/** @inheritdoc */
	static batchDefaultUniforms(maxTex) {
		return {
			...PrimaryBaseSamplerShader.batchDefaultUniforms(maxTex),
			tokenRingTexture: maxTex + PrimaryBaseSamplerShader.reservedTextureUnits,
			time: 0,
		}
	}

	/* -------------------------------------------- */

	/** @override */
	static _preRenderBatch(batchRenderer) {
		PrimaryBaseSamplerShader._preRenderBatch(batchRenderer)
		batchRenderer.renderer.texture.bind(
			CONFIG.Token.ring.ringClass.baseTexture,
			batchRenderer.uniforms.tokenRingTexture,
		)
		batchRenderer.uniforms.time = canvas.app.ticker.lastTime / 1000
		batchRenderer.uniforms.debugColorBands = CONFIG.Token.ring.debugColorBands
	}

	/* ---------------------------------------- */

	/** @inheritdoc */
	static _packInterleavedGeometry(element, attributeBuffer, indexBuffer, aIndex, iIndex) {
		PrimaryBaseSamplerShader._packInterleavedGeometry(element, attributeBuffer, indexBuffer, aIndex, iIndex)

		// Destructure the properties from the element for faster access
		const { vertexData } = element
		const object = element.object.object || {}

		// Retrieve ring properties with default values
		const {
			ringColorLittleEndian = 0xffffff,
			bkgColorLittleEndian = 0xffffff,
			ringUVs = CONFIG.Token.ring.shaderClass.nullUvs,
			bkgUVs = CONFIG.Token.ring.shaderClass.nullUvs,
			maskUVs = CONFIG.Token.ring.shaderClass.nullUvs,
			effects = 0,
			scaleCorrection = 1,
			scaleAdjustmentX = 1,
			scaleAdjustmentY = 1,
			colorBand: { startRadius = 0, endRadius = 0 } = {},
			textureScaleAdjustment = 1,
		} = object.ring || {}

		// Calculate colors using the PIXI.Color class
		const ringColor = PIXI.Color.shared.setValue(ringColorLittleEndian).toNumber()
		const bkgColor = PIXI.Color.shared.setValue(bkgColorLittleEndian).toNumber()

		// Prepare ring attributes
		const states = effects + 0.5
		const scaleCorrectionX = scaleCorrection * scaleAdjustmentX
		const scaleCorrectionY = scaleCorrection * scaleAdjustmentY
		const colorBandRadiusStart = maskUVs !== CONFIG.Token.ring.shaderClass.nullUvs ? 0 : startRadius
		const colorBandRadiusEnd = maskUVs !== CONFIG.Token.ring.shaderClass.nullUvs ? 0 : endRadius

		// Access Float32 and Uint32 views of the attribute buffer
		const { float32View, uint32View } = attributeBuffer

		// Calculate vertex size and offset
		const vertexSize = TokenRingSamplerShader.vertexSize
		const offset = aIndex + PrimaryBaseSamplerShader.batchVertexSize

		// Loop through the vertex data to fill attribute buffers
		for (let i = 0, j = 0; i < vertexData.length; i += 2, j += vertexSize) {
			let k = offset + j

			// Fill texture coordinates, colors, and state values into the buffer
			float32View[k++] = ringUVs[i]
			float32View[k++] = ringUVs[i + 1]
			float32View[k++] = bkgUVs[i]
			float32View[k++] = bkgUVs[i + 1]
			float32View[k++] = maskUVs[i]
			float32View[k++] = maskUVs[i + 1]
			uint32View[k++] = ringColor
			uint32View[k++] = bkgColor
			float32View[k++] = states
			float32View[k++] = scaleCorrectionX
			float32View[k++] = scaleCorrectionY
			float32View[k++] = colorBandRadiusStart
			float32View[k++] = colorBandRadiusEnd
			float32View[k++] = textureScaleAdjustment
		}
	}

	/* ---------------------------------------- */
	/*  GLSL Shader Code                        */
	/* ---------------------------------------- */

	/**
	 * The fragment shader header.
	 * @type {string}
	 */
	static #FRAG_HEADER = `
    const uint STATE_RING_PULSE = 0x02U;
    const uint STATE_RING_GRADIENT = 0x04U;
    const uint STATE_BKG_WAVE = 0x08U;
    const uint STATE_INVISIBLE = 0x10U;
    const uint STATE_COLOR_OVER_SUBJECT = 0x20U;

    vec4 colorOverlay;

    /* -------------------------------------------- */

    bool hasState(in uint state) {
      return (vStates & state) == state;
    }

    /* -------------------------------------------- */

    vec2 rotation(in vec2 uv, in float angle) {
      uv -= 0.5;
      float s = sin(angle);
      float c = cos(angle);
      return uv * mat2(c, -s, s, c) + 0.5;
    }

    /* -------------------------------------------- */

    float normalizedCos(in float val) {
      return (cos(val) + 1.0) * 0.5;
    }

    /* -------------------------------------------- */

    float wave(in float dist) {
      return 0.5 * sin(-time * 4.0 + dist * 100.0) + 0.9;
    }

    /* -------------------------------------------- */

    vec4 blend(vec4 src, vec4 dst) {
      return src + (dst * (1.0 - src.a));
    }

    /* -------------------------------------------- */

    vec3 unpremultiplySafe(in vec4 c) {
      if ( c.a <= 0.0 ) return vec3(0.0);
      return min(c.rgb, vec3(c.a)) / c.a;
    }

    /* -------------------------------------------- */

    vec4 colorizeTokenRing(in vec4 tokenRing, in float dist) {
      vec3 tokenColor = unpremultiplySafe(tokenRing);

      // Sample the mask texture
      vec4 maskTex = texture(tokenRingTexture, vMaskTextureCoord);
      vec3 maskColor = unpremultiplySafe(maskTex);

      // Compute red channel based on mask if available, otherwise fall back to token color
      float redChannel = (maskTex.a > 0.0) ? maskColor.r : tokenColor.r;

      // Compute pulse factor, but only if the pulse state is active
      float pulseFactor = 1.0;
      if ( hasState(STATE_RING_PULSE) ) pulseFactor = cos(time * 2.0) * 0.325 + 0.675;

      // Compute the base pulse color
      vec3 pulseColor = vRingColor * redChannel * pulseFactor;

      // Compute gradient color if the gradient state is active
      vec3 gradientColor = pulseColor;
      if ( hasState(STATE_RING_GRADIENT) ) {
        // Calculate gradient mix based on rotation and time
        float gradientMix = smoothstep(0.0, 1.0, dot(rotation(vTextureCoord, time), vec2(0.5)));
        gradientColor = mix(pulseColor, vBackgroundColor * redChannel, gradientMix);
      }

      // Compute mixFactor based on ring color bands
      float mixFactor = step(vRingColorBand.x, dist) - step(vRingColorBand.y, dist);

      if ( hasState(STATE_COLOR_OVER_SUBJECT) ) {
        float mixAdjusted = mixFactor * tokenRing.a;
        if ( maskTex.a > 0.0 ) colorOverlay = vec4(gradientColor, 1.0) * maskTex.a;
        else colorOverlay = vec4(gradientColor, 1.0) * mixAdjusted;
        return tokenRing * (1.0 - mixAdjusted);
      }

      // Compute the final color by mixing tokenColor and gradientColor based on mixFactor
      vec4 finalColor = vec4(mix(tokenColor, gradientColor, mixFactor), 1.0) * tokenRing.a;

      // If mask is present, blend the final color with the mask color
      if ( maskTex.a > 0.0 ) finalColor = blend(vec4(gradientColor, 1.0) * maskTex.a, finalColor);
      return finalColor;
    }

    /* -------------------------------------------- */

    vec4 colorizeTokenBackground(in vec4 tokenBackground, in float dist) {
      // Pre-correct the background color for alpha if necessary
      vec3 bgColor = (tokenBackground.a > 0.0) ? tokenBackground.rgb / tokenBackground.a : tokenBackground.rgb;

      // Calculate the wave factor based on the state
      float waveFactor = hasState(STATE_BKG_WAVE) ? (0.5 + wave(dist) * 1.5) : 1.0;

      // Check if tint color is pure white (no tint)
      vec3 tintColor = vBackgroundColor.rgb;
      vec3 resultColor = bgColor;

      // Apply overlay blend mode only if tint is not white
      if ( tintColor != vec3(1.0, 1.0, 1.0) ) {
        // Overlay blend: vectorized for each RGB channel
        resultColor = mix(2.0 * bgColor * tintColor,
                          1.0 - 2.0 * (1.0 - bgColor) * (1.0 - tintColor),
                          step(0.5, bgColor));
      }

      // Return the final color with alpha and wave applied
      return vec4(resultColor, 1.0) * tokenBackground.a * waveFactor;
    }

    /* -------------------------------------------- */

    vec4 processTokenColor(in vec4 finalColor) {
      if ( !hasState(STATE_INVISIBLE) ) return finalColor;

      // Computing halo
      float lum = perceivedBrightness(unpremultiplySafe(finalColor));
      vec3 haloColor = vec3(lum) * vec3(0.5, 1.0, 1.0);

      // Construct final image
      return vec4(haloColor, 1.0) * finalColor.a
                   * (0.55 + normalizedCos(time * 2.0) * 0.25);
    }

    /* -------------------------------------------- */

    float getTokenTextureClip() {
      // Check if both x and y coordinates are within the [0.0, 1.0] range
      return step(0.0, vTextureCoord.x) * step(0.0, vTextureCoord.y) *
             step(vTextureCoord.x, 1.0) * step(vTextureCoord.y, 1.0);
    }
  `

	/* ---------------------------------------- */

	/**
	 * Fragment shader body.
	 * @type {string}
	 */
	static #FRAG_MAIN = `
    vec4 color;
    vec4 result;

    %forloop%

    // Compute distances for further processing
    vec2 scaledDistVec = (vOrigTextureCoord - 0.5) * 2.0 * vScaleCorrection;
    float dist = length(scaledDistVec);  // Euclidean distance

    // Rectangular mask to not bleed over other spritesheet assets
    float rectangularMask = step(max(abs(scaledDistVec.x), abs(scaledDistVec.y)), 1.0);

    // Clip token texture to handle padding on X/Y axis
    color *= getTokenTextureClip();

    // Precompute alpha-adjusted color (avoid division by 0)
    vec4 alphaAdjustedColor = (vColor.a > 0.0) ? (color * (vColor / vColor.a)) : vec4(0.0);

    // Process token color using a custom function
    vec4 processedColor = processTokenColor(alphaAdjustedColor);

    // Blend token texture, token ring, and token background
    vec4 ringColor = colorizeTokenRing(texture(tokenRingTexture, vRingTextureCoord), dist);
    vec4 backgroundColor = colorizeTokenBackground(texture(tokenRingTexture, vBackgroundTextureCoord), dist);
    vec4 blendedResult = blend(processedColor, blend(ringColor, backgroundColor) * rectangularMask);

    // Apply color overlay if the state is active
    if ( hasState(STATE_COLOR_OVER_SUBJECT) ) blendedResult = blend(colorOverlay * rectangularMask, blendedResult);

    // Apply final alpha adjustment
    result = blendedResult * vColor.a;
  `

	/* ---------------------------------------- */

	/**
	 * Fragment shader body for debug code.
	 * @type {string}
	 */
	static #FRAG_MAIN_DEBUG = `
    if ( debugColorBands ) {
      vec2 scaledDistVec = (vTextureCoord - 0.5) * 2.0 * vScaleCorrection;
      float dist = length(scaledDistVec);
      result.rgb += vec3(0.0, 0.5, 0.0) * (step(vRingColorBand.x, dist) - step(vRingColorBand.y, dist));
    }
  `

	/* ---------------------------------------- */

	/** @override */
	static _batchVertexShader = `
    in vec2 aRingTextureCoord;
    in vec2 aBackgroundTextureCoord;
    in vec2 aMaskTextureCoord;
    in vec2 aScaleCorrection;
    in vec2 aRingColorBand;
    in vec4 aRingColor;
    in vec4 aBackgroundColor;
    in float aTextureScaleCorrection;
    in float aStates;

    out vec2 vRingTextureCoord;
    out vec2 vBackgroundTextureCoord;
    out vec2 vMaskTextureCoord;
    out vec2 vOrigTextureCoord;
    flat out vec2 vRingColorBand;
    flat out vec3 vRingColor;
    flat out vec3 vBackgroundColor;
    flat out vec2 vScaleCorrection;
    flat out uint vStates;

    void _main(out vec2 vertexPosition, out vec2 textureCoord, out vec4 color) {
      vRingTextureCoord = aRingTextureCoord;
      vBackgroundTextureCoord = aBackgroundTextureCoord;
      vMaskTextureCoord = aMaskTextureCoord;
      vRingColor = aRingColor.rgb;
      vBackgroundColor = aBackgroundColor.rgb;
      vStates = uint(aStates);
      vScaleCorrection = aScaleCorrection;
      vRingColorBand = aRingColorBand;
      vOrigTextureCoord = aTextureCoord;
      vertexPosition = (translationMatrix * vec3(aVertexPosition, 1.0)).xy;
      textureCoord = (aTextureCoord - 0.5) * aTextureScaleCorrection + 0.5;
      color = aColor * tint;
    }
  `

	/* -------------------------------------------- */

	/** @override */
	static _batchFragmentShader = `
    in vec2 vRingTextureCoord;
    in vec2 vBackgroundTextureCoord;
    in vec2 vMaskTextureCoord;
    in vec2 vOrigTextureCoord;
    flat in vec3 vRingColor;
    flat in vec3 vBackgroundColor;
    flat in vec2 vScaleCorrection;
    flat in vec2 vRingColorBand;
    flat in uint vStates;

    uniform sampler2D tokenRingTexture;
    uniform float time;
    uniform bool debugColorBands;

    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}
    ${TokenRingSamplerShader.#FRAG_HEADER}

    vec4 _main() {
      ${TokenRingSamplerShader.#FRAG_MAIN}
      ${TokenRingSamplerShader.#FRAG_MAIN_DEBUG}
      return result;
    }
  `
}
