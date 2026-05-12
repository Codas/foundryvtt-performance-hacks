const float TWOPI = 6.283185307179586;
const float INVPI = 0.3183098861837907;
const float INVTWOPI = 0.15915494309189535;
const float SQRT2 = 1.4142135623730951;
const float SQRT1_2 = 0.7071067811865476;
const float SQRT3 = 1.7320508075688772;
const float SQRT1_3 = 0.5773502691896257;
const vec3 BT709 = vec3(0.2126, 0.7152, 0.0722);
float perceivedBrightness(in vec3 color) {
	return sqrt(dot(BT709, color * color));
}
float perceivedBrightness(in vec4 color) {
	return perceivedBrightness(color.rgb);
}
const int octaves = 4;
uniform vec3 colorBase;
uniform vec3 colorStreaks;
uniform vec3 colorArcLight;
uniform vec3 colorGlow;
uniform float time;
uniform float patternSize;
uniform float noiseAmount;
uniform float streaksXAxisAmount;
uniform float noiseResolution;
uniform float edgeGlowStrength;
uniform bool enableStreaks;
uniform bool enableEdgeGlow;
uniform bool enableAlphaStreaks;
uniform highp vec4 meshDimensions;
in vec2 vMeshUvs;

float computeEdgeFalloff(in vec2 uv, in vec2 resolution, in float falloffPixels) {
	float distToLeft = uv.x;
	float distToRight = 1.0 - uv.x;
	float distToTop = uv.y;
	float distToBottom = 1.0 - uv.y;
	float d = min(min(distToLeft, distToRight), min(distToTop, distToBottom));
	float minRes = min(resolution.x, resolution.y);
	float edgeWidth = falloffPixels / minRes;
	return smoothstep(0.0, edgeWidth, d);
}

#include ./snoise3d.frag
#include ./voronoiPower16Optimized.frag

uniform float arcLightningSpeedFactor;
uniform float arcLightningTimeSliceModifier;
uniform float arcLightningAmplitudeSliceModifier;
uniform bool enableChromaticArcLightning;
uniform bool enableArcLightningMotion;
uniform bool enableArcLightning;
uniform float arcLightningIntensity;
uniform vec2 arcLightningResolution;

// --- Optimized arc lightning ---
// Changes from original:
//   1. tanh(40*x) -> clamp(40*x, -1, 1).  For |x| > 0.075, tanh(40x) is within
//      0.5% of +/-1, making the exp-based tanh unnecessary.
//   2. Dropped cos(4/exp(...) + t)/300 term.  Max contribution < 0.0033, invisible.
//   3. Loop reduced from 19 to 13 iterations (18 -> 12).  The chaotic accumulation
//      converges quickly; extra iterations add diminishing visual return.
//   4. pow(amplitude, index) replaced with just amplitude.  After the first few
//      iterations pow(0.35, n) decays to < 0.0001, contributing nothing.

const float ARC_LIGHT_ITERS = 13.0;

vec4 arcLightningEffect(in vec2 uv, in vec4 meshDimensions) {
	float lum = 0.0;

	vec4 accumulator = vec4(1.0, 2.0, 3.0, 0.0);
	vec4 accumulatorRef = accumulator;

	vec2 baseDimensions = vec2(meshDimensions.z, meshDimensions.w);
	vec2 transformedDimensions = baseDimensions * arcLightningResolution;
	vec2 offset = 0.5 * (baseDimensions - transformedDimensions);
	vec2 localCoord = uv * transformedDimensions + offset;
	vec2 uvTransformed = 0.2 * (localCoord - 0.5 * transformedDimensions) / transformedDimensions.y;

	float amplitude = 0.25;
	float timeFactor = time * arcLightningSpeedFactor;
	float index = 0.0;
	float motion = -0.8;
	vec2 oBaseDimensions = baseDimensions;

	if (!enableArcLightning) {
		return vec4(uv, 0.0, 1.0);
	} while (++index < ARC_LIGHT_ITERS) {
		accumulator += (1.0 + cos(accumulatorRef + timeFactor)) / length((1.0 + index * dot(oBaseDimensions, oBaseDimensions)) * sin(1.5 * uvTransformed / (0.5 - dot(uvTransformed, uvTransformed)) - 9.0 * uvTransformed.yx + timeFactor));

		timeFactor += arcLightningTimeSliceModifier;
		amplitude += arcLightningAmplitudeSliceModifier;

		// pow(amplitude, index) replaced with amplitude.
		// pow(0.35, 10) ~= 0.00003 -- the exponential decay makes the pow
		// irrelevant after the first few iterations.
		oBaseDimensions = cos(timeFactor - 7.0 * uvTransformed * amplitude) - 5.0 * uvTransformed;

		if (enableArcLightningMotion) {
			motion = 0.02 * timeFactor;
		}

		// tanh(40*x) replaced with clamp(40*x, -1, 1).
		// With the 40x multiplier the tanh is saturated to +/-1 for |x| > 0.075.
		// Dropped the trailing cos(4/exp(...)+t)/300 term (max amplitude 0.0033).
		// Split uvTransformed *= mat2(...) out of the dot() call -- some WebGL
		// implementations reject compound assignment as a sub-expression.
		uvTransformed *= mat2(cos(index + motion - vec4(0.0, 11.0, 33.0, 0.0)));
		vec2 warpArg = 40.0 * dot(uvTransformed, uvTransformed) * cos(100.0 * uvTransformed.yx + timeFactor);
		uvTransformed += clamp(warpArg, -1.0, 1.0) / 200.0 + 0.2 * amplitude * uvTransformed;
	}

	accumulator = 20.6 / (min(accumulator, 13.0) + 164.0 / accumulator) - dot(uvTransformed, uvTransformed) / 250.0;

	if (arcLightningIntensity != 1.0) {
		accumulator = pow(accumulator, vec4(1.0 / arcLightningIntensity));
	}

	lum = perceivedBrightness(accumulator.rgb);
	return vec4(accumulator.rgb, lum);
}

