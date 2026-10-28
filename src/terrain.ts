import * as THREE from 'three';
import { MAPS, tileCenter } from './content.ts';
import { cloneProp } from './library.ts';
import type { Quality } from './settings.ts';
import type { GameState, MapId } from './types.ts';
import { TILE, hashStr } from './util.ts';

export const waterUniforms = { uTime: { value: 0 } };

const waterMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: waterUniforms,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vPos;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vPos;
    void main() {
      float w = sin(vPos.x * 3.2 + uTime * 1.4) * sin(vPos.z * 2.6 - uTime) * 0.5 + 0.5;
      vec3 deep = vec3(0.08, 0.42, 0.72);
      vec3 lite = vec3(0.55, 0.90, 0.96);
      vec3 col = mix(deep, lite, w * 0.55 + 0.15);
      float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(0.0, 0.08, 1.0 - vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.y);
      gl_FragColor = vec4(col, 0.55 + edge * 0.28);
    }
  `,
});

const PAD = 6;

function noise(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function tileOf(mapId: MapId, x: number, z: number): { c: number; r: number; ch: string } | null {
  const map = MAPS[mapId];
  const c = Math.round(x / TILE + (map.cols - 1) / 2);
  const r = Math.round(z / TILE + (map.rows.length - 1) / 2);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows.length) return null;
  return { c, r, ch: map.rows[r][c] };
}

export function surfaceY(mapId: MapId, x: number, z: number, state: GameState | null, _now: number): number {
  const hit = tileOf(mapId, x, z);
  const n = noise(x, z);
  if (!hit) return (n - 0.5) * 0.05;
  const center = tileCenter(MAPS[mapId], hit.c, hit.r);
  const lx = Math.abs(x - center.x) / TILE;
  const lz = Math.abs(z - center.z) / TILE;
  const edge = Math.max(lx, lz);
  const ch = hit.ch;
  if (ch === 'b') {
    const soil = state?.soil[`${hit.c},${hit.r}`];
    const lift = soil?.tilled ? 0.14 : 0.08;
    const t = Math.max(0, 1 - edge / 0.46);
    const mound = t * t * (3 - 2 * t) * lift;
    return mound + (n - 0.5) * 0.012;
  }
  if (ch === 'd') return -0.22 + (n - 0.5) * 0.015;
  if (ch === 'a') return -0.08;
  if (ch === 'p' || ch === 'e') return -0.02 + (n - 0.5) * 0.008;
  if (ch === 'k' || ch === 'c') return 0.42 + n * 0.18;
  if (ch === 's') return (n - 0.5) * 0.03;
  return (n - 0.5) * 0.035;
}

function groundSample(mapId: MapId, x: number, z: number, state: GameState | null, now: number): { kind: number; shade: number } {
  const hit = tileOf(mapId, x, z);
  if (!hit) return { kind: mapId === 'jaskinia' ? 3 : 0, shade: 0.98 };
  const ch = hit.ch;
  if (ch === 'b') {
    const soil = state?.soil[`${hit.c},${hit.r}`];
    if (soil?.tilled) return { kind: 2, shade: soil.wetUntil > now ? 0.58 : 0.84 };
    return { kind: 2, shade: 1 };
  }
  if (ch === 'p' || ch === 'e') return { kind: 1, shade: 1 };
  if (ch === 'k' || ch === 'c' || ch === 'o') return { kind: 3, shade: 1 };
  if (ch === 'd' || ch === 'a') return { kind: 0, shade: 0.72 };
  if (mapId === 'jaskinia') return { kind: 3, shade: 0.85 };
  return { kind: 0, shade: 1 };
}

function tileable(size: number, paint: (g: CanvasRenderingContext2D, ox: number, oy: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  for (const ox of [0, size, -size]) {
    for (const oy of [0, size, -size]) paint(g, ox, oy);
  }
  return c;
}

function makeTex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

function grassCanvas(): HTMLCanvasElement {
  const size = 256;
  return tileable(size, (g, ox, oy) => {
    if (ox === 0 && oy === 0) {
      g.fillStyle = '#7ed85a';
      g.fillRect(0, 0, size, size);
    }
    g.save();
    g.translate(ox, oy);
    const n = 28;
    for (let i = 0; i < n; i++) {
      const x = (i * 67) % 256;
      const y = (i * 91) % 256;
      g.strokeStyle = i % 3 === 0 ? '#3f9a32' : i % 3 === 1 ? '#c6f27a' : '#5cbf40';
      g.lineWidth = 14;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y + 18);
      g.lineTo(x + ((i * 11) % 17) - 8, y - 36);
      g.stroke();
    }
    const dots: [string, number][] = [['#ffd84a', 8], ['#fff6ea', 6], ['#ff8ab4', 5], ['#ffe9a0', 4]];
    dots.forEach(([col, count], di) => {
      g.fillStyle = col;
      for (let i = 0; i < count; i++) {
        const x = ((i * 41 + di * 17) % 240) + 8;
        const y = ((i * 67 + di * 29) % 240) + 8;
        g.beginPath();
        g.arc(x, y, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    });
    g.restore();
  });
}

function pathCanvas(): HTMLCanvasElement {
  const size = 256;
  return tileable(size, (g, ox, oy) => {
    if (ox === 0 && oy === 0) {
      g.fillStyle = '#f0c98a';
      g.fillRect(0, 0, size, size);
    }
    g.save();
    g.translate(ox, oy);
    const stones = [
      [40, 48, 36, 28], [120, 36, 40, 26], [196, 58, 34, 24],
      [28, 130, 32, 30], [100, 124, 44, 32], [180, 140, 38, 26],
      [60, 210, 40, 28], [150, 206, 42, 30], [214, 200, 28, 24],
    ];
    for (const [x, y, w, h] of stones) {
      g.fillStyle = ((x + y) % 2 === 0) ? '#f3d7a4' : '#d7a86a';
      g.beginPath();
      g.roundRect(x - w / 2, y - h / 2, w, h, 8);
      g.fill();
      g.strokeStyle = '#c49258';
      g.lineWidth = 2;
      g.stroke();
    }
    g.restore();
  });
}

function soilCanvas(): HTMLCanvasElement {
  const size = 256;
  return tileable(size, (g, ox, oy) => {
    if (ox === 0 && oy === 0) {
      g.fillStyle = '#c4844a';
      g.fillRect(0, 0, size, size);
    }
    g.save();
    g.translate(ox, oy);
    for (let i = 0; i < 46; i++) {
      const x = (i * 53) % 256;
      const y = (i * 89) % 256;
      g.fillStyle = i % 2 === 0 ? '#8a542c' : '#c4844e';
      g.beginPath();
      g.ellipse(x, y, 8 + (i % 5), 5 + (i % 3), (i % 7) * 0.2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });
}

const groundUniforms = {
  uGrass: { value: null as THREE.Texture | null },
  uPath: { value: null as THREE.Texture | null },
  uSoil: { value: null as THREE.Texture | null },
};

let groundMat: THREE.MeshStandardMaterial | null = null;

function groundMaterial(): THREE.MeshStandardMaterial {
  if (groundMat) return groundMat;
  groundUniforms.uGrass.value = makeTex(grassCanvas());
  groundUniforms.uPath.value = makeTex(pathCanvas());
  groundUniforms.uSoil.value = makeTex(soilCanvas());
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
  mat.customProgramCacheKey = () => 'piotrogrod-ground-v2';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrass = groundUniforms.uGrass;
    shader.uniforms.uPath = groundUniforms.uPath;
    shader.uniforms.uSoil = groundUniforms.uSoil;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aKind;
attribute float aShade;
varying float vKind;
varying float vShade;
varying vec3 vWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vKind = aKind;
vShade = aShade;
vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uGrass;
uniform sampler2D uPath;
uniform sampler2D uSoil;
varying float vKind;
varying float vShade;
varying vec3 vWorld;`)
      .replace('#include <color_fragment>', `
vec2 uvw = vWorld.xz * 0.48;
vec3 gtex = texture2D(uGrass, uvw).rgb;
vec3 ptex = texture2D(uPath, uvw).rgb;
vec3 stex = texture2D(uSoil, uvw).rgb;
float k = vKind;
float pathW = 1.0 - smoothstep(0.0, 0.45, abs(k - 1.0));
float soilW = 1.0 - smoothstep(0.0, 0.45, abs(k - 2.0));
float rockW = 1.0 - smoothstep(0.0, 0.45, abs(k - 3.0));
vec3 albedo = gtex;
albedo = mix(albedo, ptex, pathW);
albedo = mix(albedo, stex, soilW);
vec3 rock = vec3(0.72, 0.69, 0.64) * (0.82 + 0.28 * ptex.g);
albedo = mix(albedo, rock, rockW);
diffuseColor.rgb = albedo * vShade;
`);
  };
  groundMat = mat;
  return mat;
}

