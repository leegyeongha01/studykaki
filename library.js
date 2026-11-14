import { createLibrary } from "./furniture.js";

const view = document.querySelector("#scene-3d");
const sceneTools = document.querySelector("#scene-controls");
const status = document.querySelector("#walk-status");
const sourceAvatar = document.querySelector("#scene-avatar");
const sourceName = document.querySelector("#scene-avatar-name");
const body = document.body;
const keys = new Set();
const players = new Map();
const outfitColors = { gold: 0xebad36, terracotta: 0xc16044, sage: 0x659b7e, indigo: 0x7771bd };
const hairColors = { dark: 0x302522, brown: 0x694231, blond: 0xba8140, rose: 0xb46177, slate: 0x676477 };
const walkKeys = new Set(["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"]);
const radius = 0.22;
const speed = 3.25;
const THREE = globalThis.THREE;

let renderer;
let world;
let library;
let nav;
let currentRoom;
let roomActive = false;
let camera;
let player;
let floorTarget;
let wantedSeat;
let sittingAt;
let waypoints = [];
let lastTime = 0;
let lastReport = 0;
let lastPayload = "";
let rally;

function init() {
  if (!THREE || !globalThis.StudyKakiWalk) return;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.37;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch {
    return;
  }
  view.prepend(renderer.domElement);
  world = new THREE.Scene();
  world.background = new THREE.Color(0x4a3a43);
  camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 85);
  const ambient = new THREE.HemisphereLight(0xffe9c9, 0x6d5067, 2.25);
  const sun = new THREE.DirectionalLight(0xffcb84, 2.65);
  sun.position.set(1, 16, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 0.5, far: 43 });
  sun.shadow.normalBias = 0.028;
  const fill = new THREE.DirectionalLight(0xffe8d0, 0.72);
  fill.position.set(8, 9, 12);
  world.add(ambient, sun, fill);
  view.hidden = false;
  body.dataset.sceneRender = "3d";
  player = makeCharacter();
  player.tag.classList.add("player-tag");
  rally = new THREE.Mesh(
    new THREE.RingGeometry(0.23, 0.3, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe184, transparent: true, opacity: 0.86, side: THREE.DoubleSide }),
  );
  rally.rotation.x = -Math.PI / 2;
  rally.visible = false;
  world.add(player.root, rally);
  readAvatar();
  adaptScene();
  new ResizeObserver(resize).observe(view);
  new MutationObserver(adaptScene).observe(body, { attributes: true, attributeFilter: ["data-room-phase", "data-scene-room"] });
  new MutationObserver(readAvatar).observe(sourceAvatar, { attributes: true });
  new MutationObserver(readAvatar).observe(sourceName, { childList: true, characterData: true, subtree: true });
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("pointercancel", () => { floorTarget = null; });
  renderer.domElement.addEventListener("webglcontextlost", () => {
    delete body.dataset.sceneRender;
    sceneTools.hidden = true;
    status.textContent = "3D is unavailable. You can still use the study room.";
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    body.dataset.sceneRender = "3d";
    sceneTools.hidden = !roomActive;
  });
  window.addEventListener("keydown", (event) => keyEvent(event, true));
  window.addEventListener("keyup", (event) => keyEvent(event, false));
  window.addEventListener("blur", () => keys.clear());
  window.addEventListener("studykaki:room-peers", updatePeers);
  renderer.setAnimationLoop(frame);
}

