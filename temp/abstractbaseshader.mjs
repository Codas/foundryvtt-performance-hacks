/**
 * A mixin which decorates a PIXI.Filter or PIXI.Shader with common properties.
 * @category Mixins
 * @param {typeof PIXI.Filter|typeof PIXI.Shader} ShaderClass The parent ShaderClass class being mixed.
 */
export default function BaseShaderMixin(ShaderClass) {
	class BaseShader extends ShaderClass {
		/**
		 * The default uniform values for the shader.
		 * A subclass of BaseShaderMixin must implement the defaultUniforms static getter.
		 * @type {object}
		 */
		static get defaultUniforms() {
			return {}
		}

		/* -------------------------------------------- */

		/**
		 * Handle creation of the vertex shader string for this class.
		 * If this method is not provided, PIXI will assign a default vertex for this shader.
		 * @param {object} [options]   Configuration options passed at creation time.
		 * @returns {string}
		 * @protected
		 */
		static _createVertexShader(options) {
			return BaseShader._vertexShaderCompatibility(options)
		}

		/* -------------------------------------------- */

		/**
		 * Handle creation of the fragment shader string for this class.
		 * If this method is not provided, PIXI will assign a default fragment for this shader.
		 * @param {object} [options]   Configuration options passed at creation time.
		 * @returns {string}
		 * @protected
		 */
		static _createFragmentShader(options) {
			return BaseShader._fragmentShaderCompatibility(options)
		}

		/* -------------------------------------------- */

		/**
		 * A factory method for creating the shader using its defined default values.
		 * @param {object} [uniforms]   An object of uniform values which override the class {@link defaultUniforms}.
		 * @param {object} [options]    Optional configuration parameters which may influence shader creation or initialization.
		 * @returns {BaseShader}
		 * @abstract
		 */
		static create(_uniforms, _options) {}

		/* -------------------------------------------- */

		/**
		 * A one time initialization performed on creation.
		 * Subclasses may override to perform custom configuration of uniforms or state.
		 * @param {object} [options]   Configuration options provided at creation time.
		 * @protected
		 */
		_configure(_options) {}

		/* -------------------------------------------- */

		/**
		 * Useful constant values computed at compile time
		 * @type {string}
		 */
		static CONSTANTS = `
    const float PI = 3.141592653589793;
    const float TWOPI = 6.283185307179586;
    const float INVPI = 0.3183098861837907;
    const float INVTWOPI = 0.15915494309189535;
    const float SQRT2 = 1.4142135623730951;
    const float SQRT1_2 = 0.7071067811865476;
    const float SQRT3 = 1.7320508075688772;
    const float SQRT1_3 = 0.5773502691896257;
    const vec3 BT709 = vec3(0.2126, 0.7152, 0.0722);
    `

		/* -------------------------------------------- */

		/**
		 * Fast approximate perceived brightness computation
		 * Using Digital ITU BT.709 : Exact luminance factors
		 * @type {string}
		 */
		static PERCEIVED_BRIGHTNESS = `
    float perceivedBrightness(in vec3 color) { return sqrt(dot(BT709, color * color)); }
    float perceivedBrightness(in vec4 color) { return perceivedBrightness(color.rgb); }
    float reversePerceivedBrightness(in vec3 color) { return 1.0 - perceivedBrightness(color); }
    float reversePerceivedBrightness(in vec4 color) { return 1.0 - perceivedBrightness(color.rgb); }
    `

		/* -------------------------------------------- */

		/**
		 * Simplex 3D noise functions
		 * @type {string}
		 */
		static SIMPLEX_3D = `
    vec4 permute(in vec4 x) {
      return mod(((x * 34.0) + 1.0) * x, 289.0);
    }

    vec4 taylorInvSqrt(in vec4 r) {
      return 1.79284291400159 - 0.85373472095314 * r;
    }

    float snoise(in vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + 2.0*C.xxx;
      vec3 x3 = x0 - 1.0 + 3.0*C.xxx;
      i = mod(i, 289.0);

      vec4 p = permute(
                 permute(
                   permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));

      float n_ = 1.0 / 7.0;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 xx = x_ * ns.x + ns.yyyy;
      vec4 yy = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(xx) - abs(yy);
      vec4 b0 = vec4(xx.xy, yy.xy);
      vec4 b1 = vec4(xx.zw, yy.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;

      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m *= m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }
    `

		/* -------------------------------------------- */

		/**
		 * Conversion functions for sRGB and Linear RGB.
		 * @type {string}
		 */
		static COLOR_SPACES = `
    float luminance(in vec3 c) { return dot(BT709, c); }
    vec3 linear2grey(in vec3 c) { return vec3(luminance(c)); }

    vec3 linear2srgb(in vec3 c) {
      vec3 a = 12.92 * c;
      vec3 b = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
      vec3 s = step(vec3(0.0031308), c);
      return mix(a, b, s);
    }

    vec3 srgb2linear(in vec3 c) {
      vec3 a = c / 12.92;
      vec3 b = pow((c + 0.055) / 1.055, vec3(2.4));
      vec3 s = step(vec3(0.04045), c);
      return mix(a, b, s);
    }

    vec3 srgb2linearFast(in vec3 c) { return c * c; }
    vec3 linear2srgbFast(in vec3 c) { return sqrt(c); }

    vec3 colorClamp(in vec3 c) { return clamp(c, vec3(0.0), vec3(1.0)); }
    vec4 colorClamp(in vec4 c) { return clamp(c, vec4(0.0), vec4(1.0)); }

    vec3 tintColorLinear(in vec3 color, in vec3 tint, in float intensity) {
      float t = luminance(tint);
      float c = luminance(color);
      return mix(color, mix(
                            mix(tint, vec3(1.0), (c - t) / (1.0 - t)),
                            tint * (c / t),
                            step(c, t)
                           ), intensity);
    }

    vec3 tintColor(in vec3 color, in vec3 tint, in float intensity) {
      return linear2srgbFast(tintColorLinear(srgb2linearFast(color), srgb2linearFast(tint), intensity));
    }
    `

		/* -------------------------------------------- */

		/**
		 * Fractional Brownian Motion for a given number of octaves
		 * @param {number} [octaves=4]
		 * @param {number} [amp=1.0]
		 * @returns {string}
		 */
		static FBM(octaves = 4, amp = 1.0) {
			return `float fbm(in vec2 uv) {
        float total = 0.0, amp = ${amp.toFixed(1)};
        for (int i = 0; i < ${octaves}; i++) {
          total += noise(uv) * amp;
          uv += uv;
          amp *= 0.5;
        }
        return total;
      }`
		}

		/* -------------------------------------------- */

		/**
		 * High Quality Fractional Brownian Motion.
		 * @param {number} [octaves=3]               Number of octaves (iteration).
		 * @param {string} [fbmFuncName="fbm"]       Name of the fbm function.
		 * @param {string} [noiseFuncName="noise"]   Name of the noise function to use inside fbm (must return a `float`).
		 * @param {string} [vecType="vec2"]          The vec type the function accepts as a parameter.
		 * @returns {string} The formed fbm function
		 */
		static FBMHQ(octaves = 3, fbmFuncName = 'fbm', noiseFuncName = 'noise', vecType = 'vec2') {
			return `float ${fbmFuncName}(in ${vecType} uv, in float smoothness) {
        float s = exp2(-smoothness);
        float f = 1.0;
        float a = 1.0;
        float t = 0.0;
        for( int i = 0; i < ${octaves}; i++ ) {
            t += a * ${noiseFuncName}(f * uv);
            f *= 2.0;
            a *= s;
        }
        return t;
      }`
		}

		/* -------------------------------------------- */

		/**
		 * Angular constraint working with coordinates on the range [-1, 1]
		 * => coord: Coordinates
		 * => angle: Angle in radians
		 * => smoothness: Smoothness of the pie
		 * => l: Length of the pie.
		 * @type {string}
		 */
		static PIE = `
    float pie(in vec2 coord, in float angle, in float smoothness, in float l) {
      coord.x = abs(coord.x);
      vec2 va = vec2(sin(angle), cos(angle));
      float lg = length(coord) - l;
      float clg = length(coord - va * clamp(dot(coord, va) , 0.0, l));
      return smoothstep(0.0, smoothness, max(lg, clg * sign(va.y * coord.x - va.x * coord.y)));
    }`

		/* -------------------------------------------- */

		/**
		 * A conventional pseudo-random number generator with the "golden" numbers, based on uv position
		 * @type {string}
		 */
		static PRNG_LEGACY = `
    float random(in vec2 uv) {
      return fract(cos(dot(uv, vec2(12.9898, 4.1414))) * 43758.5453);
    }`

		/* -------------------------------------------- */

		/**
		 * A pseudo-random number generator based on uv position which does not use cos/sin
		 * This PRNG replaces the old PRNG_LEGACY to workaround some driver bugs
		 * @type {string}
		 */
		static PRNG = `
    float random(in vec2 uv) {
      uv = mod(uv, 1000.0);
      return fract( dot(uv, vec2(5.23, 2.89)
                        * fract((2.41 * uv.x + 2.27 * uv.y)
                                 * 251.19)) * 551.83);
    }`

		/* -------------------------------------------- */

		/**
		 * A Vec2 pseudo-random generator, based on uv position
		 * @type {string}
		 */
		static PRNG2D = `
    vec2 random(in vec2 uv) {
      vec2 uvf = fract(uv * vec2(0.1031, 0.1030));
      uvf += dot(uvf, uvf.yx + 19.19);
      return fract((uvf.x + uvf.y) * uvf);
    }`

		/* -------------------------------------------- */

		/**
		 * A Vec3 pseudo-random generator, based on uv position
		 * @type {string}
		 */
		static PRNG3D = `
    vec3 random(in vec3 uv) {
      return vec3(fract(cos(dot(uv, vec3(12.9898,  234.1418,    152.01))) * 43758.5453),
                  fract(sin(dot(uv, vec3(80.9898,  545.8937, 151515.12))) * 23411.1789),
                  fract(cos(dot(uv, vec3(01.9898, 1568.5439,    154.78))) * 31256.8817));
    }`

		/* -------------------------------------------- */

		/**
		 * A conventional noise generator
		 * @type {string}
		 */
		static NOISE = `
    float noise(in vec2 uv) {
      const vec2 d = vec2(0.0, 1.0);
      vec2 b = floor(uv);
      vec2 f = smoothstep(vec2(0.), vec2(1.0), fract(uv));
      return mix(
        mix(random(b), random(b + d.yx), f.x),
        mix(random(b + d.xy), random(b + d.yy), f.x),
        f.y
      );
    }`

		/* -------------------------------------------- */

		/**
		 * Convert a Hue-Saturation-Brightness color to RGB - useful to convert polar coordinates to RGB
		 * @type {string}
		 */
		static HSB2RGB = `
    vec3 hsb2rgb(in vec3 c) {
      vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0 );
      rgb = rgb*rgb*(3.0-2.0*rgb);
      return c.z * mix(vec3(1.0), rgb, c.y);
    }`

		/* -------------------------------------------- */

		/**
		 * Declare a wave function in a shader -> wcos (default), wsin or wtan.
		 * Wave on the [v1,v2] range with amplitude -> a and speed -> speed.
		 * @param {string} [func="cos"]     the math function to use
		 * @returns {string}
		 */
		static WAVE(func = 'cos') {
			return `
      float w${func}(in float v1, in float v2, in float a, in float speed) {
        float w = ${func}( speed + a ) + 1.0;
        return (v1 - v2) * (w * 0.5) + v2;
      }`
		}

		/* -------------------------------------------- */

		/**
		 * Rotation function.
		 * @type {string}
		 */
		static ROTATION = `
    mat2 rot(in float a) {
      float s = sin(a);
      float c = cos(a);
      return mat2(c, -s, s, c);
    }
    `

		/* -------------------------------------------- */

		/**
		 * Voronoi noise function. Needs PRNG2D and CONSTANTS.
		 * @see {@link PRNG2D}
		 * @see {@link CONSTANTS}
		 * @type {string}
		 */
		static VORONOI = `
    vec3 voronoi(in vec2 uv, in float t, in float zd) {
      vec2 uvi = floor(uv);
      vec2 uvf = fract(uv);
      vec3 vor = vec3(0.0, 0.0, zd);
      float bestDist2 = zd * zd;

      vec2 OFFSETS[9];
      OFFSETS[0] = vec2(-1.0, -1.0);
      OFFSETS[1] = vec2( 0.0, -1.0);
      OFFSETS[2] = vec2( 1.0, -1.0);
      OFFSETS[3] = vec2(-1.0,  0.0);
      OFFSETS[4] = vec2( 0.0,  0.0);
      OFFSETS[5] = vec2( 1.0,  0.0);
      OFFSETS[6] = vec2(-1.0,  1.0);
      OFFSETS[7] = vec2( 0.0,  1.0);
      OFFSETS[8] = vec2( 1.0,  1.0);

      for ( int k = 0; k < 9; k++ ) {
        vec2 uvn = OFFSETS[k];
        float rnd = random(uvi + uvn);

        float r1 = 0.5 * sin(TWOPI * rnd + t) + 0.5;
        float r2 = 0.5 * sin(TWOPI * r1  + t) + 0.5;
        vec2 uvr = vec2(r2, r2);
        vec2 diff = (uvn + uvr - uvf);
        float dist2 = dot(diff, diff);
        if ( dist2 < bestDist2 ) {
          float dist = sqrt(dist2);
          vor.xy   = uvr;
          vor.z    = dist;
          bestDist2 = dist2;
        }
      }
      return vor;
    }

    vec3 voronoi(vec2 vuv, float zd) {
      return voronoi(vuv, 0.0, zd);
    }

    vec3 voronoi(vec3 vuv, float zd) {
      return voronoi(vuv.xy, vuv.z, zd);
    }
    `

		/* -------------------------------------------- */

		/**
		 * Enables GLSL 1.0 backwards compatibility in GLSL 3.00 ES vertex shaders.
		 * @type {string}
		 */
		static GLSL1_COMPATIBILITY_VERTEX = `
      #define attribute in
      #define varying out
    `

		/* -------------------------------------------- */

		/**
		 * Enables GLSL 1.0 backwards compatibility in GLSL 3.00 ES fragment shaders.
		 * @type {string}
		 */
		static GLSL1_COMPATIBILITY_FRAGMENT = `
      #define varying in
      #define texture2D texture
      #define textureCube texture
      #define texture2DProj textureProj
      #define texture2DLodEXT textureLod
      #define texture2DProjLodEXT textureProjLod
      #define textureCubeLodEXT textureLod
      #define texture2DGradEXT textureGrad
      #define texture2DProjGradEXT textureProjGrad
      #define textureCubeGradEXT textureGrad
      #define gl_FragDepthEXT gl_FragDepth
    `

		/* -------------------------------------------- */
		/*  Deprecations and Compatibility              */
		/* -------------------------------------------- */

		/** @ignore */
		static _fragmentShaderCompatibility(options) {
			if ('fragmentShader' in BaseShader) {
				const msg = `${BaseShader.name}.fragmentShader getter is deprecated in favor of _createFragmentShader.`
				foundry.utils.logCompatibilityWarning(msg, { since: 14, until: 16, once: true })
				const v = BaseShader.fragmentShader
				return typeof v === 'function' ? v.call(BaseShader, options) : v
			}
			return undefined
		}

		/** @ignore */
		static _vertexShaderCompatibility(options) {
			if ('vertexShader' in BaseShader) {
				const msg = `${BaseShader.name}.vertexShader getter is deprecated in favor of _createVertexShader.`
				foundry.utils.logCompatibilityWarning(msg, { since: 14, until: 16, once: true })
				const v = BaseShader.vertexShader
				return typeof v === 'function' ? v.call(BaseShader, options) : v
			}
			return undefined
		}
	}
	return BaseShader
}

