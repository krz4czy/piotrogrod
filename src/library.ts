import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { PlantStage } from './types.ts';

const BASE = import.meta.env.BASE_URL;

const FILES: Record<string, string> = {
  tree_default: 'models/nature/tree_default.glb',
  tree_oak: 'models/nature/tree_oak.glb',
  tree_pine: 'models/nature/tree_pineRoundA.glb',
  bush: 'models/nature/plant_bush.glb',
  bush_large: 'models/nature/plant_bushLarge.glb',
  grass: 'models/nature/grass.glb',
  grass_large: 'models/nature/grass_large.glb',
  flower_red: 'models/nature/flower_redA.glb',
  flower_yellow: 'models/nature/flower_yellowA.glb',
  flower_purple: 'models/nature/flower_purpleA.glb',
  carrot: 'models/nature/crop_carrot.glb',
  pumpkin: 'models/nature/crop_pumpkin.glb',
  melon: 'models/nature/crop_melon.glb',
  wheat_a: 'models/nature/crops_wheatStageA.glb',
  wheat_b: 'models/nature/crops_wheatStageB.glb',
  fence: 'models/nature/fence_simple.glb',
  rock: 'models/nature/rock_smallA.glb',
  stone: 'models/nature/stone_largeA.glb',
  mushroom: 'models/nature/mushroom_red.glb',
  mushroom_tan: 'models/nature/mushroom_tan.glb',
  stump: 'models/nature/stump_round.glb',
  lily: 'models/nature/lily_small.glb',
};

type Entry = { scene: THREE.Group; clips: THREE.AnimationClip[] };

const cache = new Map<string, Entry>();
let pending: Promise<void> | null = null;

export function preloadLibrary(): Promise<void> {
  if (pending) return pending;
  const loader = new GLTFLoader();
  pending = Promise.all(
    Object.entries(FILES).map(async ([id, rel]) => {
      try {
        const gltf = await loader.loadAsync(BASE + rel);
        gltf.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) warmNature(mat);
        });
        cache.set(id, { scene: gltf.scene, clips: gltf.animations });
      } catch (err) {
        console.warn('model', id, err);
      }
    }),
  ).then(() => undefined);
  return pending;
}

export function libraryReady(): boolean {
  return cache.has('tree_default');
}

/** Kenney Nature Kit ships metallicFactor 1 and teal foliage. That reads as dark metal. */
function warmNature(mat: THREE.Material): void {
  const m = mat as THREE.MeshStandardMaterial;
  if (!m.color || !('metalness' in m)) return;
  m.metalness = 0;
  m.roughness = 0.82;
  m.side = THREE.DoubleSide;
  const name = (m.name || '').toLowerCase();
  const c = m.color;
  const teal = c.g > 0.45 && c.b > 0.4 && c.g > c.r * 1.35 && c.b > c.r * 0.9;
  if (teal) m.color.set(c.g < 0.72 ? 0x3f9a34 : 0x67d24c);
  else if (name.includes('wood') || name.includes('bark')) m.color.set(name.includes('dark') ? 0x7a442c : name.includes('inner') ? 0xf0d2a8 : 0xd4924a);
  else if (name.includes('dirt')) m.color.set(0xc47a45);
  else if (name.includes('stone')) m.color.set(0xd5c6b4);
  m.needsUpdate = true;
}

function prepare(root: THREE.Object3D, cast: boolean): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
  });
}

/** Static prop, feet on y=0, optional target height. */
export function cloneProp(id: string, height?: number, cast = true): THREE.Group | null {
  const src = cache.get(id);
  if (!src) return null;
  const inner = src.scene.clone(true);
  prepare(inner, cast);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const s = height ? height / Math.max(0.05, size.y) : 1;
  inner.scale.setScalar(s);
  inner.position.y = -box.min.y * s;
  const wrap = new THREE.Group();
  wrap.add(inner);
  return wrap;
}

const ONCE = new Set(['die', 'sit', 'pick-up', 'attack-melee-right', 'attack-kick-right', 'interact-right']);

