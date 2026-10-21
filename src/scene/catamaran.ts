import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Boat } from '../sim/model';

/**
 * Leopard 45 from public/models/catamaran.glb.
 *
 * The Blender export leaves the hull mesh in metres, then puts a uniform
 * scale of about 4 and a scene offset on the node. Dropping that scale keeps
 * the published 13.72 m length. The node rotation already turns the mast up;
 * the bow (the narrow sprit) is yawed onto +X so it matches the other hulls.
 * The keel tip is then set to the published draught, which puts the boot
 * stripe on the waterline.
 */

const MODEL_URL = '/models/catamaran.glb';

export type CatamaranFit = {
  bowX: number;
  sternX: number;
  keepGeometry: boolean;
};

let templatePromise: Promise<THREE.Group> | null = null;

export function loadCatamaran(boat: Boat): Promise<THREE.Group> {
  templatePromise ??= buildTemplate(boat.draught);
  return templatePromise.then((template) => {
    const clone = template.clone(true);
    clone.userData.keepGeometry = true;
    clone.userData.bowX = template.userData.bowX;
    clone.userData.sternX = template.userData.sternX;
    return clone;
  });
}

async function buildTemplate(draught: number): Promise<THREE.Group> {
  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(MODEL_URL);
  draco.dispose();

  const source = largestRoot(gltf.scene);
  source.position.set(0, 0, 0);
  source.scale.set(1, 1, 1);
  source.updateMatrixWorld(true);
  tuneMaterials(source);

  const upright = new THREE.Group();
  upright.add(source);
  if (hullAboveMast(upright)) upright.rotation.x = Math.PI;
  upright.updateMatrixWorld(true);

  // Yaw and the waterline shift live on a child. The view overwrites the
  // root's rotation and height every frame with pitch, roll and heave.
  const fit = new THREE.Group();
  fit.add(upright);
  fit.rotation.y = bowYaw(upright);

  const root = new THREE.Group();
  root.name = 'leopard-45';
  root.add(fit);
  seatOnWaterline(fit, root, draught);
  return root;
}

function largestRoot(scene: THREE.Object3D): THREE.Object3D {
  let best: THREE.Object3D | null = null;
  let bestCount = 0;
  for (const child of scene.children) {
    let count = 0;
    child.traverse((obj: THREE.Object3D) => {
      const attr = (obj as THREE.Mesh).geometry?.getAttribute?.('position');
      if (attr) count += attr.count;
    });
    if (count > bestCount) {
      best = child;
      bestCount = count;
    }
  }
  if (!best) throw new Error('Catamaran model has no mesh');
  return best;
}

/** Decal textures are hard cutouts. Cut them out so the two hulls occlude. */
function tuneMaterials(root: THREE.Object3D) {
  root.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const entry of list) {
      const mat = entry as THREE.MeshStandardMaterial;
      if (!mat || !('opacity' in mat)) continue;
      mat.side = THREE.DoubleSide;
      const decal = !!mat.map && mat.transparent && mat.opacity > 0.9;
      if (!decal) continue;
      mat.alphaTest = 0.4;
      mat.transparent = false;
      mat.depthWrite = true;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
      mat.polygonOffsetUnits = -2;
    }
  });
}

function samplePoints(root: THREE.Object3D, budget = 8000): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  let total = 0;
  root.traverse((obj: THREE.Object3D) => {
    const attr = (obj as THREE.Mesh).geometry?.getAttribute?.('position');
    if (attr) total += attr.count;
  });
  const stride = Math.max(1, Math.floor(total / budget));
  const points: THREE.Vector3[] = [];
  root.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    const attr = mesh.geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
    if (!attr) return;
    for (let i = 0; i < attr.count; i += stride) {
      points.push(mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(attr, i)));
    }
  });
  return points;
}

/** Most vertices are hull, not mast. If they sit in the upper half, the rig hangs down. */
function hullAboveMast(root: THREE.Object3D): boolean {
  const points = samplePoints(root);
  const box = new THREE.Box3().setFromPoints(points);
  let sum = 0;
  for (const point of points) sum += point.y;
  const centroid = sum / points.length;
  return centroid > (box.min.y + box.max.y) / 2;
}

/**
 * Yaw onto the hull's long axis, then spin 180° if that leaves the sprit astern.
 * The export's node rotation is a few degrees off a cardinal axis, so an
 * axis-aligned bounding box would leave the boat crabbed.
 */
function bowYaw(root: THREE.Object3D): number {
  const points = samplePoints(root, 10000);
  const heights = points.map((point) => point.y).sort((a, b) => a - b);
  const cut = heights[Math.floor(heights.length * 0.72)];
  const hull = points.filter((point) => point.y <= cut);
  let meanX = 0;
  let meanZ = 0;
  for (const point of hull) {
    meanX += point.x;
    meanZ += point.z;
  }
  meanX /= hull.length;
  meanZ /= hull.length;
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const point of hull) {
    const x = point.x - meanX;
    const z = point.z - meanZ;
    xx += x * x;
    zz += z * z;
    xz += x * z;
  }
  let yaw = 0.5 * Math.atan2(2 * xz, xx - zz);
  const turned = hull.map((point) => rotateY(point, yaw));
  let minX = Infinity;
  let maxX = -Infinity;
  for (const point of turned) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
  }
  const cap = (maxX - minX) * 0.12;
  const aft = turned.filter((point) => point.x <= minX + cap);
  const fore = turned.filter((point) => point.x >= maxX - cap);
  if (width(aft, 'z') < width(fore, 'z')) yaw += Math.PI;
  return yaw;
}

function rotateY(point: THREE.Vector3, yaw: number): THREE.Vector3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new THREE.Vector3(point.x * c + point.z * s, point.y, -point.x * s + point.z * c);
}

function width(points: THREE.Vector3[], axis: 'x' | 'z'): number {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    min = Math.min(min, point[axis]);
    max = Math.max(max, point[axis]);
  }
  return max - min;
}

function seatOnWaterline(fit: THREE.Group, root: THREE.Group, draught: number) {
  fit.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  fit.position.set(-center.x, -draught - box.min.y, -center.z);
  root.updateMatrixWorld(true);
  const seated = new THREE.Box3().setFromObject(root);
  root.userData.bowX = seated.max.x;
  root.userData.sternX = seated.min.x;
  root.userData.keepGeometry = true;
}
