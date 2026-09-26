// The barnyard battlefield. Everything here is data so the server can collide
// against it and the client can build matching 3D props from it.
//
// Obstacles are axis-aligned boxes: centre (x, z), size (w along x, d along z),
// height h, and optional base height y (for stacked props).

export const ARENA_HALF = 75; // the fence line sits at ±ARENA_HALF on x and z

const obstacles = [];
let nextId = 0;
function box(kind, x, z, w, d, h, y = 0, extra = {}) {
  obstacles.push({ id: nextId++, kind, x, z, w, d, h, y, ...extra });
}

// Big landmarks
box('barn', 0, -34, 18, 13, 9);
box('silo', -15, -36, 5.5, 5.5, 15);
box('coop', 32, 28, 6, 4.5, 2.8);
box('tractor', 30, -16, 3.6, 5.6, 2.6);
box('trough', 14, 8, 4.5, 1.6, 0.9);
box('trough', -20, 18, 1.6, 4.5, 0.9);
box('well', -30, -8, 3, 3, 1.6);

// Hay bales — low enough to hop onto, stacked into little forts
const hay = [
  [-8, 4], [-5.4, 4], [-8, 6.6],
  [8, -8], [8, -10.6], [10.6, -8],
  [-24, -22], [-21.4, -22],
  [22, 20], [22, 17.4],
  [-36, 30], [-33.4, 30], [-36, 32.6],
  [40, -2], [40, 0.6],
  [0, 26], [2.6, 26], [-2.6, 26],
];
for (const [x, z] of hay) box('hay', x, z, 2.5, 2.5, 1.3);
// second layer
box('hay', -6.7, 4, 2.5, 2.5, 1.3, 1.3);
box('hay', 8, -9.3, 2.5, 2.5, 1.3, 1.3);
box('hay', -34.7, 30, 2.5, 2.5, 1.3, 1.3);
box('hay', 1.3, 26, 2.5, 2.5, 1.3, 1.3);
box('hay', 1.3, 26, 2.5, 2.5, 1.3, 2.6); // lookout on top

// Crates
const crates = [[18, -26], [19.6, -26], [18.8, -26, 1.5], [-40, -10], [-40, -8.4], [34, 10]];
for (const [x, z, y = 0] of crates) box('crate', x, z, 1.5, 1.5, 1.5, y);

// Inner fence runs (cover)
box('fence', -18, 0, 0.3, 10, 1.2);
box('fence', 18, 36, 12, 0.3, 1.2);
box('fence', -12, 40, 10, 0.3, 1.2);
box('fence', 44, -30, 0.3, 12, 1.2);

// Trees: collide with the trunk only
const trees = [[-44, -44], [-46, 12], [46, 44], [-10, 46], [44, 16], [26, -42], [-38, 44]];
for (const [x, z] of trees) box('tree', x, z, 1.2, 1.2, 7);

// ---- outer farm (added when the map grew) ------------------------------------
box('house', -58, -55, 12, 9, 6);
box('windmill', -64, -12, 5, 5, 14);
box('shed', 60, 12, 7, 5, 3.5);

// more hay forts
for (const [x, z] of [[58, 58], [60.6, 58], [58, 60.6], [-8, 64], [-5.4, 64], [18, -64], [20.6, -64], [18, -61.4]]) {
  box('hay', x, z, 2.5, 2.5, 1.3);
}
box('hay', 59.3, 58, 2.5, 2.5, 1.3, 1.3);
box('hay', -6.7, 64, 2.5, 2.5, 1.3, 1.3);
box('hay', 18, -62.7, 2.5, 2.5, 1.3, 1.3);

// low dry-stone walls (hop over them)
box('wall', 0, 56, 14, 0.8, 1);
box('wall', 66, -22, 0.8, 14, 1);
box('wall', -66, 26, 0.8, 12, 1);
box('wall', 30, 66, 10, 0.8, 1);

// boulders
box('rock', 30, 58, 3, 3, 1.8);
box('rock', -25, 62, 2.5, 2.5, 1.4);
box('rock', 64, -38, 2.8, 2.6, 1.6);
box('rock', -44, -66, 3, 3, 2);
box('rock', 8, -68, 2.4, 2.4, 1.3);

// orchard + stragglers
for (const [x, z] of [[40, 48], [48, 48], [40, 56], [48, 56], [68, 68], [-68, -30], [-20, -66], [70, 40], [-70, 68]]) {
  box('tree', x, z, 1.2, 1.2, 7);
}

export const OBSTACLES = obstacles;

// Ponds: wading through water slows everyone down.
export const PONDS = [
  { x: 52, z: -52, r: 10 },
];

// Corn fields are visual cover only: you can walk (and hide) in them.
export const CORN_FIELDS = [
  { x: -54, z: 49, w: 24, d: 22 },
];

// Mud pits: slow most animals, but pigs love them.
export const MUD_PITS = [
  { x: -14, z: 14, r: 5 },
  { x: 16, z: -2, r: 4 },
  { x: -30, z: -30, r: 4.5 },
  { x: 30, z: 42, r: 4 },
];

export const SPAWN_POINTS = [
  [0, 10], [20, 30], [-20, 30], [40, 10], [-40, 0], [35, -35],
  [-35, -20], [10, -18], [-10, -12], [45, 40], [-45, 40], [0, 45],
  [25, -5], [-28, 8], [10, 40], [-5, -48],
  [60, 0], [-58, 0], [0, 68], [0, -62], [62, 68], [-66, -68], [68, -66], [-64, 66],
  [45, -10], [-50, 25], [35, 58], [-30, -58],
];
