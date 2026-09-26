// One-off asset pipeline: converts the FBX animal models in a source folder into
// compact GLB files in client/public/models/.
//
//   npm i --no-save sharp
//   node tools/convert-models.mjs "<folder containing the unzipped model folders>"
//
// For each model it bakes the mesh into its rest pose, welds duplicate vertices,
// centres it on the ground, drops the source rig (the game builds its own, see
// client/src/assets/rig.js) and shrinks the colour texture to 1024px.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import sharp from 'sharp';

// FBXLoader touches the DOM for textures; we read those ourselves.
globalThis.self = globalThis;
const fakeImg = () => ({ addEventListener() {}, removeEventListener() {}, style: {} });
globalThis.document = { createElementNS: fakeImg, createElement: fakeImg };

// Which source folder becomes which fighter.
const MATCH = [
  [/cow/i, 'cow'], [/chicken/i, 'chicken'], [/pig/i, 'pig'],
  [/sheep/i, 'sheep'], [/goat/i, 'goat'], [/horse/i, 'horse'],
];

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/convert-models.mjs <source folder>');
  process.exit(1);
}
const outDir = path.resolve('client/public/models');
fs.mkdirSync(outDir, { recursive: true });

const manager = new THREE.LoadingManager();
manager.setURLModifier(() => 'data:,');
const loader = new FBXLoader(manager);

function findFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name === '__MACOSX') continue;
    if (e.isDirectory()) out.push(...findFiles(p));
    else out.push(p);
  }
  return out;
}

const files = findFiles(src);
for (const fbx of files.filter((f) => f.toLowerCase().endsWith('.fbx'))) {
  const match = MATCH.find(([re]) => re.test(fbx));
  if (!match) continue;
  const id = match[1];
  const buf = fs.readFileSync(fbx);
  const root = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  root.updateMatrixWorld(true);

  const geos = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) if (o.geometry.attributes[k]) g.setAttribute(k, o.geometry.attributes[k].clone());
    g.applyMatrix4(o.matrixWorld);
    geos.push(g);
  });
  let geo = geos[0];
  // FBX textures are sampled with flipY; glTF's are not
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  geo = mergeVertices(geo, 1e-5);
  geo = dropFloaters(geo);

  // sit on the ground, centred
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.computeBoundingBox();

  // texture: the base-colour jpg that ships next to the fbx
  const texPath = files.find((f) => f.startsWith(fbx.replace(/\.fbx$/i, '.fbm')) && /\.(jpe?g|png)$/i.test(f));
  const jpg = await sharp(texPath).resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();

  const glb = writeGlb(geo, jpg, id);
  fs.writeFileSync(path.join(outDir, `${id}.glb`), glb);
  const s = geo.boundingBox.getSize(new THREE.Vector3());
  console.log(`${id}: ${geo.attributes.position.count} verts, ${geo.index.count / 3} tris, size ${s.toArray().map((v) => v.toFixed(3)).join(' x ')}, ${(glb.length / 1024).toFixed(0)} KB`);
}

// Remove small disconnected fragments floating outside the main body
// (AI-generated meshes sometimes include stray bits).
function dropFloaters(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  // weld by position only so UV seams don't split components
  const key = (i) => `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
  const rep = new Map();
  const node = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!rep.has(k)) rep.set(k, rep.size);
    node[i] = rep.get(k);
  }
  const parent = new Int32Array(rep.size).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(node[idx[t]]), b = find(node[idx[t + 1]]), c = find(node[idx[t + 2]]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const boxes = new Map();
  for (let i = 0; i < pos.count; i++) {
    const r = find(node[i]);
    let b = boxes.get(r);
    if (!b) boxes.set(r, (b = { n: 0, box: new THREE.Box3() }));
    b.n++;
    b.box.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  const main = [...boxes.values()].sort((a, b) => b.n - a.n)[0].box;
  const keep = new Set();
  for (const [r, b] of boxes) if (b.n > pos.count * 0.02 || main.containsPoint(b.box.getCenter(new THREE.Vector3()))) keep.add(r);
  if (keep.size === boxes.size) return geo;
  const newIdx = [];
  for (let t = 0; t < idx.length; t += 3) if (keep.has(find(node[idx[t]]))) newIdx.push(idx[t], idx[t + 1], idx[t + 2]);
  // compact unused vertices
  const remap = new Map();
  const out = new THREE.BufferGeometry();
  const attrs = Object.keys(geo.attributes);
  const data = Object.fromEntries(attrs.map((k) => [k, []]));
  const finalIdx = newIdx.map((i) => {
    if (!remap.has(i)) {
      remap.set(i, remap.size);
      for (const k of attrs) {
        const a = geo.attributes[k];
        for (let c = 0; c < a.itemSize; c++) data[k].push(a.array[i * a.itemSize + c]);
      }
    }
    return remap.get(i);
  });
  for (const k of attrs) out.setAttribute(k, new THREE.Float32BufferAttribute(data[k], geo.attributes[k].itemSize));
  out.setIndex(finalIdx);
  console.log(`  removed ${boxes.size - keep.size} floating fragment(s)`);
  return out;
}

// Minimal glTF 2.0 binary writer: one mesh, one textured material.
function writeGlb(geo, jpg, name) {
  const chunks = [];
  let offset = 0;
  const views = [];
  const accessors = [];
  const pad4 = (n) => (n + 3) & ~3;
  function addView(bytes, target) {
    const start = offset;
    chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    const padded = pad4(bytes.byteLength);
    if (padded > bytes.byteLength) chunks.push(Buffer.alloc(padded - bytes.byteLength));
    offset += padded;
    views.push({ buffer: 0, byteOffset: start, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    return views.length - 1;
  }
  function addAccessor(attr, type, target, withBounds = false) {
    const arr = attr.array instanceof Float32Array ? attr.array : new Float32Array(attr.array);
    const view = addView(arr, target);
    const acc = { bufferView: view, componentType: 5126, count: attr.count, type };
    if (withBounds) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < attr.count; i++) for (let k = 0; k < 3; k++) {
        const v = arr[i * 3 + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
      acc.min = min;
      acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  }
  const attributes = {
    POSITION: addAccessor(geo.attributes.position, 'VEC3', 34962, true),
    NORMAL: addAccessor(geo.attributes.normal, 'VEC3', 34962),
  };
  if (geo.attributes.uv) attributes.TEXCOORD_0 = addAccessor(geo.attributes.uv, 'VEC2', 34962);
  const idx = geo.index.array;
  const small = geo.attributes.position.count < 65536;
  const indexArr = small ? Uint16Array.from(idx) : Uint32Array.from(idx);
  const iv = addView(indexArr, 34963);
  accessors.push({ bufferView: iv, componentType: small ? 5123 : 5125, count: indexArr.length, type: 'SCALAR' });
  const indices = accessors.length - 1;
  const imgView = addView(new Uint8Array(jpg));

  const json = {
    asset: { version: '2.0', generator: 'barn-wars convert-models' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives: [{ attributes, indices, material: 0 }] }],
    materials: [{ name: `${name}-skin`, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8 } }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: imgView, mimeType: 'image/jpeg' }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json));
  if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);
  const bin = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBuf.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonBuf, bh, bin]);
}
