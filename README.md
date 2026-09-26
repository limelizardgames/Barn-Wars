# 🐄 Barn Wars

A 3D multiplayer barnyard brawler that runs in the browser. Pick an animal, then fight the rest of the farm.

Built with **Three.js** (client), **Node + Socket.IO** (authoritative server) and **Vite**. All art and sound are generated in code, so there are no asset files to download.

## Quick start

```bash
npm install
npm run dev        # server on :3000 + Vite client on http://localhost:5173
```

Production:

```bash
npm run build      # bundles the client into dist/
npm start          # serves dist/ and the game server on http://localhost:3000 (PORT to override)
```

Tests: `npm test`

Open the game in several tabs or on several machines to play together. Use the **Room** field (or `?room=name` in the URL) to make a private barn. If there are fewer than 8 fighters in a room, bots join to fill it.

## Controls

| Action | Key |
| --- | --- |
| Move | WASD / arrows |
| Aim / look | Mouse (click the game to lock the pointer) |
| Jump | Space (chickens can double jump) |
| Primary attack | Left mouse |
| Ability 1 | Right mouse or Q |
| Ability 2 | E (or Left Shift) |
| Scoreboard | Tab |
| Minimap zoom (local / whole farm) | N |
| Chat | Enter |
| Mute | M |
| Pause / release mouse | Esc |

## The roster

| Animal | Role | Power (passive) | LMB | RMB / Q | E |
| --- | --- | --- | --- | --- | --- |
| 🐄 **Cow** (Bessie the Bulwark) | Tank | *Thick Hide*: takes 20% less damage | Headbutt | Stampede (trampling charge) | Fresh Milk (heal + shield) |
| 🐔 **Chicken** (Cluck Norris) | Skirmisher | *Wings (Technically)*: double jump | Egg Toss (rapid fire) | Egg Bomb (explosive lob) | Flutter (leap + glide) |
| 🐖 **Pig** (Hamm-er) | Brawler | *Mud Bath*: regenerates out of combat, faster in mud | Mud Ball (slows) | Belly Flop (leap + area slam) | Truffle Snack (heal) |
| 🐑 **Sheep** (Baa-rbara) | Controller | *Fluffy*: half knockback taken | Wool Burst (short-range spread) | Baa-rage (cone stun) | Wool Fortress (−60% damage) |
| 🐐 **Goat** (Billy the Kid) | Acrobat | *Iron Stomach*: 25% lifesteal | Horn Ram | Mountain Leap (long leap + slam) | Tin Can Toss |
| 🐎 **Horse** (Neigh-poleon) | Striker | *Kick Back*: +50% knockback dealt | Hoof Stomp | Gallop (+70% speed) | Horseshoe Hurl (sniper) |

The farm is 150×150 m. The barn, silo and hay forts are in the middle; a farmhouse, windmill, duck pond (wading slows you), a corn field you can hide in, an orchard, a tool shed and stone walls sit around the edge. A heading-up minimap in the bottom-right shows everyone.

A match lasts 5 minutes or until someone reaches 20 knockouts. After a short intermission the next match starts.

## Project layout

```
shared/            code used by both server and client
  animals.js       the roster: stats, powers and moves (all balance lives here)
  arena.js         barnyard layout: obstacles, mud pits, spawn points
  physics.js       deterministic movement and collision (used for client prediction)
  constants.js     tick rates, match rules, input bitmask
server/
  index.js         Express + Socket.IO entry, room management
  Room.js          authoritative 30 Hz simulation, match flow, snapshots
  combat.js        move execution, projectiles, damage, knockback, status effects
  bot.js           AI fighters that fill empty slots
client/
  index.html       menu + HUD markup
  src/main.js      menu → game bootstrap
  src/assets/      procedural models + painted canvas textures (animals, farm, projectiles)
  src/game/        renderer, prediction/interpolation, input, effects, synth audio
  src/ui/          menu (with 3D preview), HUD and minimap
test/              node:test suites for the server simulation
```

### Networking model

- The server is authoritative and simulates at 30 Hz, broadcasting snapshots at 20 Hz.
- Clients send one input frame per tick. They predict their own movement with the same `shared/physics.js` code, then reconcile against the server by replaying inputs it has not yet acknowledged.
- Other fighters are rendered about 110 ms in the past and interpolated between snapshots.

### Adding a new animal

1. Add an entry to `shared/animals.js`. Moves reuse the existing types: `melee`, `projectile`, `dash`, `leap`, `shout`, `buff`.
2. Add a model builder in `client/src/assets/animals.js`, plus an emoji and a call sound in `client/src/game/audio.js`.
3. Add bot names in `server/bot.js`.