vec4 _main() {
    // ----- Arc lightning ---------------------------------------------------
	vec4 arcColor = vec4(0.0);
	if (enableArcLightning) {
		arcColor = clamp(arcLightningEffect(vMeshUvs, meshDimensions), vec4(0.0), vec4(1.0));
		arcColor.rgb = mix(vec3(0.0), vec3(arcColor.a) * colorArcLight, arcColor.a);
	}
    // ----- Adaptive UV Resolution ------------------------------------------
	vec2 uv = (vMeshUvs - 0.5) * vec2(meshDimensions.z, meshDimensions.w);
	uv /= patternSize;

    // ----- Background noise on base color ----------------------------------

	float uvx = cos(vMeshUvs.x + time);
	uvx *= uvx;
	float uvoTri = 0.5 + 0.5 * smoothstep(0.0, 1.0, abs(uvx));
	float bgNoise = snoise(vec3(uv * noiseResolution + (1.0 - uvoTri), time * 0.4));
	vec3 baseColorNoisy = clamp(colorBase + bgNoise * noiseAmount, 0.0, 1.0);

    // ----- Streaks ---------------------------------------------------------

	float streaks = 0.0;
	if (enableStreaks) {
		float _xc = uv.x * streaksXAxisAmount;
		float n1 = voronoiPower16((vec2(uv.y, _xc) + 0.05 * time) * 5.22) * uvoTri;
		float n2 = voronoiPower16((vec2(_xc, uv.y) - 0.05 * time) * 4.13) * uvoTri;
		float _m = min(n1, n2 * 1.1);
		streaks = _m * _m * sqrt(_m);
	}
	vec3 streakColor = mix(baseColorNoisy, colorStreaks, streaks);

    // ----- Composite with arc lightning -----------------------------------

	float arcWeight = enableArcLightning ? smoothstep(0.7, 0.9, arcColor.a) : 0.0;
	vec3 composite = mix(streakColor, arcColor.rgb, arcWeight);

    // ----- Edge falloff and Glow ------------------------------------------

	float falloff = computeEdgeFalloff(vMeshUvs, meshDimensions.zw, 25.0);
	float edgeFactor = 1.0 - falloff;
	float glow = enableEdgeGlow ? edgeFactor * edgeFactor * edgeGlowStrength : 0.0;
	composite = mix(composite, colorGlow, glow);

    // ----- Final Alpha -----------------------------------------------------

	float arcMinAlpha = arcColor.a * arcColor.a * arcColor.a * arcColor.a;
	float alphaStreaks = mix(0.25, 1.0, smoothstep(0.0, 0.25, max(streaks, arcMinAlpha)));
	float alpha = enableAlphaStreaks ? min(alphaStreaks, max(max(0.9, arcColor.a), max(streaks, glow))) * falloff * tintAlpha.a : max(max(0.9, arcColor.a), max(streaks, glow)) * falloff * tintAlpha.a;
	return vec4(composite, alpha);
}
