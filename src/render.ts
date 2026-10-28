import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  MAPS,
  NPCS,
  getSpecies,
  tileCenter,
  type NpcDef,
} from './content.ts';
import { cloneProp, makeCrop, mobProp, preloadLibrary } from './library.ts';
import type { Quality } from './settings.ts';
import { buildTerrain, surfaceY, waterUniforms } from './terrain.ts';
import type { Character, GameState, MapId, Plant, Role } from './types.ts';
import { ROLES } from './types.ts';
import { TILE, angDelta, hashStr, lerp } from './util.ts';

const THEME: Record<MapId, { sky: number; fog: number; grass: number; grass2: number; path: number }> = {
  ogrod: { sky: 0x8fd8ff, fog: 0xc7ecff, grass: 0x6adf4c, grass2: 0x49c438, path: 0xf6d7a2 },
  wies: { sky: 0x96d9ff, fog: 0xcfefff, grass: 0x62d44a, grass2: 0x46b838, path: 0xf3d09a },
  las: { sky: 0x7ec8ea, fog: 0xa9d8cf, grass: 0x3eae46, grass2: 0x2d8c38, path: 0xd8c09a },
  laka: { sky: 0x8fd8ff, fog: 0xd4f2ff, grass: 0x86e85e, grass2: 0x69d44a, path: 0xf8e4ae },
  jaskinia: { sky: 0x161c2a, fog: 0x121722, grass: 0x3c4258, grass2: 0x2c3348, path: 0x514860 },
};

type Parts = {
  bob: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
};

