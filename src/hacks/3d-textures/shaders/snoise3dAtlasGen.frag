#include ./_atlasGenHeader.frag

// GLSL helper functions and snoise implementations
// Extracted from snoiseOnTheFly.frag -- the known-correct reference.

vec3 mod289(in vec3 x) {
	return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(in vec4 x) {
	return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(in vec4 x) {
	return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(in vec4 r) {
	return 1.79284291400159 - 0.85373472095314 * r;
}

vec3 fade(in vec3 t) {
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// Tiled Perlin snoise — the workhorse for weather effects.
// rep will always only be 10,10,10, but please keep this parameter.
float snoise(in vec3 P, in vec3 rep) {
	vec3 Pi0 = mod(floor(P), rep);
	vec3 Pi1 = mod(Pi0 + vec3(1.0), rep);
	Pi0 = mod289(Pi0);
	Pi1 = mod289(Pi1);
	vec3 Pf0 = fract(P);
	vec3 Pf1 = Pf0 - vec3(1.0);
	vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
	vec4 iy = vec4(Pi0.yy, Pi1.yy);
	vec4 iz0 = Pi0.zzzz;
	vec4 iz1 = Pi1.zzzz;

	vec4 ixy = permute(permute(ix) + iy);
	vec4 ixy0 = permute(ixy + iz0);
	vec4 ixy1 = permute(ixy + iz1);

	vec4 gx0 = ixy0 * (1.0 / 7.0);
	vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
	gx0 = fract(gx0);
	vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
	vec4 sz0 = step(gz0, vec4(0.0));
	gx0 -= sz0 * (step(0.0, gx0) - 0.5);
	gy0 -= sz0 * (step(0.0, gy0) - 0.5);

	vec4 gx1 = ixy1 * (1.0 / 7.0);
	vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
	gx1 = fract(gx1);
	vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
	vec4 sz1 = step(gz1, vec4(0.0));
	gx1 -= sz1 * (step(0.0, gx1) - 0.5);
	gy1 -= sz1 * (step(0.0, gy1) - 0.5);

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
	return 2.2 * n_xyz;
}

// Simplex snoise variant — single vec3 input, no rep parameter.
float snoise(in vec3 v) {
	const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
	const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

	vec3 i = floor(v + dot(v, C.yyy));
	vec3 x0 = v - i + dot(i, C.xxx);
	vec3 g = step(x0.yzx, x0.xyz);
	vec3 l = 1.0 - g;
	vec3 i1 = min(g.xyz, l.zxy);
	vec3 i2 = max(g.xyz, l.zxy);
	vec3 x1 = x0 - i1 + C.xxx;
	vec3 x2 = x0 - i2 + 2.0 * C.xxx;
	vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
	i = mod(i, 289.0);

	vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));

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
	vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
	p0 *= norm.x;
	p1 *= norm.y;
	p2 *= norm.z;
	p3 *= norm.w;

	vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
	m *= m;
	return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Packing: inverse of snoUnpack / snrUnpack from the runtime sampler.
// snoUnpack: (p - 0.5) * 4.4  =>  pack: (v / 4.4) + 0.5, clamp [0,1]
// snrUnpack: (p - 0.5) * 2.0  =>  pack: (v / 2.0) + 0.5, clamp [0,1]
float packSno(float v) {
	return clamp(v / 4.4 + 0.5, 0.0, 1.0);
}
float packSnr(float v) {
	return clamp(v / 2.0 + 0.5, 0.0, 1.0);
}

void main() {
	// For a 160-wide texture spanning period 10, each unit maps to 16 texels.
	// Compute noise at fractional coordinates (i/16, j/16, k) so that:
	//   texel  0 = snoise(0.0,   0.0,   k)
	//   texel 16 = snoise(1.0,   0.0,   k)
	//   texel 32 = snoise(2.0,   0.0,   k)
	//   texel 159 = snoise(9.9375, 0.0, k)
	// This matches the render shader's sampling at mod(v, 10)/10 * 160.
	float x = (gl_FragCoord.x - 0.5) / 16.0;
	float y = (gl_FragCoord.y - 0.5) / 16.0;
	float z = uSlice;

	// Perlin snoise (tiled, rep=10)
	float pVal = snoise(vec3(x, y, z), vec3(10.0));
	// Perlin z-derivative (finite diff, epsilon = 0.5)
	float pDeriv = (snoise(vec3(x, y, z + 0.5), vec3(10.0)) - snoise(vec3(x, y, z - 0.5), vec3(10.0))) / 1.0;

	// Simplex snoise
	float sVal = snoise(vec3(x, y, z));
	// Simplex z-derivative
	float sDeriv = (snoise(vec3(x, y, z + 0.5)) - snoise(vec3(x, y, z - 0.5))) / 1.0;

	fragColor = vec4(packSno(pVal), packSno(pDeriv), packSnr(sVal), packSnr(sDeriv));
}
