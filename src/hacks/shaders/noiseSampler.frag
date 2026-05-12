// Optimized noise lookup via precomputed texture (period 1/16)
uniform sampler2D noiseTexture;
float noise(in vec2 uv) {
	vec4 color = texture2D(noiseTexture, uv * 0.0625);
	return color.r;
}
