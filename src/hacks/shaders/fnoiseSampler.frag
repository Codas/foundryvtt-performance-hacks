// Optimized fnoise lookup via precomputed noise texture (period 1/16)
uniform sampler2D noiseTexture;
float fnoise(in vec2 coords) {
	vec4 color = texture2D(noiseTexture, coords * 0.0625);
	return color.r;
}
