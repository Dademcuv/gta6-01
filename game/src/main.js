// Bayline — boot and the one loop. Input is read every frame, the world advances
// in fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between six screens: title, play, paused, busted, wasted and story complete.
//
// ?seed=N fixes the city. ?shot=start|play|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP, SAVE_KEY } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_WASTED } from './world.js';
import { createInput, ACTION } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_BUSTED, SCREEN_WASTED, SCREEN_COMPLETE } from './render.js';
import { createMissionRuntime, updateMission, startNextMission, MISSIONS } from './missions.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
// Debug hook for play-testing: lets an automated browser read live game state.
window.__bayline = world;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    const p = world.state.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: p.cash,
      missionsDone: world.state.stats.missionsDone,
      x: p.x,
      y: p.y,
      hp: p.hp,
      ammo: p.ammo,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function applySave(save) {
  const p = world.state.player;
  p.cash = save.cash;
  p.x = save.x;
  p.y = save.y;
  p.hp = save.hp;
  p.ammo = save.ammo;
  world.state.stats.missionsDone = save.missionsDone;
  world.state.camera.x = p.x;
  world.state.camera.y = p.y;
}

function announce(text) {
  status.textContent = text;
}

function runShot(name) {
  const scene = stageShot(name, world, audio);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let saved = readSave();
  let menuItems = [];
  let selected = 0;
  let helpOpen = false;
  let missionDelay = 0;
  let completeShown = false;
  let accumulator = 0;
  let last = performance.now();

  function buildMenu() {
    menuItems = [];
    if (saved) menuItems.push({ label: `▶  Continue — $${saved.cash}, ${saved.missionsDone}/${MISSIONS.length} jobs done`, action: 'continue' });
    menuItems.push({ label: '▶  New Game', action: 'new' });
    menuItems.push({ label: 'How to Play', action: 'help' });
    selected = 0;
  }
  buildMenu();

  function startNewGame() {
    world.reset();
    saved = null;
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    createMissionRuntime(world, 0);
    screen = SCREEN_PLAY;
    audio.ensure();
    audio.startMusic();
    audio.startEngine();
    announce('Mission 1: First Fare. Pick up the package at Port Luna Docks.');
  }

  function continueGame() {
    world.reset();
    applySave(saved);
    if (world.state.stats.missionsDone >= MISSIONS.length) {
      world.state.storyComplete = true;
    } else {
      createMissionRuntime(world, world.state.stats.missionsDone);
    }
    screen = SCREEN_PLAY;
    audio.ensure();
    audio.startMusic();
    audio.startEngine();
    announce('Welcome back to Bayline City.');
  }

  function menuRect(i) {
    const y = renderer.height / 2 - 20 + i * 44;
    return { x: renderer.width / 2 - 220, y: y - 24, w: 440, h: 36 };
  }

  function handleTitleInput() {
    if (input.pressed(ACTION.UP)) {
      selected = (selected - 1 + menuItems.length) % menuItems.length;
      audio.ensure();
      audio.click();
    }
    if (input.pressed(ACTION.DOWN)) {
      selected = (selected + 1) % menuItems.length;
      audio.ensure();
      audio.click();
    }
    // Mouse: hover selects, click activates.
    for (let i = 0; i < menuItems.length; i += 1) {
      const r = menuRect(i);
      const m = input.mouse;
      if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) {
        selected = i;
        if (m.clicked) {
          input.mouse.clicked = false;
          activateMenuItem();
          return;
        }
      }
    }
    if (input.pressed(ACTION.CONFIRM)) activateMenuItem();
  }

  function activateMenuItem() {
    const item = menuItems[selected];
    if (!item) return;
    audio.ensure();
    audio.click();
    if (item.action === 'continue') continueGame();
    else if (item.action === 'new') startNewGame();
    else if (item.action === 'help') helpOpen = true;
  }

  function nearCar() {
    const p = world.state.player;
    if (p.inCar !== null) return null;
    for (const car of world.state.cars) {
      if (car.driver === 'traffic' || car.driver === 'police') continue;
      const dx = car.x - p.x;
      const dy = car.y - p.y;
      if (dx * dx + dy * dy < 95 * 95) return car;
    }
    return null;
  }

  function frame(now) {
    const delta = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;

    if (screen === SCREEN_TITLE) {
      if (helpOpen) {
        if (input.pressed(ACTION.CONFIRM) || input.pressed(ACTION.PAUSE) || input.mouse.clicked) helpOpen = false;
      } else {
        handleTitleInput();
      }
    } else if (screen === SCREEN_PLAY) {
      if (input.pressed(ACTION.PAUSE)) {
        screen = SCREEN_PAUSED;
        audio.stopEngine();
      } else if (input.pressed(ACTION.MUTE)) {
        audio.ensure();
        const muted = audio.toggleMute();
        world.showMessage(muted ? 'Sound off' : 'Sound on');
      } else {
        // One-shot actions.
        if (input.pressed(ACTION.ENTER_CAR)) {
          audio.ensure();
          const p = world.state.player;
          if (p.inCar !== null) world.exitCar();
          else world.enterNearestCar(audio);
        }
        if (input.pressed(ACTION.PUNCH)) {
          audio.ensure();
          world.punch(audio);
        }
        if (input.mouse.clicked) {
          audio.ensure();
          const vo = renderer.viewOrigin();
          const wx = vo.x + input.mouse.x;
          const wy = vo.y + input.mouse.y;
          world.shoot(wx, wy, audio);
        }
        accumulator += delta;
        while (accumulator >= STEP) {
          world.step(STEP, input, audio);
          accumulator -= STEP;
          updateMission(world, audio);
          // Mission finished: bank the save, then queue the next job.
          const mission = world.state.mission;
          if (mission && mission.done && !world.state.storyComplete && missionDelay <= 0) {
            missionDelay = 2.0;
            saveGame();
          }
          if (world.state.events.includes(EVENT_BUSTED)) {
            screen = SCREEN_BUSTED;
            audio.stopEngine();
            break;
          }
          if (world.state.events.includes(EVENT_WASTED)) {
            screen = SCREEN_WASTED;
            audio.stopEngine();
            break;
          }
          if (world.state.storyComplete && !completeShown) {
            completeShown = true;
            saveGame();
            screen = SCREEN_COMPLETE;
            audio.stopEngine();
            break;
          }
        }
        if (missionDelay > 0) {
          missionDelay -= delta;
          if (missionDelay <= 0) startNextMission(world);
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      if (input.pressed(ACTION.PAUSE) || input.pressed(ACTION.CONFIRM)) {
        screen = SCREEN_PLAY;
        audio.startEngine();
      } else if (input.pressed(ACTION.MUTE)) {
        audio.ensure();
        audio.toggleMute();
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (input.pressed(ACTION.CONFIRM)) {
        const st = world.state;
        st.busted = false;
        st.wasted = false;
        if (screen === SCREEN_WASTED) {
          // Wake up at the hospital, lighter in the pocket.
          const p = st.player;
          p.hp = 100;
          p.cash = Math.max(0, p.cash - 150);
          p.x = 2 * 268 + 40;
          p.y = 7 * 268 + 40;
          p.inCar = null;
          st.wanted = 0;
          st.cars = st.cars.filter((c) => c.driver !== 'police');
          st.peds = st.peds.filter((ped) => ped.kind !== 'cop');
          // Restart the current job from its briefing.
          const next = st.stats.missionsDone;
          if (next < MISSIONS.length) createMissionRuntime(world, next);
        }
        screen = SCREEN_PLAY;
        audio.startEngine();
      }
    } else if (screen === SCREEN_COMPLETE) {
      if (input.pressed(ACTION.CONFIRM)) {
        screen = SCREEN_PLAY;
        audio.startEngine();
      }
    }

    // What the HUD shows under the player.
    let prompt = '';
    if (screen === SCREEN_PLAY) {
      const p = world.state.player;
      if (p.inCar !== null) prompt = 'E — exit car';
      else if (nearCar()) prompt = 'E — enter car';
    }

    if (helpOpen) {
      // Help overlay drawn over the title menu.
      renderer.draw(world.state, SCREEN_TITLE, { menuItems, selected, prompt: '', muted: audio.muted });
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = 'rgba(8, 10, 14, 0.88)';
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      ctx.fillStyle = '#ffd23d';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HOW TO PLAY', renderer.width / 2, renderer.height / 2 - 140);
      ctx.fillStyle = '#ffffff';
      ctx.font = '17px sans-serif';
      const lines = [
        'WASD / Arrow keys — walk or drive',
        'E — get in / out of a car (taking one raises your wanted level)',
        'Space — punch · Click — shoot (uses ammo)',
        'Steal cars, lose the cops, finish all five jobs to pay the $1,000 debt',
        'Stars show your wanted level — cops chase, ram and bust you',
        'Green + crates heal, yellow A crates give ammo',
        'P — pause · M — mute · Progress saves after every job',
        '',
        'Press Enter or click to go back',
      ];
      lines.forEach((line, i) => ctx.fillText(line, renderer.width / 2, renderer.height / 2 - 100 + i * 30));
      ctx.restore();
    } else {
      renderer.draw(world.state, screen, { menuItems, selected, prompt, muted: audio.muted });
    }

    input.endFrame();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

if (shot) {
  runShot(shot);
} else {
  runGame();
}