const woodMat = new THREE.MeshStandardMaterial({ color: 0xe8b15a, roughness: 0.62, metalness: 0 });
const woodDark = new THREE.MeshStandardMaterial({ color: 0x8a522f, roughness: 0.78, metalness: 0 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x4cb83c, roughness: 0.7, metalness: 0 });
const bloomMats = new Map<number, THREE.MeshBasicMaterial>();
function bloomMat(color: number): THREE.MeshBasicMaterial {
  let m = bloomMats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    bloomMats.set(color, m);
  }
  return m;
}
const plankX = new THREE.BoxGeometry(TILE * 0.98, 0.22, 0.1);
const plankZ = new THREE.BoxGeometry(0.1, 0.22, TILE * 0.98);
const postGeo = new THREE.BoxGeometry(0.12, 0.32, 0.12);

export function buildTerrain(group: THREE.Group, mapId: MapId, state: GameState, now: number, quality: Quality): void {
  const map = MAPS[mapId];
  const sub = quality === 'niska' ? 4 : quality === 'wysoka' ? 8 : 6;
  const cols = map.cols + PAD * 2;
  const rows = map.rows.length + PAD * 2;
  const nx = cols * sub + 1;
  const nz = rows * sub + 1;
  const x0 = tileCenter(map, -PAD, 0).x - TILE / 2;
  const z0 = tileCenter(map, 0, -PAD).z - TILE / 2;
  const step = TILE / sub;
  const positions = new Float32Array(nx * nz * 3);
  const kinds = new Float32Array(nx * nz);
  const shades = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = x0 + ix * step;
      const z = z0 + iz * step;
      const y = surfaceY(mapId, x, z, state, now);
      const i = iz * nx + ix;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const sample = groundSample(mapId, x, z, state, now);
      kinds[i] = sample.kind;
      shades[i] = sample.shade;
    }
  }
  const indices: number[] = [];
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  geo.setAttribute('aShade', new THREE.BufferAttribute(shades, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, groundMaterial());
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'ground';
  group.add(mesh);

  for (let r = 0; r < map.rows.length; r++) {
    for (let c = 0; c < map.cols; c++) {
      const ch = map.rows[r][c];
      if (ch !== 'a' && ch !== 'd') continue;
      const p = tileCenter(map, c, r);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 1.04, TILE * 1.04), waterMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(p.x, ch === 'd' ? -0.08 : -0.02, p.z);
      plane.name = 'water';
      plane.receiveShadow = true;
      group.add(plane);
    }
  }

  dress(group, mapId, state, quality);
}

