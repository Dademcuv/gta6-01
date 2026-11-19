// Bayline — configuration and constants for the open-world crime game.
// All names, places and story are original fiction; nothing here comes from any
// existing game. The city is a 10x10 grid of blocks separated by roads.
export const STEP = 1 / 60;
export const SAVE_KEY = 'bayline-save-v1';

// City geometry (world units, pixels at zoom 1).
export const BLOCK = 220;
export const ROAD = 48;
export const PITCH = BLOCK + ROAD; // distance between road centre lines
export const GRID = 10; // blocks per side; roads run 0..GRID
export const WORLD = GRID * PITCH + ROAD; // 2728

// Player on foot.
export const PLAYER_RADIUS = 12;
export const PLAYER_SPEED = 175;
export const PLAYER_HP = 100;
export const PUNCH_RANGE = 46;
export const PUNCH_DAMAGE = 25;
export const PUNCH_COOLDOWN = 0.38;
export const SHOT_RANGE = 420;
export const SHOT_DAMAGE = 40;

// Cars.
export const CAR_LENGTH = 46;
export const CAR_WIDTH = 22;
export const CAR_MAX_SPEED = 430;
export const CAR_ACCEL = 320;
export const CAR_BRAKE = 520;
export const CAR_REVERSE_MAX = 150;
export const CAR_TURN = 2.6; // radians per second at full lock
export const CAR_HP = 100;

// Wanted level.
export const MAX_WANTED = 5;
export const WANTED_DECAY_SECONDS = 14;

// Traffic and pedestrians.
export const TRAFFIC_CARS = 14;
export const PEDESTRIANS = 26;

// Colours.
export const COLORS = {
  asphalt: '#2b2f36',
  asphaltEdge: '#23262c',
  sidewalk: '#3a3f47',
  laneDash: '#c9a227',
  building: ['#7a5c8e', '#4e7a6b', '#8e6b4e', '#5b6f8e', '#8e4e5b', '#6b8e4e', '#5c5c7a', '#8e7a4e'],
  park: '#3d6b35',
  parkPath: '#8a7a52',
  sand: '#c2a878',
  water: '#2e5f7a',
  roofEdge: '#22242a',
};

export const CAR_COLORS = ['#d94f3d', '#3d7ad9', '#e0b13c', '#7ad93d', '#d9d9d9', '#8e3dd9', '#3dd9c4', '#d93d7a'];

// Named places in Bayline City (world coordinates are road-centre based).
// Each entry: { name, x, y }.
export const PLACES = {
  garage: { name: "Jax's Garage", x: 1 * PITCH + 60, y: 1 * PITCH + 60 },
  docks: { name: 'Port Luna Docks', x: 1 * PITCH + 40, y: 9 * PITCH + 30 },
  hotel: { name: 'Grand Bay Hotel', x: 7 * PITCH + 40, y: 2 * PITCH + 40 },
  marina: { name: 'Marina Lot', x: 8 * PITCH + 40, y: 8 * PITCH + 40 },
  office: { name: "Sal's Office", x: 5 * PITCH + 40, y: 5 * PITCH + 40 },
  hospital: { name: 'City Hospital', x: 2 * PITCH + 40, y: 7 * PITCH + 40 },
  police: { name: 'Bayline PD HQ', x: 4 * PITCH + 40, y: 3 * PITCH + 40 },
  northGate: { name: 'North Gate', x: 5 * PITCH, y: 0 * PITCH },
};

// Mission rewards in dollars.
export const MISSION_COUNT = 5;
