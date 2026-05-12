// fbm reduced to 3 octaves with smoothness input and amplitude of 1.0
float fbm(in vec2 uv, in float smoothness) {
	float s = exp2(-smoothness);
	float f = 1.0;
	float a = 1.0;
	float t = 0.0;

	t += a * noise(f * uv);
	f *= 2.0;
	a *= s;

	t += a * noise(f * uv);
	f *= 2.0;
	a *= s;

	t += a * noise(f * uv);

	return t;
}
