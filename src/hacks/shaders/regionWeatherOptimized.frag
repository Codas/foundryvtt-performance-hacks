#define TYPE_RAIN    0
#define TYPE_FOG     1
#define TYPE_POLLEN  2
#define octaves 2
#define period 10
uniform sampler2D pixelTexture;
uniform float uEdgeBlendPx;
uniform float uTime;
uniform float uWindAngle;
uniform float uWindCos;
uniform float uWindSin;
uniform float uWindSpeed;

// Rain

uniform float uRainRotation;
uniform vec2 uRainResolution;
uniform float uRainStrength;
uniform float uRainOpacity;
uniform vec3 uRainTint;

// Fog

uniform int uFogOctaves;
uniform float uFogSlope;
uniform float uFogRotation;
uniform float uFogScale;
uniform vec3 uFogTint;

// Pollen particles

uniform float uPollenOpacity;
uniform vec3 uPollenTint;
uniform float uPollenCellWorldPx;
uniform float uPollenDotRadiusPx;
uniform float uPollenTwinkle;
uniform float uPollenFlow;
uniform float uPollenDrift;
uniform float uPollenKnotScale;

// Pollen haze

uniform float uPollenHazeOpacity;
uniform float uPollenHazeScale;
uniform float uPollenHazeSoftness;

// Clouds

uniform int uCloudType;
uniform vec3 uCloudTint;
uniform float uCloudCoverage;
uniform float uCloudShadowIntensity;
uniform float uCloudScale;
uniform float uCloudDetailScale;
uniform float uCloudLacunarity;
uniform float uCloudSoftness;
uniform float uCloudContrast;
uniform float uCloudAnisotropy;
uniform float uCloudFlow;
uniform float uCloudDrift;
uniform float uCloudMaxAlpha;
uniform float uCloudDepthScale;
uniform float uCloudDepthAmount;
uniform float uCloudSwirlScale;
uniform float uCloudSwirlStrength;
uniform float uCloudCoreGamma;
uniform float uCloudEdgeDetailFade;
uniform float uCloudCoreIntensity;

// Cloud texture

uniform sampler2D cloudTexture;
uniform float uCloudTexWorldSizePx;
uniform float uCloudTexSwirlStrength;
uniform float uCloudTexDriftMult;
uniform float uCloudRainCreate;
uniform float uCloudRainBoostCoverage;
uniform float uCloudRainBoostIntensity;

// Dynamics

uniform float uDarknessLevel;
uniform float uZoomLevel;

// Lunar motes

uniform vec3 uMoonColor[6];
uniform float uMoonWeight[6];
uniform float uMoonRadiusScale[6];
uniform float uMoonWeightSum;
uniform float uMoteChance;
uniform float uMoteAlpha;
uniform float uMoteMinZoom;
uniform float uMoteVisibleSec;
uniform float uMoteFadeInSec;
uniform float uMoteFadeOutSec;
uniform float uMoteOffSec;
uniform float uMoteHexEdgeFadePx;
uniform float uMoteTimeScale;
uniform float uMoteResolution;

// Hex

