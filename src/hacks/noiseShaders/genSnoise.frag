#version 300 es
#define SHADER_NAME generate-snoise
precision mediump float;

in vec2 vTextureCoord;
out vec4 fragColor;

#include ./_common.frag

// Atlas layout — must match snoise.frag (the runtime sampler).
const float SNO_PERIOD = 10.0f;
const float SNO_INNER = 160.0f;
const float SNO_TILE = SNO_INNER + 2.0f; // 162 — inner + 1px border each side
const float SNO_SLICES = 10.0f;
const float SNO_ATLAS_W = SNO_TILE * SNO_SLICES; // 1620
const float SNO_ATLAS_H = SNO_TILE * 2.0f;        // 324 — top: Perlin RG, bottom: Simplex RG

// --- Pack helpers ---

float snoPack(float v) {
	return clamp(v / 4.4f + 0.5f, 0.0f, 1.0f);
}

float snrPack(float v) {
	return clamp(v / 2.0f + 0.5f, 0.0f, 1.0f);
}

float snrDPack(float v) {
	return clamp(v / 8.0f + 0.5f, 0.0f, 1.0f);
}

// --- Classic Perlin (tiled at SNO_PERIOD) ---

vec2 snoiseFade2(in vec2 t) {
	return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f);
}

// Evaluates classic Perlin with fz=0 and extracts z-gradient weight.
// R = noise value packed to [0,1]; G = z-gradient weight packed to [0,1].
vec2 snoiseAtIntegerZ(vec3 P) {
	vec3 Pi0 = mod(floor(P), vec3(SNO_PERIOD));
	vec3 Pi1 = mod(Pi0 + 1.0f, vec3(SNO_PERIOD));
	Pi0 = mod289(Pi0);
	Pi1 = mod289(Pi1);
	vec2 Pf0 = fract(P.xy);
	vec2 Pf1 = Pf0 - 1.0f;

	vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
	vec4 iy = vec4(Pi0.yy, Pi1.yy);
	vec4 ixy = permute(permute(ix) + iy);
	vec4 ixy0 = permute(ixy + Pi0.zzzz);

	vec4 gx0 = ixy0 * (1.0f / 7.0f);
	vec4 gy0 = fract(floor(gx0) * (1.0f / 7.0f)) - 0.5f;
	gx0 = fract(gx0);
	vec4 gz0 = vec4(0.5f) - abs(gx0) - abs(gy0);
	vec4 sz0 = step(gz0, vec4(0.0f));
	gx0 -= sz0 * (step(0.0f, gx0) - 0.5f);
	gy0 -= sz0 * (step(0.0f, gy0) - 0.5f);

	vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
	vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
	vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
	vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);

	vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
	g000 *= norm0.x;
	g010 *= norm0.y;
	g100 *= norm0.z;
	g110 *= norm0.w;

	float n000 = dot(g000.xy, Pf0);
	float n100 = dot(g100.xy, vec2(Pf1.x, Pf0.y));
	float n010 = dot(g010.xy, vec2(Pf0.x, Pf1.y));
	float n110 = dot(g110.xy, Pf1);

	vec2 fade_xy = snoiseFade2(Pf0);
	vec2 n_yz = mix(vec2(n000, n100), vec2(n010, n110), fade_xy.y);
	float R_raw = mix(n_yz.x, n_yz.y, fade_xy.x);

	vec2 gz_yz = mix(vec2(g000.z, g100.z), vec2(g010.z, g110.z), fade_xy.y);
	float G_raw = mix(gz_yz.x, gz_yz.y, fade_xy.x);

	return vec2(snoPack(2.2f * R_raw), snoPack(2.2f * G_raw));
}

// --- Tiled simplex noise (tiles at SNO_PERIOD in skewed space) ---

