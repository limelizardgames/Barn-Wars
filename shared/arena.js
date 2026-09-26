// The barnyard battlefield. Everything here is data so the server can collide
// against it and the client can build matching 3D props from it.
//
// Obstacles are axis-aligned boxes: centre (x, z), size (w along x, d along z),
// height h, and optional base height y (for stacked props).

export const ARENA_HALF = 55; // the fence line sits at ±ARENA_HALF on x and z

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

export const OBSTACLES = obstacles;

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
];