function place(group: THREE.Group, id: string, x: number, y: number, z: number, height: number, rot: number, cast = true): void {
  const g = cloneProp(id, height, cast);
  if (!g) return;
  g.position.set(x, y, z);
  g.rotation.y = rot;
  group.add(g);
}

function sprout(group: THREE.Group, x: number, y: number, z: number, color: number, h: number): void {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.26 * h, 5), leafMat);
  stem.position.y = 0.13 * h;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09 * h, 7, 6), bloomMat(color));
  head.position.y = 0.3 * h;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06 * h, 6, 4), leafMat);
  leaf.scale.set(1.6, 0.4, 0.8);
  leaf.position.set(-0.06 * h, 0.16 * h, 0);
  g.add(stem, head, leaf);
  g.position.set(x, y, z);
  group.add(g);
}

function bedFrame(group: THREE.Group, x: number, z: number, y: number): void {
  const y0 = y + 0.08;
  const n = new THREE.Mesh(plankX, woodMat);
  n.position.set(x, y0, z - TILE * 0.46);
  const s = new THREE.Mesh(plankX, woodMat);
  s.position.set(x, y0, z + TILE * 0.46);
  const w = new THREE.Mesh(plankZ, woodMat);
  w.position.set(x - TILE * 0.46, y0, z);
  const e = new THREE.Mesh(plankZ, woodMat);
  e.position.set(x + TILE * 0.46, y0, z);
  for (const p of [n, s, w, e]) {
    p.castShadow = true;
    p.receiveShadow = true;
  }
  group.add(n, s, w, e);
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [sx, sz] of corners) {
    const post = new THREE.Mesh(postGeo, woodDark);
    post.position.set(x + sx * TILE * 0.46, y + 0.12, z + sz * TILE * 0.46);
    post.castShadow = true;
    group.add(post);
  }
}

