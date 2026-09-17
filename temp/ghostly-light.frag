precision mediump float;
#define SHADER_NAME pixi-shader-21
uniform int technique;
uniform bool useSampler;
uniform bool hasColor;
uniform bool computeIllumination;
uniform bool linkedToDarknessLevel;
uniform bool enableVisionMasking;
uniform bool globalLight;
uniform float attenuation;
uniform float borderDistance;
uniform float contrast;
uniform float shadows;
uniform float exposure;
uniform float saturation;
uniform float intensity;
uniform float brightness;
uniform float luminosity;
uniform float pulse;
uniform float brightnessPulse;
uniform float backgroundAlpha;
uniform float illuminationAlpha;
uniform float colorationAlpha;
uniform float ratio;
uniform float time;
uniform float darknessLevel;
uniform float darknessPenalty;
uniform vec2 globalLightThresholds;
uniform vec3 color;
uniform vec3 colorBackground;
uniform vec3 colorVision;
uniform vec3 colorTint;
uniform vec3 colorEffect;
uniform vec3 colorDim;
uniform vec3 colorBright;
uniform vec3 ambientDaylight;
uniform vec3 ambientDarkness;
uniform vec3 ambientBrightest;
uniform int dimLevelCorrection;
uniform int brightLevelCorrection;
uniform vec4 weights;
uniform sampler2D primaryTexture;
uniform sampler2D depthTexture;
uniform sampler2D darknessLevelTexture;
uniform sampler2D visionTexture;

// Shared uniforms with vertex shader

uniform highp float rotation;
uniform highp float angle;
uniform highp float radius;
uniform highp float depthElevation;
uniform highp vec2 resolution;
uniform highp vec2 screenDimensions;
uniform highp vec3 origin;
uniform highp vec3 dimensions;
uniform highp mat3 translationMatrix;
uniform highp mat3 projectionMatrix;
varying vec2 vUvs;
varying vec2 vSamplerUvs;
varying float vDepth;
#define DARKNESS -2
#define HALFDARK -1
#define UNLIT 0
#define DIM 1
#define BRIGHT 2
#define BRIGHTEST 3

