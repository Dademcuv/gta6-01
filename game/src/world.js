// Bayline city simulation: the road grid, buildings, traffic, pedestrians,
// police, combat and the wanted system. All original fiction.
import {
  BLOCK, ROAD, PITCH, GRID, WORLD, PLAYER_RADIUS, PLAYER_SPEED, PLAYER_HP,
  PUNCH_RANGE, PUNCH_DAMAGE, PUNCH_COOLDOWN, SHOT_RANGE, SHOT_DAMAGE, CAR_LENGTH, CAR_WIDTH,
  CAR_MAX_SPEED, CAR_ACCEL, CAR_BRAKE, CAR_REVERSE_MAX, CAR_TURN, CAR_HP,
  MAX_WANTED, WANTED_DECAY_SECONDS, TRAFFIC_CARS, PEDESTRIANS, COLORS, CAR_COLORS,
  PLACES,
} from './config.js';
import { clamp, dist, angleTo, angleDiff } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_BUSTED = 1;
export const EVENT_WASTED = 2;
export const EVENT_CAR_DESTROYED = 4;
export const EVENT_PICKUP = 8;

function roadCenter(index) {
  return index * PITCH;
}

export function isOnRoad(x, y) {
  for (let i = 0; i <= GRID; i += 1) {
    if (Math.abs(x - roadCenter(i)) < ROAD / 2 + 2) return true;
    if (Math.abs(y - roadCenter(i)) < ROAD / 2 + 2) return true;
  }
  return false;
}

function buildCity(random) {
  const buildings = [];
  const parks = [];
  // Two parks, a sandy beach strip along the south edge, and the garage lot
  // (block 1,1) — an open paved lot where Jax keeps his cars. No buildings there.
  parks.push({ x: 3 * PITCH + ROAD / 2, y: 6 * PITCH + ROAD / 2, w: BLOCK, h: BLOCK });
  parks.push({ x: 7 * PITCH + ROAD / 2, y: 4 * PITCH + ROAD / 2, w: BLOCK, h: BLOCK });
  const lots = [{ x: 1 * PITCH + ROAD / 2, y: 1 * PITCH + ROAD / 2, w: BLOCK, h: BLOCK }];
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      const bx = i * PITCH + ROAD / 2;
      const by = j * PITCH + ROAD / 2;
      // Park blocks stay empty; the south strip (j == 9) is the beach; (1,1) is the garage lot.
      if ((i === 3 && j === 6) || (i === 7 && j === 4) || j === 9 || (i === 1 && j === 1)) continue;
      const color = random.pick(COLORS.building);
      if (random.chance(0.3)) {
        // Two smaller buildings in one block.
        buildings.push({ x: bx + 14, y: by + 14, w: BLOCK / 2 - 20, h: BLOCK - 28, color });
        buildings.push({ x: bx + BLOCK / 2 + 6, y: by + 14, w: BLOCK / 2 - 20, h: BLOCK - 28, color: random.pick(COLORS.building) });
      } else {
        buildings.push({ x: bx + 14, y: by + 14, w: BLOCK - 28, h: BLOCK - 28, color });
      }
    }
  }
  return { buildings, parks, lots };
}

