import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/Room.js';
import { TICK_DT, BTN, MIN_FIGHTERS } from '../shared/constants.js';
import { ANIMAL_IDS, ANIMALS } from '../shared/animals.js';

function run(room, seconds) {
  const n = Math.round(seconds / TICK_DT);
  for (let i = 0; i < n; i++) room.tick(TICK_DT);
}

test('bots fill the room around a human and bots stay balanced', () => {
  const room = new Room('t', null);
  room.addPlayer('h1', { name: 'Tester', animal: 'pig' });
  assert.equal(room.players.size, MIN_FIGHTERS);
  room.addPlayer('h2', { name: 'Tester2', animal: 'cow' });
  assert.equal(room.players.size, MIN_FIGHTERS);
  room.removePlayer('h1');
  room.removePlayer('h2');
  assert.equal(room.players.size, 0);
});

test('bots fight each other and score kills', () => {
  const room = new Room('t', null);
  room.addPlayer('h1', { name: 'Idle', animal: 'cow' });
  run(room, 120);
  const kills = [...room.players.values()].reduce((s, p) => s + p.kills, 0);
  assert.ok(kills > 0, `expected some kills, got ${kills}`);
  for (const p of room.players.values()) {
    assert.ok(Number.isFinite(p.body.x) && Number.isFinite(p.body.y) && Number.isFinite(p.body.z));
  }
});

test('every move of every animal can be used without errors', () => {
  for (const id of ANIMAL_IDS) {
    const room = new Room('t', null, { withBots: false });
    const a = room.addPlayer('a', { name: 'A', animal: id });
    const b = room.addPlayer('b', { name: 'B', animal: 'cow' });
    a.spawnProtT = b.spawnProtT = 0;
    a.body.x = 0; a.body.z = 0; a.body.yaw = 0;
    b.body.x = 0; b.body.z = 2.5;
    let seq = 0;
    for (const btn of [BTN.PRIMARY, BTN.ABILITY1, BTN.ABILITY2]) {
      room.queueInput('a', { seq: ++seq, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: btn });
      room.queueInput('b', { seq, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0 });
      run(room, 2.5);
      for (let i = 0; i < 70; i++) {
        room.queueInput('a', { seq: ++seq, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0 });
        room.queueInput('b', { seq, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: 0 });
        room.tick(TICK_DT);
      }
    }
    const snap = room.snapshot();
    assert.equal(snap.players.length, 2);
  }
});

test('melee hits damage and knock back the target', () => {
  const room = new Room('t', null, { withBots: false });
  const a = room.addPlayer('a', { name: 'A', animal: 'goat' });
  const b = room.addPlayer('b', { name: 'B', animal: 'pig' });
  a.spawnProtT = b.spawnProtT = 0;
  a.body.x = 0; a.body.z = 0;
  b.body.x = 0; b.body.z = 2;
  room.queueInput('a', { seq: 1, mx: 0, mz: 0, yaw: 0, pitch: 0, buttons: BTN.PRIMARY });
  room.tick(TICK_DT);
  assert.equal(b.hp, ANIMALS.pig.stats.maxHp - ANIMALS.goat.primary.damage);
  assert.ok(b.body.vz > 0, 'target pushed away');
});
