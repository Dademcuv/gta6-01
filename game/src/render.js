// Bayline renderer: paints the city, the people and cars in it, the HUD with its
// minimap, and every screen (title, pause, busted, wasted, story complete).
import { WORLD, ROAD, PITCH, GRID, COLORS, PLAYER_RADIUS } from './config.js';
import { clamp, angleTo } from './random.js';
import { MISSIONS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

const MINIMAP = 170;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Wheels.
  ctx.fillStyle = '#111111';
  ctx.fillRect(-16, -13, 9, 5);
  ctx.fillRect(-16, 8, 9, 5);
  ctx.fillRect(8, -13, 9, 5);
  ctx.fillRect(8, 8, 9, 5);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -23, -11, 46, 22, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Windshield and roof.
  ctx.fillStyle = 'rgba(20,30,44,0.9)';
  ctx.fillRect(6, -8, 8, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(-8, -8, 12, 16);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(21, -8, 2, 4);
  ctx.fillRect(21, 4, 2, 4);
  if (car.kind === 'police') {
    // Flashing light bar.
    const phase = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2d2d' : '#2d6bff';
    ctx.fillRect(-4, -9, 8, 5);
    ctx.fillStyle = phase ? '#2d6bff' : '#ff2d2d';
    ctx.fillRect(-4, 4, 8, 5);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-14, -8, 6, 16);
  }
  if (car.kind === 'target') {
    ctx.strokeStyle = '#ffd23d';
    ctx.lineWidth = 2;
    roundRect(ctx, -23, -11, 46, 22, 6);
    ctx.stroke();
  }
  // Damage smoke.
  if (car.hp < 40) {
    ctx.fillStyle = 'rgba(60,60,60,0.7)';
    ctx.beginPath();
    ctx.arc(-18, 0, 5 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPedShape(ctx, ped, time) {
  const bob = Math.sin(ped.walkPhase || 0) * 1.5;
  ctx.save();
  ctx.translate(ped.x, ped.y + bob * 0.3);
  const color = ped.kind === 'goon' ? '#c93b3b' : ped.kind === 'cop' ? '#2d4a7a' : ['#e0b13c', '#7ad93d', '#d97ad9', '#3dd9c4'][Math.abs(Math.floor(ped.x + ped.y)) % 4];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Facing tick.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(ped.angle) * 12, Math.sin(ped.angle) * 12);
  ctx.stroke();
  // Health bar for hostiles.
  if (ped.kind !== 'ped' && ped.hp < 80) {
    ctx.fillStyle = '#222';
    ctx.fillRect(-10, -16, 20, 4);
    ctx.fillStyle = '#e04040';
    ctx.fillRect(-10, -16, 20 * Math.max(0, ped.hp / 80), 4);
  }
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;
  // The top-left world coordinate of the last painted frame (camera, clamped).
  let viewX = 0;
  let viewY = 0;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  window.addEventListener('resize', resize);
  resize();

  function drawWorld(state) {
    const cam = state.camera;
    // Clamp the view so the camera never shows the void outside the city.
    const viewLeft = clamp(cam.x - width / 2, 0, Math.max(0, WORLD - width));
    const viewTop = clamp(cam.y - height / 2, 0, Math.max(0, WORLD - height));
    viewX = viewLeft;
    viewY = viewTop;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(-viewLeft, -viewTop);

    // Ground: sidewalks everywhere, roads cut through.
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(viewLeft - 10, viewTop - 10, width + 20, height + 20);
    // Beach strip along the south edge.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, 9 * PITCH + ROAD / 2, WORLD, WORLD - (9 * PITCH + ROAD / 2));
    // Parks.
    for (const park of state.parks) {
      ctx.fillStyle = COLORS.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = COLORS.parkPath;
      ctx.fillRect(park.x + park.w / 2 - 6, park.y, 12, park.h);
      ctx.fillRect(park.x, park.y + park.h / 2 - 6, park.w, 12);
      // Trees.
      ctx.fillStyle = '#2c5426';
      for (let i = 0; i < 6; i += 1) {
        const tx = park.x + 30 + ((i * 37) % (park.w - 60));
        const ty = park.y + 30 + ((i * 53) % (park.h - 60));
        ctx.beginPath();
        ctx.arc(tx, ty, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Garage lot: paved, with parking bays.
    for (const lot of state.lots) {
      ctx.fillStyle = '#33373e';
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.strokeRect(lot.x + 8, lot.y + 8, lot.w - 16, lot.h - 16);
      ctx.setLineDash([]);
      ctx.fillStyle = '#c9a227';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("JAX'S GARAGE", lot.x + lot.w / 2, lot.y + lot.h - 16);
    }
    // Roads.
    ctx.fillStyle = COLORS.asphalt;
    for (let i = 0; i <= GRID; i += 1) {
      const c = i * PITCH;
      ctx.fillRect(c - ROAD / 2, Math.max(0, viewTop), ROAD, height + 20);
      ctx.fillRect(Math.max(0, viewLeft), c - ROAD / 2, width + 20, ROAD);
    }
    // Lane dashes.
    ctx.strokeStyle = COLORS.laneDash;
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 18]);
    ctx.beginPath();
    for (let i = 0; i <= GRID; i += 1) {
      const c = i * PITCH;
      ctx.moveTo(c, Math.max(0, viewTop));
      ctx.lineTo(c, Math.min(WORLD, viewTop + height));
      ctx.moveTo(Math.max(0, viewLeft), c);
      ctx.lineTo(Math.min(WORLD, viewLeft + width), c);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Buildings (only the visible ones).
    for (const b of state.buildings) {
      if (b.x + b.w < viewLeft || b.x > viewLeft + width || b.y + b.h < viewTop || b.y > viewTop + height) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = COLORS.roofEdge;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // Windows.
      ctx.fillStyle = 'rgba(255, 240, 180, 0.75)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 34));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if ((cx * 7 + cy * 3 + Math.floor(b.x)) % 4 === 0) continue;
          ctx.fillRect(b.x + 10 + cx * 34, b.y + 10 + cy * 34, 12, 14);
        }
      }
    }

    // Pickups.
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      if (pk.x < viewLeft || pk.x > viewLeft + width || pk.y < viewTop || pk.y > viewTop + height) continue;
      ctx.save();
      ctx.translate(pk.x, pk.y);
      ctx.fillStyle = pk.kind === 'health' ? '#37d67a' : '#ffd23d';
      roundRect(ctx, -13, -13, 26, 26, 5);
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pk.kind === 'health' ? '+' : 'A', 0, 1);
      ctx.restore();
    }

    // Mission target marker.
    const mission = state.mission;
    if (mission && mission.target && !mission.done) {
      const t = mission.target;
      const pulse = 1 + Math.sin(state.time * 4) * 0.15;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.strokeStyle = '#ffd23d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.moveTo(0, -34 * pulse);
      ctx.lineTo(8, -20 * pulse);
      ctx.lineTo(-8, -20 * pulse);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Cars.
    for (const car of state.cars) {
      if (car.x < viewLeft - 60 || car.x > viewLeft + width + 60 || car.y < viewTop - 60 || car.y > viewTop + height + 60) continue;
      drawCarShape(ctx, car, state.time);
    }
    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.x < viewLeft - 30 || ped.x > viewLeft + width + 30 || ped.y < viewTop - 30 || ped.y > viewTop + height + 30) continue;
      drawPedShape(ctx, ped, state.time);
    }
    // Player on foot.
    const p = state.player;
    if (p.inCar === null) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const bob = Math.sin(p.walkPhase) * 1.5;
      ctx.fillStyle = '#f2f2f2';
      ctx.beginPath();
      ctx.arc(0, bob * 0.2, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e0b13c';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(p.angle) * 16, Math.sin(p.angle) * 16);
      ctx.stroke();
      ctx.restore();
    }
    // Particles.
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return { viewLeft, viewTop };
  }

  function drawMinimap(state) {
    const scale = MINIMAP / WORLD;
    const x0 = width - MINIMAP - 14;
    const y0 = 14;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = 'rgba(10, 12, 16, 0.82)';
    roundRect(ctx, x0 - 4, y0 - 4, MINIMAP + 8, MINIMAP + 8, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x0, y0, MINIMAP, MINIMAP);
    ctx.clip();
    // Roads.
    ctx.strokeStyle = '#6a7078';
    ctx.lineWidth = 2;
    for (let i = 0; i <= GRID; i += 1) {
      const c = i * PITCH * scale;
      ctx.beginPath();
      ctx.moveTo(x0 + c, y0);
      ctx.lineTo(x0 + c, y0 + MINIMAP);
      ctx.moveTo(x0, y0 + c);
      ctx.lineTo(x0 + MINIMAP, y0 + c);
      ctx.stroke();
    }
    // Parks.
    ctx.fillStyle = '#3d6b35';
    for (const park of state.parks) {
      ctx.fillRect(x0 + park.x * scale, y0 + park.y * scale, Math.max(2, park.w * scale), Math.max(2, park.h * scale));
    }
    // Mission target.
    const mission = state.mission;
    if (mission && mission.target && !mission.done) {
      const t = mission.target;
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.arc(x0 + t.x * scale, y0 + t.y * scale, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police.
    ctx.fillStyle = '#2d6bff';
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      ctx.beginPath();
      ctx.arc(x0 + car.x * scale, y0 + car.y * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x0 + state.player.x * scale, y0 + state.player.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHud(state, ui) {
    ctx.save();
    ctx.scale(dpr, dpr);
    const p = state.player;
    // Top-left: cash, health, ammo.
    ctx.fillStyle = 'rgba(10, 12, 16, 0.75)';
    roundRect(ctx, 12, 12, 220, 86, 8);
    ctx.fill();
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`$${p.cash}`, 24, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px sans-serif';
    ctx.fillText(`Ammo: ${p.ammo}`, 24, 50);
    // Health bar.
    ctx.fillStyle = '#333';
    roundRect(ctx, 24, 72, 150, 12, 4);
    ctx.fill();
    ctx.fillStyle = p.hp > 40 ? '#37d67a' : '#e04040';
    roundRect(ctx, 24, 72, 150 * Math.max(0, p.hp / 100), 12, 4);
    ctx.fill();
    // Wanted stars, top centre.
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < state.wanted ? '#ffd23d' : 'rgba(255,255,255,0.25)';
      ctx.font = '26px sans-serif';
      ctx.fillText('★', width / 2 + (i - 2) * 30, 14);
    }
    // Mission text, bottom centre.
    const mission = state.mission;
    if (mission && !mission.done) {
      ctx.fillStyle = 'rgba(10, 12, 16, 0.75)';
      const text = `Mission ${mission.def.id}: ${mission.def.title} — ${mission.text}`;
      ctx.font = '15px sans-serif';
      const tw = ctx.measureText(text).width;
      roundRect(ctx, width / 2 - tw / 2 - 14, height - 92, tw + 28, 30, 8);
      ctx.fill();
      ctx.fillStyle = '#ffd23d';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, width / 2, height - 76);
    } else if (state.storyComplete) {
      ctx.fillStyle = 'rgba(10, 12, 16, 0.75)';
      const text = 'Debt paid! Free roam — Bayline is yours.';
      ctx.font = '15px sans-serif';
      const tw = ctx.measureText(text).width;
      roundRect(ctx, width / 2 - tw / 2 - 14, height - 92, tw + 28, 30, 8);
      ctx.fill();
      ctx.fillStyle = '#7dff8a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, width / 2, height - 76);
    }
    // Context prompt.
    if (ui.prompt) {
      ctx.fillStyle = 'rgba(10, 12, 16, 0.8)';
      ctx.font = 'bold 15px sans-serif';
      const tw = ctx.measureText(ui.prompt).width;
      roundRect(ctx, width / 2 - tw / 2 - 12, height - 140, tw + 24, 28, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ui.prompt, width / 2, height - 125);
    }
    // Toast message.
    if (state.message) {
      ctx.fillStyle = 'rgba(10, 12, 16, 0.8)';
      ctx.font = '15px sans-serif';
      const tw = ctx.measureText(state.message).width;
      roundRect(ctx, width / 2 - tw / 2 - 12, 56, tw + 24, 28, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(state.message, width / 2, 71);
    }
    // Controls hint, bottom-left.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('WASD move/drive · E enter/exit car · Space punch · Click shoot · P pause · M mute', 14, height - 14);
    // Waypoint arrow when the target is off-screen.
    if (mission && mission.target && !mission.done) {
      const t = mission.target;
      const ppos = state.player;
      const dx = t.x - ppos.x;
      const dy = t.y - ppos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 320) {
        const ang = angleTo(0, 0, dx, dy);
        const px = ppos.x - viewX;
        const py = ppos.y - viewY;
        const ax = px + Math.cos(ang) * 190;
        const ay = py + Math.sin(ang) * 190;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = '#ffd23d';
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffd23d';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(d)}m`, ax, ay + 26);
      }
    }
    ctx.restore();
  }

  function overlay(title, lines, accent) {
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = 'rgba(8, 10, 14, 0.78)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || '#ffd23d';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText(title, width / 2, height / 2 - 90);
    ctx.fillStyle = '#ffffff';
    ctx.font = '17px sans-serif';
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, height / 2 - 40 + i * 28);
    });
    ctx.restore();
  }

  function menu(title, subtitle, items, selected) {
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0d1420';
    ctx.fillRect(0, 0, width, height);
    // Skyline silhouette.
    ctx.fillStyle = '#16233a';
    for (let i = 0; i < 24; i += 1) {
      const bw = width / 24;
      const bh = 60 + ((i * 53) % 140);
      ctx.fillRect(i * bw, height - bh - 120, bw - 4, bh);
    }
    ctx.fillStyle = '#0d1420';
    ctx.fillRect(0, height - 120, width, 120);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23d';
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText(title, width / 2, height / 2 - 130);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText(subtitle, width / 2, height / 2 - 92);
    items.forEach((item, i) => {
      const y = height / 2 - 20 + i * 44;
      if (i === selected) {
        ctx.fillStyle = 'rgba(255, 210, 61, 0.2)';
        roundRect(ctx, width / 2 - 220, y - 24, 440, 36, 8);
        ctx.fill();
        ctx.fillStyle = '#ffd23d';
      } else {
        ctx.fillStyle = '#cfd6de';
      }
      ctx.font = '20px sans-serif';
      ctx.fillText(item.label, width / 2, y);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px sans-serif';
    ctx.fillText('WASD / arrows to move · E enter a car · Space punch · Click to shoot · P pause', width / 2, height - 40);
    ctx.restore();
  }

  return {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    viewOrigin() {
      return { x: viewX, y: viewY };
    },
    draw(state, screen, ui) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#11141b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (screen === SCREEN_TITLE) {
        menu('BAYLINE', 'An open-world crime story — five jobs to pay the debt.', ui.menuItems, ui.selected);
        // Story lines under the menu.
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Jax Carter owes $1,000 to Sal Moreno. Five jobs. Pay the debt. Stay out of jail.', width / 2, height / 2 + 200);
        ctx.restore();
        return;
      }
      drawWorld(state);
      drawMinimap(state);
      drawHud(state, ui);
      if (screen === SCREEN_PAUSED) {
        overlay('PAUSED', ['P or Esc to resume', 'Your progress is saved when a mission ends', ui.muted ? 'Sound: OFF (M to unmute)' : 'Sound: ON (M to mute)']);
      } else if (screen === SCREEN_BUSTED) {
        overlay('BUSTED!', ['The Bayline PD caught you.', 'Fine: $100. The cops let you go at the garage.', 'Press Enter to get back on the street.'], '#5b9dff');
      } else if (screen === SCREEN_WASTED) {
        overlay('WASTED', ['Jax is down — but Bayline never sleeps.', 'You wake up at City Hospital, $150 lighter.', 'Press Enter to get back on the street.'], '#e04040');
      } else if (screen === SCREEN_COMPLETE) {
        overlay('DEBT PAID!', [`All five jobs done. Jax is free — and $${state.player.cash} richer.`, 'Free roam: Bayline City is yours now.', 'Press Enter to keep playing.'], '#7dff8a');
      }
    },
  };
}
