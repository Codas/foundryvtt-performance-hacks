// Integer-hash utilities (Murmur-like 32-bit mix).
// Import with: #include ./_hash.frag

float hashToFloat(in uint x) {
	return float(x) * (1.0 / 4294967295.0);
}

uint mixHash32(in uint x) {
	x ^= x >> 16;
	x *= 0x85ebca6bU;
	x ^= x >> 13;
	x *= 0xc2b2ae35U;
	x ^= x >> 16;
	return x;
}

uint hashVec2_u(in uvec2 uv) {
	uint h = uv.x * 0x9E3779B1u;
	h ^= uv.y + 0x85ebca6bu;
	return mixHash32(h);
}

float hashFloatFromVec2(in vec2 position) {
	uvec2 uv = uvec2(floatBitsToUint(position.x), floatBitsToUint(position.y));
	return hashToFloat(hashVec2_u(uv));
}

uint hashUInt(in uint x) {
	return mixHash32(x);
}

float hashFloat(in float val) {
	uint bits = floatBitsToUint(val);
	return hashToFloat(hashUInt(bits));
}

vec2 hashVec2To2D(in vec2 position) {
	uvec2 uv = uvec2(floatBitsToUint(position.x), floatBitsToUint(position.y));
	uint h1 = hashVec2_u(uv);
	uint h2 = mixHash32(h1 ^ 0xDEADBEEFu);
	return vec2(hashToFloat(h1), hashToFloat(h2));
}