function butterfly(group: THREE.Group, x: number, y: number, z: number, color: number, phase: number): void {
  const g = new THREE.Group();
  g.name = 'butterfly';
  g.userData.hx = x;
  g.userData.hy = y;
  g.userData.hz = z;
  g.userData.ph = phase;
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const wingL = new THREE.Mesh(new THREE.CircleGeometry(0.28, 7), mat);
  wingL.name = 'wingL';
  wingL.position.set(-0.1, 0, 0);
  const wingR = new THREE.Mesh(new THREE.CircleGeometry(0.28, 7), mat);
  wingR.name = 'wingR';
  wingR.position.set(0.1, 0, 0);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.12, 2, 4), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.6, metalness: 0 }));
  body.rotation.x = Math.PI / 2;
  g.add(wingL, wingR, body);
  g.position.set(x, y, z);
  group.add(g);
}

function yardFence(group: THREE.Group, mapId: MapId, state: GameState): void {
  const map = MAPS[mapId];
  const tree = (ch: string | undefined) => ch === 't';
  const put = (x: number, z: number, rot: number) => {
    const y = surfaceY(mapId, x, z, state, 0);
    place(group, 'fence', x, y, z, 0.52, rot);
  };
  for (let r = 0; r < map.rows.length; r++) {
    for (let c = 0; c < map.cols; c++) {
      const ch = map.rows[r][c];
      if (ch === 't' || ch === 'p' || ch === 'e') continue;
      const p = tileCenter(map, c, r);
      if (c > 0 && tree(map.rows[r][c - 1])) put(p.x - TILE * 0.5, p.z, Math.PI / 2);
      if (c + 1 < map.cols && tree(map.rows[r][c + 1])) put(p.x + TILE * 0.5, p.z, Math.PI / 2);
      if (r > 0 && tree(map.rows[r - 1][c])) put(p.x, p.z - TILE * 0.5, 0);
      if (r + 1 < map.rows.length && tree(map.rows[r + 1][c])) put(p.x, p.z + TILE * 0.5, 0);
    }
  }
  const last = map.rows.length - 1;
  for (let c = 1; c < map.cols - 1; c++) {
    const ch = map.rows[last][c];
    if (ch === 'e' || ch === 'p' || ch === 't') continue;
    const p = tileCenter(map, c, last);
    put(p.x, p.z + TILE * 0.48, 0);
  }
}

const BLOOMS = [0xff6b9a, 0xffd23a, 0xfff6ea, 0xff8a3d, 0xc86bff, 0xff5a7a];