import BaseShaderMixin from '../mixins/base-shader-mixin.mjs'

/**
 * This class defines an interface which all shaders utilize.
 * @extends {PIXI.Shader}
 * @property {PIXI.Program} program The program to use with this shader.
 * @property {object} uniforms      The current uniforms of the Shader.
 * @mixes BaseShaderMixin
 * @abstract
 */
export default class AbstractBaseShader extends BaseShaderMixin(PIXI.Shader) {
  constructor(program, uniforms) {
    super(program, foundry.utils.deepClone(uniforms));

    /**
     * The initial values of the shader uniforms.
     * @type {object}
     */
    this.initialUniforms = uniforms;
  }

  /* -------------------------------------------- */

  /** @override */
  static create(uniforms, options) {
    const vert = AbstractBaseShader._vertexShaderCompatibility(options) ?? AbstractBaseShader._createVertexShader(options);
    const frag = AbstractBaseShader._fragmentShaderCompatibility(options) ?? AbstractBaseShader._createFragmentShader(options);
    const program = PIXI.Program.from(vert, frag);
    const u = foundry.utils.mergeObject(AbstractBaseShader.defaultUniforms, uniforms, {inplace: false, insertKeys: false});
    const shader = new this(program, u);
    shader._configure(options);
    return shader;
  }

  /* -------------------------------------------- */

  /**
   * Reset the shader uniforms back to their initial values.
   */
  reset() {
    for ( const [k, v] of Object.entries(this.initialUniforms) ) {
      this.uniforms[k] = foundry.utils.deepClone(v);
    }
  }

  /* ---------------------------------------- */

  /**
   * Perform operations which are required before binding the Shader to the Renderer.
   * @param {PIXI.DisplayObject} mesh      The mesh display object linked to this shader.
   * @param {PIXI.Renderer} renderer       The renderer
   * @protected
   */
  _preRender(_mesh, _renderer) {}
}

/**
 * Identify this class to be compatible with ShaderField
 * @type {boolean}
 * @internal
 * @readonly
 */
Object.defineProperty(AbstractBaseShader, '_isShaderFieldCompatible', {
	value: true,
	writable: false,
	enumerable: false,
	configurable: false,
})