float tiledSimplex(vec3 v) {
	const vec2 C = vec2(1.0f / 6.0f, 1.0f / 3.0f);
	const vec4 D = vec4(0.0f, 0.5f, 1.0f, 2.0f);

	vec3 i = floor(v + dot(v, C.yyy));
	vec3 x0 = v - i + dot(i, C.xxx);
	vec3 g = step(x0.yzx, x0.xyz);
	vec3 l = 1.0f - g;
	vec3 i1 = min(g.xyz, l.zxy);
	vec3 i2 = max(g.xyz, l.zxy);
	vec3 x1 = x0 - i1 + C.xxx;
	vec3 x2 = x0 - i2 + 2.0f * C.xxx;
	vec3 x3 = x0 - 1.0f + 3.0f * C.xxx;

	i = mod(i, SNO_PERIOD);

	vec4 p = permute(permute(permute(i.z + vec4(0.0f, i1.z, i2.z, 1.0f)) +
		i.y + vec4(0.0f, i1.y, i2.y, 1.0f)) +
		i.x + vec4(0.0f, i1.x, i2.x, 1.0f));

	float n_ = 1.0f / 7.0f;
	vec3 ns = n_ * D.wyz - D.xzx;
	vec4 j = p - 49.0f * floor(p * ns.z * ns.z);
	vec4 x_ = floor(j * ns.z);
	vec4 y_ = floor(j - 7.0f * x_);
	vec4 xx = x_ * ns.x + ns.yyyy;
	vec4 yy = y_ * ns.x + ns.yyyy;
	vec4 h = 1.0f - abs(xx) - abs(yy);
	vec4 b0 = vec4(xx.xy, yy.xy);
	vec4 b1 = vec4(xx.zw, yy.zw);
	vec4 s0 = floor(b0) * 2.0f + 1.0f;
	vec4 s1 = floor(b1) * 2.0f + 1.0f;
	vec4 sh = -step(h, vec4(0.0f));
	vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
	vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
	vec3 p0 = vec3(a0.xy, h.x);
	vec3 p1 = vec3(a0.zw, h.y);
	vec3 p2 = vec3(a1.xy, h.z);
	vec3 p3 = vec3(a1.zw, h.w);
	vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
	p0 *= norm.x;
	p1 *= norm.y;
	p2 *= norm.z;
	p3 *= norm.w;

	vec4 m = max(0.6f - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0f);
	m *= m;
	return 42.0f * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// --- Combined bake entry point ---
//
// Atlas layout (1620 x 324):
//   Top half    (y < SNO_TILE): Classic Perlin — R = value packed, G = z-gradient weight packed
//   Bottom half (y >= SNO_TILE): Tiled simplex — R = value packed, G = z-derivative packed
//   10 slices along X, each SNO_TILE wide. Z index = slice index.

vec4 snoisePreStep(vec2 atlasUV) {
	vec2 tile_px = atlasUV * vec2(SNO_ATLAS_W, SNO_ATLAS_H);
	float z_k = floor(tile_px.x / SNO_TILE);
	vec2 within = vec2(tile_px.x - z_k * SNO_TILE, mod(tile_px.y, SNO_TILE));
	vec2 world_xy = mod((within - 0.5f) / SNO_INNER * SNO_PERIOD, SNO_PERIOD);

	vec2 rg = snoiseAtIntegerZ(vec3(world_xy, z_k));

	const vec3 SIMPLEX_TIE_OFFSET = vec3(1.0e-4f);
	vec3 sample_pos = vec3(world_xy, z_k) + SIMPLEX_TIE_OFFSET;
	float b_val = tiledSimplex(sample_pos);
	float b_pos = tiledSimplex(sample_pos + vec3(0.0f, 0.0f, 0.001f));
	float b_neg = tiledSimplex(sample_pos + vec3(0.0f, 0.0f, -0.001f));
	float b_dz = (b_pos - b_neg) / 0.002f;

	if (tile_px.y < SNO_TILE) {
		return vec4(rg, 0.5f, 0.5f);
	} else {
		return vec4(snrPack(b_val), snrDPack(b_dz), 0.5f, 0.5f);
	}
}

void main() {
	vec4 color = snoisePreStep(vTextureCoord);
	// Always output alpha=1 so WebGL premultiplication is a no-op.
	fragColor = vec4(color.xyz, 1.0f);
}