vec3 computedDimColor;
vec3 computedBrightColor;
vec3 computedBackgroundColor;
float computedDarknessLevel;
vec3 getCorrectedColor(int level) {
	if ((level == HALFDARK) || (level == DIM)) {
		return computedDimColor;
	} else if ((level == BRIGHT) || (level == DARKNESS)) {
		return computedBrightColor;
	} else if (level == BRIGHTEST) {
		return ambientBrightest;
	} else if (level == UNLIT) {
		return computedBackgroundColor;
	}
	return computedDimColor;
}
const float PI = 3.141592653589793;
const float TWOPI = 6.283185307179586;
const float INVPI = 0.3183098861837907;
const float INVTWOPI = 0.15915494309189535;
const float SQRT2 = 1.4142135623730951;
const float SQRT1_2 = 0.7071067811865476;
const float SQRT3 = 1.7320508075688772;
const float SQRT1_3 = 0.5773502691896257;
const vec3 BT709 = vec3(0.2126, 0.7152, 0.0722);
const float INVTHREE = 1.0 / 3.0;
const vec2 PIVOT = vec2(0.5);
const vec4 ALLONES = vec4(1.0);
vec3 switchColor(in vec3 innerColor, in vec3 outerColor, in float dist) {
	float attenuationStrength = attenuation * 0.7;
	float lowerEdge = 0.99 - attenuationStrength;
	float upperEdge = 1.01 + attenuationStrength;
	return mix(innerColor, outerColor, smoothstep(ratio * lowerEdge, clamp(ratio * upperEdge, 0.0001, 1.0), dist));
}
float random(in vec2 uv) {
	uv = mod(uv, 1000.0);
	return fract(dot(uv, vec2(5.23, 2.89) * fract((2.41 * uv.x + 2.27 * uv.y) * 251.19)) * 551.83);
}
uniform sampler2D noiseTexture;
float noise(in vec2 uv) {
	vec4 color = texture2D(noiseTexture, uv * 0.0625);
	return color.r;
}
float fbm(in vec2 uv) {
	float total = 0.0, amp = 1.0;
	for (int i = 0; i < 3; i++) {
		total += noise(uv) * amp;
		uv += uv;
		amp *= 0.5;
	}
	return total;
}
float perceivedBrightness(in vec3 color) {
	return sqrt(dot(BT709, color * color));
}
float perceivedBrightness(in vec4 color) {
	return perceivedBrightness(color.rgb);
}
float reversePerceivedBrightness(in vec3 color) {
	return 1.0 - perceivedBrightness(color);
}
float reversePerceivedBrightness(in vec4 color) {
	return 1.0 - perceivedBrightness(color.rgb);
}
void main() {
	float weightDark = weights.x;
	float weightHalfdark = weights.y;
	float weightDim = weights.z;
	float weightBright = weights.w;
	if (computeIllumination) {
		computedDarknessLevel = texture2D(darknessLevelTexture, vSamplerUvs).r;
		computedBackgroundColor = mix(ambientDaylight, ambientDarkness, computedDarknessLevel);
		computedBrightColor = mix(computedBackgroundColor, ambientBrightest, weightBright);
		computedDimColor = mix(computedBackgroundColor, computedBrightColor, weightDim);

        // Apply lighting levels

		vec3 correctedComputedBrightColor = getCorrectedColor(brightLevelCorrection);
		vec3 correctedComputedDimColor = getCorrectedColor(dimLevelCorrection);
		computedBrightColor = correctedComputedBrightColor;
		computedDimColor = correctedComputedDimColor;
	} else {
		computedBackgroundColor = colorBackground;
		computedDimColor = colorDim;
		computedBrightColor = colorBright;
		computedDarknessLevel = darknessLevel;
	}
	computedDimColor = max(computedDimColor, computedBackgroundColor);
	computedBrightColor = max(computedBrightColor, computedBackgroundColor);
	if (globalLight && ((computedDarknessLevel < globalLightThresholds[0]) || (computedDarknessLevel > globalLightThresholds[1])))
		discard;
	float dist = distance(vUvs, vec2(0.5)) * 2.0;
	vec4 depthColor = texture2D(depthTexture, vSamplerUvs);
	float depth = smoothstep(0.0, 1.0, vDepth) * (globalLight ? 1.0 : step(depthColor.g, depthElevation) * step(depthElevation, (254.5 / 255.0) - depthColor.r));
	vec4 baseColor = useSampler ? texture2D(primaryTexture, vSamplerUvs) : vec4(1.0);
	vec3 finalColor = baseColor.rgb;

    // Creating distortion with vUvs and fbm

	float distortion1 = fbm(vec2(fbm(vUvs * 3.0 + time * 0.50), fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));
	float distortion2 = fbm(vec2(fbm(-vUvs * 3.0 + time * 0.50), fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));
	vec2 uv = vUvs;

    // time related var

	float t = time * 0.5;
	float tcos = 0.5 * (0.5 * (cos(t) + 1.0)) + 0.25;
	float tsin = 0.5 * (0.5 * (sin(t) + 1.0)) + 0.25;

    // Creating distortions with cos and sin : create fluidity

	uv -= PIVOT;
	uv *= tcos * distortion1;
	uv *= tsin * distortion2;
	uv *= fbm(vec2(time + distortion1, time + distortion2));
	uv += PIVOT;
	finalColor = distortion1 * distortion1 *
		distortion2 * distortion2 *
		color * pow(1.0 - dist, dist) * colorationAlpha * mix(uv.x + distortion1 * 4.5 * (intensity * 0.2), uv.y + distortion2 * 4.5 * (intensity * 0.2), tcos);
	if (technique == 1) {
		float reflection = perceivedBrightness(baseColor);
		finalColor *= reflection;
	} else if (technique == 2) {
		float reflection = perceivedBrightness(baseColor);
		finalColor = switchColor(finalColor, finalColor * reflection, dist);
	} else if (technique == 3) {
		float reflection = perceivedBrightness(baseColor);
		finalColor = switchColor(finalColor * reflection, finalColor, dist);
	} else if (technique == 4) {
		float reflection = perceivedBrightness(baseColor);
		finalColor = (finalColor * (1.0 - sqrt(reflection))) / clamp(baseColor.rgb * 2.0, 0.001, 0.25);
	} else if (technique == 5) {
		float reflection = perceivedBrightness(baseColor);
		finalColor = switchColor((finalColor * (1.0 - sqrt(reflection))) / clamp(baseColor.rgb * 2.0, 0.001, 0.25), finalColor * reflection, dist);
	} else if (technique == 6) {
		float reflection = perceivedBrightness(baseColor);
		finalColor = switchColor(finalColor * reflection, (finalColor * (1.0 - sqrt(reflection))) / clamp(baseColor.rgb * 2.0, 0.001, 0.25), dist);
	} else if (technique == 7) {
		float reflection = perceivedBrightness(baseColor);
		reflection *= smoothstep(0.35, 0.75, reflection);
		finalColor *= reflection;
	} else if (technique == 8) {
		float reflection = perceivedBrightness(baseColor);
		reflection *= smoothstep(0.55, 0.85, reflection);
		finalColor *= reflection;
	} else if (technique == 9) {
		float r = reversePerceivedBrightness(baseColor);
		finalColor *= (r * r * r * r * r);
	} else if (technique == 10) {
		float reflection = perceivedBrightness(baseColor);
		finalColor *= reflection;
	} else if (technique == 100) {
		float reflection = perceivedBrightness(baseColor);
		finalColor *= reflection;
		float k = 1.0 + attenuation * 13.33;
		float s = 0.05;
		float fall = mix(exp(-k * (dist - s)), 1.0, step(dist, s));
		depth *= max(0.095, fall);
	} else if (technique == 101) {
		float reflection = perceivedBrightness(baseColor);
		finalColor *= reflection;
		float k = 1.0 + attenuation * 13.33;
		float s = 0.05;
		float fall = mix(exp(-k * (dist - s)), 1.0, step(dist, s));
		depth *= max(0.095, fall);
	}
	vec3 changedColor = finalColor;

    // Computing saturated color

	if (saturation
		!= 0.0) {
		vec3 grey = vec3(perceivedBrightness(changedColor));
		changedColor = mix(grey, changedColor, 1.0 + saturation);
	}
    // Computing shadows
	if (shadows
		!= 0.0) {
		float shadowing = mix(1.0, smoothstep(0.25, 0.35, perceivedBrightness(baseColor.rgb)), shadows);
        // Applying shadow factor

		changedColor *= shadowing;
	}
	finalColor = changedColor;
	if (attenuation
		!= 0.0) depth *= smoothstep(1.0, 1.0 - attenuation, dist);
	gl_FragColor = vec4(finalColor * depth, 1.0);
}