uniform highp vec2 uRegionOrigin;
uniform highp float uHexSizePx;
in vec2 vWorldPx;
const int EDGE_COUNT = 6;
const int NEIGHBOR_COUNT = EDGE_COUNT + 1;
uint gPacked7[NEIGHBOR_COUNT];
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
float random(in vec2 uv) {
	uv = mod(uv, 1000.0);
	return fract(dot(uv, vec2(5.23, 2.89) * fract((2.41 * uv.x + 2.27 * uv.y) * 251.19)) * 551.83);
}
#include ./voronoi3d.frag
vec3 voronoi(vec2 vuv, float zd) {
	return voronoi(vuv, 0.0, zd);
}
vec3 voronoi(vec3 vuv, float zd) {
	return voronoi(vuv.xy, vuv.z, zd);
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
// Hash a single uint -> uint
uint hashUInt(in uint x) {
	return mixHash32(x);
}
// Normalize hash to [0..1]
float hashToFloat(in uint x) {
	return float(x) * (1.0 / 4294967295.0);
}
// Hash a float -> float in [0..1]
float hashFloat(in float val) {
	uint bits = floatBitsToUint(val);
	return hashToFloat(hashUInt(bits));
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
// Hash a vec2 -> two floats in [0..1]
vec2 hashVec2To2D(in vec2 position) {
	uvec2 uv = uvec2(floatBitsToUint(position.x), floatBitsToUint(position.y));
	uint h1 = hashVec2_u(uv);
	uint h2 = mixHash32(h1 ^ 0xDEADBEEFu);
	return vec2(hashToFloat(h1), hashToFloat(h2));
}
// Hash a float -> bool
bool hashBool(in float val) {
	return (hashFloat(val) > 0.5);
}
// 2D value noise using quintic interpolation
float valueNoise(in vec2 uv) {
    // Separate integer and fractional parts
	vec2 i = floor(uv);
	vec2 f = fract(uv);

    // Quintic smoothing

	f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    // Hash the four corners of the cell

	float c00 = hashFloatFromVec2(i);
	float c10 = hashFloatFromVec2(i + vec2(1.0, 0.0));
	float c01 = hashFloatFromVec2(i + vec2(0.0, 1.0));
	float c11 = hashFloatFromVec2(i + vec2(1.0, 1.0));

    // Bilinear mix of corners

	return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}
// Fractional Brownian Motion using valueNoise
float fbmHash(in vec2 uv, in float smoothness) {
	float lacunarity = 2.0;
	float gain = exp2(-smoothness);
	float sum = 0.0;
	float amp = 1.0;

    // Accumulate noise over multiple octaves

	for (int i = 0; i < 5; i++) {
		sum += amp * valueNoise(uv);
		uv *= lacunarity;
		amp *= gain;
	}
	return sum;
}
vec2 voronoiCenter(in vec2 local, in vec2 global, in float time) {
	vec2 point = local + global;
	return local + vec2(-0.5 +
		(sin(time * hashVec2To2D(point) + 1.0) * 0.5 * 1.928) * 0.5 + 0.5);
}
float voronoiValue(in vec2 coord) {
	return hashFloatFromVec2(coord);
}
vec2 voronoiCircles(in vec2 coord, in float freq, in float time, in float radiusScale) {
	const int radius = 1;
	vec2 point = coord * freq;
	vec2 ipoint = floor(point);
	vec2 fpoint = fract(point);
	vec2 center = fpoint;
	vec2 icenter = vec2(0.0);
	float md = 1e10;
	float mr = 1e10;

    // Find nearest circle

	for (int y = -radius; y <= radius; ++y) {
		for (int x = -radius; x <= radius; ++x) {
			vec2 offset = vec2(x, y);
			vec2 c = voronoiCenter(offset, ipoint, time);
			float d = dot(c - fpoint, c - fpoint);
			if (d < md) {
				md = d;
				center = c;
				icenter = offset;
			}

		}

	}
    // Calc circle radius
	for (int y = -radius; y <= radius; ++y) {
		for (int x = -radius; x <= radius; ++x) {
			if ((x == 0) && (y == 0))
				continue;
			vec2 offset = icenter + vec2(x, y);
			vec2 c = voronoiCenter(offset, ipoint, time);
			float d = dot(c - fpoint, c - fpoint);
			if (d < mr)
				mr = d;
		}

	}
	md = sqrt(md);
	mr = sqrt(mr) * 0.5 * radiusScale * 0.28;
	if (md < mr)
		return vec2(md / mr, voronoiValue(icenter + ipoint));
	return vec2(0.0, -2.0);
}

#include ./snoise3d.frag

// fbm using a vec3 (z is usually a time value)
float fbm3(in vec3 uv, in float smoothness) {
	float s = exp2(-smoothness);
	float f = 1.0;
	float a = 1.0;
	float t = 0.0;
	for (int i = 0; i < octaves; i++) {
		t += a * snoise(f * uv, vec3(period));
		f *= 2.0;
		a *= s;
	}
	return t;
}
vec4 premul(in vec3 rgb, in float a) {
	return vec4(rgb * a, a);
}
vec4 overPD(in vec4 underPM, in vec4 overPM) {
	return overPM + underPM * (1.0 - overPM.a);
}
float saturate(in float x) {
	return clamp(x, 0.0, 1.0);
}
uint packFromRGBA(in vec4 t) {
	ivec4 b = ivec4(floor(t * 255.0 + 0.5));
	return uint((b.r & 255)) | (uint(b.g & 255) << 8u) | (uint(b.b & 255) << 16u) | (uint(b.a & 255) << 24u);
}
/* -------------------------------------------- */

uint bitExtract(in uint v, in int off, in int width) {
	return (v >> uint(off)) & uint((1 << width) - 1);
}
/* -------------------------------------------- */

int bitOffsetOfType(in int typeId) {
	return (typeId == 0) ? 0 : (4 + 2 * (typeId - 1));
}
/* -------------------------------------------- */

int bitWidthOfType(in int typeId) {
	return (typeId == 0) ? 4 : 2;
}
/* -------------------------------------------- */

float invMaxOfType(in int typeId) {
	return (typeId == 0) ? (1.0 / 4.0) : (1.0 / 3.0);
}
/* -------------------------------------------- */

float strengthNorm(in uint packed, in int typeId) {
	int off = bitOffsetOfType(typeId);
	int w = bitWidthOfType(typeId);
	float vmax = 1.0 / invMaxOfType(typeId);
	float v = float(bitExtract(packed, off, w));
	return clamp(v / vmax, 0.0, 1.0);
}
/* -------------------------------------------- */

bool hasAnyEffect(in uint packed) {
	return packed != 0u;
}
vec2 rotFast(in vec2 p, in float a) {
	float s = -sin(a);
	float c = cos(a);
	return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
/* -------------------------------------------- */

float gammaShape(in float v, in float k) {
	float t = clamp((k + 1.0) * 0.5, 0.0001, 0.9999);
	float g = mix(0.5, 2.0, t);
	return pow(saturate(v), g);
}
/* -------------------------------------------- */

vec2 windSpace(in vec2 wpx) {
	return vec2(uWindCos * wpx.x + uWindSin * wpx.y, -uWindSin * wpx.x + uWindCos * wpx.y);
}
/* -------------------------------------------- */

vec3 flowField(in vec2 wp, in float adv) {
	float advH = adv * 0.5;
	vec2 sA = wp * uCloudSwirlScale + vec2(31.1, 13.7);
	vec2 sB = wp * uCloudSwirlScale + vec2(-27.2, -9.3);
	float nA = fbm3(vec3(sA, advH), uCloudLacunarity) * 2.0 - 1.0;
	float nB = fbm3(vec3(sB, advH), uCloudLacunarity) * 2.0 - 1.0;
	return vec3(nA, nB, 0.0);
}
/* -------------------------------------------- */

void cloudFields(in vec2 wpx, in float t, in float driftSpeed, in float advSpeed, in float coverageBoost, in float cutPush, in bool needDetail, out float mask, out float core, out float detail, out vec3 flowOut, out float advOut) {
	vec2 wp = windSpace(wpx);
	vec2 drift = vec2(driftSpeed * uCloudDrift * t, 0.0);
	wp -= drift;
	float adv = t * advSpeed * uCloudFlow;
	advOut = adv;
	vec2 anisotropy = vec2(1.0 / max(1.0 + uCloudAnisotropy * 4.0, 1.0), 1.0 + uCloudAnisotropy * 6.0);
	vec2 p0 = wp * uCloudScale * anisotropy;
	vec2 p1 = wp * (uCloudScale * uCloudDetailScale);
	float b0 = fbm3(vec3(p0, adv), uCloudLacunarity) * 0.5 + 0.5;
	float b1 = fbm3(vec3(p1, adv * 1.31), uCloudLacunarity) * 0.5 + 0.5;
	float ridged = 1.0 - abs(2.0 * b1 - 1.0);
	float base;
	if (uCloudType == 1) {
		base = clamp(mix(b0, (b0 * 0.7 + b1 * 0.3), 0.6), 0.0, 1.0);
	} else if (uCloudType == 2) {
		base = clamp(gammaShape(b0 * 0.9 + b1 * 0.1, -0.35), 0.0, 1.0);
	} else if (uCloudType == 3) {
		float warp = (b1 - 0.5) * 0.35;
		vec2 pw = p0 + vec2(0.0, warp);
		float gB = gammaShape(fbm3(vec3(pw, adv * 0.85), uCloudLacunarity) * 0.5 + 0.5, -0.2);
		base = clamp(mix(gB, ridged, 0.4), 0.0, 1.0);
	} else {
		base = clamp(gammaShape(mix(b0, ridged, 0.55), 0.35), 0.0, 1.0);
	}
	float cov = saturate(uCloudCoverage + coverageBoost);
	float soft = max(uCloudSoftness, 1e-3);
	float shaped = gammaShape(base, uCloudContrast);
	float cut = mix(0.85, 0.15, cov) - cutPush;
	mask = smoothstep(cut - soft, cut + soft, shaped);
	core = smoothstep(cut + soft * 0.25, 1.0, shaped);
	if (needDetail) {
		vec3 flow = flowField(wp, adv);
		flowOut = flow;
		vec2 wWarp = wp + flow.xy * uCloudSwirlStrength;
		float d = fbm3(vec3(wWarp * (uCloudScale * uCloudDepthScale), adv * 1.17), uCloudLacunarity) * 0.5 + 0.5;
		float edgeAtten = mix(1.0 - uCloudEdgeDetailFade, 1.0, core);
		detail = saturate(d * edgeAtten);
	} else {
		flowOut = vec3(0.0);
		detail = 1.0;
	}
}
/* -------------------------------------------- */

vec2 cloudTexUV(in vec2 wpx, in float t, in float driftSpeed, in vec3 cachedFlow) {
	vec2 drift = vec2(uWindCos, uWindSin) * (driftSpeed * uCloudDrift * uCloudTexDriftMult * t);
	vec2 q = wpx - drift;
	if (uCloudTexSwirlStrength != 0.0) {
		q += cachedFlow.xy * uCloudTexSwirlStrength;
	}
	return q / max(uCloudTexWorldSizePx, 1.0);
}
/* -------------------------------------------- */

vec3 cloudTex(in vec2 wpx, in float t, in float driftSpeed, in vec3 cachedFlow) {
	vec2 uv = cloudTexUV(wpx, t, driftSpeed, cachedFlow);
	return texture(cloudTexture, uv).rgb;
}
float minInsidePxToHexEdge(in vec2 gridPoint, in ivec2 ij) {
	vec2 c = offsetToPoint(ij);
	float minPx = 1e9;
	for (int k = 0; k < 6; ++k) {
		ivec2 ijN = nTexel(ij, k);
		vec2 pn = offsetToPoint(ijN);
		vec2 d = pn - c;
		float invL = inversesqrt(max(dot(d, d), 1e-8));
		vec2 n = d * invL;
		vec2 mid = 0.5 * (c + pn);
		float inside = max(0.0, -dot(n, gridPoint - mid));
		minPx = min(minPx, inside * uHexSizePx);
	}
	return minPx;
}
/* -------------------------------------------- */

float hexEdgeRadiusScale(in vec2 gridPoint, in ivec2 ij) {
	if (uMoteHexEdgeFadePx <= 0.0)
		return 1.0;
	float dpx = minInsidePxToHexEdge(gridPoint, ij);
	return saturate(dpx / max(uMoteHexEdgeFadePx, 1e-3));
}
/* -------------------------------------------- */

float motes(in vec2 value) {
	if (value.y < -1.0)
		return 0.0;
	float alpha;
	if (hashBool(value.y))
		alpha = 1.0 / (value.x * value.x * 16.0) - 0.07;
	else
		alpha = 1.0 / (value.x * 8.0) - 0.15;
	return saturate(alpha);
}
/* -------------------------------------------- */

float motesLayers(in vec2 coord, in float time, in float weight, in float edgeScale) {
	if (edgeScale <= 0.0)
		return 0.0;
	float alpha = 0.0;
	alpha = max(alpha, motes(voronoiCircles(coord + vec2(6.518), 9.251, time * 0.6 * 0.5 + 8.513, max((2.0 * weight), 1.0) * edgeScale)));
	if (weight > 0.3)
		alpha = max(alpha, motes(voronoiCircles(coord + vec2(3.584), 12.125, time * 0.8 * 0.5 + 4.214, max((2.5 * weight), 1.0) * edgeScale)));
	if (weight > 0.6)
		alpha = max(alpha, motes(voronoiCircles(coord + vec2(0.493), 15.210, time * 0.5 + 2.321, max((3.0 * weight), 1.0) * edgeScale)));
	return alpha;
}
/* -------------------------------------------- */

bool lunarMoteCycleState(in ivec2 ij, out int moonIndex, out float moonWeight, out float radiusScale, out float life, out float spawn) {
	moonIndex = -1;
	moonWeight = 0.0;
	radiusScale = 0.0;
	life = 0.0;
	spawn = 0.0;
	if (uZoomLevel < uMoteMinZoom)
		return false;
	if (uMoonWeightSum <= 1e-6)
		return false;
	vec2 key = vec2(float(ij.x), float(ij.y));
	int m = int(floor(random(key + vec2(11.4, 6.2)) * 6.0));
	m = clamp(m, 0, 5);
	float wMoon = uMoonWeight[m];
	float rScale = uMoonRadiusScale[m];
	if ((wMoon <= 0.0) || (rScale <= 0.0))
		return false;
	float fadeIn = max(uMoteFadeInSec, 1e-3);
	float fadeOut = max(uMoteFadeOutSec, 1e-3);
	float visible = max(uMoteVisibleSec, fadeIn + fadeOut + 1e-3);
	float hold = max(visible - fadeIn - fadeOut, 0.0);
	float off = max(uMoteOffSec, 0.0);
	float tVisibleEnd = fadeIn + hold + fadeOut;
	float periodSec = tVisibleEnd + off;
	float phaseShift = random(key + vec2(40.0, 12.0));
	float t = mod(uTime + phaseShift * periodSec, max(periodSec, 1e-3));
	if (t >= tVisibleEnd)
		return false;
	float aIn = smoothstep(0.0, fadeIn, t);
	float aOut = 1.0 - smoothstep(fadeIn + hold, tVisibleEnd, t);
	float moteLife = aIn * aOut;
	if (moteLife <= 0.0)
		return false;
	float cycleId = floor((uTime + phaseShift * periodSec) / max(periodSec, 1e-3));
	cycleId = mod(cycleId, 1024.0);
	float avgW = max(uMoonWeightSum * (1.0 / 6.0), 1e-6);
	float pSpawn = saturate(uMoteChance * (wMoon / avgW));
	float rSpawn = random(key + vec2(3.1, 9.7) + cycleId * vec2(1.0, 7.0));
	float moteSpawn = smoothstep(rSpawn - 0.04, rSpawn + 0.04, pSpawn);
	if (moteSpawn <= 0.0)
		return false;
	moonIndex = m;
	moonWeight = wMoon;
	radiusScale = rScale;
	life = moteLife;
	spawn = moteSpawn;
	return true;
}
/* -------------------------------------------- */

float pow075(in float r) {
	r = max(r, 0.0);
	float s = sqrt(r);
	return s * sqrt(s);
}
/* -------------------------------------------- */

float softFloor(in float x, in float floorV, in float k) {
	return floorV + log(1.0 + exp(k * (x - floorV))) / k;
}
/* -------------------------------------------- */

void fetchNeighborhoodPacked7(in ivec2 ij) {
	gPacked7[0] = packFromRGBA(texelFetch(pixelTexture, ij, 0));
	for (int k = 0; k < EDGE_COUNT; ++k) {
		ivec2 ijNeighbor = nTexel(ij, k);
		gPacked7[k + 1] = packFromRGBA(texelFetch(pixelTexture, ijNeighbor, 0));
	}

}
/* -------------------------------------------- */

vec3 blendedStrength(in vec2 gridPoint, in ivec2 ij) {
	float sCenterRain = strengthNorm(gPacked7[0], TYPE_RAIN);
	float sCenterFog = strengthNorm(gPacked7[0], TYPE_FOG);
	float sCenterPollen = strengthNorm(gPacked7[0], TYPE_POLLEN);
	uint c0 = gPacked7[0];
	if (gPacked7[1] == c0 && gPacked7[2] == c0 && gPacked7[3] == c0 &&
		gPacked7[4] == c0 && gPacked7[5] == c0 && gPacked7[6] == c0) {
		return vec3(sCenterRain, sCenterFog, sCenterPollen);
	}
	float wSumR = 0.0, vSumR = 0.0, wSumF = 0.0, vSumF = 0.0, wSumP = 0.0, vSumP = 0.0;
	float invEdgeBlend = 1.0 / max(uEdgeBlendPx, 1.0);
	vec2 c = offsetToPoint(ij);
	float minEmptyR = 1e9, wEmptyR = 0.0;
	float minEmptyF = 1e9, wEmptyF = 0.0;
	float minEmptyP = 1e9, wEmptyP = 0.0;
	for (int k = 0; k < EDGE_COUNT; ++k) {
		uint pN = gPacked7[k + 1];
		float sNR = strengthNorm(pN, TYPE_RAIN);
		float sNF = strengthNorm(pN, TYPE_FOG);
		float sNP = strengthNorm(pN, TYPE_POLLEN);
		ivec2 ijN = nTexel(ij, k);
		vec2 pn = offsetToPoint(ijN);
		vec2 d = pn - c;
		float invL = inversesqrt(max(dot(d, d), 1e-8));
		vec2 n = d * invL;
		vec2 mid = 0.5 * (c + pn);
		float inside = max(0.0, -dot(n, gridPoint - mid));
		float dpx = inside * uHexSizePx;
		float t = 1.0 - smoothstep(0.0, 1.0, dpx * invEdgeBlend);
		if (sNR > 0.0) {
			wSumR += t;
			vSumR += t * sNR;
		} else if ((sCenterRain > 0.0) && (dpx < minEmptyR)) {
			minEmptyR = dpx;
			wEmptyR = t;
		}
		if (sNF > 0.0) {
			wSumF += t;
			vSumF += t * sNF;
		} else if ((sCenterFog > 0.0) && (dpx < minEmptyF)) {
			minEmptyF = dpx;
			wEmptyF = t;
		}
		if (sNP > 0.0) {
			wSumP += t;
			vSumP += t * sNP;
		} else if ((sCenterPollen > 0.0) && (dpx < minEmptyP)) {
			minEmptyP = dpx;
			wEmptyP = t;
		}

	}
	if (sCenterRain > 0.0)
		wSumR += wEmptyR;
	if (sCenterFog > 0.0)
		wSumF += wEmptyF;
	if (sCenterPollen > 0.0)
		wSumP += wEmptyP;
	float sRain = (sCenterRain + vSumR) / (1.0 + wSumR);
	float sFog = (sCenterFog + vSumF) / (1.0 + wSumF);
	float sPollen = (sCenterPollen + vSumP) / (1.0 + wSumP);
	return vec3(sRain, sFog, sPollen);
}
/* -------------------------------------------- */

float computeRain(in vec2 uv, in float t, in float sRain) {
	vec2 ruv = rotFast(uv + 0.5, uRainRotation) - 0.5;
	ruv.y -= t * 1.232458;
	vec2 st = ruv * uRainResolution;
	vec3 d2 = voronoi(vec3(st - t * 1.0109, t * 1.2), 10.0);
	float df = perceivedBrightness(d2);
	float edge = 1.0 - smoothstep(0.3, 1.0, d2.z);
	float core = 1.0 - smoothstep(-df * uRainStrength * sRain, df * uRainStrength * sRain + 0.001, edge);
	return core;
}
/* -------------------------------------------- */

float computeFog(in vec2 wpx, in float t, in float k) {
	vec3 coord = vec3(wpx * uFogScale, t * 0.15);
	float fbmv = fbm3(coord, 1.5);
	float c = 0.4 + (k - 0.23) * 0.6;
	float v1 = saturate((fbmv + 2.0) * 0.25);
	float threshold = 1.0 - c;
	float fg = (v1 - threshold) / (1.0 - threshold);
	return saturate(smoothstep(0.0, 1.0, fg));
}
/* -------------------------------------------- */

float pollenKnots(in vec2 wp, in float adv) {
	float b = fbm3(vec3(wp * uPollenKnotScale, adv), 1.85) * 0.5 + 0.5;
	float ridged = 1.0 - abs(2.0 * b - 1.0);
	return smoothstep(0.55, 0.92, ridged);
}
/* -------------------------------------------- */

vec4 pollenPM(in vec2 wpx, in float t, in float sPol) {
	if ((sPol < 0.02) || (uPollenOpacity < 0.01))
		return vec4(0.0);
	vec2 q = windSpace(wpx);
	float advPx = max(uWindSpeed, 0.0) * uPollenDrift * t;
	float cellPx = max(uPollenCellWorldPx, 4.0);
	vec2 cq = (q - vec2(advPx, 0.0)) / cellPx;
	vec2 base = floor(cq);
	vec2 f = fract(cq);
	vec2 dxc = dFdx(cq), dyc = dFdy(cq);
	float pxCell = max(length(dxc), length(dyc));
	float dotCell = uPollenDotRadiusPx / cellPx;
	float sigma = max(dotCell, pxCell * 0.60);
	float invS2 = 0.5 / (sigma * sigma);
	float energyK = (dotCell * dotCell) / (sigma * sigma);
	float swirl = sin((q.x + q.y * 0.23) * 0.012 + t * 0.6) * (0.18 * uPollenTwinkle);
	float acc = 0.0;
	for (int j = -1; j < 1; ++j) {
		for (int i = -1; i < 1; ++i) {
			vec2 cell = base + vec2(float(i), float(j));
			vec2 rnd = vec2(random(cell), random(cell + 17.7));
			vec2 p0 = rnd;
			vec2 p = p0 + vec2(advPx / cellPx, swirl);
			vec2 d = f - p;
			d -= round(d);
			float r2 = dot(d, d);
			acc += exp(-r2 * invS2) * energyK;
		}

	}
	float ratio = sigma / max(dotCell, 1e-6);
	float approxCells = 3.14159 * ratio * ratio;
	float neighborGain = max(1.0, approxCells / 9.0);
	neighborGain = min(neighborGain, 3.0);
	float knots = fbm3(vec3(q * uPollenKnotScale, t * 0.08), 1.0) * 0.5 + 0.5;
	float knotBoost = mix(0.75, 1.35, smoothstep(0.35, 0.85, knots));
	acc = (acc / 9.0) * knotBoost * sPol * neighborGain;
	acc = smoothstep(0.02, 0.65, acc);
	acc = clamp(acc, 0.0, 1.0);
	float a = acc * uPollenOpacity;
	a = clamp(a, 0.0, 1.0);
	vec3 tint = clamp(uPollenTint, 0.0, 1.0);
	return vec4(tint * a, a);
}
/* -------------------------------------------- */

vec4 pollenHazePM(in vec2 wpx, in float t, in float sPol) {
	if (sPol < 0.02 || uPollenHazeOpacity < 0.01)
		return vec4(0.0);
	vec2 wp = windSpace(wpx);
	float drift = max(uWindSpeed, 0.0) * (uPollenDrift * 0.5) * t;
	vec2 p = wp - vec2(drift, 0.0);
	float adv = t * max(uWindSpeed, 0.0) * (uPollenFlow * 0.7);
	float n = fbm3(vec3(p * uPollenHazeScale, adv), 1.5) * 0.5 + 0.5;
	float k = pollenKnots(p, adv);
	float shaped = smoothstep(0.5 - uPollenHazeSoftness, 0.5 + uPollenHazeSoftness, n);
	float a = shaped * mix(0.75, 1.25, k) * sPol * uPollenHazeOpacity;
	vec3 tint = mix(vec3(1.0), clamp(uPollenTint, 0.0, 1.0), 0.6);
	return vec4(tint * a, a);
}
/* -------------------------------------------- */
/*  Lunar Motes                                 */
/* -------------------------------------------- */

vec3 boostHighlights(in vec3 c, in float amount) {
	vec3 w = c * c;
	return c * (1.0 + amount * w);
}
/* -------------------------------------------- */

vec4 lunarMotePM(in vec2 gridPoint, in ivec2 ij, in vec2 centerGrid) {
	int m;
	float wMoon;
	float radiusScale;
	float life;
	float spawn;
	if (!lunarMoteCycleState(ij, m, wMoon, radiusScale, life, spawn))
		return vec4(0.0);
	vec2 moteWorld = uRegionOrigin + centerGrid * max(uHexSizePx, 1.0);
	float intensity = saturate(radiusScale);
	float hexInR = 0.5 * uHexSizePx;
	float rMin = 0.5 * hexInR;
	float rMaxHex = hexInR + max(uMoteHexEdgeFadePx, 0.0);
	float revealR = mix(rMin, rMaxHex, intensity);
	float d = length(vWorldPx - moteWorld);
	const float REVEAL_FEATHER_PX = 3.0;
	float reveal = smoothstep(revealR + REVEAL_FEATHER_PX, revealR - REVEAL_FEATHER_PX, d);
	if (reveal <= 0.0)
		return vec4(0.0);
	float invRef = 2.0 / max(uHexSizePx, 1.0);
	float s = (6.0 * max(uMoteResolution, 1e-3)) * invRef;
	vec2 coord = (vWorldPx - uRegionOrigin) * s;
	float tM = uTime * max(uMoteTimeScale, 0.0);
	vec3 moon = clamp(uMoonColor[m], 0.0, 1.0);
	float edgeScale = hexEdgeRadiusScale(gridPoint, ij);
	float alpha = motesLayers(coord, tM, wMoon, edgeScale);
	vec3 color = mix(moon, vec3(1.0), alpha * alpha * alpha * alpha * alpha * 0.33);
	float a = pow(alpha, 0.85) * reveal * life * uMoteAlpha * spawn;
	if (a <= 0.0)
		return vec4(0.0);
	return premul(mix(color, boostHighlights(moon, 0.5), smoothstep(0.4, 0.6, uDarknessLevel)), saturate(a));
}
/* -------------------------------------------- */

vec4 drawGrid(in vec2 gridPoint) {
	ivec2 ij = pointToOffset(gridPoint);
	vec2 centerGrid = offsetToPoint(ij);
	fetchNeighborhoodPacked7(ij);
	vec3 sRFP = blendedStrength(gridPoint, ij);
	float sRain = sRFP.x;
	float sFog = sRFP.y;
	float sPollen = sRFP.z;

    // Lunar motes

	vec4 acc = lunarMotePM(gridPoint, ij, centerGrid);

    // Rain

	if (sRain > 0.04) {
		float r = computeRain(vWorldPx, uTime, sRain);
		float rG = pow075(r);
		float aR = saturate(uRainOpacity * rG * sRain);
		vec3 cR = mix(uRainTint, vec3(1.0), 0.35 * rG);
		acc = overPD(acc, premul(cR, aR));
		acc = overPD(acc, premul(vec3(1.0), 0.18 * rG * sRain));
	}
    // Fog
	if (sFog > 0.0) {
		float f = computeFog(vWorldPx, uTime * 0.5, mix(0.33, 1.0, sFog));
		float fG = pow(max(f, 0.0), 0.8);
		float aF = saturate(fG * sFog);
		vec3 cF = mix(uFogTint, vec3(1.0), 0.25 * fG);
		acc = overPD(acc, premul(cF, aF));
		acc = overPD(acc, premul(vec3(1.0), 0.16 * fG * sFog));
	}
    // Pollen haze
	if (sPollen > 0.0) {
		vec4 hPM = pollenHazePM(vWorldPx, uTime, sPollen);
		if (hPM.a > 0.0)
			acc = overPD(acc, hPM);
	}
    // Pollen particles
	if (sPollen > 0.0) {
		vec4 pPM = pollenPM(vWorldPx, uTime, sPollen);
		if (pPM.a > 0.0) {
			acc = overPD(acc, pPM);
			acc = overPD(acc, premul(vec3(1.0), 0.08 * pPM.a));
		}

	}
    // Atmospheric haze
	float z = clamp(uZoomLevel, 0.0, 1.0);
	float haze = 1.0 - smoothstep(0.05, 0.40, z);
	haze = haze * haze;
	float aH = haze * (1.0 - uDarknessLevel) * 0.30;
	if (aH > 0.0)
		acc = overPD(acc, premul(vec3(0.4, 0.65, 1.0), aH));

    // Clouds

	if (uCloudType == 0)
		return acc;
	float cloudDriftSpeed = uWindSpeed;
	float cloudAdvSpeed = max(uWindSpeed, 0.0);
	float zVis = 1.0 - smoothstep(0.20, 0.40, clamp(uZoomLevel, 0.06, 1.0));
	float mask;
	float core;
	float detail;
	vec3 cloudFlow;
	float cloudAdv;
	cloudFields(vWorldPx, uTime, cloudDriftSpeed, cloudAdvSpeed, uCloudRainBoostCoverage * sRain, uCloudRainCreate * sRain, zVis > 0.0, mask, core, detail, cloudFlow, cloudAdv);
	float day = 1.0 - uDarknessLevel;
	float baseI = saturate(uCloudShadowIntensity + uCloudRainBoostIntensity * sRain);
	float aShadow = saturate(mask * baseI * day);
	if (aShadow > 0.0) {
		vec3 cS = clamp(uCloudTint, 0.0, 1.0);
		acc = overPD(acc, premul(cS, aShadow));
	}
	if (zVis > 0.0) {
		float vol = mix(1.0, detail, saturate(uCloudDepthAmount));
		float puff = pow(saturate(core), max(uCloudCoreGamma, 0.01));
		float aAlb = saturate(mask * uCloudCoreIntensity * (0.55 + 0.45 * puff) * vol) * zVis * 2.0;
		if (aAlb > 0.0) {
			vec3 colCloud = cloudTex(vWorldPx, uTime, cloudDriftSpeed, cloudFlow);
			float pbc = perceivedBrightness(colCloud) * 0.25;
			pbc = pbc * pbc * pbc * pbc;
			float rI = softFloor(saturate(1.0 - sRain * (1.0 - pbc)), 0.25, 16.0);
			vec3 cA = mix(colCloud * 0.85 * rI, colCloud * rI * 1.1, saturate(0.5 * (detail + puff)));
			acc = overPD(acc, premul(cA, smoothstep(0.0, 0.60, aAlb) * uCloudMaxAlpha));
		}

	}
	return acc;
}
vec4 _main() {
	return drawGrid(vGridCoord);
}
