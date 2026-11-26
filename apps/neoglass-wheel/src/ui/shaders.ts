/**
 * Shaders propios de NeoGlassRojo.
 * Un único quad a pantalla completa; toda la rueda (sectores, bisel, especular,
 * separadores y brillo de barrido) se calcula por fragmento en coordenadas
 * polares. Sin texturas, sin dependencias: cero coste de subida de datos y
 * nitidez perfecta a cualquier DPR.
 */

export const MAX_SHADER_SEGMENTS = 24;

export const wheelVertexShader = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // Triángulo que cubre el viewport, generado desde gl_VertexID:
  // sin buffers de vértices, sin atributos, sin VAO con datos.
  vec2 positions[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  vec2 position = positions[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const wheelFragmentShader = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uRotation;   // grados, sentido horario
uniform float uTime;       // segundos
uniform int   uCount;
uniform float uStarts[${MAX_SHADER_SEGMENTS}];
uniform float uSizes[${MAX_SHADER_SEGMENTS}];
uniform vec3  uColors[${MAX_SHADER_SEGMENTS}];
uniform float uSpinning;   // 0..1
uniform float uWinner;     // índice o -1
uniform float uHover;      // índice o -1

const float PI = 3.141592653589793;
const float DEG = PI / 180.0;
const float HUB_RADIUS = 0.27;   // debe coincidir con el buje CSS/Canvas2D

// Todos los smoothstep usan edge0 < edge1 (requisito de GLSL ES 3.00:
// con los bordes invertidos el resultado es indefinido). Los degradados
// "de dentro hacia fuera" se invierten restando de 1.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float angularDistance(float angle, float start, float size) {
  float rel = mod(angle - start, 360.0);
  return min(rel, max(0.0, size - rel));
}

void main() {
  vec2 p = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  p.x *= uResolution.x / uResolution.y;

  float radius = length(p);
  if (radius > 1.0 || radius < HUB_RADIUS) discard;

  // Ángulo: 0 en 12 en punto, positivo en sentido horario.
  float angle = mod(degrees(atan(p.x, p.y)) + 360.0, 360.0);
  float local = mod(angle - uRotation, 360.0);

  int index = 0;
  float boundary = 9999.0;
  float span = 360.0;
  for (int i = 0; i < ${MAX_SHADER_SEGMENTS}; i++) {
    if (i >= uCount) break;
    float start = uStarts[i];
    float size = uSizes[i];
    float rel = mod(local - start + 360.0, 360.0);
    if (rel < size) {
      index = i;
      span = size;
      boundary = angularDistance(local, start, size);
      break;
    }
  }

  vec3 tint = uColors[index];

  // --- Volumen: altura del bisel y normal aproximada -----------------------
  float rim = 1.0 - smoothstep(0.86, 1.0, radius);       // 1 dentro → 0 borde
  float height = sqrt(max(0.0, 1.0 - radius * radius));
  vec3 normal = normalize(vec3(p * 0.85, height + 0.18));
  vec3 lightDir = normalize(vec3(-0.42, 0.58, 0.70));

  float diffuse = clamp(dot(normal, lightDir), 0.0, 1.0);
  vec3 halfway = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float specular = pow(clamp(dot(normal, halfway), 0.0, 1.0), 34.0);

  // --- Cristal: cuerpo, brillo interno y borde ---------------------------
  vec3 body = tint * (0.42 + 0.58 * diffuse);
  body = mix(body, tint * 1.45 + 0.10, rim * 0.55);
  body += vec3(1.0, 0.86, 0.88) * specular * 0.55;

  // Bisel de vidrio: se oscurece hacia el borde y dibuja un filo luminoso.
  float outerEdge = smoothstep(0.90, 1.0, radius);
  body *= 1.0 - outerEdge * 0.55;
  float filament = smoothstep(0.955, 0.975, radius) * (1.0 - smoothstep(0.975, 0.995, radius));
  body += vec3(1.0, 0.72, 0.76) * filament * 0.30;

  // Separadores entre sectores, atenuados cerca del buje.
  float separator = 1.0 - smoothstep(0.0, 1.6, boundary * radius * 2.6);
  body *= 1.0 - separator * 0.42;

  // Hover y ganador: realce dentro de la misma familia cromática.
  if (abs(float(index) - uHover) < 0.5) {
    body += tint * 0.22 + vec3(0.06, 0.01, 0.02);
  }
  if (abs(float(index) - uWinner) < 0.5) {
    float pulse = 0.5 + 0.5 * sin(uTime * 3.4);
    body += tint * (0.16 + 0.10 * pulse) + vec3(0.02, 0.005, 0.008);
    float halo = 1.0 - smoothstep(0.0, 0.38, boundary / max(span, 1.0));
    body += vec3(1.0, 0.42, 0.46) * halo * 0.16;
  }

  // Barrido especular de cristal; sólo late fuerte mientras gira.
  float sweepPhase = local * 1.6 + uTime * 120.0;
  float sweep = pow(0.5 + 0.5 * cos(sweepPhase * DEG), 9.0);
  body += vec3(1.0, 0.80, 0.82) * sweep * (0.10 + 0.22 * uSpinning);

  // Sombra interna junto al buje.
  float innerShadow = 1.0 - smoothstep(HUB_RADIUS, 0.34, radius);
  body *= 1.0 - innerShadow * 0.42;

  // Dithering determinista: evita bandas en degradados amplios.
  body += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;

  float alpha = (1.0 - smoothstep(0.985, 1.0, radius)) * smoothstep(HUB_RADIUS, HUB_RADIUS + 0.013, radius);

  fragColor = vec4(body, alpha);
}
`;
