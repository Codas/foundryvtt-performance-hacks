#version 300 es

      #define varying in
      #define texture2D texture
      #define textureCube texture
      #define texture2DProj textureProj
      #define texture2DLodEXT textureLod
      #define texture2DProjLodEXT textureProjLod
      #define textureCubeLodEXT textureLod
      #define texture2DGradEXT textureGrad
      #define texture2DProjGradEXT textureProjGrad
      #define textureCubeGradEXT textureGrad
      #define gl_FragDepthEXT gl_FragDepth

precision mediump float;

in vec2 vGridCoord; // normalized grid coordinates
in vec2 vCanvasCoord; // normalized canvas coordinates
in vec2 vSceneCoord; // normalized scene coordinates
in vec2 vScreenCoord; // normalized screen coordinates

const float PI = 3.141592653589793f;
const float TWOPI = 6.283185307179586f;
const float INVPI = 0.3183098861837907f;
const float INVTWOPI = 0.15915494309189535f;
const float SQRT2 = 1.4142135623730951f;
const float SQRT1_2 = 0.7071067811865476f;
const float SQRT3 = 1.7320508075688772f;
const float SQRT1_3 = 0.5773502691896257f;
const vec3 BT709 = vec3(0.2126f, 0.7152f, 0.0722f);

const int TYPE_SQUARE = 1;
const int TYPE_HEXODDR = 2;
const int TYPE_HEXEVENR = 3;
const int TYPE_HEXODDQ = 4;
const int TYPE_HEXEVENQ = 5;

uniform lowp int type;

    #define TYPE_IS_SQUARE (type == TYPE_SQUARE)
    #define TYPE_IS_HEXAGONAL ((TYPE_HEXODDR <= type) && (type <= TYPE_HEXEVENQ))
    #define TYPE_IS_HEXAGONAL_COLUMNS ((type == TYPE_HEXODDQ) || (type == TYPE_HEXEVENQ))
    #define TYPE_IS_HEXAGONAL_ROWS ((type == TYPE_HEXODDR) || (type == TYPE_HEXEVENR))
    #define TYPE_IS_HEXAGONAL_EVEN ((type == TYPE_HEXEVENR) || (type == TYPE_HEXEVENQ))
    #define TYPE_IS_HEXAGONAL_ODD ((type == TYPE_HEXODDR) || (type == TYPE_HEXODDQ))

uniform float thickness;
uniform vec4 color;
uniform float resolution;

    #define ANTIALIASED_STEP_TEMPLATE(type)       type antialiasedStep(type edge, type x) {         return clamp(((x - edge) * resolution) + 0.5, type(0.0), type(1.0));       }

ANTIALIASED_STEP_TEMPLATE(float) ANTIALIASED_STEP_TEMPLATE(vec2) ANTIALIASED_STEP_TEMPLATE(vec3) ANTIALIASED_STEP_TEMPLATE(vec4)

    #undef ANTIALIASED_STEP_TEMPLATE

float lineCoverage(float distance, float thickness, float alignment) {
float alpha0 = antialiasedStep((0.0f - alignment) * thickness, distance);
float alpha1 = antialiasedStep((1.0f - alignment) * thickness, distance);
return alpha0 - alpha1;
}

float lineCoverage(float distance, float thickness) {
return lineCoverage(distance, thickness, 0.5f);
}

vec2 pointToCube(vec2 p) {
float x = p.x;
float y = p.y;
float q;
float r;
float e = TYPE_IS_HEXAGONAL_EVEN ? 1.0f : 0.0f;
if (TYPE_IS_HEXAGONAL_COLUMNS) {
q = ((2.0f * SQRT1_3) * x) - (2.0f / 3.0f);
r = (- 0.5f * (q + e)) + y;
} else {
r = ((2.0f * SQRT1_3) * y) - (2.0f / 3.0f);
q = (- 0.5f * (r + e)) + x;
}
return vec2(q, r);
}

