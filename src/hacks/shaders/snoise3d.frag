// === Optimized 3D snoise — sampler3D with hardware trilinear Z
// ================================================================

uniform mediump sampler3D snoiseAtlas3D;
const float SNO_PERIOD = 10.0;

// Packing matches snoise3d.ts generator:
//   R = Perlin value, pack: (v / 4.4) + 0.5  =>  unpack: (p - 0.5) * 4.4
//   B = Simplex value, pack: (v / 2.0) + 0.5  =>  unpack: (p - 0.5) * 2.0

float snoUnpack(float p) {
	return (p - 0.5) * 4.4;
}

float snrUnpack(float p) {
	return (p - 0.5) * 2.0;
}

// Tiled Perlin snoise — uses R channel (Perlin).
float snoise(in vec3 P, in vec3 rep) {
	vec3 uvw = vec3(mod(P.xy, SNO_PERIOD) / SNO_PERIOD, mod(P.z, SNO_PERIOD) / SNO_PERIOD);
	return snoUnpack(texture(snoiseAtlas3D, uvw).r);
}

// Simplex snoise (tiled to period 10) — uses B channel (Simplex).
float snoise(in vec3 v) {
	vec3 uvw = vec3(mod(v.xy, SNO_PERIOD) / SNO_PERIOD, mod(v.z, SNO_PERIOD) / SNO_PERIOD);
	return snrUnpack(texture(snoiseAtlas3D, uvw).b);
}

// --- Optimized 3D snoise
