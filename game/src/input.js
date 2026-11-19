// Keyboard and mouse input. Keys are tracked by their code so WASD and arrows
// both work; mouse position is kept in canvas pixels and converted to world
// coordinates by the caller. Clicks are consumed as one-shot events.
export const ACTION = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  ENTER_CAR: 'enterCar',
  PUNCH: 'punch',
  SHOOT: 'shoot',
  PAUSE: 'pause',
  CONFIRM: 'confirm',
  MUTE: 'mute',
};

const KEY_MAP = {
  KeyW: ACTION.UP,
  ArrowUp: ACTION.UP,
  KeyS: ACTION.DOWN,
  ArrowDown: ACTION.DOWN,
  KeyA: ACTION.LEFT,
  ArrowLeft: ACTION.LEFT,
  KeyD: ACTION.RIGHT,
  ArrowRight: ACTION.RIGHT,
  KeyE: ACTION.ENTER_CAR,
  Space: ACTION.PUNCH,
  KeyP: ACTION.PAUSE,
  Escape: ACTION.PAUSE,
  Enter: ACTION.CONFIRM,
  KeyM: ACTION.MUTE,
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, clicked: false, down: false };

  function onKeyDown(event) {
    const action = KEY_MAP[event.code];
    if (!action) return;
    event.preventDefault();
    if (!event.repeat) pressed.add(action);
    held.add(action);
  }
  function onKeyUp(event) {
    const action = KEY_MAP[event.code];
    if (!action) return;
    held.delete(action);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }
  function onMouseDown(event) {
    onMouseMove(event);
    mouse.down = true;
    mouse.clicked = true;
    pressed.add(ACTION.SHOOT);
  }
  function onMouseUp() {
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    held(action) {
      return held.has(action);
    },
    // True only on the frame the key/button went down.
    pressed(action) {
      return pressed.has(action);
    },
    mouse,
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}