vec2 cubeToPoint(vec2 a) {
float q = a[0];
float r = a[1];
float x;
float y;
float e = TYPE_IS_HEXAGONAL_EVEN ? 1.0f : 0.0f;
if (TYPE_IS_HEXAGONAL_COLUMNS) {
x = (SQRT3 / 2.0f) * (q + (2.0f / 3.0f));
y = (0.5f * (q + e)) + r;
} else {
y = (SQRT3 / 2.0f) * (r + (2.0f / 3.0f));
x = (0.5f * (r + e)) + q;
}
return vec2(x, y);
}

vec2 offsetToCube(vec2 o) {
float i = o[0];
float j = o[1];
float q;
float r;
float e = TYPE_IS_HEXAGONAL_EVEN ? 1.0f : - 1.0f;
if (TYPE_IS_HEXAGONAL_COLUMNS) {
q = j;
r = i - ((j + (e * mod(j, 2.0f))) * 0.5f);
} else {
q = j - ((i + (e * mod(i, 2.0f))) * 0.5f);
r = i;
}
return vec2(q, r);
}

ivec2 offsetToCube(ivec2 o) {
int i = o[0];
int j = o[1];
int q;
int r;
int e = TYPE_IS_HEXAGONAL_EVEN ? 1 : - 1;
if (TYPE_IS_HEXAGONAL_COLUMNS) {
q = j;
r = i - ((j + (e * (j & 1))) / 2);
} else {
q = j - ((i + (e * (i & 1))) / 2);
r = i;
}
return ivec2(q, r);
}

vec2 cubeToOffset(vec2 a) {
float q = a[0];
float r = a[1];
float i;
float j;
float e = TYPE_IS_HEXAGONAL_EVEN ? 1.0f : - 1.0f;
if (TYPE_IS_HEXAGONAL_COLUMNS) {
j = q;
i = r + ((q + (e * mod(q, 2.0f))) * 0.5f);
} else {
i = r;
j = q + ((r + (e * mod(r, 2.0f))) * 0.5f);
}
return vec2(i, j);
}

ivec2 cubeToOffset(ivec2 a) {
int q = a[0];
int r = a[1];
int i;
int j;
int e = TYPE_IS_HEXAGONAL_EVEN ? 1 : - 1;
if (TYPE_IS_HEXAGONAL_COLUMNS) {
j = q;
i = r + ((q + (e * (q & 1))) / 2);
} else {
i = r;
j = q + ((r + (e * (r & 1))) / 2);
}
return ivec2(i, j);
}

vec2 cubeRound(vec2 a) {
float q = a[0];
float r = a[1];
float s = - q - r;
float iq = floor(q + 0.5f);
float ir = floor(r + 0.5f);
float is = floor(s + 0.5f);
float dq = abs(iq - q);
float dr = abs(ir - r);
float ds = abs(is - s);
if ((dq > dr) && (dq > ds)) {
iq = - ir - is;
} else if (dr > ds) {
ir = - iq - is;
} else {
is = - iq - ir;
}
return vec2(iq, ir);
}

float cubeDistance(vec2 a, vec2 b) {
vec2 c = b - a;
float q = c[0];
float r = c[1];
return (abs(q) + abs(r) + abs(q + r)) * 0.5f;
}

int cubeDistance(ivec2 a, ivec2 b) {
ivec2 c = b - a;
int q = c[0];
int r = c[1];
return (abs(q) + abs(r) + abs(q + r)) / 2;
}

vec2 nearestVertex(vec2 p) {
if (TYPE_IS_SQUARE) {
return floor(p + 0.5f);
}

if (TYPE_IS_HEXAGONAL) {
vec2 c = cubeToPoint(cubeRound(pointToCube(p)));
vec2 d = p - c;
float a = atan(d.y, d.x);
if (TYPE_IS_HEXAGONAL_COLUMNS) {
a = floor((a / (PI / 3.0f)) + 0.5f) * (PI / 3.0f);
} else {
a = (floor(a / (PI / 3.0f)) + 0.5f) * (PI / 3.0f);
}
return c + (vec2(cos(a), sin(a)) * SQRT1_3);
}
}