function dress(group: THREE.Group, mapId: MapId, state: GameState, quality: Quality): void {
  const map = MAPS[mapId];
  const trees = ['tree_default', 'tree_oak', 'tree_pine'];
  const flowers = ['flower_red', 'flower_yellow', 'flower_purple', 'lily'];
  for (let r = 0; r < map.rows.length; r++) {
    for (let c = 0; c < map.cols; c++) {
      const ch = map.rows[r][c];
      const p = tileCenter(map, c, r);
      const h = hashStr(mapId + ':' + c + ',' + r);
      const y = surfaceY(mapId, p.x, p.z, state, 0);
      const rot = (h % 628) / 100;
      if (ch === 't') {
        place(group, trees[h % trees.length], p.x, y, p.z, 3.15 + (h % 5) * 0.22, rot);
        if (h % 2 === 0) place(group, 'bush', p.x + 0.38, y, p.z + 0.22, 0.55, rot, false);
      } else if (ch === 'k' || ch === 'c') {
        place(group, h % 2 ? 'stone' : 'rock', p.x, y - 0.15, p.z, ch === 'k' ? 1.15 : 0.75, rot);
      } else if (ch === 'o') {
        place(group, 'rock', p.x, y, p.z, 0.55, rot);
      } else if (ch === 'm' || (ch === 'z' && mapId !== 'ogrod')) {
        place(group, ch === 'm' ? 'mushroom' : 'mushroom_tan', p.x, y, p.z, 0.42, rot, false);
      } else if (ch === 'h') {
        place(group, 'stump', p.x, y, p.z, 0.55, rot);
      } else if (ch === 'g' || ch === 's') {
        const dense = quality === 'niska' ? 4 : quality === 'wysoka' ? 2 : 3;
        if (h % dense === 0) {
          sprout(group, p.x + ((h % 5) - 2) * 0.12, y, p.z + ((h % 3) - 1) * 0.1, BLOOMS[h % BLOOMS.length], 1);
        }
        if (h % (dense + 2) === 1) {
          const flower = flowers[h % flowers.length];
          place(group, flower, p.x - 0.18, y, p.z + 0.12, 0.46, rot, false);
        }
        if (h % 9 === 2) place(group, 'rock', p.x + 0.28, y, p.z - 0.2, 0.28, rot, true);
      } else if (ch === 'n' && h % 2 === 0) {
        place(group, 'grass', p.x, y, p.z, 0.36, rot, false);
      } else if (ch === 'b' && mapId === 'ogrod') {
        bedFrame(group, p.x, p.z, y);
      }
    }
  }
  for (let r = -PAD; r < map.rows.length + PAD; r++) {
    for (let c = -PAD; c < map.cols + PAD; c++) {
      if (c >= 0 && r >= 0 && c < map.cols && r < map.rows.length) continue;
      const h = hashStr('edge' + mapId + c + ',' + r);
      if (r === -1 && c >= 0 && c < map.cols && map.rows[0][c] === 'e') continue;
      if (r === map.rows.length && c >= 0 && c < map.cols && map.rows[map.rows.length - 1][c] === 'e') continue;
      if (c === -1 && r >= 0 && r < map.rows.length && map.rows[r][0] === 'e') continue;
      if (c === map.cols && r >= 0 && r < map.rows.length && map.rows[r][map.cols - 1] === 'e') continue;
      const ring = Math.max(Math.abs(c + 0.5), Math.abs(r + 0.5));
      if (h % (ring < 8 ? 2 : 4) !== 0) continue;
      const p = tileCenter(map, c, r);
      const y = surfaceY(mapId, p.x, p.z, state, 0);
      if (mapId === 'jaskinia') place(group, 'stone', p.x, y, p.z, 0.9, h, true);
      else if (h % 5 === 0) place(group, 'bush_large', p.x, y, p.z, 0.85, h, false);
      else place(group, h % 2 ? 'tree_pine' : 'tree_oak', p.x, y, p.z, 3.3 + (h % 4) * 0.28, h);
    }
  }
  if (mapId === 'ogrod') {
    yardFence(group, mapId, state);
    for (const f of state.fences) {
      const p = tileCenter(map, f.c, f.r);
      const y = surfaceY(mapId, p.x, p.z, state, 0);
      place(group, 'fence', p.x, y, p.z, 0.52, 0);
    }
    const spots: [number, number, number][] = [
      [-2.2, 1.15, -1.4], [1.6, 1.2, -2.2], [0.2, 1.35, 0.4],
      [-3.4, 1.05, 2.2], [3.1, 1.25, 1.2], [2.4, 1.4, -0.6], [-0.8, 1.1, 3.1],
    ];
    spots.forEach(([x, y, z], i) => butterfly(group, x, y, z, BLOOMS[i % BLOOMS.length], i * 1.3));
  }
  if (mapId === 'laka' || mapId === 'wies') {
    butterfly(group, 1.2, 1.3, 0.4, 0xffd23a, 0.4);
    butterfly(group, -1.4, 1.15, -0.8, 0xff6b9a, 1.7);
  }
}