function makeCharacter() {
  const root = new THREE.Group();
  const material = (color, roughness = 0.72) => new THREE.MeshStandardMaterial({ color, roughness });
  const skin = material(0xf3b68e);
  const shirt = material(0xebad36);
  const hair = material(0x302522);
  const pants = material(0x354143);
  const boots = material(0x242727);
  const pupil = material(0x30272a, 0.36);
  const blush = material(0xcc7469);
  const glassesMaterial = material(0x1d302a);
  const headphoneMaterial = material(0x484b52);

  function shape(parent, geometry, surface, x, y, z) {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function sphere(parent, surface, x, y, z, sx, sy, sz) {
    const mesh = shape(parent, new THREE.SphereGeometry(1, 20, 14), surface, x, y, z);
    mesh.scale.set(sx, sy, sz);
    return mesh;
  }

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.56;
  root.add(bodyGroup);
  sphere(bodyGroup, shirt, 0, 0.17, 0, 0.225, 0.28, 0.159);
  sphere(bodyGroup, skin, 0, 0.40, 0, 0.09, 0.10, 0.08);
  const head = new THREE.Group();
  head.position.set(0, 0.61, 0.013);
  bodyGroup.add(head);
  sphere(head, skin, 0, 0, 0, 0.28, 0.292, 0.236);
  const hairCap = shape(head, new THREE.SphereGeometry(1, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.59), hair, 0, 0.022, -0.017);
  hairCap.scale.set(0.292, 0.294, 0.247);
  const fringe = sphere(head, hair, -0.05, 0.135, 0.163, 0.245, 0.124, 0.124);
  fringe.rotation.z = -0.13;
  const bob = sphere(head, hair, 0, -0.027, -0.092, 0.295, 0.309, 0.164);
  const bun = sphere(head, hair, 0.098, 0.263, -0.089, 0.11, 0.113, 0.10);
  bob.visible = false;
  bun.visible = false;

  for (const side of [-1, 1]) {
    sphere(head, skin, side * 0.257, -0.044, 0.005, 0.046, 0.064, 0.047);
    sphere(head, pupil, side * 0.096, -0.038, 0.219, 0.025, 0.035, 0.017);
    sphere(head, blush, side * 0.145, -0.105, 0.195, 0.042, 0.023, 0.013);
  }
  sphere(head, skin, 0, -0.088, 0.235, 0.026, 0.021, 0.024);
  sphere(head, pupil, 0, -0.141, 0.199, 0.021, 0.01, 0.01);
  const framedGlasses = new THREE.Group();
  const headphones = new THREE.Group();
  head.add(framedGlasses, headphones);
  for (const side of [-1, 1]) {
    shape(framedGlasses, new THREE.TorusGeometry(0.053, 0.008, 7, 21), glassesMaterial, side * 0.096, -0.04, 0.244);
    sphere(headphones, headphoneMaterial, side * 0.281, -0.038, 0.014, 0.046, 0.083, 0.066);
  }
  shape(framedGlasses, new THREE.BoxGeometry(0.09, 0.009, 0.01), glassesMaterial, 0, -0.033, 0.25);
  shape(headphones, new THREE.TorusGeometry(0.287, 0.022, 8, 26, Math.PI), headphoneMaterial, 0, -0.028, 0.008);
  framedGlasses.visible = false;
  headphones.visible = false;

  const arms = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.196, 0.32, 0.0);
    pivot.rotation.z = side * 0.13;
    bodyGroup.add(pivot);
    sphere(pivot, shirt, side * 0.011, -0.111, 0, 0.065, 0.147, 0.07);
    sphere(pivot, skin, side * 0.015, -0.236, 0.006, 0.049, 0.058, 0.047);
    return pivot;
  });
  const legs = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.091, 0.583, 0);
    root.add(pivot);
    sphere(pivot, pants, 0, -0.227, 0, 0.077, 0.26, 0.077);
    sphere(pivot, boots, 0, -0.514, 0.043, 0.085, 0.063, 0.115);
    return pivot;
  });
  const tag = document.createElement("span");
  tag.className = "scene-name name-3d";
  view.append(tag);
  return { root, bodyGroup, shirt, hair, bob, bun, framedGlasses, headphones, arms, legs, tag, cycle: 0, facing: 0 };
}

function paint(actor, appearance, name) {
  actor.shirt.color.setHex(outfitColors[appearance.avatar] ?? outfitColors.gold);
  actor.hair.color.setHex(hairColors[appearance.hair] ?? hairColors.dark);
  actor.bob.visible = appearance.hairStyle === "bob";
  actor.bun.visible = appearance.hairStyle === "bun";
  actor.framedGlasses.visible = appearance.glasses === true || appearance.glasses === "true";
  actor.headphones.visible = appearance.headphones === true || appearance.headphones === "true";
  actor.tag.textContent = name;
}

function readAvatar() {
  paint(player, sourceAvatar.dataset, sourceName.textContent);
}

function dispose(group) {
  const cached = new Set();
  group.traverse(({ geometry, material }) => {
    for (const resource of [geometry, ...[material].flat()]) {
      if (!resource || cached.has(resource)) continue;
      cached.add(resource);
      if (resource.map && !cached.has(resource.map)) {
        cached.add(resource.map);
        resource.map.dispose();
      }
      resource.dispose();
    }
  });
}

function adaptScene() {
  const changed = currentRoom !== body.dataset.sceneRoom;
  const active = body.dataset.roomPhase === "active";
  if (changed) {
    if (library) { world.remove(library.group); dispose(library.group); }
    currentRoom = body.dataset.sceneRoom;
    library = createLibrary(THREE, currentRoom);
    world.add(library.group);
    nav = globalThis.StudyKakiWalk.create({ bounds: library.bounds, obstacles: library.obstacles, radius, cell: 0.3 });
  }
  if (changed || active !== roomActive) {
    waypoints = [];
    wantedSeat = null;
    sittingAt = null;
    keys.clear();
    rally.visible = false;
    const spawn = nav.nearest(library.spawn) || library.spawn;
    player.root.position.set(spawn.x, 0, spawn.z);
    player.facing = 0.56;
    lastPayload = "";
  }
  roomActive = active;
  sceneTools.hidden = !active;
  if (!active) clearPeers();
  resize();
}

