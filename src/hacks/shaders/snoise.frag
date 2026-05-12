// === Optimized snoise shader
// ================================================================

uniform sampler2D snoiseAtlas;
const float SNO_PERIOD = 10.0;
const float SNO_INNER = 160.0;
const float SNO_TILE = 162.0;
const float SNO_SLICES = 10.0;
const float SNO_ATLAS_W = SNO_TILE * SNO_SLICES;
const float SNO_ATLAS_H = SNO_TILE * 2.0;
float snrUnpack(float p) {
	return (p - 0.5) * 2.0;
}
float snrDUnpack(float p) {
	return (p - 0.5) * 8.0;
}
vec2 snoAtlasUV(float sliceIdx, vec2 uvInner) {
	float x = sliceIdx * SNO_TILE + uvInner.x * SNO_INNER + 1.0;
	float y = uvInner.y * SNO_INNER + 1.0;
	return vec2(x / SNO_ATLAS_W, y / SNO_ATLAS_H);
}
vec2 snoAtlasUV_simplex(float sliceIdx, vec2 uvInner) {
	float x = sliceIdx * SNO_TILE + uvInner.x * SNO_INNER + 1.0;
	float y = uvInner.y * SNO_INNER + 1.0 + SNO_TILE;
	return vec2(x / SNO_ATLAS_W, y / SNO_ATLAS_H);
}
float snoise(in vec3 v) {
	float zWrapped = mod(v.z, SNO_PERIOD);
	float z0 = floor(zWrapped);
	float fz = fract(v.z);
	float z1 = mod(z0 + 1.0, SNO_PERIOD);
	vec2 uvInner = mod(v.xy, SNO_PERIOD) / SNO_PERIOD;
	vec4 s0 = texture(snoiseAtlas, snoAtlasUV_simplex(z0, uvInner));
	vec4 s1 = texture(snoiseAtlas, snoAtlasUV_simplex(z1, uvInner));
	float fade_z = fz * fz * fz * (fz * (fz * 6.0 - 15.0) + 10.0);
	float A0 = snrUnpack(s0.r) + fz * snrDUnpack(s0.g);
	float A1 = snrUnpack(s1.r) + (fz - 1.0) * snrDUnpack(s1.g);
	return mix(A0, A1, fade_z);
}
float snoUnpack(float p) {
	return (p - 0.5) * 4.4;
}

float snoise(in vec3 P, in vec3 rep) {
	float zWrapped = mod(P.z, SNO_PERIOD);
	float z0 = floor(zWrapped);
	float fz = fract(P.z);
	float z1 = mod(z0 + 1.0, SNO_PERIOD);

	vec2 uvInner = mod(P.xy, SNO_PERIOD) / SNO_PERIOD;

	vec2 s0 = texture(snoiseAtlas, snoAtlasUV(z0, uvInner)).rg;
	vec2 s1 = texture(snoiseAtlas, snoAtlasUV(z1, uvInner)).rg;

	float fade_z = fz * fz * fz * (fz * (fz * 6.0 - 15.0) + 10.0);
	float A0 = snoUnpack(s0.r) + fz * snoUnpack(s0.g);
	float A1 = snoUnpack(s1.r) + (fz - 1.0) * snoUnpack(s1.g);
	return mix(A0, A1, fade_z);
}

// --- Optimized snoise
