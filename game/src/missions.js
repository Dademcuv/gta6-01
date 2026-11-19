// Bayline story and missions. Jax Carter, a courier driver in Bayline City, owes
// $1,000 to Sal Moreno, a loan shark. Five jobs pay the debt off, one by one.
// Missions are data plus a small state machine; the world simulation owns the
// entities, this module owns the objectives.
import { PLACES } from './config.js';
import { dist } from './random.js';

export const STORY_INTRO = [
  'Bayline City. 2 AM.',
  'Jax Carter owes $1,000 to Sal Moreno — and Sal does not wait.',
  'Five jobs. Pay the debt. Stay out of jail.',
];

export const MISSIONS = [
  {
    id: 1,
    title: 'First Fare',
    briefing: 'Pick up the package at Port Luna Docks, then deliver it to the Grand Bay Hotel. Stay out of trouble.',
    reward: 150,
  },
  {
    id: 2,
    title: 'The Collector',
    briefing: "Sal sent his goons to lean on you. They are waiting by his office. Deal with them — fists or otherwise — then get back to the garage.",
    reward: 250,
  },
  {
    id: 3,
    title: 'Getaway Driver',
    briefing: 'A job went loud. The cops are on you. Get in a car and reach the North Gate with the law on your tail.',
    reward: 300,
  },
  {
    id: 4,
    title: 'The Big Score',
    briefing: 'A gold coupe is parked at the Marina Lot. Take it and bring it to your garage. Expect the police to care.',
    reward: 500,
  },
  {
    id: 5,
    title: 'Settle the Debt',
    briefing: 'Last job: bring the cash to Sal\'s Office. His crew will not let you walk in easy. Finish them, then walk in and pay up.',
    reward: 1000,
  },
];

export function createMissionRuntime(world, index) {
  const state = world.state;
  const def = MISSIONS[index];
  const runtime = {
    index,
    def,
    stage: 0,
    target: null,
    text: def.briefing,
    goons: [],
    targetCar: null,
    done: false,
  };
  state.mission = runtime;

  if (index === 0) {
    runtime.target = { x: PLACES.docks.x, y: PLACES.docks.y, r: 60, label: 'Pick up the package' };
  } else if (index === 1) {
    runtime.target = { x: PLACES.office.x, y: PLACES.office.y, r: 120, label: 'Reach the ambush' };
  } else if (index === 2) {
    runtime.target = { x: PLACES.northGate.x, y: PLACES.northGate.y, r: 90, label: 'Reach the North Gate' };
  } else if (index === 3) {
    runtime.target = { x: PLACES.marina.x, y: PLACES.marina.y, r: 90, label: 'Find the gold coupe' };
  } else if (index === 4) {
    runtime.target = { x: PLACES.office.x, y: PLACES.office.y, r: 120, label: 'Reach Sal\'s Office' };
  }
  world.showMessage(`Mission ${def.id}: ${def.title} — ${def.briefing}`);
  return runtime;
}

function completeMission(world, audio) {
  const state = world.state;
  const runtime = state.mission;
  const def = runtime.def;
  state.player.cash += def.reward;
  state.stats.missionsDone += 1;
  runtime.done = true;
  if (audio) audio.missionDone();
  world.showMessage(`Mission complete! +$${def.reward}`);
  if (runtime.index + 1 >= MISSIONS.length) {
    state.storyComplete = true;
    world.showMessage('DEBT PAID! Jax is free — Bayline is yours now.');
  }
}