function resize() {
  const width = view.clientWidth;
  const height = view.clientHeight;
  if (!width || !height) return;
  const aspect = width / height;
  const portrait = aspect < 0.78;
  const targetX = roomActive ? (portrait ? 1.4 : -0.4) : library.spawn.x - (portrait ? 0.2 : 2.4);
  const targetZ = roomActive ? (portrait ? 0.1 : 0) : library.spawn.z - 1.45;
  camera.position.set(12 + targetX, 17, 16 + targetZ);
  camera.lookAt(targetX, 0.25, targetZ);
  const half = roomActive ? (portrait ? 12.3 : Math.max(8.75, 12.7 / aspect)) : (portrait ? 6.4 : 5.4);
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function pointerDown(event) {
  if (!roomActive || !event.isPrimary || event.button !== 0) return;
  floorTarget = { x: event.clientX, y: event.clientY };
}

function pointerUp(event) {
  if (!floorTarget || !roomActive) return;
  const previous = floorTarget;
  floorTarget = null;
  if (Math.hypot(previous.x - event.clientX, previous.y - event.clientY) > 14) return;
  const box = renderer.domElement.getBoundingClientRect();
  const position = new THREE.Vector2(
    ((event.clientX - box.left) / box.width) * 2 - 1,
    1 - ((event.clientY - box.top) / box.height) * 2,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(position, camera);
  const seat = library.seats
    .map(candidate => ({ candidate, distance: ray.ray.distanceToPoint(new THREE.Vector3(candidate.x, candidate.y ?? 0.44, candidate.z)) }))
    .filter(({ distance }) => distance < 0.3)
    .sort((first, second) => first.distance - second.distance)[0]?.candidate;
  if (seat) {
    if (sittingAt?.id === seat.id) { stand(); return; }
    walkTo(seat.approach, seat);
    return;
  }
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = ray.ray.intersectPlane(ground, new THREE.Vector3());
  if (!hit) return;
  const { minX, maxX, minZ, maxZ } = library.bounds;
  if (hit.x < minX || hit.x > maxX || hit.z < minZ || hit.z > maxZ) return;
  walkTo(hit);
}

function stand() {
  if (!sittingAt) return;
  const approach = nav.nearest(sittingAt.approach);
  if (approach) player.root.position.set(approach.x, 0, approach.z);
  sittingAt = null;
}

function walkTo(destination, seat = null) {
  stand();
  keys.clear();
  const start = player.root.position;
  waypoints = nav.findPath({ x: start.x, z: start.z }, { x: destination.x, z: destination.z });
  wantedSeat = seat;
  const endpoint = waypoints.at(-1);
  if (endpoint) {
    rally.position.set(endpoint.x, 0.018, endpoint.z);
    rally.visible = true;
  } else if (!seat) status.textContent = "No clear path to that point.";
}

function keyEvent(event, down) {
  const key = event.key.toLowerCase();
  if (!walkKeys.has(key)) return;
  if (!down) { keys.delete(key); return; }
  if (!roomActive || event.altKey || event.metaKey || event.ctrlKey ||
      document.querySelector("dialog[open]") ||
      event.target.closest?.("input, select, textarea, button, [contenteditable]")) return;
  event.preventDefault();
  if (!keys.size) {
    stand();
    waypoints = [];
    wantedSeat = null;
    rally.visible = false;
  }
  keys.add(key);
}

function direction() {
  const has = (one, two) => Number(keys.has(one) || keys.has(two));
  const side = has("d", "arrowright") - has("a", "arrowleft");
  const front = has("s", "arrowdown") - has("w", "arrowup");
  if (!side && !front) return null;
  const x = side * 0.8 + front * 0.6;
  const z = -side * 0.6 + front * 0.8;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

function walkFrame(dt) {
  if (!roomActive) return false;
  const here = player.root.position;
  const manual = direction();
  const next = waypoints[0];
  if (!manual && next && Math.hypot(next.x - here.x, next.z - here.z) < 0.047) waypoints.shift();
  const target = manual ? null : waypoints[0];
  if (!manual && !target) {
    rally.visible = false;
    if (wantedSeat) {
      if (Math.hypot(here.x - wantedSeat.approach.x, here.z - wantedSeat.approach.z) <= 0.6) {
        here.set(wantedSeat.x, 0, wantedSeat.z);
        player.facing = wantedSeat.angle ?? 0;
        sittingAt = wantedSeat;
        status.textContent = `Seated at ${sittingAt.label || "the desk"}.`;
      } else status.textContent = "No clear path to that chair.";
      wantedSeat = null;
    }
    return false;
  }
  const length = manual ? 1 : Math.hypot(target.x - here.x, target.z - here.z);
  const vector = manual || { x: (target.x - here.x) / length, z: (target.z - here.z) / length };
  const step = Math.min(speed * dt, manual ? Infinity : length);
  const moved = nav.move({ x: here.x, z: here.z }, { x: vector.x * step, z: vector.z * step });
  const traveled = Math.hypot(moved.x - here.x, moved.z - here.z);
  here.set(moved.x, 0, moved.z);
  if (traveled > 0.001) player.facing = Math.atan2(vector.x, vector.z);
  if (target && !traveled && step > 0.004) {
    waypoints = [];
    wantedSeat = null;
  }
  return traveled > 0.001;
}

function turn(current, goal, t) {
  const angle = Math.atan2(Math.sin(goal - current), Math.cos(goal - current));
  return current + angle * t;
}

function animate(actor, walking, sitting, dt) {
  const ease = 1 - Math.exp(-17 * dt);
  actor.cycle += walking ? 9 * dt : 0;
  const stride = walking ? Math.sin(actor.cycle) : 0;
  const y = sitting ? -0.145 : walking ? Math.abs(Math.sin(actor.cycle)) * 0.038 : 0;
  actor.bodyGroup.position.y += (0.56 + y - actor.bodyGroup.position.y) * ease;
  actor.root.rotation.y = turn(actor.root.rotation.y, actor.facing, ease);
  actor.legs.forEach((leg, index) => {
    const sign = index ? -1 : 1;
    const rotation = sitting ? -1.15 : stride * sign * 0.65;
    leg.rotation.x += (rotation - leg.rotation.x) * ease;
    leg.position.y += ((sitting ? 0.445 : 0.583) - leg.position.y) * ease;
    actor.arms[index].rotation.x += (((sitting ? -0.22 : -stride * sign * 0.57)) - actor.arms[index].rotation.x) * ease;
  });
}

function clearPeers() {
  for (const actor of players.values()) {
    world.remove(actor.root);
    actor.tag.remove();
    dispose(actor.root);
  }
  players.clear();
}

function updatePeers(event) {
  if (!roomActive) return;
  const peers = event.detail;
  const keep = new Set();
  for (const peer of peers.slice(0, 5)) {
    if (!peer.position) continue;
    keep.add(peer.id);
    let actor = players.get(peer.id);
    if (!actor) {
      actor = makeCharacter();
      actor.root.position.set(peer.position.x, 0, peer.position.z);
      players.set(peer.id, actor);
      world.add(actor.root);
    }
    actor.state = peer.position;
    paint(actor, peer, peer.name);
  }
  for (const [id, actor] of players) {
    if (keep.has(id)) continue;
    world.remove(actor.root);
    actor.tag.remove();
    dispose(actor.root);
    players.delete(id);
  }
}

const screen = () => new THREE.Vector3();
let marker;
function positionTag(actor, seat) {
  marker ??= screen();
  marker.copy(actor.root.position);
  marker.y += seat ? 1.57 : 1.77;
  marker.project(camera);
  const hide = marker.x < -1 || marker.x > 1 || marker.y < -1 || marker.y > 1;
  actor.tag.hidden = hide;
  if (!hide) {
    const x = (marker.x + 1) * view.clientWidth / 2;
    const y = (1 - marker.y) * view.clientHeight / 2;
    actor.tag.style.translate = `${x}px ${y}px`;
  }
}

function publishPosition(time, walking) {
  if (!roomActive || time - lastReport < 100) return;
  const { x, z } = player.root.position;
  const payload = {
    x: Math.round(x * 100) / 100,
    z: Math.round(z * 100) / 100,
    facing: player.facing,
    walking,
    sitting: Boolean(sittingAt),
  };
  const encoded = JSON.stringify(payload);
  if (lastPayload === encoded && time - lastReport < 1500) return;
  lastReport = time;
  lastPayload = encoded;
  window.dispatchEvent(new CustomEvent("studykaki:position", { detail: payload }));
}

function frame(time) {
  if (!library) return;
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.035);
  lastTime = time;
  if (body.dataset.sceneRender !== "3d" || document.hidden) return;
  const walking = walkFrame(dt);
  animate(player, walking, Boolean(sittingAt), dt);
  for (const actor of players.values()) {
    const state = actor.state;
    const follower = 1 - Math.exp(-11 * dt);
    actor.root.position.x += (state.x - actor.root.position.x) * follower;
    actor.root.position.z += (state.z - actor.root.position.z) * follower;
    actor.facing = state.facing;
    animate(actor, state.walking, state.sitting, dt);
    positionTag(actor, state.sitting);
  }
  positionTag(player, Boolean(sittingAt));
  publishPosition(time, walking);
  renderer.render(world, camera);
}

init();