function circleHitsBuilding(buildings, x, y, r) {
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

function moveWithCollision(buildings, ent, dx, dy, r) {
  const nx = ent.x + dx;
  const ny = ent.y + dy;
  if (nx < r || nx > WORLD - r || ny < r || ny > WORLD - r) return false;
  if (!circleHitsBuilding(buildings, nx, ny, r)) {
    ent.x = nx;
    ent.y = ny;
    return true;
  }
  if (!circleHitsBuilding(buildings, nx, ent.y, r)) {
    ent.x = nx;
    return true;
  }
  if (!circleHitsBuilding(buildings, ent.x, ny, r)) {
    ent.y = ny;
    return true;
  }
  return false;
}

let carId = 1;

function makeCar(x, y, angle, color, kind) {
  return {
    id: carId += 1,
    x, y, angle, speed: 0,
    color, kind, // 'civilian' | 'police' | 'target'
    hp: CAR_HP, maxHp: CAR_HP,
    driver: null, // 'traffic' | 'police' | 'player' | null (parked)
    axis: 'v', dir: 1, lane: 10,
    ramCooldown: 0, hitCooldown: 0, stuckTimer: 0,
  };
}

function randomRoadPoint(random) {
  const vertical = random.chance(0.5);
  const road = random.int(0, GRID);
  const along = random.range(ROAD, WORLD - ROAD);
  if (vertical) return { x: roadCenter(road), y: along, angle: random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
  return { x: along, y: roadCenter(road), angle: random.chance(0.5) ? 0 : Math.PI };
}

function spawnTrafficCar(state, random) {
  const p = randomRoadPoint(random);
  const car = makeCar(p.x, p.y, p.angle, random.pick(CAR_COLORS), 'civilian');
  car.driver = 'traffic';
  car.axis = Math.abs(Math.cos(p.angle)) > 0.5 ? 'h' : 'v';
  car.dir = (car.axis === 'h' ? Math.cos(p.angle) : Math.sin(p.angle)) > 0 ? 1 : -1;
  car.lane = random.chance(0.5) ? 11 : -11;
  car.speed = random.range(90, 150);
  state.cars.push(car);
  return car;
}

function spawnPed(state, random, kind, x, y) {
  const p = x === undefined ? randomRoadPoint(random) : { x, y, angle: 0 };
  const ped = {
    x: p.x, y: p.y, angle: random.range(0, Math.PI * 2),
    speed: kind === 'ped' ? random.range(40, 70) : random.range(150, 185),
    kind, // 'ped' | 'goon' | 'cop'
    hp: kind === 'goon' ? 60 : kind === 'cop' ? 80 : 20,
    axis: random.chance(0.5) ? 'v' : 'h',
    dir: random.chance(0.5) ? 1 : -1,
    lane: random.chance(0.5) ? ROAD / 2 + 8 : -(ROAD / 2 + 8),
    attackTimer: 0, fleeTimer: 0, bustTimer: 0, walkPhase: random.range(0, 6),
  };
  state.peds.push(ped);
  return ped;
}

function nearestCopDistance(state, x, y) {
  let best = Infinity;
  for (const car of state.cars) {
    if (car.driver !== 'police') continue;
    best = Math.min(best, dist(x, y, car.x, car.y));
  }
  for (const ped of state.peds) {
    if (ped.kind !== 'cop') continue;
    best = Math.min(best, dist(x, y, ped.x, ped.y));
  }
  return best;
}

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    time: 0,
    random,
    buildings: city.buildings,
    parks: city.parks,
    lots: city.lots,
    player: {
      x: PLACES.garage.x, y: PLACES.garage.y, angle: -Math.PI / 2,
      hp: PLAYER_HP, cash: 0, ammo: 24, inCar: null,
      punchTimer: 0, shootTimer: 0, walkPhase: 0, bustTimer: 0,
    },
    cars: [],
    peds: [],
    particles: [],
    pickups: [],
    wanted: 0,
    lastCrimeTime: -100,
    busted: false,
    wasted: false,
    storyComplete: false,
    mission: null, // set by missions.js: { index, stage, target, text }
    message: '',
    messageTimer: 0,
    events: [],
    stats: { carsStolen: 0, missionsDone: 0, arrests: 0 },
    camera: { x: PLACES.garage.x, y: PLACES.garage.y },
  };

  const world = {
    state,
    reset() {
      state.time = 0;
      state.cars = [];
      state.peds = [];
      state.particles = [];
      state.pickups = [
        { x: 2 * PITCH, y: PLACES.hospital.y, kind: 'health', active: true, timer: 0 },
        { x: PLACES.garage.x + 80, y: PLACES.garage.y, kind: 'ammo', active: true, timer: 0 },
        { x: PLACES.docks.x, y: PLACES.docks.y + 60, kind: 'ammo', active: true, timer: 0 },
        { x: 8 * PITCH, y: PLACES.marina.y, kind: 'health', active: true, timer: 0 },
      ];
      state.player.x = PLACES.garage.x;
      state.player.y = PLACES.garage.y;
      state.player.angle = -Math.PI / 2;
      state.player.hp = PLAYER_HP;
      state.player.cash = 0;
      state.player.ammo = 24;
      state.player.inCar = null;
      state.player.bustTimer = 0;
      state.wanted = 0;
      state.lastCrimeTime = -100;
      state.busted = false;
      state.wasted = false;
      state.storyComplete = false;
      state.mission = null;
      state.message = '';
      state.messageTimer = 0;
      state.stats = { carsStolen: 0, missionsDone: 0, arrests: 0 };
      for (let i = 0; i < TRAFFIC_CARS; i += 1) spawnTrafficCar(state, random);
      for (let i = 0; i < PEDESTRIANS; i += 1) spawnPed(state, random, 'ped');
      // A few parked cars near the garage so the player can drive right away.
      const parked1 = makeCar(PLACES.garage.x + 40, PLACES.garage.y + 60, 0, '#d94f3d', 'civilian');
      const parked2 = makeCar(PLACES.garage.x + 40, PLACES.garage.y + 110, Math.PI / 2, '#3d7ad9', 'civilian');
      state.cars.push(parked1, parked2);
    },

    showMessage(text) {
      state.message = text;
      state.messageTimer = 3.5;
    },

    addWanted(n) {
      if (n <= 0) return;
      state.wanted = Math.min(MAX_WANTED, state.wanted + n);
      state.lastCrimeTime = state.time;
    },

    addParticles(x, y, color, count, speed) {
      for (let i = 0; i < count; i += 1) {
        const a = random.range(0, Math.PI * 2);
        const s = random.range(speed * 0.3, speed);
        state.particles.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: random.range(0.3, 0.8), maxLife: 0.8, color, size: random.range(2, 5),
        });
      }
    },

    playerCar() {
      if (state.player.inCar === null) return null;
      return state.cars.find((c) => c.id === state.player.inCar) || null;
    },

    enterNearestCar(audio) {
      let best = null;
      let bestD = 95;
      for (const car of state.cars) {
        if (car.driver === 'traffic' || car.driver === 'police') continue;
        const d = dist(state.player.x, state.player.y, car.x, car.y);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      if (!best) return false;
      best.driver = 'player';
      state.player.inCar = best.id;
      state.player.x = best.x;
      state.player.y = best.y;
      if (best.kind === 'civilian' && best._parked !== false) {
        // Taking a car that is not yours is a crime in Bayline.
        this.addWanted(1);
        state.stats.carsStolen += 1;
        this.showMessage('Car taken! The cops noticed. +1 wanted star');
      }
      if (audio) audio.click();
      return true;
    },

    exitCar() {
      const car = this.playerCar();
      if (!car) return;
      car.driver = null;
      car.speed = 0;
      state.player.inCar = null;
      state.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      state.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      if (circleHitsBuilding(state.buildings, state.player.x, state.player.y, PLAYER_RADIUS)) {
        state.player.x = car.x - Math.cos(car.angle + Math.PI / 2) * 34;
        state.player.y = car.y - Math.sin(car.angle + Math.PI / 2) * 34;
      }
    },

    punch(audio) {
      const p = state.player;
      if (p.punchTimer > 0 || p.inCar !== null) return;
      p.punchTimer = PUNCH_COOLDOWN;
      if (audio) audio.punch();
      const reach = PUNCH_RANGE;
      for (const ped of state.peds) {
        if (ped.kind === 'ped') continue;
        const d = dist(ped.x, ped.y, p.x, p.y);
        if (d > reach) continue;
        const ang = angleTo(p.x, p.y, ped.x, ped.y);
        if (Math.abs(angleDiff(p.angle, ang)) > 1.2) continue;
        ped.hp -= PUNCH_DAMAGE;
        const kb = 160;
        ped.x += Math.cos(ang) * 14;
        ped.y += Math.sin(ang) * 14;
        this.addParticles(ped.x, ped.y, '#ffd23d', 6, 120);
        if (ped.hp <= 0) {
          ped.dead = true;
          p.cash += ped.kind === 'goon' ? 25 : 0;
          if (ped.kind === 'goon') this.showMessage('Goon down! +$25');
        }
      }
    },

    shoot(targetX, targetY, audio) {
      const p = state.player;
      if (p.shootTimer > 0 || p.inCar !== null) return;
      if (p.ammo <= 0) {
        this.showMessage('No ammo! Find an ammo crate (yellow box).');
        return;
      }
      p.shootTimer = 0.28;
      p.ammo -= 1;
      p.angle = angleTo(p.x, p.y, targetX, targetY);
      if (audio) audio.shoot();
      this.addParticles(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, '#ffe08a', 4, 200);
      // Hit the nearest hostile ped roughly in the firing line.
      let best = null;
      let bestD = SHOT_RANGE;
      for (const ped of state.peds) {
        if (ped.kind === 'ped' || ped.dead) continue;
        const d = dist(p.x, p.y, ped.x, ped.y);
        if (d > bestD) continue;
        const ang = angleTo(p.x, p.y, ped.x, ped.y);
        if (Math.abs(angleDiff(p.angle, ang)) > 0.22) continue;
        bestD = d;
        best = ped;
      }
      if (best) {
        best.hp -= SHOT_DAMAGE;
        this.addParticles(best.x, best.y, '#d93d3d', 8, 160);
        this.addWanted(1);
        if (best.hp <= 0) {
          best.dead = true;
          if (best.kind === 'goon') {
            p.cash += 25;
            this.showMessage('Goon down! +$25');
          }
        }
      }
    },

    spawnPoliceCar() {
      const p = state.player;
      // Spawn on a road 350-550 units away.
      for (let tries = 0; tries < 12; tries += 1) {
        const a = random.range(0, Math.PI * 2);
        const d = random.range(350, 550);
        const x = clamp(p.x + Math.cos(a) * d, ROAD, WORLD - ROAD);
        const y = clamp(p.y + Math.sin(a) * d, ROAD, WORLD - ROAD);
        if (!isOnRoad(x, y)) continue;
        const car = makeCar(x, y, angleTo(x, y, p.x, p.y), '#20242c', 'police');
        car.driver = 'police';
        car.speed = 200;
        state.cars.push(car);
        return car;
      }
      return null;
    },

    spawnCopPed() {
      const p = state.player;
      const a = random.range(0, Math.PI * 2);
      const x = clamp(p.x + Math.cos(a) * 260, ROAD, WORLD - ROAD);
      const y = clamp(p.y + Math.sin(a) * 260, ROAD, WORLD - ROAD);
      return spawnPed(state, random, 'cop', x, y);
    },

    spawnGoons(x, y, count) {
      const out = [];
      for (let i = 0; i < count; i += 1) {
        out.push(spawnPed(state, random, 'goon', x + random.range(-60, 60), y + random.range(-60, 60)));
      }
      return out;
    },

    spawnTargetCar(x, y, color) {
      const car = makeCar(x, y, Math.PI / 2, color || '#e0b13c', 'target');
      car._parked = false; // the mission car is not a "stolen civilian" crime
      state.cars.push(car);
      return car;
    },

    damagePlayer(amount) {
      const p = state.player;
      p.hp -= amount;
      if (p.hp <= 0) {
        p.hp = 0;
        state.wasted = true;
        state.events.push(EVENT_WASTED);
      }
    },

    bustPlayer() {
      const p = state.player;
      state.busted = true;
      state.events.push(EVENT_BUSTED);
      state.stats.arrests += 1;
      const fine = Math.min(p.cash, 100);
      p.cash -= fine;
      state.wanted = 0;
      if (p.inCar !== null) {
        const car = this.playerCar();
        if (car) car.driver = null;
        p.inCar = null;
      }
      p.x = PLACES.garage.x;
      p.y = PLACES.garage.y;
      p.hp = Math.max(p.hp, 50);
      p.bustTimer = 0;
      // Cops leave after a bust.
      state.cars = state.cars.filter((c) => c.driver !== 'police');
      state.peds = state.peds.filter((ped) => ped.kind !== 'cop');
    },

    step(dt, input, audio) {
      state.events = [];
      state.time += dt;
      const p = state.player;
      if (state.messageTimer > 0) {
        state.messageTimer -= dt;
        if (state.messageTimer <= 0) state.message = '';
      }
      if (p.punchTimer > 0) p.punchTimer -= dt;
      if (p.shootTimer > 0) p.shootTimer -= dt;

      // --- Player control ---
      const car = this.playerCar();
      if (car) {
        let steer = 0;
        if (input.held('left')) steer -= 1;
        if (input.held('right')) steer += 1;
        const forward = input.held('up');
        const back = input.held('down');
        const dirSign = car.speed >= 0 ? 1 : -1;
        if (forward) car.speed += CAR_ACCEL * dt;
        if (back) car.speed -= (car.speed > 5 ? CAR_BRAKE : CAR_ACCEL * 0.6) * dt;
        if (!forward && !back) car.speed -= Math.sign(car.speed) * 140 * dt;
        if (Math.abs(car.speed) < 4 && !forward && !back) car.speed = 0;
        car.speed = clamp(car.speed, -CAR_REVERSE_MAX, CAR_MAX_SPEED);
        car.angle += steer * CAR_TURN * dt * clamp(Math.abs(car.speed) / 120, 0, 1) * dirSign;
        const dx = Math.cos(car.angle) * car.speed * dt;
        const dy = Math.sin(car.angle) * car.speed * dt;
        const moved = moveWithCollision(state.buildings, car, dx, dy, 16);
        if (!moved && Math.abs(car.speed) > 120) {
          if (car.hitCooldown <= 0) {
            car.hp -= 6;
            car.hitCooldown = 0.5;
          }
          car.speed *= -0.25;
          if (audio) audio.crash();
          this.addParticles(car.x, car.y, '#ffb13d', 8, 140);
          this.addWanted(0); // crashing alone is not a crime
        } else if (!moved) {
          car.speed *= 0.5;
        }
        p.x = car.x;
        p.y = car.y;
        p.angle = car.angle;
        if (car.hp <= 0) {
          car.hp = 0;
          this.addParticles(car.x, car.y, '#ff6b3d', 30, 260);
          this.addParticles(car.x, car.y, '#333333', 20, 160);
          if (audio) audio.explosion();
          state.cars = state.cars.filter((c) => c.id !== car.id);
          p.inCar = null;
          p.x = car.x + 30;
          p.y = car.y + 30;
          this.damagePlayer(20);
          state.events.push(EVENT_CAR_DESTROYED);
          this.showMessage('Your car blew up!');
        }
        if (audio) {
          audio.setEngine(Math.abs(car.speed) / CAR_MAX_SPEED);
        }
      } else {
        let mx = 0;
        let my = 0;
        if (input.held('left')) mx -= 1;
        if (input.held('right')) mx += 1;
        if (input.held('up')) my -= 1;
        if (input.held('down')) my += 1;
        if (mx !== 0 || my !== 0) {
          const len = Math.sqrt(mx * mx + my * my);
          mx /= len;
          my /= len;
          p.angle = Math.atan2(my, mx);
          p.walkPhase += dt * 10;
          moveWithCollision(state.buildings, p, mx * PLAYER_SPEED * dt, my * PLAYER_SPEED * dt, PLAYER_RADIUS);
        }
        if (audio) audio.setEngine(0);
      }

      // --- Traffic ---
      for (const c of state.cars) {
        if (c.hitCooldown > 0) c.hitCooldown -= dt;
      }
      for (const c of state.cars) {
        if (c.driver !== 'traffic') continue;
        // At an intersection, sometimes turn onto the cross road.
        const nearV = nearestRoadDistance(c.x, c.y, 'v');
        const nearH = nearestRoadDistance(c.x, c.y, 'h');
        const atJunction = Math.min(nearV, nearH) < 8;
        if (atJunction && random.chance(0.02)) {
          if (c.axis === 'v') {
            c.axis = 'h';
            c.y = Math.round(c.y / PITCH) * PITCH;
            c.dir = random.chance(0.5) ? 1 : -1;
          } else {
            c.axis = 'v';
            c.x = Math.round(c.x / PITCH) * PITCH;
            c.dir = random.chance(0.5) ? 1 : -1;
          }
        }
        if (c.axis === 'v') {
          c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          const ny = c.y + c.dir * c.speed * dt;
          if (ny < ROAD / 2 || ny > WORLD - ROAD / 2) {
            c.dir *= -1;
          } else {
            c.y = ny;
          }
          c.x += (Math.round(c.x / PITCH) * PITCH + c.lane - c.x) * dt * 2;
        } else {
          c.angle = c.dir > 0 ? 0 : Math.PI;
          const nx = c.x + c.dir * c.speed * dt;
          if (nx < ROAD / 2 || nx > WORLD - ROAD / 2) {
            c.dir *= -1;
          } else {
            c.x = nx;
          }
          c.y += (Math.round(c.y / PITCH) * PITCH + c.lane - c.y) * dt * 2;
        }
      }

      // --- Pedestrians ---
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (ped.kind === 'ped') {
          if (ped.fleeTimer > 0) {
            ped.fleeTimer -= dt;
            const a = angleTo(p.x, p.y, ped.x, ped.y); // run away from the player
            moveWithCollision(state.buildings, ped, Math.cos(a) * 150 * dt, Math.sin(a) * 150 * dt, 8);
            continue;
          }
          // Stroll along the sidewalk; turn at junctions sometimes.
          const nearV = nearestRoadDistance(ped.x, ped.y, 'v');
          const nearH = nearestRoadDistance(ped.x, ped.y, 'h');
          if (Math.min(nearV, nearH) < 8 && random.chance(0.02)) {
            ped.axis = ped.axis === 'v' ? 'h' : 'v';
            ped.dir = random.chance(0.5) ? 1 : -1;
            ped.lane = random.chance(0.5) ? ROAD / 2 + 8 : -(ROAD / 2 + 8);
          }
          if (ped.axis === 'v') {
            ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            const ny = ped.y + ped.dir * ped.speed * dt;
            if (ny < ROAD / 2 || ny > WORLD - ROAD / 2) ped.dir *= -1;
            else ped.y = ny;
            ped.x += (Math.round(ped.x / PITCH) * PITCH + ped.lane - ped.x) * dt * 2;
          } else {
            ped.angle = ped.dir > 0 ? 0 : Math.PI;
            const nx = ped.x + ped.dir * ped.speed * dt;
            if (nx < ROAD / 2 || nx > WORLD - ROAD / 2) ped.dir *= -1;
            else ped.x = nx;
            ped.y += (Math.round(ped.y / PITCH) * PITCH + ped.lane - ped.y) * dt * 2;
          }
          ped.walkPhase += dt * 8;
        } else if (ped.kind === 'goon') {
          // Chase the player and punch up close.
          const d = dist(ped.x, ped.y, p.x, p.y);
          if (d < 500) {
            const a = angleTo(ped.x, ped.y, p.x, p.y);
            ped.angle = a;
            if (d > 30) {
              moveWithCollision(state.buildings, ped, Math.cos(a) * ped.speed * dt, Math.sin(a) * ped.speed * dt, 10);
            } else if (ped.attackTimer <= 0) {
              ped.attackTimer = 1.0;
              this.damagePlayer(8);
              this.addParticles(p.x, p.y, '#ff5b5b', 5, 100);
              if (audio) audio.punch();
            }
          }
          if (ped.attackTimer > 0) ped.attackTimer -= dt;
        } else if (ped.kind === 'cop') {
          const d = dist(ped.x, ped.y, p.x, p.y);
          const a = angleTo(ped.x, ped.y, p.x, p.y);
          ped.angle = a;
          if (car) {
            // On foot cops cannot catch a car; they hold position and radio in.
            if (d > 120) moveWithCollision(state.buildings, ped, Math.cos(a) * ped.speed * dt, Math.sin(a) * ped.speed * dt, 10);
          } else if (d > 26) {
            moveWithCollision(state.buildings, ped, Math.cos(a) * ped.speed * dt, Math.sin(a) * ped.speed * dt, 10);
            ped.bustTimer = 0;
          } else {
            ped.bustTimer += dt;
            if (ped.bustTimer > 1.2) {
              this.bustPlayer();
              if (audio) audio.busted();
              return;
            }
          }
        }
      }
      state.peds = state.peds.filter((ped) => !ped.dead);

      // --- Police cars chase the player ---
      const policeCars = state.cars.filter((c) => c.driver === 'police');
      for (const pc of policeCars) {
        const targetX = p.x;
        const targetY = p.y;
        const desired = angleTo(pc.x, pc.y, targetX, targetY);
        const diff = angleDiff(pc.angle, desired);
        pc.angle += clamp(diff, -2.8 * dt, 2.8 * dt);
        pc.speed = Math.min(pc.speed + 260 * dt, 450);
        const dx = Math.cos(pc.angle) * pc.speed * dt;
        const dy = Math.sin(pc.angle) * pc.speed * dt;
        const moved = moveWithCollision(state.buildings, pc, dx, dy, 16);
        if (!moved) {
          pc.angle += 1.4 * dt;
          pc.speed *= 0.6;
        }
        if (pc.ramCooldown > 0) pc.ramCooldown -= dt;
        // Ram the player's car.
        if (car && pc.ramCooldown <= 0 && dist(pc.x, pc.y, car.x, car.y) < 34) {
          pc.ramCooldown = 1.2;
          car.hp -= 2;
          car.speed *= 0.7;
          if (audio) audio.crash();
          this.addParticles(car.x, car.y, '#ffb13d', 8, 140);
        }
      }

      // --- Car vs car collisions (traffic vs player car / police) ---
      const allCars = state.cars;
      for (let i = 0; i < allCars.length; i += 1) {
        for (let j = i + 1; j < allCars.length; j += 1) {
          const a = allCars[i];
          const b = allCars[j];
          const d = dist(a.x, a.y, b.x, b.y);
          if (d < 30 && d > 0.01) {
            const push = (30 - d) / 2;
            const nx = (b.x - a.x) / d;
            const ny = (b.y - a.y) / d;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            if (a.driver === 'player' || b.driver === 'player') {
              const playerCarObj = a.driver === 'player' ? a : b;
              const other = a.driver === 'player' ? b : a;
              playerCarObj.speed *= 0.6;
              if (playerCarObj.hitCooldown <= 0) {
                playerCarObj.hp -= 2;
                other.hp -= 2;
                playerCarObj.hitCooldown = 0.6;
                other.hitCooldown = 0.6;
                if (audio) audio.crash();
                this.addParticles(playerCarObj.x, playerCarObj.y, '#ffb13d', 6, 120);
              }
            }
          }
        }
      }

      // --- Player car vs pedestrians (a crime) ---
      if (car) {
        for (const ped of state.peds) {
          if (ped.kind !== 'ped' || ped.dead) continue;
          if (dist(car.x, car.y, ped.x, ped.y) < 26 && Math.abs(car.speed) > 60) {
            ped.dead = true;
            this.addWanted(1);
            this.showMessage('Pedestrian hit! +1 wanted star');
            this.addParticles(ped.x, ped.y, '#d93d3d', 10, 160);
            if (audio) audio.crash();
          }
        }
        state.peds = state.peds.filter((ped) => !ped.dead);
      }

      // --- Pickups ---
      for (const pk of state.pickups) {
        if (!pk.active) {
          pk.timer -= dt;
          if (pk.timer <= 0) pk.active = true;
          continue;
        }
        if (dist(p.x, p.y, pk.x, pk.y) < 34) {
          pk.active = false;
          pk.timer = 25;
          if (pk.kind === 'health') {
            p.hp = Math.min(PLAYER_HP, p.hp + 30);
            this.showMessage('Health +30');
          } else {
            p.ammo += 24;
            this.showMessage('Ammo +24');
          }
          if (audio) audio.pickup();
          state.events.push(EVENT_PICKUP);
        }
      }

      // --- Wanted level: police presence and decay ---
      const wantCars = Math.min(state.wanted, 4);
      const haveCars = state.cars.filter((c) => c.driver === 'police').length;
      if (haveCars < wantCars && state.wanted > 0) {
        this.spawnPoliceCar();
      }
      const wantCops = state.wanted >= 2 && !car ? Math.min(state.wanted - 1, 3) : 0;
      const haveCops = state.peds.filter((ped) => ped.kind === 'cop').length;
      if (haveCops < wantCops) {
        this.spawnCopPed();
      }
      if (state.wanted > 0 && state.time - state.lastCrimeTime > WANTED_DECAY_SECONDS) {
        if (nearestCopDistance(state, p.x, p.y) > 350) {
          state.wanted -= 1;
          state.lastCrimeTime = state.time;
          if (state.wanted === 0) this.showMessage('You lost the cops. Wanted level clear.');
        }
      }
      if (state.wanted > 0 && audio) audio.startSiren();
      else if (audio) audio.stopSiren();

      // --- Wrecked cars (not the player's) burn out and leave the road ---
      for (const c of [...state.cars]) {
        if (c.hp <= 0 && c.driver !== 'player') {
          this.addParticles(c.x, c.y, '#ff6b3d', 20, 220);
          if (audio) audio.explosion();
          state.cars = state.cars.filter((x) => x.id !== c.id);
        }
      }

      // --- Particles ---
      for (const pt of state.particles) {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= 0.96;
        pt.vy *= 0.96;
        pt.life -= dt;
      }
      state.particles = state.particles.filter((pt) => pt.life > 0);

      // --- Camera follows the player ---
      state.camera.x = p.x;
      state.camera.y = p.y;

      // Slow health regen on foot, out of trouble.
      if (!car && state.wanted === 0 && p.hp > 0 && p.hp < PLAYER_HP) {
        p.hp = Math.min(PLAYER_HP, p.hp + 1.2 * dt);
      }
    },
  };

  function nearestRoadDistance(x, y, axis) {
    let best = Infinity;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i);
      const d = axis === 'v' ? Math.abs(x - c) : Math.abs(y - c);
      if (d < best) best = d;
    }
    return best;
  }

  world.reset();
  return world;
}