float edgeDistance(vec2 p) {
if (TYPE_IS_SQUARE) {
vec2 d = abs(p - floor(p + 0.5f));
return min(d.x, d.y);
}

if (TYPE_IS_HEXAGONAL) {
vec2 a = pointToCube(p);
vec2 b = cubeRound(a);
vec2 c = b - a;
float q = c[0];
float r = c[1];
float s = - q - r;
return (2.0f - (abs(q - r) + abs(r - s) + abs(s - q))) * 0.25f;
}
}

vec3 edgeOffset(vec2 p) {
if (TYPE_IS_SQUARE) {
vec2 d = abs(p - floor(p + 0.5f));
return vec3(max(d.x, d.y), min(d.x, d.y), 1.0f);
}

if (TYPE_IS_HEXAGONAL) {
vec2 c = cubeToPoint(cubeRound(pointToCube(p)));
vec2 d = p - c;
float a = atan(d.y, d.x);
if (TYPE_IS_HEXAGONAL_COLUMNS) {
a = (floor(a / (PI / 3.0f)) + 0.5f) * (PI / 3.0f);
} else {
a = floor((a / (PI / 3.0f)) + 0.5f) * (PI / 3.0f);
}
vec2 n = vec2(cos(a), sin(a));
return vec3((0.5f * SQRT1_3) + dot(d, vec2(- n.y, n.x)), 0.5f - dot(d, n), SQRT1_3);
}
}

uniform lowp int style;

const int STYLE_LINE_SOLID = 0;
const int STYLE_LINE_DASHED = 1;
const int STYLE_LINE_DOTTED = 2;
const int STYLE_POINT_SQUARE = 3;
const int STYLE_POINT_DIAMOND = 4;
const int STYLE_POINT_ROUND = 5;

vec4 drawGrid(vec2 point, int style, float thickness, vec4 color) {
float alpha;

if (style == STYLE_POINT_SQUARE) {
vec2 offset = abs(nearestVertex(point) - point);
float distance = max(offset.x, offset.y);
alpha = lineCoverage(distance, thickness);
} else if (style == STYLE_POINT_DIAMOND) {
vec2 offset = abs(nearestVertex(point) - point);
float distance = (offset.x + offset.y) * SQRT1_2;
alpha = lineCoverage(distance, thickness);
} else if (style == STYLE_POINT_ROUND) {
float distance = distance(point, nearestVertex(point));
alpha = lineCoverage(distance, thickness);
} else if (style == STYLE_LINE_SOLID) {
float distance = edgeDistance(point);
alpha = lineCoverage(distance, thickness);
} else if ((style == STYLE_LINE_DASHED) || (style == STYLE_LINE_DOTTED)) {
vec3 offset = edgeOffset(point);
if ((style == STYLE_LINE_DASHED) && TYPE_IS_HEXAGONAL) {
float padding = thickness * ((1.0f - SQRT1_3) * 0.5f);
offset.x += padding;
offset.z += (padding * 2.0f);
}

float intervals = offset.z * 0.5f / thickness;
if (intervals < 0.5f) {
alpha = lineCoverage(offset.y, thickness);
} else {
float interval = thickness * (2.0f * (intervals / floor(intervals + 0.5f)));
float dx = offset.x - (floor((offset.x / interval) + 0.5f) * interval);
float dy = offset.y;

if (style == STYLE_LINE_DOTTED) {
alpha = lineCoverage(length(vec2(dx, dy)), thickness);
} else {
alpha = min(lineCoverage(dx, thickness), lineCoverage(dy, thickness));
}
}
}

return color * alpha;
}

vec4 _main() {
return drawGrid(vGridCoord, style, thickness, color);
}

uniform float alpha;

out vec4 fragColor;

void main() {
fragColor = _main() * alpha;
}
