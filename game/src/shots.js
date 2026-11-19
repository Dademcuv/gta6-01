// Screenshot scenes behind ?shot=start|play|chase|mission. Each scene plays the
// real rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot, so every frame is what the game really looks like and the same
// seed always gives the same frame.
import { STEP, PLACES, PITCH, ROAD } from './config.js';
import { angleDiff, dist } from './random.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createMissionRuntime } from './missions.js';
import { EVENT_BUSTED, EVENT_WASTED } from './world.js';

const SAMPLE = STEP;

function fakeInput() {
  const heldSet = new Set();
  return {
    set(actions) {
      heldSet.clear();
      for (const a of actions) heldSet.add(a);
    },
    held(action) {
      return heldSet.has(action);
    },
    pressed() {
      return false;
    },
    endFrame() {},
  };
}

// Steer a car along the roads: off-road, head for the nearest road centre line;
// on-road, keep going along the road it is on. Never aims through buildings.
function nearestRoadCoord(value) {
  return Math.round(value / PITCH) * PITCH;
}

function autoDrive(world, input) {
  const car = world.playerCar();
  if (!car) {
    input.set([]);
    return;
  }
  const onV = nearestRoadCoord(car.x);
  const onH = nearestRoadCoord(car.y);
  const dv = Math.abs(car.x - onV);
  const dh = Math.abs(car.y - onH);
  let tx;
  let ty;
  if (Math.min(dv, dh) > ROAD / 2 - 6) {
    // Off-road: head for the nearest road centre line.
    if (dv < dh) {
      tx = onV;
      ty = car.y;
    } else {
      tx = car.x;
      ty = onH;
    }
  } else if (Math.abs(Math.cos(car.angle)) > Math.abs(Math.sin(car.angle))) {
    // Travelling along a horizontal road: stay on its centre line.
    tx = car.x + Math.cos(car.angle) * 300;
    ty = onH;
  } else {
    // Travelling along a vertical road.
    tx = onV;
    ty = car.y + Math.sin(car.angle) * 300;
  }
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, desired);
  const actions = ['up'];
  if (diff > 0.1) actions.push('left');
  else if (diff < -0.1) actions.push('right');
  input.set(actions);
}

function autoWalkToward(world, input, tx, ty) {
  const p = world.state.player;
  const d = dist(p.x, p.y, tx, ty);
  if (d < 30) {
    input.set([]);
    return;
  }
  const a = Math.atan2(ty - p.y, tx - p.x);
  const actions = [];
  if (Math.abs(Math.sin(a)) > 0.4) actions.push(Math.sin(a) > 0 ? 'down' : 'up');
  if (Math.abs(Math.cos(a)) > 0.4) actions.push(Math.cos(a) > 0 ? 'right' : 'left');
  input.set(actions);
}

export function stageShot(name, world, audio) {
  const input = fakeInput();
  const state = world.state;
  world.reset();
  const ui = { menuItems: [], selected: 0, prompt: '', muted: false };

  if (name === 'play') {
    // Get in the parked car by the garage, pull onto the road and drive.
    world.enterNearestCar(null);
    const car = world.playerCar();
    car.x = 1 * PITCH;
    car.y = 1 * PITCH;
    car.angle = Math.PI / 2;
    car.speed = 0;
    for (let i = 0; i < 5 / SAMPLE; i += 1) {
      autoDrive(world, input);
      world.step(SAMPLE, input, audio);
      if (state.events.includes(EVENT_BUSTED) || state.events.includes(EVENT_WASTED)) break;
    }
    return { screen: SCREEN_PLAY, ui };
  }
  if (name === 'chase') {
    world.enterNearestCar(null);
    const car = world.playerCar();
    car.x = 2 * PITCH;
    car.y = 4 * PITCH;
    car.angle = Math.PI / 2;
    car.speed = 200;
    world.addWanted(3);
    for (let i = 0; i < 4 / SAMPLE; i += 1) {
      autoDrive(world, input);
      world.step(SAMPLE, input, audio);
      if (state.events.includes(EVENT_BUSTED) || state.events.includes(EVENT_WASTED)) break;
    }
    return { screen: SCREEN_PLAY, ui };
  }
  if (name === 'mission') {
    createMissionRuntime(world, 0);
    state.player.x = PLACES.docks.x - 180;
    state.player.y = PLACES.docks.y;
    for (let i = 0; i < 6 / SAMPLE; i += 1) {
      autoWalkToward(world, input, PLACES.docks.x, PLACES.docks.y);
      world.step(SAMPLE, input, audio);
      if (state.events.includes(EVENT_BUSTED) || state.events.includes(EVENT_WASTED)) break;
    }
    return { screen: SCREEN_PLAY, ui };
  }
  // start (default): a fresh city, a few idle seconds, title screen.
  for (let i = 0; i < 4 / SAMPLE; i += 1) {
    world.step(SAMPLE, input, audio);
  }
  return {
    screen: SCREEN_TITLE,
    ui: {
      menuItems: [
        { label: '▶  New Game', action: 'new' },
        { label: 'How to Play', action: 'help' },
      ],
      selected: 0,
      prompt: '',
      muted: false,
    },
  };
}