export function makeActor(id: string, height: number, hat?: string, tool?: string): THREE.Group | null {
  const src = cache.get(id);
  if (!src) return null;
  const model = cloneSkinned(src.scene) as THREE.Group;
  prepare(model, true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = height / Math.max(0.05, size.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  const root = new THREE.Group();
  root.add(model);
  const head = findBone(model, 'head');
  const hand = findBone(model, 'arm-right');
  if (head && hat) head.add(hatMesh(hat));
  if (hand && tool) hand.add(toolMesh(tool));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.name = 'ring';
  root.add(ring);
  const mixer = new THREE.AnimationMixer(model);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const clip of src.clips) {
    const action = mixer.clipAction(clip);
    if (ONCE.has(clip.name)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions[clip.name] = action;
  }
  root.userData.mixer = mixer;
  root.userData.actions = actions;
  root.userData.clip = '';
  return root;
}

export function stepActor(root: THREE.Group, dt: number, clip: string): void {
  const mixer = root.userData.mixer as THREE.AnimationMixer | undefined;
  const actions = root.userData.actions as Record<string, THREE.AnimationAction> | undefined;
  if (!mixer || !actions) return;
  if (root.userData.clip !== clip) {
    const next = actions[clip] ?? actions.idle ?? actions.static;
    const prev = actions[root.userData.clip as string];
    if (next) {
      if (prev && prev !== next) prev.fadeOut(0.15);
      next.reset().fadeIn(0.15).play();
      root.userData.clip = clip;
    }
  }
  mixer.update(dt);
}

function findBone(root: THREE.Object3D, name: string): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((obj) => {
    if (obj.name === name && (obj as THREE.Bone).isBone) found = obj as THREE.Bone;
  });
  return found;
}

function std(color: number, rough = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
}

function hatMesh(hat: string): THREE.Object3D {
  const g = new THREE.Group();
  if (hat === 'wianek') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 12), std(0x3cbf4a));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    for (let i = 0; i < 5; i++) {
      const pet = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), std(i % 2 ? 0xff6b9a : 0xffd23a));
      const a = (i / 5) * Math.PI * 2;
      pet.position.set(Math.cos(a) * 0.11, 0.02, Math.sin(a) * 0.11);
      g.add(pet);
    }
    g.position.y = 0.12;
  } else if (hat === 'kaptur') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), std(0x5c4a86));
    hood.scale.set(1.05, 0.85, 1.05);
    hood.position.y = 0.06;
    g.add(hood);
  } else {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.025, 12), std(0xf2c14d));
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.08, 10), std(0xe6b13a));
    crown.position.y = 0.05;
    g.add(brim, crown);
    g.position.y = 0.14;
  }
  g.scale.setScalar(1.15);
  return g;
}

function toolMesh(tool: string): THREE.Object3D {
  const g = new THREE.Group();
  if (tool.startsWith('konewka')) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), std(tool.includes('miedz') ? 0xe08545 : 0x8d6a43, 0.45));
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.08, 6), std(0x6b5344));
    spout.rotation.z = Math.PI / 2.4;
    spout.position.set(0.05, 0.02, 0);
    g.add(can, spout);
  } else {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.42, 6), std(0xc4894a));
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.04), std(tool.includes('zelazo') ? 0xd5dbe6 : 0x8d939c, 0.35));
    blade.position.y = -0.2;
    g.add(stick, blade);
  }
  g.position.set(0, -0.02, 0.08);
  g.rotation.x = 0.4;
  return g;
}

const CROP: Record<string, { sprout: string; grow: string; mature: string; h: number }> = {
  carrot: { sprout: 'grass', grow: 'wheat_a', mature: 'carrot', h: 0.55 },
  lettuce: { sprout: 'grass', grow: 'bush', mature: 'grass_large', h: 0.48 },
  tomato: { sprout: 'wheat_a', grow: 'bush', mature: 'pumpkin', h: 0.55 },
  berry: { sprout: 'grass', grow: 'wheat_a', mature: 'melon', h: 0.42 },
  daisy: { sprout: 'grass', grow: 'wheat_a', mature: 'flower_yellow', h: 0.42 },
  tulip: { sprout: 'grass', grow: 'wheat_b', mature: 'flower_red', h: 0.48 },
  rose: { sprout: 'wheat_a', grow: 'bush', mature: 'flower_red', h: 0.5 },
  sun: { sprout: 'wheat_a', grow: 'wheat_b', mature: 'flower_yellow', h: 0.7 },
  lavender: { sprout: 'grass', grow: 'wheat_b', mature: 'flower_purple', h: 0.5 },
  mint: { sprout: 'grass', grow: 'bush', mature: 'grass_large', h: 0.4 },
};

export function makeCrop(form: string, stage: PlantStage, sick: boolean): THREE.Group | null {
  const spec = CROP[form] ?? CROP.daisy;
  const id = stage === 'mature' ? spec.mature : stage === 'growing' ? spec.grow : stage === 'sprout' ? spec.sprout : 'grass';
  const h = stage === 'mature' ? spec.h : stage === 'growing' ? spec.h * 0.72 : stage === 'sprout' ? 0.22 : 0.12;
  const g = cloneProp(id, h, false);
  if (!g) return null;
  if (sick) {
    g.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mat.color.multiplyScalar(0.45);
      mesh.material = mat;
    });
    g.rotation.z = 0.35;
  }
  return g;
}

export function npcModel(id: string): string {
  if (id === 'stanislaw') return 'stanislaw';
  if (id === 'henio') return 'henio';
  if (id === 'mira') return 'mira';
  if (id === 'lena') return 'lena';
  if (id === 'bogdan') return 'bogdan';
  return 'ogrodnik';
}

export function mobProp(kind: string): { id: string; height: number } | null {
  if (kind === 'szlam' || kind === 'szlam_maly') return { id: 'mushroom', height: kind === 'szlam_maly' ? 0.45 : 0.7 };
  if (kind === 'kret' || kind === 'kret_las') return { id: 'rock', height: 0.42 };
  if (kind === 'slimak') return { id: 'mushroom_tan', height: 0.38 };
  if (kind === 'dzik') return { id: 'stump', height: 0.55 };
  return null;
}