export class WorldView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly labels: HTMLElement;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private lamp: THREE.PointLight;
  private staticG = new THREE.Group();
  private dynG = new THREE.Group();
  private rain: THREE.Points | null = null;
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private iconTex = new Map<string, THREE.CanvasTexture>();
  private chars = new Map<string, { group: THREE.Group; key: string }>();
  private plants = new Map<string, { group: THREE.Group; key: string }>();
  private mobs = new Map<string, THREE.Group>();
  private npcs = new Map<string, THREE.Group>();
  private labelPool: HTMLDivElement[] = [];
  private cam = new THREE.Vector3(0, 20.5, 14.8);
  private look = new THREE.Vector3(0, 0.4, 1.8);
  private butterflies: THREE.Object3D[] = [];
  private skyTex: THREE.Texture;
  private mapId: MapId | null = null;
  private worldKey = '';
  quality: Quality = 'srednia';
  private reduceMotion: boolean;
  private dust: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  private dustTex: THREE.Texture;
  private seenFx = new Set<number>();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.4, 180);
    this.labels = document.createElement('div');
    this.labels.id = 'labels';
    canvas.parentElement?.appendChild(this.labels);
    this.hemi = new THREE.HemisphereLight(0xfff0c8, 0x8ed86a, 1.05);
    this.sun = new THREE.DirectionalLight(0xfff3c8, 1.05);
    this.sun.position.set(12, 26, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -20;
    sc.right = 20;
    sc.top = 20;
    sc.bottom = -20;
    sc.near = 1;
    sc.far = 80;
    this.fill = new THREE.DirectionalLight(0xffe4b8, 0.82);
    this.fill.position.set(-10, 12, -6);
    this.lamp = new THREE.PointLight(0xffd2a2, 0, 9, 1.4);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.lamp, this.staticG, this.dynG);
    this.skyTex = skyTexture();
    this.dustTex = makeShadow();
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    void preloadLibrary().then(() => {
      this.worldKey = '';
    });
    this.resize();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const dpr = q === 'niska' ? 1 : Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    const shadows = q !== 'niska';
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    const size = q === 'wysoka' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
    this.worldKey = '';
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  frame(state: GameState, self: Role, dt: number, now: number, mode: 'play' | 'menu'): void {
    const mapId: MapId = mode === 'menu' ? 'ogrod' : state.characters[self].map;
    this.ensureWorld(state, mapId, now);
    this.syncDynamics(state, self, mapId, now, mode);
    this.cameraFor(state, self, dt, now, mode);
    this.weather(state, mapId, now);
    this.stepDust(dt);
    waterUniforms.uTime.value = now / 1000;
    const focus = mode === 'play' ? state.characters[self] : null;
    this.followSun(focus ? focus.x : 0, focus ? focus.z : 0);
    this.stepButterflies(now);
    this.renderer.render(this.scene, this.camera);
    if (mode === 'play') this.projectLabels(state, self, mapId, now);
    else this.clearLabels();
  }

  private followSun(x: number, z: number): void {
    this.sun.position.set(x + 12, 26, z + 8);
    this.sun.target.position.set(x, 0, z - 1.5);
    this.sun.target.updateMatrixWorld();
  }

  private stepButterflies(now: number): void {
    if (this.reduceMotion) return;
    const t = now / 1000;
    for (const b of this.butterflies) {
      const ph = Number(b.userData.ph ?? 0);
      const hx = Number(b.userData.hx ?? b.position.x);
      const hy = Number(b.userData.hy ?? 1.2);
      const hz = Number(b.userData.hz ?? b.position.z);
      b.position.set(hx + Math.sin(t * 0.65 + ph) * 0.75, hy + Math.sin(t * 2.1 + ph) * 0.16, hz + Math.cos(t * 0.5 + ph) * 0.6);
      b.rotation.y = t * 0.7 + ph;
      const flap = Math.sin(t * 14 + ph) * 0.95;
      const wl = b.getObjectByName('wingL');
      const wr = b.getObjectByName('wingR');
      if (wl) wl.rotation.y = 0.35 + flap;
      if (wr) wr.rotation.y = -0.35 - flap;
    }
  }

  private M(color: number, rough = 0.55, em = 0, opacity = 1): THREE.MeshStandardMaterial {
    const key = `${color.toString(16)}:${rough}:${em}:${opacity}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        metalness: 0.02,
        emissive: em,
        emissiveIntensity: em ? 0.55 : 0,
        transparent: opacity < 1,
        opacity,
      });
      this.mats.set(key, m);
    }
    return m;
  }

  private ensureWorld(state: GameState, mapId: MapId, now: number): void {
    let soil = '';
    if (mapId === 'ogrod') {
      for (const k of Object.keys(state.soil)) {
        const c = state.soil[k];
        if (c.tilled) soil += k + (c.wetUntil > now ? 'w' : 'd');
      }
    }
    const b = state.buildings;
    const key = `${mapId}|${this.quality}|${b.greenhouse ? 1 : 0}${b.coop ? 1 : 0}${b.house ? 1 : 0}|${state.fences.length}|${state.decors.length}|${soil}`;
    if (key === this.worldKey && this.mapId === mapId) return;
    this.worldKey = key;
    this.mapId = mapId;
    this.staticG.clear();
    const theme = THEME[mapId];
    this.scene.background = mapId === 'jaskinia' ? new THREE.Color(theme.sky) : this.skyTex;
    this.scene.fog = mapId === 'jaskinia' ? new THREE.Fog(theme.fog, 8, 28) : null;
    this.hemi.color.set(mapId === 'jaskinia' ? 0x6a7898 : 0xfff0c8);
    this.hemi.groundColor.set(mapId === 'jaskinia' ? 0x2a2438 : 0x8ed86a);
    this.hemi.intensity = mapId === 'jaskinia' ? 0.35 : 1.05;
    this.sun.color.set(mapId === 'jaskinia' ? 0xc5d4ee : 0xfff3c8);
    this.sun.intensity = mapId === 'jaskinia' ? 0.12 : 1.05;
    this.fill.color.set(mapId === 'jaskinia' ? 0x8899bb : 0xffe4b8);
    this.fill.intensity = mapId === 'jaskinia' ? 0.15 : 0.82;
    buildTerrain(this.staticG, mapId, state, now, this.quality);
    if (mapId === 'ogrod') {
      this.addWell();
      this.addGreenhouse(state.buildings.greenhouse);
      this.addCoop(state.buildings.coop);
      this.addHouse(state.buildings.house);
      for (const d of state.decors) this.addLamp(d.c, d.r);
    }
    if (mapId === 'wies') {
      this.addBlockHouses(mapId, 'H', 0xfff1d6, 0xe15b4c);
      this.addPropAt(mapId, 'F', (x, z) => this.addForge(x, z));
      this.addPropAt(mapId, 'S', (x, z) => this.addStall(x, z));
    }
    if (mapId === 'laka') this.addPropAt(mapId, 'h', (x, z) => this.addHive(x, z));
    this.addSigns(mapId);
    if (mapId !== 'jaskinia') this.addClouds();
    this.shade(this.staticG);
    this.butterflies = [];
    this.staticG.traverse((obj) => {
      if (obj.name === 'butterfly') this.butterflies.push(obj);
    });
  }

  private shade(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.name !== 'ground' && mesh.name !== 'water';
      mesh.receiveShadow = true;
    });
  }

  private addClouds(): void {
    const g = new THREE.Group();
    g.name = 'clouds';
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(1.1 + (i % 3) * 0.35, 12, 8), this.M(0xfff8ef, 0.92));
      c.position.set(-8 + i * 5.2, 9.5 + (i % 2) * 0.6, -14 - (i % 3) * 1.4);
      c.scale.set(2.4, 0.7, 1.3);
      g.add(c);
    }
    this.staticG.add(g);
  }

  private addWell(): void {
    const p = tileCenter(MAPS.ogrod, 9, 3);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.55, 10), this.M(0xd5d8e4, 0.45));
    base.position.set(p.x, 0.4, p.z);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), this.M(0x3ec6f0, 0.15, 0x8ae8ff));
    water.rotation.x = -Math.PI / 2;
    water.position.set(p.x, 0.62, p.z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.38, 4), this.M(0xe15b4c, 0.55));
    roof.position.set(p.x, 1.15, p.z);
    roof.rotation.y = Math.PI / 4;
    this.staticG.add(base, water, roof);
  }

  private addGreenhouse(finished: boolean): void {
    const cells = cellsOf('ogrod', 'G');
    if (!cells.length) return;
    const center = avg(cells);
    const glass = this.M(0xd7f4ff, 0.06, finished ? 0xc8f6ff : 0, 0.38);
    glass.depthWrite = false;
    const cream = this.M(0xfff6ea, 0.42);
    const wood = this.M(0xc4894a, 0.6);
    const base = new THREE.Mesh(new RoundedBoxGeometry(4.35, 0.26, 2.2, 2, 0.05), wood);
    base.position.set(center.x, 0.16, center.z);
    const walls = new THREE.Mesh(new RoundedBoxGeometry(4.05, 1.35, 1.85, 2, 0.04), glass);
    walls.position.set(center.x, 0.95, center.z);
    const slopeA = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.05, 1.2), glass);
    slopeA.position.set(center.x, 1.78, center.z - 0.42);
    slopeA.rotation.x = -0.42;
    const slopeB = slopeA.clone();
    slopeB.position.z = center.z + 0.42;
    slopeB.rotation.x = 0.42;
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.3, 6), cream);
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(center.x, 1.98, center.z);
    this.staticG.add(base, walls, slopeA, slopeB, ridge);
    for (const sx of [-1.9, 1.9]) {
      for (const sz of [-0.85, 0.85]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 6), wood);
        post.position.set(center.x + sx, 0.9, center.z + sz);
        this.staticG.add(post);
      }
    }
    for (let i = 0; i < 5; i++) {
      const plant = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 7), this.M(i % 2 ? 0x62d24c : 0x3f9e36));
      plant.position.set(center.x - 1.4 + i * 0.7, 0.48, center.z + (i % 2 ? 0.15 : -0.1));
      this.staticG.add(plant);
    }
  }

  private addCoop(finished: boolean): void {
    const p = tileCenter(MAPS.ogrod, 2, 6);
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.72, 0.85, 2, 0.08), this.M(0xfff3e2, 0.58));
    body.position.set(p.x, 0.5, p.z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.42, 4), this.M(finished ? 0xe23d3d : 0xd4553a, 0.5));
    roof.position.set(p.x, 1.05, p.z);
    roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.32, 0.06, 1, 0.03), this.M(0xc4894a));
    door.position.set(p.x, 0.32, p.z + 0.43);
    this.staticG.add(body, roof, door);
  }

  private addHouse(finished: boolean): void {
    const cells = cellsOf('ogrod', 'H');
    if (!cells.length) return;
    const center = avg(cells);
    const wall = this.M(0xfff6ea, 0.55);
    const roofC = this.M(0xe25b3a, 0.5);
    const wood = this.M(0xc4894a, 0.58);
    const body = new THREE.Mesh(new RoundedBoxGeometry(3.05, 1.35, 1.65, 3, 0.1), wall);
    body.position.set(center.x, 0.78, center.z);
    const slopeA = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.14, 1.2), roofC);
    slopeA.position.set(center.x, 1.62, center.z - 0.38);
    slopeA.rotation.x = -0.48;
    const slopeB = slopeA.clone();
    slopeB.position.z = center.z + 0.38;
    slopeB.rotation.x = 0.48;
    const chimney = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.5, 0.28, 1, 0.04), this.M(0xc46a4a, 0.7));
    chimney.position.set(center.x - 0.75, 2.05, center.z - 0.15);
    const door = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.7, 0.08, 2, 0.04), wood);
    door.position.set(center.x + 0.1, 0.46, center.z + 0.84);
    const winMat = this.M(0xffe7a0, 0.25, finished ? 0xffd56a : 0xffc86a);
    const win = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.34, 0.06, 1, 0.04), winMat);
    win.position.set(center.x - 0.55, 0.9, center.z + 0.84);
    const win2 = win.clone();
    win2.position.x = center.x + 0.72;
    const trough = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.12, 0.18, 1, 0.03), wood);
    trough.position.set(center.x - 0.55, 0.58, center.z + 0.96);
    this.staticG.add(body, slopeA, slopeB, chimney, door, win, win2, trough);
    for (let i = 0; i < 3; i++) {
      const pet = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), this.M(i === 1 ? 0xffd23a : 0xff6b9a));
      pet.position.set(center.x - 0.75 + i * 0.18, 0.72, center.z + 1.0);
      this.staticG.add(pet);
    }
    const benchA = tileCenter(MAPS.ogrod, 2, 9);
    const benchB = tileCenter(MAPS.ogrod, 3, 9);
    for (const b of [benchA, benchB]) {
      const seat = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.1, 0.34, 2, 0.04), this.M(0xe0b15e));
      seat.position.set(b.x, 0.4, b.z);
      const back = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.32, 0.08, 1, 0.03), this.M(0xc4894a));
      back.position.set(b.x, 0.58, b.z - 0.14);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), this.M(0x8a522f));
      leg.position.set(b.x - 0.26, 0.2, b.z);
      const leg2 = leg.clone();
      leg2.position.x = b.x + 0.26;
      this.staticG.add(seat, back, leg, leg2);
    }
  }

  private addLamp(c: number, r: number): void {
    const p = tileCenter(MAPS.ogrod, c, r);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 6), this.M(0x6b4a32));
    pole.position.set(p.x, 0.55, p.z);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), this.M(0xffe08a, 0.3, 0xffc83d));
    glow.position.set(p.x, 0.95, p.z);
    this.staticG.add(pole, glow);
  }

  private addBlockHouses(mapId: MapId, ch: string, wall: number, roofC: number): void {
    const map = MAPS[mapId];
    const seen = new Set<string>();
    for (let r = 0; r < map.rows.length; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (map.rows[r][c] !== ch || seen.has(c + ',' + r)) continue;
        let w = 0;
        while (c + w < map.cols && map.rows[r][c + w] === ch) w++;
        let h = 0;
        while (r + h < map.rows.length && [...Array(w).keys()].every((i) => map.rows[r + h][c + i] === ch)) h++;
        for (let rr = 0; rr < h; rr++) for (let cc = 0; cc < w; cc++) seen.add((c + cc) + ',' + (r + rr));
        const a = tileCenter(map, c, r);
        const b = tileCenter(map, c + w - 1, r + h - 1);
        const cx = (a.x + b.x) / 2;
        const cz = (a.z + b.z) / 2;
        const body = new THREE.Mesh(new RoundedBoxGeometry(w * TILE * 0.92, 1.3, h * TILE * 0.92, 2, 0.1), this.M(wall));
        body.position.set(cx, 0.8, cz);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, h) * 0.55, 0.7, 4), this.M(roofC));
        roof.position.set(cx, 1.7, cz);
        roof.rotation.y = Math.PI / 4;
        this.staticG.add(body, roof);
      }
    }
  }

  private addForge(x: number, z: number): void {
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.7, 0.7, 2, 0.08), this.M(0x5c534c));
    base.position.set(x, 0.5, z);
    const fire = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), this.M(0xff8a2a, 0.4, 0xff6a1a));
    fire.position.set(x, 0.85, z);
    this.staticG.add(base, fire);
  }

  private addStall(x: number, z: number): void {
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.1, 0.7, 1, 0.04), this.M(0xfff6ea));
    top.position.set(x, 0.85, z);
    const cloth = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.08, 0.8, 1, 0.02), this.M(0xff8a3d));
    cloth.position.set(x, 0.95, z);
    this.staticG.add(top, cloth);
  }

  private addHive(x: number, z: number): void {
    const hive = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 8), this.M(0xf2c14d, 0.5));
    hive.position.set(x, 0.42, z);
    this.staticG.add(hive);
  }

  private addPropAt(mapId: MapId, ch: string, fn: (x: number, z: number) => void): void {
    const map = MAPS[mapId];
    for (let r = 0; r < map.rows.length; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (map.rows[r][c] !== ch) continue;
        const p = tileCenter(map, c, r);
        fn(p.x, p.z);
      }
    }
  }

  private addSigns(mapId: MapId): void {
    const map = MAPS[mapId];
    const seen = new Set<string>();
    for (const ex of map.exits) {
      const k = ex.to;
      if (seen.has(k)) continue;
      seen.add(k);
      const p = tileCenter(map, ex.c, ex.r);
      const names: Record<MapId, string> = { ogrod: 'Ogród', wies: 'Piotrogród', las: 'Las', laka: 'Łąka', jaskinia: 'Jaskinia' };
      const board = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.36, 0.06, 1, 0.04), this.M(0xfff6ea));
      const tex = labelTexture(names[ex.to], '#fff6ea', '#5a3a22');
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.28), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      board.position.set(p.x, 0.7, p.z);
      face.position.set(p.x, 0.7, p.z + 0.04);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6), this.M(0xc4894a));
      post.position.set(p.x, 0.4, p.z);
      this.staticG.add(board, face, post);
    }
  }

  private syncDynamics(state: GameState, self: Role, mapId: MapId, now: number, mode: 'play' | 'menu'): void {
    const seenC = new Set<string>();
    for (const role of ROLES) {
      const ch = state.characters[role];
      if (mode === 'play' && ch.map !== mapId) continue;
      seenC.add(role);
      const gear = `${ch.equip.hat ?? ''}|${ch.equip.tool ?? ''}|${ch.equip.gloves ?? ''}`;
      let rec = this.chars.get(role);
      if (!rec || rec.key !== gear) {
        rec?.group.removeFromParent();
        const group = makeHero(role, ch.equip.hat, ch.equip.tool, (color, rough, em) => this.M(color, rough, em));
        this.dynG.add(group);
        rec = { group, key: gear };
        this.chars.set(role, rec);
      }
      const g = rec.group;
      const y = surfaceY(ch.map, ch.x, ch.z, state, now);
      const dx = g.position.x - ch.x;
      const dz = g.position.z - ch.z;
      const snap = role === self || mode === 'menu' || g.userData.ready !== 1 || dx * dx + dz * dz > 16;
      if (snap) g.position.set(ch.x, y, ch.z);
      else {
        g.position.x = lerp(g.position.x, ch.x, 0.35);
        g.position.z = lerp(g.position.z, ch.z, 0.35);
        g.position.y = y;
      }
      g.userData.ready = 1;
      const dy = angDelta(g.rotation.y, ch.rot);
      g.rotation.y += dy * (role === self ? 1 : 0.4);
      animateHero(g, ch, now);
      const ring = g.getObjectByName('ring') as THREE.Mesh | undefined;
      if (ring) ring.visible = role === self;
      if (role === self && ch.anim === 'walk' && !ch.downed && !this.reduceMotion) this.puff(ch.x, y + 0.05, ch.z, 0xc4b48a);
    }
    for (const [id, rec] of this.chars) {
      if (!seenC.has(id)) {
        rec.group.removeFromParent();
        this.chars.delete(id);
      }
    }

    const seenP = new Set<string>();
    if (mapId === 'ogrod' && mode === 'play') {
      for (const p of state.plants) {
        seenP.add(p.id);
        const key = `${p.species}:${p.stage}:${p.needsHeal}:${p.needsWater}:${p.needsPrune}:${p.fertilized}:${p.staked}:${p.covered}`;
        let rec = this.plants.get(p.id);
        if (!rec || rec.key !== key) {
          rec?.group.removeFromParent();
          const sp = getSpecies(p.species);
          const group = makeCrop(sp.form, p.stage, p.needsHeal)
            ?? makePlant(p, (c, r, e, o) => this.M(c, r, e, o), (k) => this.icon(k));
          if (!p.needsHeal && !this.reduceMotion) group.userData.sway = hashStr(p.id) % 100;
          const flag = p.needsHeal ? 'hurt' : p.needsPrune ? 'cut' : p.needsWater ? 'water' : p.stage === 'mature' ? 'star' : '';
          if (flag && !group.children.some((c) => c.name === 'flag')) {
            const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.icon(flag), transparent: true, depthWrite: false }));
            spr.name = 'flag';
            spr.position.y = 0.85;
            spr.scale.set(0.28, 0.28, 1);
            group.add(spr);
          }
          this.dynG.add(group);
          rec = { group, key };
          this.plants.set(p.id, rec);
        }
        const pos = tileCenter(MAPS.ogrod, p.c, p.r);
        const y = surfaceY('ogrod', pos.x, pos.z, state, now);
        rec.group.position.set(pos.x, y, pos.z);
        if (!p.needsHeal && !this.reduceMotion) {
          const sway = Number(rec.group.userData.sway ?? 0);
          rec.group.rotation.z = Math.sin(now / 480 + sway) * 0.06;
          rec.group.rotation.x = Math.cos(now / 560 + sway) * 0.04;
        }
      }
    }
    for (const [id, rec] of this.plants) {
      if (!seenP.has(id)) {
        rec.group.removeFromParent();
        this.plants.delete(id);
      }
    }

    const seenM = new Set<string>();
    if (mode === 'play') {
      for (const m of state.mobs) {
        if (m.map !== mapId) continue;
        seenM.add(m.id);
        let g = this.mobs.get(m.id);
        if (!g) {
          const prop = mobProp(m.kind);
          g = (prop && cloneProp(prop.id, prop.height)) || makeMobMesh(m.kind, (c, r, e, o) => this.M(c, r, e, o));
          this.dynG.add(g);
          this.mobs.set(m.id, g);
        }
        const fly = m.kind === 'wrona' || m.kind === 'osa' || m.kind === 'pszczola';
        const bob = fly ? 0.55 + Math.sin(now / 180 + m.x) * 0.08 : Math.sin(now / 260 + m.x) * 0.03;
        const gy = surfaceY(m.map, m.x, m.z, state, now);
        g.position.x = lerp(g.position.x || m.x, m.x, 0.4);
        g.position.z = lerp(g.position.z || m.z, m.z, 0.4);
        g.position.y = gy + bob + (m.deadAt ? -0.12 : 0);
        g.rotation.y = m.rot;
        g.scale.setScalar(m.deadAt ? 0.4 : m.kind === 'szlam' ? 1 + Math.sin(now / 200) * 0.06 : 1);
        const bar = g.getObjectByName('hp') as THREE.Mesh | undefined;
        if (bar) {
          const ratio = Math.max(0.05, m.hp / m.maxHp);
          bar.scale.x = ratio;
          bar.visible = m.hp < m.maxHp && !m.deadAt;
        }
      }
    }
    for (const [id, g] of this.mobs) {
      if (!seenM.has(id)) {
        g.removeFromParent();
        this.mobs.delete(id);
      }
    }

    const seenN = new Set<string>();
    if (mode === 'play') {
      for (const npc of NPCS) {
        if (npc.map !== mapId) continue;
        seenN.add(npc.id);
        let g = this.npcs.get(npc.id);
        if (!g) {
          g = makeNpc(npc, (c, r, e) => this.M(c, r, e));
          this.dynG.add(g);
          this.npcs.set(npc.id, g);
        }
        const p = tileCenter(MAPS[npc.map], npc.c, npc.r);
        g.position.set(p.x, surfaceY(npc.map, p.x, p.z, state, now), p.z);
        const face = angDelta(g.rotation.y, npc.rot);
        g.rotation.y += face * 0.2;
        const bob = g.getObjectByName('bob');
        if (bob && !this.reduceMotion) bob.position.y = Math.sin(now / 420 + npc.c) * 0.03;
        let mark = g.getObjectByName('mark') as THREE.Sprite | null;
        const kind = npcMarkerSafe(state, npc.id);
        if (kind === 'none') {
          if (mark) mark.visible = false;
        } else {
          if (!mark) {
            mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.icon(kind === 'turn' ? 'turn' : 'bang'), transparent: true, depthWrite: false }));
            mark.name = 'mark';
            mark.scale.set(0.38, 0.38, 1);
            mark.position.y = 2.85;
            g.add(mark);
          }
          (mark.material as THREE.SpriteMaterial).map = this.icon(kind === 'turn' ? 'turn' : 'bang');
          mark.visible = true;
        }
      }
    }
    for (const [id, g] of this.npcs) {
      if (!seenN.has(id)) {
        g.removeFromParent();
        this.npcs.delete(id);
      }
    }

    if (mode === 'play') {
      const me = state.characters[self];
      if (mapId === 'jaskinia') {
        this.lamp.intensity = 7;
        this.lamp.position.set(me.x, 1.6, me.z);
      } else this.lamp.intensity = 0;
    }

    const clouds = this.staticG.getObjectByName('clouds');
    if (clouds && !this.reduceMotion) clouds.position.x = Math.sin(now / 4000) * 0.8;
  }

  private cameraFor(state: GameState, self: Role, dt: number, now: number, mode: 'play' | 'menu'): void {
    const k = 1 - Math.pow(0.0015, Math.max(0.001, dt));
    if (mode === 'menu') {
      const c = tileCenter(MAPS.ogrod, 5, 6);
      const wob = this.reduceMotion ? 0 : Math.sin(now / 2200) * 0.4;
      const desired = new THREE.Vector3(c.x + wob, 20.5, c.z + 14.8);
      const look = new THREE.Vector3(c.x, 0.35, c.z + 1.6);
      this.cam.lerp(desired, 0.08);
      this.look.lerp(look, 0.08);
    } else {
      const p = state.characters[self];
      const desired = new THREE.Vector3(p.x, 20.5, p.z + 12.2);
      const look = new THREE.Vector3(p.x, 0.3, p.z - 6.4);
      this.cam.lerp(desired, Math.min(1, k));
      this.look.lerp(look, Math.min(1, k));
    }
    this.camera.position.copy(this.cam);
    this.camera.lookAt(this.look);
  }

  private weather(state: GameState, mapId: MapId, now: number): void {
    const storm = mapId === 'ogrod' && (state.weather.kind === 'storm' || state.weather.kind === 'warning');
    if (storm && !this.rain) {
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(180 * 3);
      for (let i = 0; i < 180; i++) {
        arr[i * 3] = (Math.random() - 0.5) * 14;
        arr[i * 3 + 1] = Math.random() * 8;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 14;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe7f6ff, size: 0.06, transparent: true, opacity: 0.65 }));
      this.dynG.add(this.rain);
    }
    if (this.rain) {
      this.rain.visible = storm;
      if (storm) {
        const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) - 0.18;
          if (y < 0) y = 7;
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
        this.rain.position.set(state.characters.ogrodnik.map === 'ogrod' ? state.characters.ogrodnik.x : 0, 0, 0);
      }
    }
    if (state.weather.kind === 'storm' && mapId === 'ogrod') {
      this.sun.intensity = 0.48 + Math.sin(now / 80) * 0.1;
      this.hemi.intensity = 0.36;
    } else if (mapId !== 'jaskinia') {
      this.sun.intensity = 1.05;
      this.hemi.intensity = 1.05;
    }
    for (const f of state.fx) {
      if (!this.seenFx.has(f.id)) {
        this.seenFx.add(f.id);
        const col = f.kind === 'water' ? 0x8ad4ff : f.kind === 'spark' ? 0xffe27a : f.kind === 'hit' || f.kind === 'dmg' ? 0xff8a6a : 0xe7d7b0;
        if (f.map === mapId && (f.kind === 'dust' || f.kind === 'water' || f.kind === 'spark' || f.kind === 'hit')) {
          for (let n = 0; n < (this.quality === 'niska' ? 2 : 4); n++) this.puff(f.x, 0.4, f.z, col);
        }
      }
    }
    for (const id of this.seenFx) {
      if (!state.fx.some((f) => f.id === id)) this.seenFx.delete(id);
    }
    for (const f of state.fx) {
      if (f.map !== mapId || f.until < now) continue;
      if (f.kind === 'lightning') {
        this.sun.intensity = 4.2;
      }
    }
  }

  private projectLabels(state: GameState, self: Role, mapId: MapId, now: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let i = 0;
    const put = (text: string, x: number, y: number, z: number, cls: string) => {
      const v = new THREE.Vector3(x, y, z).project(this.camera);
      if (v.z > 1) return;
      const el = this.labelPool[i] ?? document.createElement('div');
      if (!this.labelPool[i]) {
        this.labelPool[i] = el;
        this.labels.appendChild(el);
      }
      el.className = 'wlabel ' + cls;
      el.textContent = text;
      el.style.display = 'block';
      el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
      i++;
    };
    for (const role of ROLES) {
      const ch = state.characters[role];
      if (ch.map !== mapId) continue;
      const name = role === self ? 'Ty' : role === 'ogrodnik' ? 'Ogrodnik' : 'Zielarka';
      put(name, ch.x, 2.95, ch.z, role === self ? 'me' : 'them');
      if (ch.emote && ch.emoteUntil > Date.now()) {
        const bubble = ch.emote === 'heart' ? '❤' : ch.emote === 'wave' ? '👋' : ch.emote === 'laugh' ? '😄' : '🌸';
        put(bubble, ch.x, 3.25, ch.z, 'emote');
      }
    }
    for (const npc of NPCS) {
      if (npc.map !== mapId) continue;
      const p = tileCenter(MAPS[npc.map], npc.c, npc.r);
      put(npc.name, p.x, 2.7, p.z, 'npc');
    }
    for (const f of state.fx) {
      if (f.map !== mapId || !f.text || f.until < now) continue;
      const rise = (1 - Math.max(0, f.until - now) / 800) * 0.7;
      put(f.text, f.x, 1.15 + rise, f.z, 'num');
    }
    for (; i < this.labelPool.length; i++) this.labelPool[i].style.display = 'none';
  }

  private clearLabels(): void {
    for (const el of this.labelPool) el.style.display = 'none';
  }

  private puff(x: number, y: number, z: number, color: number): void {
    const cap = this.quality === 'niska' ? 16 : this.quality === 'wysoka' ? 48 : 28;
    if (this.dust.length >= cap) return;
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 8),
      new THREE.MeshBasicMaterial({ map: this.dustTex, color, transparent: true, depthWrite: false, opacity: 0.7 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2);
    this.dynG.add(mesh);
    this.dust.push({ mesh, life: 0, max: 0.45 });
  }

  private stepDust(dt: number): void {
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const p = this.dust[i];
      p.life += dt;
      const t = p.life / p.max;
      p.mesh.position.y += dt * 0.35;
      p.mesh.scale.setScalar(1 + t * 1.4);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.65 * (1 - t));
      if (t >= 1) {
        p.mesh.removeFromParent();
        (p.mesh.material as THREE.Material).dispose();
        this.dust.splice(i, 1);
      }
    }
  }

  private icon(kind: string): THREE.CanvasTexture {
    let tex = this.iconTex.get(kind);
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 64, 64);
    g.beginPath();
    g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fillStyle = kind === 'bang' ? '#ffcf3a' : kind === 'turn' ? '#7dff9a' : kind === 'water' ? '#4aa3ff' : kind === 'hurt' ? '#ff5b6a' : kind === 'cut' ? '#d7a15a' : '#ffe27a';
    g.fill();
    g.fillStyle = '#3a2a1a';
    g.font = 'bold 36px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const glyph = kind === 'bang' ? '!' : kind === 'turn' ? '★' : kind === 'water' ? '•' : kind === 'hurt' ? '+' : kind === 'cut' ? '✂' : '✦';
    g.fillText(glyph, 32, 34);
    tex = new THREE.CanvasTexture(c);
    this.iconTex.set(kind, tex);
    return tex;
  }
}

function npcMarkerSafe(state: GameState, id: string): 'none' | 'new' | 'turn' {
  // local import avoided; duplicated lightly via dynamic to keep render free of logic cycles
  const quests = state.quests;
  void quests;
  return markerFrom(state, id);
}

function markerFrom(state: GameState, npcId: string): 'none' | 'new' | 'turn' {
  // Inline minimal marker using quest ids stored; full rules live in logic and are mirrored by reading progress lazily.
  // We import npcMarker through a late binding set by main to avoid a cycle (render <- logic <- content, logic doesn't import render).
  return externalMarker(state, npcId);
}

let externalMarker: (s: GameState, id: string) => 'none' | 'new' | 'turn' = () => 'none';
export function bindMarker(fn: (s: GameState, id: string) => 'none' | 'new' | 'turn'): void {
  externalMarker = fn;
}

function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#7ec8f8');
  grd.addColorStop(0.42, '#ffd59a');
  grd.addColorStop(0.72, '#ffe7c4');
  grd.addColorStop(1, '#b7e68a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeShadow(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, 'rgba(40,60,20,0.45)');
  grd.addColorStop(1, 'rgba(40,60,20,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function shadowMesh(tex: THREE.Texture): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  return m;
}

type MatFn = (color: number, rough?: number, em?: number, opacity?: number) => THREE.Material;

type ChibiHat = 'straw' | 'wreath' | 'hood' | 'cap' | 'none';
type ChibiTool = 'hoe' | 'can' | 'hammer' | 'none';
type ChibiOpts = {
  skin?: number;
  hair?: number;
  cloth: number;
  pants?: number;
  hat: ChibiHat;
  tool: ChibiTool;
  skirt?: boolean;
  beard?: boolean;
  ring?: number;
};

let strawMat: THREE.MeshStandardMaterial | null = null;
function strawMaterial(): THREE.MeshStandardMaterial {
  if (strawMat) return strawMat;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f0c14e';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#e0a62e';
  g.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.cos(a) * 150, 128 + Math.sin(a) * 150);
    g.stroke();
  }
  g.strokeStyle = '#f6d56a';
  g.lineWidth = 2;
  for (let r = 24; r <= 120; r += 16) {
    g.beginPath();
    g.arc(128, 128, r, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  strawMat = new THREE.MeshStandardMaterial({ map: tex, color: 0xfff3c4, roughness: 0.68, metalness: 0, side: THREE.DoubleSide });
  return strawMat;
}

function makeHero(role: Role, hat: string | undefined, tool: string | undefined, M: MatFn): THREE.Group {
  const straw = hat === 'kapelusz_sloma' || (role === 'ogrodnik' && hat !== 'kaptur' && hat !== 'wianek');
  const wreath = hat === 'wianek' || (role === 'zielarka' && hat !== 'kaptur' && !straw);
  const toolKind: ChibiTool = tool?.startsWith('konewka') ? 'can' : tool?.startsWith('motyka') ? 'hoe' : role === 'zielarka' ? 'can' : 'hoe';
  return makeChibi({
    cloth: role === 'ogrodnik' ? 0x3caf3a : 0xff7aa8,
    pants: role === 'ogrodnik' ? 0x2f9a38 : 0xff7aa8,
    hair: 0xc47a3a,
    hat: hat === 'kaptur' ? 'hood' : straw ? 'straw' : wreath ? 'wreath' : 'none',
    tool: toolKind,
    skirt: role === 'zielarka',
    ring: role === 'ogrodnik' ? 0x7dff6a : 0xff8ab8,
  }, M);
}

function makeChibi(opts: ChibiOpts, M: MatFn): THREE.Group {
  const skin = opts.skin ?? 0xffd7b8;
  const hair = opts.hair ?? 0x6b3a22;
  const cloth = opts.cloth;
  const pants = opts.pants ?? cloth;
  const root = new THREE.Group();
  const blob = shadowMesh(makeShadow());
  blob.name = 'blob';
  root.add(blob);
  const bob = new THREE.Group();
  bob.name = 'bob';
  root.add(bob);
  const skinM = M(skin, 0.48);
  const hairM = M(hair, 0.62);
  const clothM = M(cloth, 0.52);
  const pantsM = M(pants, 0.55);
  const bootM = M(0x6b4228, 0.62);
  const cream = M(0xfff3e4, 0.5);

  const legL = chibiLeg(-0.13, opts.skirt ? cream : pantsM, bootM);
  const legR = chibiLeg(0.13, opts.skirt ? cream : pantsM, bootM);
  bob.add(legL, legR);

  if (opts.skirt) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, 0.42, 16), clothM);
    skirt.position.y = 0.58;
    bob.add(skirt);
    const bodice = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.32, 0.32, 3, 0.1), cream);
    bodice.position.y = 0.9;
    bob.add(bodice);
    const bow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M(0xfff6ea, 0.4));
    bow.scale.set(1.5, 0.7, 0.7);
    bow.position.set(0, 0.72, -0.28);
    bob.add(bow);
  } else {
    const torso = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.5, 0.38, 3, 0.12), clothM);
    torso.position.y = 0.82;
    bob.add(torso);
    const strap = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.42, 0.06, 1, 0.02), M(0x2c7a34, 0.5));
    strap.position.set(-0.1, 0.84, -0.18);
    strap.rotation.z = 0.35;
    const strap2 = strap.clone();
    strap2.position.x = 0.1;
    strap2.rotation.z = -0.35;
    const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.12, 0.04, 1, 0.02), M(0x2f8a36, 0.5));
    pocket.position.set(0.12, 0.72, 0.18);
    bob.add(strap, strap2, pocket);
  }

  const headPivot = new THREE.Group();
  headPivot.position.y = 1.22;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), skinM);
  headPivot.add(head);
  if (opts.hat === 'straw') {
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), hairM);
    fringe.scale.set(1.3, 0.55, 0.7);
    fringe.position.set(0, 0.02, -0.18);
    headPivot.add(fringe);
  } else {
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), hairM);
    hairCap.scale.set(1.02, 0.62, 1.02);
    hairCap.position.set(0, 0.04, -0.02);
    headPivot.add(hairCap);
  }
  headPivot.add(chibiEye(-0.11), chibiEye(0.11));
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 12, Math.PI), M(0xc45b4a, 0.4));
  smile.position.set(0, -0.06, 0.28);
  smile.rotation.z = Math.PI;
  headPivot.add(smile);
  const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff8aa0 });
  const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), cheekMat);
  cheek.position.set(-0.18, -0.02, 0.22);
  const cheek2 = cheek.clone();
  cheek2.position.x = 0.18;
  headPivot.add(cheek, cheek2);
  if (opts.beard) {
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 8), M(0xf4f0ea, 0.6));
    beard.position.set(0, -0.16, 0.22);
    headPivot.add(beard);
  }
  if (opts.hat === 'straw') addStrawHat(headPivot, M);
  else if (opts.hat === 'wreath') addFlowerCrown(headPivot);
  else if (opts.hat === 'hood') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), M(0x6a4cc0, 0.55));
    hood.scale.y = 0.82;
    hood.position.y = 0.06;
    headPivot.add(hood);
  } else if (opts.hat === 'cap') addCap(headPivot, M);
  if (opts.skirt) {
    const braid = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 4, 8), hairM);
    braid.position.set(0.08, -0.22, -0.22);
    braid.rotation.x = 0.5;
    const tie = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), M(0xff6b9a, 0.4));
    tie.position.set(0.1, -0.42, -0.32);
    headPivot.add(braid, tie);
  }
  bob.add(headPivot);

  const sleeve = opts.skirt ? M(0xff8fb8, 0.5) : cream;
  const armL = chibiArm(-0.36, skinM, sleeve);
  const armR = chibiArm(0.36, skinM, sleeve);
  bob.add(armL, armR);
  if (opts.tool === 'hoe') addHoe(armR, M);
  else if (opts.tool === 'can') addCan(armR, M);
  else if (opts.tool === 'hammer') {
    const hammer = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.1, 0.1, 1, 0.02), M(0xc5ced8, 0.3));
    hammer.position.set(0.08, -0.32, -0.06);
    armR.add(hammer);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 28),
    new THREE.MeshBasicMaterial({ color: opts.ring ?? 0xfff6c8, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.045;
  ring.name = 'ring';
  root.add(ring);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name === 'ring' || mesh.name === 'blob') return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  root.scale.setScalar(1.62);
  root.userData.parts = { bob, legL, legR, armL, armR, head: headPivot } satisfies Parts;
  return root;
}

function chibiLeg(x: number, cloth: THREE.Material, boot: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.48, 0);
  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.18, 4, 8), cloth);
  thigh.position.y = -0.16;
  const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), boot);
  shoe.scale.set(1.05, 0.62, 1.35);
  shoe.position.set(0, -0.34, 0.04);
  pivot.add(thigh, shoe);
  return pivot;
}

function chibiArm(x: number, skin: THREE.Material, sleeve: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.92, 0);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 3, 8), sleeve);
  upper.position.y = -0.14;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skin);
  hand.position.y = -0.3;
  pivot.add(upper, hand);
  return pivot;
}

function chibiEye(x: number): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), new THREE.MeshBasicMaterial({ color: 0x2a2218 }));
  pupil.position.z = 0.045;
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  glint.position.set(0.015, 0.015, 0.07);
  g.add(white, pupil, glint);
  g.position.set(x, 0.04, 0.26);
  return g;
}

function addStrawHat(head: THREE.Group, M: MatFn): void {
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 28), strawMaterial());
  brim.position.y = 0.28;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.14, 16), strawMaterial());
  crown.position.y = 0.36;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.045, 16), M(0x2f9a34, 0.45));
  band.position.y = 0.32;
  head.add(brim, crown, band);
  for (const rad of [0.3, 0.39]) {
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.012, 6, 24), M(0xd9a22e, 0.5));
    ridge.rotation.x = Math.PI / 2;
    ridge.position.y = 0.3;
    head.add(ridge);
  }
}

function addFlowerCrown(head: THREE.Group): void {
  const colors = [0xff6b9a, 0xfff6ea, 0xffd23a, 0xff8a3d, 0xd56bff, 0xff5a7a];
  for (let i = 0; i < 6; i++) {
    const pet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 7), new THREE.MeshBasicMaterial({ color: colors[i] }));
    const a = (i / 6) * Math.PI * 2;
    pet.position.set(Math.cos(a) * 0.28, 0.4, Math.sin(a) * 0.28);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), new THREE.MeshBasicMaterial({ color: 0x3ecf4a }));
    leaf.scale.set(1.4, 0.4, 0.8);
    leaf.position.set(Math.cos(a + 0.45) * 0.28, 0.2, Math.sin(a + 0.45) * 0.28);
    head.add(pet, leaf);
  }
}

function addCap(head: THREE.Group, M: MatFn): void {
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.16, 12), M(0x6b3a28, 0.6));
  crown.position.y = 0.3;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), M(0x5c321f, 0.6));
  brim.position.y = 0.22;
  head.add(crown, brim);
}

function addHoe(arm: THREE.Group, M: MatFn): void {
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.95, 7), M(0xc4894a, 0.55));
  stick.position.set(0.16, -0.42, -0.08);
  stick.rotation.z = 0.42;
  const blade = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.07, 0.08, 1, 0.02), M(0xd5dbe6, 0.32));
  blade.position.set(0.34, -0.84, -0.08);
  arm.add(stick, blade);
}

function addCan(arm: THREE.Group, M: MatFn): void {
  const metal = M(0xd5e2ea, 0.28);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 12), metal);
  can.position.set(0.08, -0.36, -0.06);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 0.18, 7), metal);
  spout.rotation.z = Math.PI / 2.3;
  spout.position.set(0.18, -0.24, -0.06);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 10), metal);
  handle.position.set(-0.02, -0.32, -0.06);
  arm.add(can, spout, handle);
}


function animateHero(group: THREE.Group, ch: Character, now: number): void {
  const parts = group.userData.parts as Parts | undefined;
  if (!parts) return;
  const t = now / 1000;
  const walk = ch.anim === 'walk' && !ch.downed && !ch.sitting;
  const swing = (ch.cd.swing ?? 0) > now;
  parts.bob.position.y = ch.sitting ? -0.12 : walk ? Math.abs(Math.sin(t * 10)) * 0.07 : Math.sin(t * 2.2) * 0.02;
  parts.legL.rotation.x = ch.sitting ? -1.1 : walk ? Math.sin(t * 10) * 0.7 : 0;
  parts.legR.rotation.x = ch.sitting ? -1.1 : walk ? -Math.sin(t * 10) * 0.7 : 0;
  parts.armL.rotation.x = walk ? -Math.sin(t * 10) * 0.55 : Math.sin(t * 1.6) * 0.05;
  parts.armR.rotation.x = swing ? -1.6 : walk ? Math.sin(t * 10) * 0.55 : -Math.sin(t * 1.6) * 0.05;
  parts.head.rotation.z = walk ? Math.sin(t * 10) * 0.04 : 0;
  group.rotation.z = ch.downed ? 1.2 : 0;
  group.position.y = ch.downed ? -0.05 : group.position.y;
}

function makePlant(p: Plant, M: MatFn, icon: (k: string) => THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const sp = getSpecies(p.species);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M(0x8a5a32, 0.8));
  mound.scale.y = 0.35;
  mound.position.y = 0.04;
  g.add(mound);
  const stage = p.stage;
  const s = stage === 'seed' ? 0.35 : stage === 'sprout' ? 0.6 : stage === 'growing' ? 0.85 : 1;
  if (stage !== 'seed') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.35 * s, 6), M(0x3cbf4a));
    stem.position.y = 0.18 * s;
    g.add(stem);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 8, 6), M(sp.color2));
    leaf.scale.set(1.4, 0.45, 0.8);
    leaf.position.set(-0.1, 0.22 * s, 0);
    const leaf2 = leaf.clone();
    leaf2.position.x = 0.1;
    g.add(leaf, leaf2);
  }
  if (stage === 'mature' || stage === 'growing') {
    const top = matureTop(sp.form, sp.color, sp.color2, M, stage === 'mature' ? 1 : 0.65);
    top.position.y = 0.42 * s;
    g.add(top);
  } else {
    const seed = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), M(sp.color));
    seed.position.y = 0.1;
    g.add(seed);
  }
  if (p.needsHeal) g.rotation.z = 0.45;
  const flag = p.needsHeal ? 'hurt' : p.needsPrune ? 'cut' : p.needsWater ? 'water' : stage === 'mature' ? 'star' : '';
  if (flag) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon(flag), transparent: true, depthWrite: false }));
    spr.position.y = 0.95;
    spr.scale.set(0.28, 0.28, 1);
    g.add(spr);
  }
  return g;
}

function matureTop(form: string, color: number, color2: number, M: MatFn, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  if (form === 'carrot') {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 8), M(color, 0.45));
    c.rotation.x = Math.PI;
    c.position.y = -0.05;
    g.add(c);
  } else if (form === 'lettuce') {
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M(color));
    a.scale.y = 0.6;
    g.add(a);
  } else if (form === 'tomato') {
    for (const [x, z] of [[0, 0], [0.12, 0.06], [-0.1, 0.04]] as [number, number][]) {
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), M(color, 0.35));
      t.position.set(x, 0.05, z);
      g.add(t);
    }
  } else if (form === 'berry') {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 7), M(color));
    b.rotation.x = Math.PI;
    g.add(b);
  } else if (form === 'tulip' || form === 'rose') {
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), M(color, 0.4));
    cup.scale.y = form === 'tulip' ? 1.3 : 0.9;
    g.add(cup);
  } else if (form === 'sun') {
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), M(color2));
    g.add(center);
    for (let i = 0; i < 8; i++) {
      const pet = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), M(color));
      const a = (i / 8) * Math.PI * 2;
      pet.position.set(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16);
      g.add(pet);
    }
  } else if (form === 'lavender') {
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.18, 3, 6), M(color));
      spike.position.set((i - 1) * 0.08, 0.12, 0);
      g.add(spike);
    }
  } else if (form === 'mint') {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), M(color));
    leaf.scale.set(1.2, 0.4, 0.8);
    g.add(leaf);
  } else {
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), M(color2));
    g.add(center);
    for (let i = 0; i < 6; i++) {
      const pet = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), M(color));
      const a = (i / 6) * Math.PI * 2;
      pet.position.set(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
      g.add(pet);
    }
  }
  return g;
}

function makeMobMesh(kind: string, M: MatFn): THREE.Group {
  const g = new THREE.Group();
  g.add(shadowMesh(makeShadow()));
  const bodyColor = kind === 'slimak' ? 0xc8e88a : kind === 'wrona' ? 0x2a2e38 : kind === 'osa' ? 0xffd23a : kind === 'pszczola' ? 0xffe566 : kind === 'dzik' ? 0x8a5a48 : kind === 'szlam' || kind === 'szlam_maly' ? 0x7dff9a : 0x8a5a3c;
  const body = new THREE.Mesh(
    kind === 'dzik' ? new THREE.CapsuleGeometry(0.22, 0.35, 4, 8) : new THREE.SphereGeometry(kind === 'szlam_maly' ? 0.22 : 0.28, 14, 12),
    M(bodyColor, kind.startsWith('szlam') ? 0.25 : 0.5, kind.startsWith('szlam') ? 0x4ade80 : 0, kind.startsWith('szlam') ? 0.85 : 1),
  );
  body.position.y = kind === 'dzik' ? 0.32 : 0.32;
  if (kind === 'dzik') body.rotation.z = Math.PI / 2;
  g.add(body);
  if (kind === 'slimak') {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M(0xd08a4a, 0.4));
    shell.position.set(-0.05, 0.38, -0.08);
    g.add(shell);
  }
  if (kind === 'wrona') {
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), M(0xffc83d));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.32, 0.28);
    g.add(beak);
  }
  if (kind === 'osa' || kind === 'pszczola') {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    wing.position.set(0.12, 0.42, 0);
    wing.rotation.y = 0.4;
    g.add(wing);
  }
  if (kind === 'dzik') {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), M(0xfff6ea));
    tusk.position.set(0.12, 0.28, 0.28);
    g.add(tusk);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), M(0x221811));
  eye.position.set(0.08, 0.4, 0.18);
  const eye2 = eye.clone();
  eye2.position.x = -0.08;
  g.add(eye, eye2);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.06), new THREE.MeshBasicMaterial({ color: 0x7dff6a }));
  bar.name = 'hp';
  bar.position.y = 0.8;
  g.add(bar);
  return g;
}

function makeNpc(npc: NpcDef, M: MatFn): THREE.Group {
  const hat = npc.hat === 'bee' ? 'straw' : npc.hat === 'botanist' ? 'wreath' : npc.hat === 'elder' ? 'cap' : 'cap';
  return makeChibi({
    skin: npc.skin,
    hair: npc.hat === 'elder' ? 0xe7e2da : 0x4a2c1c,
    cloth: npc.cloth,
    pants: 0x6b4632,
    hat,
    tool: npc.hat === 'smith' ? 'hammer' : 'none',
    skirt: npc.hat === 'botanist',
    beard: npc.hat === 'elder',
    ring: 0xffe7a0,
  }, M);
}

function cellsOf(mapId: MapId, ch: string): { c: number; r: number }[] {
  const map = MAPS[mapId];
  const out: { c: number; r: number }[] = [];
  for (let r = 0; r < map.rows.length; r++) {
    for (let c = 0; c < map.cols; c++) if (map.rows[r][c] === ch) out.push({ c, r });
  }
  return out;
}

function avg(cells: { c: number; r: number }[]): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const cell of cells) {
    const p = tileCenter(MAPS.ogrod, cell.c, cell.r);
    x += p.x;
    z += p.z;
  }
  return { x: x / cells.length, z: z / cells.length };
}

function labelTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = fg;
  g.font = '700 42px Fredoka, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
