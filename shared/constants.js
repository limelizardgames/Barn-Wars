// Global tuning shared by client and server.

export const TICK_RATE = 30; // server simulation steps per second
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 20; // state broadcasts per second
export const INTERP_DELAY_MS = 110; // how far behind the server remote entities are rendered

export const GRAVITY = -32;
export const GROUND_FRICTION = 10; // how quickly knockback velocity decays on the ground
export const AIR_FRICTION = 1.5;
export const STEP_HEIGHT = 0.45; // obstacles lower than this can be walked onto

export const MAX_PLAYERS_PER_ROOM = 12;
export const MIN_FIGHTERS = 6; // bots fill rooms up to this many fighters
export const RESPAWN_TIME = 4; // seconds
export const SPAWN_PROTECTION = 1.5; // seconds of invulnerability after spawning

export const MATCH_DURATION = 300; // seconds
export const SCORE_LIMIT = 20; // kills to win a match
export const INTERMISSION = 10; // seconds between matches

export const KILL_Y = -20; // falling below this is a knockout

// Input button bitmask
export const BTN = {
  JUMP: 1,
  PRIMARY: 2,
  ABILITY1: 4,
  ABILITY2: 8,
};

export const DEFAULT_ROOM = 'farm';
export const NAME_MAX = 16;
