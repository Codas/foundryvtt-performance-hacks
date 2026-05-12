#version 300 es
precision mediump float;

in vec2 vTextureCoord;

out vec4 fragColor;

// === Hashing and Utility Functions
float random(in vec2 uv) {
	uv = mod(uv, 1000.0f);
	return fract(dot(uv, vec2(5.23f, 2.89f) * fract((2.41f * uv.x + 2.27f * uv.y) * 251.19f)) * 551.83f);
}

vec3 mod289(in vec3 x) {
	return x - floor(x * (1.0f / 289.0f)) * 289.0f;
}

vec4 mod289(in vec4 x) {
	return x - floor(x * (1.0f / 289.0f)) * 289.0f;
}

vec4 permute(in vec4 x) {
	return mod289(((x * 34.0f) + 1.0f) * x);
}

vec4 taylorInvSqrt(in vec4 r) {
	return 1.79284291400159f - 0.85373472095314f * r;
}

vec3 fade(in vec3 t) {
	return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f);
}

    // Normalize hash to [0..1]
float hashToFloat(in uint x) {
	return float(x) * (1.0f / 4294967295.0f);
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

    // Hash a single uint -> uint
uint hashUInt(in uint x) {
	return mixHash32(x);
}

    // Hash a float -> float in [0..1]
float hashFloat(in float val) {
	uint bits = floatBitsToUint(val);
	return hashToFloat(hashUInt(bits));
}

    // Hash a vec2 -> two floats in [0..1]
vec2 hashVec2To2D(in vec2 position) {
	uvec2 uv = uvec2(floatBitsToUint(position.x), floatBitsToUint(position.y));
	uint h1 = hashVec2_u(uv);
	uint h2 = mixHash32(h1 ^ 0xDEADBEEFu);
	return vec2(hashToFloat(h1), hashToFloat(h2));
}

// === SNOISE
// ============================================================

float snoise(in vec3 P) {
	vec3 rep = vec3(10.0f);
	vec3 Pi0 = mod(floor(P), rep); // Integer part, modulo period
	vec3 Pi1 = mod(Pi0 + vec3(1.0f), rep); // Integer part + 1, mod period
	Pi0 = mod289(Pi0);
	Pi1 = mod289(Pi1);
	vec3 Pf0 = fract(P); // Fractional part for interpolation
	vec3 Pf1 = Pf0 - vec3(1.0f); // Fractional part - 1.0
	vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
	vec4 iy = vec4(Pi0.yy, Pi1.yy);
	vec4 iz0 = Pi0.zzzz;
	vec4 iz1 = Pi1.zzzz;

	vec4 ixy = permute(permute(ix) + iy);
	vec4 ixy0 = permute(ixy + iz0);
	vec4 ixy1 = permute(ixy + iz1);

	vec4 gx0 = ixy0 * (1.0f / 7.0f);
	vec4 gy0 = fract(floor(gx0) * (1.0f / 7.0f)) - 0.5f;
	gx0 = fract(gx0);
	vec4 gz0 = vec4(0.5f) - abs(gx0) - abs(gy0);
	vec4 sz0 = step(gz0, vec4(0.0f));
	gx0 -= sz0 * (step(0.0f, gx0) - 0.5f);
	gy0 -= sz0 * (step(0.0f, gy0) - 0.5f);

	vec4 gx1 = ixy1 * (1.0f / 7.0f);
	vec4 gy1 = fract(floor(gx1) * (1.0f / 7.0f)) - 0.5f;
	gx1 = fract(gx1);
	vec4 gz1 = vec4(0.5f) - abs(gx1) - abs(gy1);
	vec4 sz1 = step(gz1, vec4(0.0f));
	gx1 -= sz1 * (step(0.0f, gx1) - 0.5f);
	gy1 -= sz1 * (step(0.0f, gy1) - 0.5f);

	vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
	vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
	vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
	vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
	vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
	vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
	vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
	vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

	vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
	g000 *= norm0.x;
	g010 *= norm0.y;
	g100 *= norm0.z;
	g110 *= norm0.w;
	vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
	g001 *= norm1.x;
	g011 *= norm1.y;
	g101 *= norm1.z;
	g111 *= norm1.w;

	float n000 = dot(g000, Pf0);
	float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
	float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
	float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
	float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
	float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
	float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
	float n111 = dot(g111, Pf1);

	vec3 fade_xyz = fade(Pf0);
	vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
	vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
	float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
	return 2.2f * n_xyz;
}

float tilingSnoise(vec2 uv, float period) {
	// Convert 2D UV to 3D coordinates and apply tiling period
	// snoise already has periodic tiling built-in
	vec3 P = vec3(uv * period, 0.0f);
	return snoise(P);
}

// === VALUE NOISE
// ============================================================

float valueNoise(in vec2 uv) {
      // Separate integer and fractional parts
	vec2 i = floor(uv);
	vec2 f = fract(uv);

      // Quintic smoothing
	f = f * f * f * (f * (f * 6.0f - 15.0f) + 10.0f);

      // Hash the four corners of the cell
	float c00 = hashFloatFromVec2(i);
	float c10 = hashFloatFromVec2(i + vec2(1.0f, 0.0f));
	float c01 = hashFloatFromVec2(i + vec2(0.0f, 1.0f));
	float c11 = hashFloatFromVec2(i + vec2(1.0f, 1.0f));

      // Bilinear mix of corners
	return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

float tilingValueNoise(vec2 uv, float period) {
	uv *= period;

      // Separate integer and fractional parts
	vec2 i = floor(uv);
	vec2 f = fract(uv);

      // Quintic smoothing
	f = f * f * f * (f * (f * 6.0f - 15.0f) + 10.0f);

      // Hash the four corners of the cell with periodic wrapping
	float c00 = hashFloatFromVec2(mod(i, period));
	float c10 = hashFloatFromVec2(mod(i + vec2(1.0f, 0.0f), period));
	float c01 = hashFloatFromVec2(mod(i + vec2(0.0f, 1.0f), period));
	float c11 = hashFloatFromVec2(mod(i + vec2(1.0f, 1.0f), period));

      // Bilinear mix of corners
	return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

// === Noise
// ============================================================

float noise(in vec2 uv) {
	const vec2 d = vec2(0.0f, 1.0f);
	vec2 b = floor(uv);
	vec2 f = smoothstep(vec2(0.f), vec2(1.0f), fract(uv));
	return mix(mix(random(b), random(b + d.yx), f.x), mix(random(b + d.xy), random(b + d.yy), f.x), f.y);
}

float tilingNoise(vec2 uv, float period) {
	uv *= period; // skaliere uv auf das gewünschte Tiling-Gitter

    // Ganzzahlige Gitterpunkte
	vec2 i = floor(uv);
	vec2 f = fract(uv);

    // Interpolation glätten
	vec2 u = smoothstep(0.0f, 1.0f, f);

    // Wiederholung durch Modulo mit periodischer Tile-Größe
	float a = random(mod(i + vec2(0.0f, 0.0f), period));
	float b = random(mod(i + vec2(1.0f, 0.0f), period));
	float c = random(mod(i + vec2(0.0f, 1.0f), period));
	float d = random(mod(i + vec2(1.0f, 1.0f), period));

    // Bilineare Interpolation
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// === VORONOI with time animation
// ============================================================

// Voronoi atlas baking function. Embed this in your texture-generator shader.
// Call tilingVoronoiPreStep(vTextureCoord, u_period) from main().
//
// u_period = total number of time slices (128.0).
// The atlas layout must match the constants in voronoiOptimized.glsl.
//
// Output: vec3(vor.x, vor.y, clamp(dist, 0, 1))
//   R = feature point x, G = feature point y, B = distance to nearest point

const float TWOPI = 6.283185307179586f;

// Atlas layout — keep in sync with voronoiOptimized.glsl
const float VOR_INNER = 512.0f;
const float VOR_TILE = VOR_INNER + 2.0f;    // 514 — inner + 1px border each side
const float VOR_SLICES_X = 8.0f;
const float VOR_SLICES_Y = 8.0f;
const float VOR_CELLS = 64.0f;
const float VOR_ATLAS_W = VOR_TILE * VOR_SLICES_X; // 4112
const float VOR_ATLAS_H = VOR_TILE * VOR_SLICES_Y; // 4112

// Hash that tiles at VOR_CELLS, matching the runtime sampler.
float tilingRandom(vec2 uv) {
	uv = mod(uv, VOR_CELLS);
	float f = fract((2.41f * uv.x + 2.27f * uv.y) * 251.19f);
	return fract((5.23f * uv.x + 2.89f * uv.y) * f * 551.83f);
}

vec3 voronoiTiling(vec2 uv, float t) {
	vec2 uvi = floor(uv);
	vec2 uvf = fract(uv);
	float bestDist2 = 100.0f;
	vec2 bestUVR = vec2(0.0f);
	float bestDist = 10.0f;

	for (int oy = -1; oy <= 1; oy++) {
		for (int ox = -1; ox <= 1; ox++) {
			vec2 uvn = vec2(float(ox), float(oy));
			float rnd = tilingRandom(uvi + uvn);
			float r1 = 0.5f * sin(TWOPI * rnd + t) + 0.5f;
			float r2 = 0.5f * sin(TWOPI * r1 + t) + 0.5f;
			vec2 uvr = vec2(r2);
			vec2 diff = uvn + uvr - uvf;
			float dist2 = dot(diff, diff);
			if (dist2 < bestDist2) {
				bestDist2 = dist2;
				bestUVR = uvr;
				bestDist = sqrt(dist2);
			}
		}
	}

	return vec3(bestUVR, clamp(bestDist, 0.0f, 1.0f));
}

// atlasUV: vTextureCoord in [0,1]^2 over the full atlas.
// period:  u_period — total number of time slices (64.0).
vec3 tilingVoronoiAtlas(vec2 atlasUV) {
	float period = 64.0f;
	vec2 atlasPx = atlasUV * vec2(VOR_ATLAS_W, VOR_ATLAS_H);
	vec2 sliceXY = floor(atlasPx / VOR_TILE);
	float sliceIdx = sliceXY.y * VOR_SLICES_X + sliceXY.x;

	// pixelInTile in [0, VOR_TILE): shift by -0.5 so border pixels wrap to opposite side
	vec2 pixelInTile = mod(atlasPx, VOR_TILE);
	vec2 uvCell = mod((pixelInTile - 0.5f) / VOR_INNER * VOR_CELLS, VOR_CELLS);

	float t = (sliceIdx / period) * TWOPI;
	return voronoiTiling(uvCell, t);
}

// === VORONOI Power 16
// ============================================================
float voronoiPower16(in vec2 point) {
	vec2 cell = floor(point);
	vec2 frac = fract(point);
	float res = 0.0f;

	for (int j = -1; j <= 1; j++) {
		for (int i = -1; i <= 1; i++) {
			vec2 neighbor = vec2(i, j);
			// Mod the cell coordinate so the texture tiles seamlessly at period 16.
			// Without this, cell 0 and cell 16 hash differently because
			// floatBitsToUint(0.0) != floatBitsToUint(16.0).
			vec2 r = neighbor - frac + hashVec2To2D(mod(cell + neighbor, 16.0f));
			float dr = dot(r, r);
			dr = dr * dr * dr * dr * dr * dr * dr * dr;
			res += 1.0f / dr;
		}
	}
	return pow(1.0f / res, 1.0f / 16.0f);
}

// -- Entry point for baking ----------------------------------------------------

// atlasUV: vTextureCoord in [0,1]^2 over the full 512x512 LUT.
float voronoiPower16PreStep(in vec2 atlasUV, in float period) {
	vec2 point = atlasUV * period;
	float v = voronoiPower16(point);
	return clamp(v, 0.0f, 1.0f);
}

// === FNOISE
// ============================================================

float fnoise(in vec2 coords) {
	vec2 i = floor(coords);
	vec2 f = fract(coords);

	float a = random(i);
	float b = random(i + vec2(1.0f, 0.0f));
	float c = random(i + vec2(0.0f, 1.0f));
	float d = random(i + vec2(1.0f, 1.0f));
	vec2 cb = f * f * (3.0f - 2.0f * f);

	return mix(a, b, cb.x) + (c - a) * cb.y * (1.0f - cb.x) + (d - b) * cb.x * cb.y;
}

float tilingFNoise(vec2 uv, float period) {
	uv *= period;

	vec2 i = floor(uv);
	vec2 f = fract(uv);

	float a = random(mod(i + vec2(0.0f, 0.0f), period));
	float b = random(mod(i + vec2(1.0f, 0.0f), period));
	float c = random(mod(i + vec2(0.0f, 1.0f), period));
	float d = random(mod(i + vec2(1.0f, 1.0f), period));
	vec2 cb = f * f * (3.0f - 2.0f * f);

	return mix(a, b, cb.x) + (c - a) * cb.y * (1.0f - cb.x) + (d - b) * cb.x * cb.y;
}

// === SNOISE
// ============================================================
// Atlas layout — must match snoiseOptimized.glsl and snoiseNoRepOptimized.glsl
const float SNO_PERIOD = 10.0f;
const float SNO_INNER = 160.0f;
const float SNO_TILE = SNO_INNER + 2.0f; // 162
const float SNO_SLICES = 10.0f;
const float SNO_ATLAS_W = SNO_TILE * SNO_SLICES; // 1620
const float SNO_ATLAS_H = SNO_TILE * 2.0f;         // 324 — top half Perlin RG, bottom half Simplex RG

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

// --- Classic Perlin (rep=10) bake ---

vec2 snoiseFade2(in vec2 t) {
	return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f);
}

// Evaluates classic Perlin with fz=0 and extracts z-gradient weight.
// See snoiseOptimized.glsl for reconstruction formula.
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

    // Tile at SNO_PERIOD instead of 289 for repeating pattern
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

// atlasUV: vTextureCoord in [0,1]^2 over the full 1620x324 atlas.
vec4 snoisePreStep(vec2 atlasUV) {
	vec2 tile_px = atlasUV * vec2(SNO_ATLAS_W, SNO_ATLAS_H);
	float z_k = floor(tile_px.x / SNO_TILE);
	// Normalize y to [0, SNO_TILE) so both halves sample the same noise position
	vec2 within = vec2(tile_px.x - z_k * SNO_TILE, mod(tile_px.y, SNO_TILE));
    // -0.5 shift makes border pixels wrap to opposite side
	vec2 world_xy = mod((within - 0.5f) / SNO_INNER * SNO_PERIOD, SNO_PERIOD);

    // R,G: classic Perlin at integer z
	vec2 rg = snoiseAtIntegerZ(vec3(world_xy, z_k));

    // R,G: tiled simplex at integer z + centered finite-difference z-derivative.
    // A tiny constant offset is added to all three coords to avoid the simplex
    // "tie point" discontinuity that occurs when x0 components are equal (which
    // happens whenever world_xy and z_k are all integer-aligned).  The offset is
    // 0.1% of the period, invisible in the final noise pattern.
	const vec3 SIMPLEX_TIE_OFFSET = vec3(1.0e-4f);
	vec3 sample_pos = vec3(world_xy, z_k) + SIMPLEX_TIE_OFFSET;
	float b_val = tiledSimplex(sample_pos);
	float b_pos = tiledSimplex(sample_pos + vec3(0.0f, 0.0f, 0.001f));
	float b_neg = tiledSimplex(sample_pos + vec3(0.0f, 0.0f, -0.001f));
	float b_dz = (b_pos - b_neg) / 0.002f;

    // Top half: Perlin RG; Bottom half: Simplex RG. B/A unused, set to 0.5 (neutral).
	if (tile_px.y < SNO_TILE) {
		return vec4(rg, 0.5f, 0.5f);
	} else {
		return vec4(snrPack(b_val), snrDPack(b_dz), 0.5f, 0.5f);
	}
}

// === MAIN FUNCTION
// ============================================================

// u_outputMode: 0 = RGB pass (alpha forced to 1), 1 = Alpha pass (alpha in RGB, alpha forced to 1)
// By always outputting alpha=1, WebGL premultiplication becomes a no-op.
uniform float u_outputMode;

void main() {
	// vec3 color = tilingVoronoiPreStep(vTextureCoord, u_period);
	// fragColor = vec4(color, 1.0f);

	vec4 color = snoisePreStep(vTextureCoord);

	// RGB pass: output RGB, force alpha = 1 so premult is no-op
	fragColor = vec4(color.xyz, 1.0f);
}
