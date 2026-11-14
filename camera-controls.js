const minZoom = 0.65;
const maxZoom = 2.35;
const turnStep = Math.PI / 12;
const pointerThreshold = 7;

const clampZoom = (zoom) => Math.max(minZoom, Math.min(maxZoom, zoom));
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createCameraControls({ element, toolbar, onChange, onTap }) {
  const pointers = new Map();
  const status = toolbar.querySelector("#camera-status");
  let zoom = 1;
  let yaw = 0;
  let enabled = false;
  let pinch = null;

  function change(nextZoom, nextYaw, announce = false) {
    zoom = clampZoom(nextZoom);
    yaw = angleDelta(0, nextYaw);
    onChange({ zoom, yaw });
    if (announce) status.textContent = `배율 ${Math.round(zoom * 100)}%, 회전 ${Math.round(yaw * 180 / Math.PI)}도`;
  }

  function measurePinch() {
    const [first, second] = [...pointers.values()].filter(pointer => pointer.type === "touch");
    if (!second) return null;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    return { distance: Math.max(Math.hypot(dx, dy), 8), angle: Math.atan2(dy, dx) };
  }

  element.addEventListener("pointerdown", (event) => {
    if (!enabled || ![0, 1, 2].includes(event.button)) return;
    event.preventDefault();
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      type: event.pointerType, drag: event.button !== 0, usedTogether: false, tap: event.button === 0,
    });
    if (element.setPointerCapture) element.setPointerCapture(event.pointerId);
    pinch = measurePinch();
    if (pinch) for (const pointer of pointers.values()) pointer.usedTogether = true;
  });

  element.addEventListener("pointermove", (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pinch) {
      const next = measurePinch();
      if (next) change(zoom * next.distance / pinch.distance, yaw - angleDelta(pinch.angle, next.angle));
      pinch = next;
      return;
    }
    if (pointer.usedTogether) return;
    const moved = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
    if (pointer.drag || moved >= pointerThreshold) {
      pointer.drag = true;
      change(zoom, yaw - dx * 0.008);
    }
  });

  function release(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointers.delete(event.pointerId);
    pinch = measurePinch();
    if (event.type === "pointerup" && pointer.tap && !pointer.drag && !pointer.usedTogether &&
        Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < pointerThreshold) {
      onTap(event.clientX, event.clientY);
    }
  }

  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("lostpointercapture", release);
  element.addEventListener("contextmenu", (event) => { if (enabled) event.preventDefault(); });
  element.addEventListener("wheel", (event) => {
    if (!enabled) return;
    event.preventDefault();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
    const delta = Math.max(-260, Math.min(260, event.deltaY * units));
    change(zoom * Math.exp(-delta * 0.0026), yaw);
  }, { passive: false });

  const commands = {
    in: () => change(zoom * 1.19, yaw, true),
    out: () => change(zoom / 1.19, yaw, true),
    left: () => change(zoom, yaw - turnStep, true),
    right: () => change(zoom, yaw + turnStep, true),
    reset: () => change(1, 0, true),
  };

  toolbar.addEventListener("click", (event) => {
    const command = event.target.closest("[data-camera]")?.dataset.camera;
    if (enabled && Object.hasOwn(commands, command)) commands[command]();
  });

  return {
    enable(value) {
      enabled = value;
      toolbar.hidden = !enabled;
      if (!enabled) {
        pointers.clear();
        pinch = null;
        change(1, 0);
      }
    },
  };
}