export function updateMission(world, audio) {
  const state = world.state;
  const runtime = state.mission;
  if (!runtime || runtime.done) return;
  const p = state.player;

  if (runtime.index === 0) {
    if (runtime.stage === 0) {
      if (dist(p.x, p.y, PLACES.docks.x, PLACES.docks.y) < 60) {
        runtime.stage = 1;
        runtime.target = { x: PLACES.hotel.x, y: PLACES.hotel.y, r: 60, label: 'Deliver to the hotel' };
        runtime.text = 'Package collected. Deliver it to the Grand Bay Hotel.';
        world.showMessage('Package collected! Deliver it to the Grand Bay Hotel.');
        if (audio) audio.pickup();
      }
    } else if (dist(p.x, p.y, PLACES.hotel.x, PLACES.hotel.y) < 60) {
      completeMission(world, audio);
    }
  } else if (runtime.index === 1) {
    if (runtime.stage === 0) {
      if (dist(p.x, p.y, PLACES.office.x, PLACES.office.y) < 130) {
        runtime.stage = 1;
        // Goons wait on the road west of the office (not inside the building).
        runtime.goons = world.spawnGoons(PLACES.office.x - 40, PLACES.office.y + 40, 3);
        runtime.target = null;
        runtime.text = 'Take down all 3 goons!';
        world.showMessage("Sal's goons are here! Take them down.");
      }
    } else if (runtime.stage === 1) {
      const alive = state.peds.filter((ped) => ped.kind === 'goon').length;
      if (alive === 0) {
        runtime.stage = 2;
        runtime.target = { x: PLACES.garage.x, y: PLACES.garage.y, r: 70, label: 'Return to the garage' };
        runtime.text = 'All goons down. Get back to the garage.';
        world.showMessage('All goons down! Get back to the garage.');
      }
    } else if (dist(p.x, p.y, PLACES.garage.x, PLACES.garage.y) < 70) {
      completeMission(world, audio);
    }
  } else if (runtime.index === 2) {
    if (runtime.stage === 0) {
      // The job went loud the moment it starts.
      runtime.stage = 1;
      world.addWanted(2);
      runtime.text = 'Lose the cops and reach the North Gate!';
      world.showMessage('The job went loud! Reach the North Gate.');
    }
    if (dist(p.x, p.y, PLACES.northGate.x, PLACES.northGate.y) < 90) {
      completeMission(world, audio);
    }
  } else if (runtime.index === 3) {
    if (runtime.stage === 0) {
      if (dist(p.x, p.y, PLACES.marina.x, PLACES.marina.y) < 90) {
        runtime.stage = 1;
        // The coupe sits on the road by the marina lot, not inside a building.
        runtime.targetCar = world.spawnTargetCar(PLACES.marina.x - 40, PLACES.marina.y, '#e0b13c');
        runtime.target = { x: PLACES.marina.x - 40, y: PLACES.marina.y, r: 60, label: 'Steal the gold coupe' };
        runtime.text = 'The gold coupe is here. Take it!';
        world.showMessage('There it is — the gold coupe. Take it!');
      }
    } else if (runtime.stage === 1) {
      const car = world.playerCar();
      if (car && car.kind === 'target') {
        runtime.stage = 2;
        world.addWanted(3);
        runtime.target = { x: PLACES.garage.x, y: PLACES.garage.y, r: 70, label: 'Deliver the coupe to the garage' };
        runtime.text = 'Coupe stolen! Deliver it to your garage — the cops are coming.';
        world.showMessage('Coupe stolen! The cops are on you — get to the garage.');
      }
    } else if (dist(p.x, p.y, PLACES.garage.x, PLACES.garage.y) < 70) {
      const car = world.playerCar();
      if (car && car.kind === 'target') completeMission(world, audio);
    }
  } else if (runtime.index === 4) {
    if (runtime.stage === 0) {
      if (dist(p.x, p.y, PLACES.office.x, PLACES.office.y) < 130) {
        runtime.stage = 1;
        runtime.goons = world.spawnGoons(PLACES.office.x - 40, PLACES.office.y + 20, 4);
        world.spawnCopPed();
        runtime.target = null;
        runtime.text = "Sal's crew is blocking the door. Clear them out!";
        world.showMessage("Sal's crew is blocking the door!");
      }
    } else if (runtime.stage === 1) {
      const alive = state.peds.filter((ped) => ped.kind === 'goon').length;
      if (alive === 0) {
        runtime.stage = 2;
        runtime.target = { x: PLACES.office.x, y: PLACES.office.y, r: 50, label: 'Walk into the office' };
        runtime.text = 'The way is clear. Walk in and pay the debt.';
        world.showMessage('The way is clear. Walk in and pay up.');
      }
    } else if (dist(p.x, p.y, PLACES.office.x, PLACES.office.y) < 50 && p.inCar === null) {
      completeMission(world, audio);
    }
  }
}

export function startNextMission(world) {
  const state = world.state;
  const next = state.stats.missionsDone;
  if (next >= MISSIONS.length) return false;
  createMissionRuntime(world, next);
  return true;
}
