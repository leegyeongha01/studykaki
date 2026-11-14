(() => {
  "use strict";

  const EPSILON = 1e-6;
  const MAX_CELLS = 24_000;
  const MAX_OBSTACLES = 128;
  const DIRECTIONS = [
    [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];

  function finitePoint(point) {
    return Number.isFinite(point?.x) && Number.isFinite(point?.z);
  }

  function validRect(rect) {
    return Number.isFinite(rect?.minX) && Number.isFinite(rect?.maxX) &&
      Number.isFinite(rect?.minZ) && Number.isFinite(rect?.maxZ) &&
      rect.minX < rect.maxX && rect.minZ < rect.maxZ;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function distance(first, second) {
    return Math.hypot(first.x - second.x, first.z - second.z);
  }

  function rectangleVisit(start, delta, rect) {
    let enter = 0;
    let exit = 1;
    for (const [coordinate, change, minimum, maximum] of [
      [start.x, delta.x, rect.minX, rect.maxX],
      [start.z, delta.z, rect.minZ, rect.maxZ],
    ]) {
      if (Math.abs(change) < EPSILON) {
        if (coordinate <= minimum || coordinate >= maximum) return 1;
        continue;
      }
      const first = (minimum - coordinate) / change;
      const last = (maximum - coordinate) / change;
      enter = Math.max(enter, Math.min(first, last));
      exit = Math.min(exit, Math.max(first, last));
      if (enter >= exit) return 1;
    }
    return enter;
  }

  class Frontier {
    constructor() {
      this.nodes = [];
    }

    add(node) {
      const nodes = this.nodes;
      let index = nodes.length;
      nodes.push(node);
      while (index) {
        const parent = (index - 1) >>> 1;
        if (nodes[parent].priority <= node.priority) break;
        nodes[index] = nodes[parent];
        index = parent;
      }
      nodes[index] = node;
    }

    remove() {
      const nodes = this.nodes;
      const best = nodes[0];
      const last = nodes.pop();
      if (!nodes.length) return best;
      let index = 0;
      while (index * 2 + 1 < nodes.length) {
        let child = index * 2 + 1;
        if (child + 1 < nodes.length && nodes[child + 1].priority < nodes[child].priority) child += 1;
        if (last.priority <= nodes[child].priority) break;
        nodes[index] = nodes[child];
        index = child;
      }
      nodes[index] = last;
      return best;
    }
  }

  function create({ bounds, obstacles = [], radius = 0.24, cell = 0.35 } = {}) {
    if (!validRect(bounds) || !Number.isFinite(radius) || radius < 0 ||
        !Number.isFinite(cell) || cell <= 0 || !Array.isArray(obstacles) ||
        obstacles.length > MAX_OBSTACLES || obstacles.some((rect) => !validRect(rect))) {
      throw new RangeError("Invalid walking map.");
    }
    const arena = {
      minX: bounds.minX + radius,
      maxX: bounds.maxX - radius,
      minZ: bounds.minZ + radius,
      maxZ: bounds.maxZ - radius,
    };
    if (!validRect(arena)) throw new RangeError("The avatar is larger than the walking map.");
    const blockers = obstacles.map((rect) => ({
      minX: rect.minX - radius,
      maxX: rect.maxX + radius,
      minZ: rect.minZ - radius,
      maxZ: rect.maxZ + radius,
    }));
    const spanX = arena.maxX - arena.minX;
    const spanZ = arena.maxZ - arena.minZ;
    const columns = Math.ceil(spanX / cell) + 1;
    const rows = Math.ceil(spanZ / cell) + 1;
    const size = columns * rows;
    if (!Number.isFinite(size) || size > MAX_CELLS) throw new RangeError("Walking grid is too dense.");
    const strideX = spanX / (columns - 1);
    const strideZ = spanZ / (rows - 1);

    function within(point) {
      return {
        x: clamp(point.x, arena.minX, arena.maxX),
        z: clamp(point.z, arena.minZ, arena.maxZ),
      };
    }

    function isFree(point) {
      if (!finitePoint(point) || point.x < arena.minX || point.x > arena.maxX ||
          point.z < arena.minZ || point.z > arena.maxZ) return false;
      return !blockers.some((rect) => point.x > rect.minX && point.x < rect.maxX &&
        point.z > rect.minZ && point.z < rect.maxZ);
    }

    function fractionToCollision(start, goal) {
      const delta = { x: goal.x - start.x, z: goal.z - start.z };
      let fraction = 1;
      for (const blocker of blockers) {
        fraction = Math.min(fraction, rectangleVisit(start, delta, blocker));
        if (fraction === 0) break;
      }
      return fraction;
    }

    function canTravel(start, goal) {
      return isFree(start) && isFree(goal) && fractionToCollision(start, goal) === 1;
    }

    function advance(start, goal) {
      const fraction = fractionToCollision(start, goal);
      if (fraction === 1) return goal;
      if (fraction === 0) return start;
      const backoff = Math.min(fraction, EPSILON / Math.max(EPSILON, distance(start, goal)));
      return within({
        x: start.x + (goal.x - start.x) * (fraction - backoff),
        z: start.z + (goal.z - start.z) * (fraction - backoff),
      });
    }

    function move(start, delta) {
      if (!finitePoint(start)) return null;
      const origin = isFree(start) ? start : nearest(start);
      if (!origin || !finitePoint(delta)) return origin;
      const target = within({ x: origin.x + delta.x, z: origin.z + delta.z });
      const direct = advance(origin, target);
      if (!isFree(direct)) return origin;
      if (direct === target) return direct;
      const byX = advance(direct, { x: target.x, z: direct.z });
      const byZ = advance(direct, { x: direct.x, z: target.z });
      if (!isFree(byX)) return isFree(byZ) ? byZ : direct;
      if (!isFree(byZ)) return byX;
      return distance(byX, target) <= distance(byZ, target) ? byX : byZ;
    }

    const points = Array.from({ length: size }, (_, index) => ({
      x: index % columns === columns - 1 ? arena.maxX : arena.minX + index % columns * strideX,
      z: Math.floor(index / columns) === rows - 1 ? arena.maxZ :
        arena.minZ + Math.floor(index / columns) * strideZ,
    }));
    const free = points.map(isFree);

    function nearest(point) {
      if (!finitePoint(point)) return null;
      const target = within(point);
      if (isFree(target)) return target;
      let best = null;
      let bestDistance = Infinity;
      function consider(candidate) {
        const separation = distance(candidate, target);
        if (separation < bestDistance && isFree(candidate)) {
          best = candidate;
          bestDistance = separation;
        }
      }
      for (const rect of blockers) {
        const x = clamp(target.x, rect.minX, rect.maxX);
        const z = clamp(target.z, rect.minZ, rect.maxZ);
        consider({ x: rect.minX, z });
        consider({ x: rect.maxX, z });
        consider({ x, z: rect.minZ });
        consider({ x, z: rect.maxZ });
      }
      for (let index = 0; index < size; index += 1) {
        if (free[index]) consider(points[index]);
      }
      return best ? { ...best } : null;
    }

    const adjacency = new Array(size);

    function edges(index) {
      if (adjacency[index]) return adjacency[index];
      const column = index % columns;
      const row = Math.floor(index / columns);
      const available = [];
      for (const [dx, dz] of DIRECTIONS) {
        const x = column + dx;
        const z = row + dz;
        if (x < 0 || x >= columns || z < 0 || z >= rows) continue;
        const next = z * columns + x;
        if (!free[next]) continue;
        if (dx && dz && (!free[row * columns + x] || !free[z * columns + column])) continue;
        if (canTravel(points[index], points[next])) {
          available.push([next, Math.hypot(dx * strideX, dz * strideZ)]);
        }
      }
      adjacency[index] = available;
      return available;
    }

    function startCells(origin) {
      const column = Math.round((origin.x - arena.minX) / strideX);
      const row = Math.round((origin.z - arena.minZ) / strideZ);
      const nearby = [];
      for (let z = Math.max(0, row - 2); z <= Math.min(rows - 1, row + 2); z += 1) {
        for (let x = Math.max(0, column - 2); x <= Math.min(columns - 1, column + 2); x += 1) {
          const index = z * columns + x;
          if (free[index] && canTravel(origin, points[index])) nearby.push(index);
        }
      }
      return nearby;
    }

    function compress(origin, route) {
      if (!route.length) return [];
      const waypoints = [];
      let previous = origin;
      let index = 0;
      while (index < route.length) {
        let next = index;
        while (next + 1 < route.length && canTravel(previous, route[next + 1])) next += 1;
        if (distance(previous, route[next]) > EPSILON) {
          previous = route[next];
          waypoints.push({ ...previous });
        }
        index = next + 1;
      }
      return waypoints;
    }

    function findPath(start, goal) {
      if (!isFree(start) || !finitePoint(goal)) return [];
      const target = within(goal);
      if (distance(start, target) <= EPSILON) return [];
      if (canTravel(start, target)) return [target];
      const endpoint = nearest(target);
      if (endpoint && canTravel(start, endpoint)) return [endpoint];
      const destination = endpoint || target;
      const frontier = new Frontier();
      const travelled = new Float64Array(size).fill(Infinity);
      const parent = new Int32Array(size).fill(-1);
      const seen = new Uint8Array(size);
      let bestIndex = -1;
      const immediate = move(start, { x: target.x - start.x, z: target.z - start.z });
      let bestPoint = canTravel(start, immediate) ? immediate : advance(start, target);
      let bestDistance = distance(bestPoint, target);
      for (const index of startCells(start)) {
        const cost = distance(start, points[index]);
        travelled[index] = cost;
        frontier.add({ index, priority: cost + distance(points[index], destination) });
      }

      while (frontier.nodes.length) {
        const { index } = frontier.remove();
        if (seen[index]) continue;
        seen[index] = 1;
        const current = points[index];
        if (endpoint && canTravel(current, endpoint)) {
          bestIndex = index;
          bestPoint = endpoint;
          break;
        }
        if (distance(current, target) < bestDistance + cell) {
          const approach = move(current, { x: target.x - current.x, z: target.z - current.z });
          const fromTarget = distance(approach, target);
          if (fromTarget < bestDistance && canTravel(current, approach)) {
            bestDistance = fromTarget;
            bestIndex = index;
            bestPoint = approach;
          }
        }
        for (const [neighbor, step] of edges(index)) {
          const cost = travelled[index] + step;
          if (seen[neighbor] || cost >= travelled[neighbor]) continue;
          travelled[neighbor] = cost;
          parent[neighbor] = index;
          frontier.add({ index: neighbor, priority: cost + distance(points[neighbor], destination) });
        }
      }

      const route = [];
      for (let index = bestIndex; index !== -1; index = parent[index]) route.push(points[index]);
      route.reverse();
      if (canTravel(route.at(-1) || start, bestPoint)) route.push(bestPoint);
      return compress(start, route);
    }

    return Object.freeze({ findPath, move, nearest, isFree, canTravel });
  }

  window.StudyKakiWalk = Object.freeze({ create });
})();
