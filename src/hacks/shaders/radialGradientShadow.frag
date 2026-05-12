precision mediump float;

varying vec2 vTextureCoord;

uniform float innerRadius;  // solid-core radius (pixels from center)
uniform float outerRadius;  // fade-to-zero radius (pixels from center)
uniform vec3 shadowColor;   // RGB, typically vec3(0.0)
uniform float peakAlpha;    // alpha at innerRadius boundary

void main(void) {
	vec2 offset = (vTextureCoord - 0.5) * (outerRadius * 2.0);
	float dist = length(offset);

	if (dist >= outerRadius) {
		gl_FragColor = vec4(0.0);
		return;
	}

	float alpha;
	if (dist <= innerRadius) {
		alpha = peakAlpha;
	} else {
		float t = (dist - innerRadius) / (outerRadius - innerRadius);
		alpha = peakAlpha * ((1.0 - pow(t, 0.6)) * 0.5 + exp(-3.5 * t * t) * 0.5);
	}

	gl_FragColor = vec4(shadowColor * alpha, alpha);
}
