uniform bool enableRotation;
uniform bool enableVignette;
uniform bool enableReducer;
uniform vec2 reducerPosition;
uniform vec2 rotationAnchor;
uniform float reducerPower;
uniform float reducerFactor;
uniform float vignetteSmoothMin;
uniform float vignetteSmoothMax;
uniform float rotationSpeed;
uniform float time;
uniform float resolution;
uniform float density;
uniform float intensity;
uniform float glow;
uniform vec2 frameTexelSize;
uniform vec3 textureTint;
uniform vec3 vignetteTint;
uniform highp vec4 meshDimensions;
uniform highp mat3 textureMatrix;
varying vec2 vMeshUvs;

const float PI = 3.141592653589793;
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

// Murmur-like 32-bit mix function
uint mixHash32(in uint x) {
	x ^= x >> 16;
	x *= 0x85ebca6bU;
	x ^= x >> 13;
	x *= 0xc2b2ae35U;
	x ^= x >> 16;
	return x;
}
// Normalize hash to [0..1]
float hashToFloat(in uint x) {
	return float(x) * (1.0 / 4294967295.0);
}
// Combine two uints (x, y) and mix
uint hashVec2_u(in uvec2 uv) {
    // Mix x and y with two different constants
	uint h = uv.x * 0x9E3779B1u; // golden ratio prime

	h ^= uv.y + 0x85ebca6bu;
	return mixHash32(h);
}
// Hash a vec2 -> float in [0..1]
float hashFloatFromVec2(in vec2 position) {
	uvec2 uv = uvec2(floatBitsToUint(position.x), floatBitsToUint(position.y));
	return hashToFloat(hashVec2_u(uv));
}

// --- Star rendering (optimized)
// -----------------------------------------
// MAX_OFFS reduced from 2 to 1.
// A star's influence is bounded by smoothstep(0, 0.2, dist) where dist = len/radius.
// Max radius is 3.0, so max influence distance = 0.2 * 3.0 = 0.6 cell units.
// Checking the 3x3 neighbourhood (+-1) covers all stars that can contribute.

const int MAX_OFFS = 1;

vec3 starLayer(in vec2 uv) {
	vec3 acc = vec3(0.0);
	vec2 cellUV = fract(uv);
	vec2 cellId = floor(uv);

	for (int y = -MAX_OFFS; y <= MAX_OFFS; ++y) {
		for (int x = -MAX_OFFS; x <= MAX_OFFS; ++x) {
			vec2 offset = vec2(x, y);
			float n = hashFloatFromVec2(cellId + offset);

            // Density cull
			if (fract(n * 17.0) > density)
				continue;
			float raw = fract(n);
			float radius = mix(0.1, 3.0, raw);
			vec2 starPos = cellUV - offset - vec2(n, fract(n * 34.0)) + 0.5;

			// Early distance cull: star contributes nothing when dist > 0.2 * radius.
			// Avoids expensive twinkle, flare, and baseColor computations for
			// stars that would be fully clipped by the smoothstep falloff anyway.
			float distSq = dot(starPos, starPos);
			float maxDist = 0.2 * radius;
			if (distSq > maxDist * maxDist)
				continue;

			float twkAmp = mix(0.6, 1.4, fract(n * 91.0));
			float twkFreq = mix(1.0, 3.0, fract(n * 133.0));
			float twinkle = 1.0 - abs(sin(n * time * twkFreq)) * twkAmp;
			float flare = mix(0.15, 0.9, fract(n * 47.0)) * twinkle * 0.5;

			// Star function inlined to reuse distSq
			float dist = sqrt(distSq);
			float b = glow * radius / max(dist, 1e-6);
			float rays = max(0.0, 0.5 - abs(starPos.x * starPos.y * 1000.0));
			b += rays * flare;
			b *= 1.0 - smoothstep(0.0, maxDist, dist);

			vec3 baseColor = sin(vec3(0.2, 0.3, 0.9) * fract(n * 2345.2) * TWOPI) * 0.25 + 0.75;
			baseColor += (fract(n * 811.0) - 0.5) * 0.05;
			baseColor *= vec3(1.0, 0.59, 0.9 + raw * 0.2);
			float intensityVal = mix(0.4, 1.2, sqrt(raw));
			float sizeComp = 1.0 / radius;
			acc += b * baseColor * intensityVal * sizeComp * (0.3 + 0.7 * twinkle);
		}

	}
	return acc;
}

vec2 aspectCorrect(in vec2 uv) {
	float ratio = meshDimensions.w / meshDimensions.z;
	vec2 scale = vec2(min(1.0, 1.0 / ratio), min(1.0, ratio));
	return (uv - 0.5) * scale + 0.5;
}

vec2 rotate2D(in vec2 p, in vec2 anchor, in float angle) {
	float s = sin(angle);
	float c = cos(angle);
	p -= anchor;
	p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
	return p + anchor;
}

/* -------------------------------------------- */
/*  Main Program                                */
/* -------------------------------------------- */
vec4 _main() {
	vec2 uv = fract(vMeshUvs * resolution);
	vec2 margin = frameTexelSize * 0.75;
	uv = uv * (1.0 - 2.0 * margin) + margin;
	vec2 atlasUV = (textureMatrix * vec3(uv, 1.0)).xy;
	vec4 tex = texture2D(sampler, atlasUV);
	tex.rgb *= textureTint;
	vec3 starfieldColor = vec3(0.0);
	vec2 starfieldUv = aspectCorrect(vMeshUvs);
	vec3 whiteTint = vec3(1.0);
	float angle = rotationSpeed * time;
	starfieldUv = mix(starfieldUv, rotate2D(starfieldUv, aspectCorrect(rotationAnchor), angle), float(enableRotation));
	vec2 vignetteUv = aspectCorrect(vMeshUvs) - 0.5;
	float dist = length(vignetteUv) * 2.0;
	float vFactor = 1.0 - smoothstep(vignetteSmoothMin, vignetteSmoothMax, dist);
	float vignette = mix(1.0, vFactor, float(enableVignette));
	vec3 starTint = mix(vignetteTint, whiteTint, vignette);
	float fade0 = 1.0 - smoothstep(0.1, 1.0, 0.50);
	starfieldColor += starLayer(starfieldUv * 30.0) * fade0;
	float fade1 = 1.0 - smoothstep(0.1, 1.0, 0.60);
	starfieldColor += starLayer(starfieldUv * 40.0 + 11.33) * fade1;
	float fade2 = 1.0 - smoothstep(0.1, 1.0, 0.70);
	starfieldColor += starLayer(starfieldUv * 50.0 + 33.48) * fade2;
	vec2 redPos = aspectCorrect(reducerPosition);
	float redDist = distance(starfieldUv, redPos);
	float reduceFactor = mix(1.0, (1.0 - reducerFactor) + reducerFactor * smoothstep(0.0, reducerPower, redDist), float(enableReducer));
	starfieldColor *= reduceFactor;
	tex.rgb = mix(tex.rgb * 0.5, tex.rgb, perceivedBrightness(starfieldColor) * 2.0);
	tex.rgb *= starTint;
	tex.rgb += starfieldColor * starTint * intensity;
	return tex * tintAlpha;
}
