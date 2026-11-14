// The room uses metres. Desks are 0.74 m tall and chairs are 0.45 m at the seat.
export function createLibrary(THREE, roomMode = "quiet") {
  const group = new THREE.Group();
  const bounds = { minX: -10.82, maxX: 10.82, minZ: -7.82, maxZ: 7.82 };
  const obstacles = [];
  const seats = [];
  const points = {};
  const pieces = [];
  const walls = {};
  const materials = new Map();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  let randomSeed = 16;

  const palette = {
    ivory: 0xe8d7bd, cream: 0xf3e0bd, sand: 0xd7ae86,
    walnut: 0x795139, oak: 0xa66a43, maple: 0xc38957,
    olive: 0x808957, oliveDark: 0x606344, gold: 0xa86c34,
    brick: 0xa95442, apricot: 0xd89668, leather: 0xca7658,
  };

  function random() {
    randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
    return randomSeed / 4294967296;
  }

  function finish(color, roughness = .81) {
    const key = `${color}/${roughness}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
    }
    return materials.get(key);
  }

  function mesh(geometry, material, x, y, z) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    group.add(item);
    return item;
  }

  function box(x, y, z, width, height, depth, color) {
    const tile = new THREE.Object3D();
    tile.position.set(x, y, z);
    tile.scale.set(width, height, depth);
    tile.color = color;
    tile.castShadow = true;
    pieces.push(tile);
    return tile;
  }

  function cylinder(x, y, z, top, bottom, height, color, segments = 20) {
    return mesh(new THREE.CylinderGeometry(top, bottom, height, segments), finish(color), x, y, z);
  }

  function ellipsoid(x, y, z, width, height, depth, color) {
    const item = mesh(new THREE.SphereGeometry(1, 12, 8), finish(color), x, y, z);
    item.scale.set(width, height, depth);
    return item;
  }

  function obstacle(x, z, width, depth) {
    obstacles.push({
      minX: x - width / 2, maxX: x + width / 2,
      minZ: z - depth / 2, maxZ: z + depth / 2,
    });
  }

  function batchBoxes(records, shadows = true) {
    if (!records.length) return;
    const tiles = new THREE.InstancedMesh(unitBox, finish(0xffffff), records.length);
    const transform = new THREE.Object3D();
    for (const [index, [x, y, z, width, height, depth, color]] of records.entries()) {
      transform.position.set(x, y, z);
      transform.scale.set(width, height, depth);
      transform.updateMatrix();
      tiles.setMatrixAt(index, transform.matrix);
      tiles.setColorAt(index, new THREE.Color(color));
    }
    tiles.castShadow = shadows;
    tiles.receiveShadow = true;
    group.add(tiles);
  }

  function assemblePieces(source = pieces, target = group) {
    for (const shadows of [true, false]) {
      const batch = source.filter(piece => piece.castShadow === shadows);
      if (!batch.length) continue;
      const items = new THREE.InstancedMesh(unitBox, finish(0xffffff), batch.length);
      for (const [index, piece] of batch.entries()) {
        piece.updateMatrix();
        items.setMatrixAt(index, piece.matrix);
        items.setColorAt(index, new THREE.Color(piece.color));
      }
      items.castShadow = shadows;
      items.receiveShadow = true;
      target.add(items);
    }
  }

  function floor() {
    box(0, -.24, 0, 22, .48, 16, 0xab7751);
    const ground = mesh(
      new THREE.PlaneGeometry(22, 16), finish(0xb77d53), 0, .002, 0,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;
    const boards = [];
    const grains = [];
    const wood = [0xc58a60, 0xbb8054, 0xc18a62, 0xca9266, 0xae7551, 0xbd845a, 0xb77c50];
    for (let row = 0; row < 47; row += 1) {
      const z = -8 + (row + .5) * 16 / 47;
      let edge = -11;
      let length = 1.1 + random() * 2;
      while (edge < 11) {
        const plank = Math.min(length, 11 - edge);
        if (plank < .016) break;
        const color = wood[Math.floor(random() * wood.length)];
        boards.push([edge + plank / 2, .006, z, plank - .013, .008, .333, color]);
        if (plank > 1) {
          const tint = new THREE.Color(color).multiplyScalar(.93);
          grains.push([edge + plank * .55, .0105, z + (random() - .5) * .23,
            plank * .56, .001, .009, tint]);
        }
        edge += plank;
        length = 2.4 + random() * 2.4;
      }
    }
    batchBoxes(boards, false);
    batchBoxes(grains, false);
    box(0, .006, 7.95, 22, .012, .10, palette.walnut);
    box(10.95, .006, 0, .10, .012, 16, palette.walnut);
    return ground;
  }

  function landscape() {
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 440;
    const context = canvas.getContext("2d");
    const sky = context.createLinearGradient(0, 0, 0, 440);
    sky.addColorStop(0, "#aaad9e");
    sky.addColorStop(.44, "#e5b29c");
    sky.addColorStop(.83, "#ffdb9c");
    sky.addColorStop(1, "#eee0a9");
    context.fillStyle = sky;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "#ffe0a9";
    context.beginPath();
    context.arc(1450, 165, 44, 0, Math.PI * 2);
    context.fill();
    for (let stripe = 0; stripe < 29; stripe += 1) {
      context.fillStyle = stripe % 2 ? "#f5c9b133" : "#ffe2b42b";
      context.beginPath();
      context.ellipse(random() * 1920, 140 + random() * 116, 20 + random() * 150,
        1 + random() * 6, -.03, 0, Math.PI * 2);
      context.fill();
    }

    for (const [layer, [color, line, size]] of [
      ["#b4a879", 350, 64], ["#909368", 385, 72], ["#657955", 423, 67],
    ].entries()) {
      context.fillStyle = color;
      context.fillRect(0, line, 1920, 440 - line);
      for (let tree = 0; tree < 85; tree += 1) {
        const x = 1920 * tree / 84;
        context.beginPath();
        context.ellipse(x, line - 9 - random() * 32, 10 + random() * 53,
          11 + random() * size + layer * 5, 0, 0, Math.PI * 2);
        context.fill();
      }
    }

    function palm(x, height, lean, color) {
      const base = 448;
      const top = base - height;
      context.lineCap = "round";
      context.strokeStyle = color;
      context.lineWidth = Math.max(5, height / 28);
      context.beginPath();
      context.moveTo(x, base);
      context.quadraticCurveTo(x - lean * .15, top + height * .53, x + lean, top);
      context.stroke();
      context.fillStyle = color;
      for (let branch = 0; branch < 15; branch += 1) {
        const direction = -Math.PI * .97 + branch * .2;
        const length = height * (.24 + random() * .17);
        const tipX = x + lean + Math.cos(direction) * length;
        const tipY = top + Math.sin(direction) * length * .71 + 19;
        context.beginPath();
        context.moveTo(x + lean, top + 5);
        context.quadraticCurveTo((tipX + x + lean) / 2, (top + tipY) / 2 - 24, tipX, tipY);
        context.quadraticCurveTo((tipX + x + lean) / 2, (top + tipY) / 2 - 4, x + lean, top + 5);
        context.fill();
      }
    }

    palm(175, 255, 44, "#5c7251");
    palm(542, 146, -32, "#758362");
    palm(931, 170, 24, "#637454");
    palm(1572, 226, -32, "#63785a");
    palm(1782, 280, 25, "#576c50");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function shell() {
    const westX = -10.95;
    const backZ = -7.94;
    walls.west = new THREE.Group();
    walls.north = new THREE.Group();
    group.add(walls.west, walls.north);
    const westStart = pieces.length;
    box(westX, 1.32, 0, .2, 2.64, 16, palette.ivory);
    box(westX + .11, .105, 0, .075, .21, 15.95, palette.walnut);
    box(westX, 2.68, 0, .24, .1, 16.03, palette.cream);
    assemblePieces(pieces.splice(westStart), walls.west);
    const northStart = pieces.length;
    box(0, .27, backZ, 22, .54, .2, palette.ivory);
    box(0, .515, backZ + .03, 22, .09, .27, palette.maple);
    box(0, 3.45, backZ, 22, .15, .23, palette.cream);
    const window = mesh(
      new THREE.PlaneGeometry(21.8, 3.0),
      new THREE.MeshBasicMaterial({ map: landscape() }), 0, 1.95, backZ - .055,
    );
    window.castShadow = false;
    walls.north.add(window);

    for (let bay = 0; bay <= 9; bay += 1) {
      const x = -10.90 + bay * 21.8 / 9;
      const major = bay % 3 === 0;
      box(x, 1.99, backZ + .025, major ? .24 : .065, 2.97, major ? .29 : .10,
        major ? palette.ivory : 0x684e3a);
    }
    box(0, 1.12, backZ + .036, 21.6, .054, .105, 0x684e3a);
    box(0, 3.33, backZ + .036, 21.6, .055, .112, 0x684e3a);
    assemblePieces(pieces.splice(northStart), walls.north);
  }

  function bookshelf(z, width) {
    const x = -10.48;
    const frame = palette.walnut;
    const colors = [
      0x9e5140, 0xcea268, 0xad8057, 0xc0855d, 0xa4a171,
      0x5d785b, 0xe2c982, 0x7a5847, 0x687a78, 0xd3b18b,
    ];
    box(x - .29, 1.08, z, .08, 2.16, width, 0x74503b);
    box(x, .10, z, .69, .20, width, frame);
    box(x, 2.17, z, .72, .10, width + .075, palette.maple);
    for (const end of [-1, 1]) {
      box(x, 1.12, z + end * width / 2, .69, 2.07, .09, frame);
    }
    if (width > 4) box(x, 1.12, z, .67, 2.07, .09, frame);

    const books = [];
    for (let shelf = 0; shelf < 4; shelf += 1) {
      const y = .24 + shelf * .49;
      box(x, y, z, .69, .072, width, palette.maple);
      let edge = z - width / 2 + .135;
      const end = z + width / 2 - .13;
      while (edge < end - .08) {
        const height = .20 + random() * .19;
        const thickness = Math.min(.047 + random() * .09, end - edge);
        const bookX = x - .04 + random() * .055;
        const color = colors[Math.floor(random() * colors.length)];
        books.push([bookX, y + .039 + height / 2, edge + thickness / 2,
          .37, height, thickness - .008, color]);
        if (thickness > .065) {
          books.push([bookX + .188, y + .10, edge + thickness / 2,
            .004, .022, thickness * .60, palette.cream]);
        }
        edge += thickness + .008 + (random() > .92 ? .16 : 0);
      }
    }
    batchBoxes(books);
    obstacle(x, z, .76, width + .11);
  }

  function plant(x, z, scale = 1) {
    const pot = cylinder(x, .21 * scale, z, .35 * scale, .27 * scale, .42 * scale, 0xc18e69);
    pot.userData.decor = true;
    cylinder(x, .425 * scale, z, .30 * scale, .30 * scale, .032 * scale, 0x75523a);
    for (let i = 0; i < 9; i += 1) {
      const angle = i * 2.4;
      const y = (.62 + random() * .63) * scale;
      const reach = (.21 + random() * .25) * scale;
      const leaf = ellipsoid(x + Math.cos(angle) * reach, y, z + Math.sin(angle) * reach,
        (.22 + random() * .10) * scale, (.075 + random() * .042) * scale,
        (.11 + random() * .05) * scale, i % 2 ? 0x566d43 : 0x74865a);
      leaf.rotation.set(0, -angle, .20 + random() * .40);
    }
    obstacle(x, z, .65 * scale, .65 * scale);
  }

  function lamp(x, z, tabletop) {
    cylinder(x, tabletop + .019, z, .138, .149, .038, palette.gold, 20);
    cylinder(x, tabletop + .19, z, .019, .024, .34, 0xb28249, 10);
    const shade = mesh(new THREE.SphereGeometry(.205, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      finish(0xe8b675, .52), x, tabletop + .37, z);
    shade.scale.y = .67;
    const light = mesh(new THREE.CylinderGeometry(.192, .192, .025, 18),
      new THREE.MeshStandardMaterial({ color: 0xffdf9d, emissive: 0xffb859, emissiveIntensity: .36 }),
      x, tabletop + .363, z);
    light.castShadow = false;
  }

  function notebook(x, z, y, tint, angle) {
    box(x, y + .019, z, .31, .033, .22, 0xe2ccaa).rotation.y = angle;
    box(x, y + .039, z, .33, .013, .225, tint).rotation.y = angle;
    box(x - .19, y + .017, z + .021, .02, .017, .18, palette.walnut).rotation.y = angle + .24;
  }

  function chair(x, z, look, id, label, shade = palette.olive) {
    const angle = look > 0 ? 0 : Math.PI;
    box(x, .446, z, .47, .082, .44, shade);
    box(x, .397, z, .49, .042, .455, palette.walnut);
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) box(x + a * .18, .19, z + b * .16, .049, .37, .049, palette.walnut);
      box(x + a * .17, .63, z - look * .174, .049, .40, .049, palette.walnut);
    }
    const back = box(x, .80, z - look * .187, .49, .26, .091, shade);
    back.rotation.x = look * .105;
    obstacle(x, z, .51, .51);
    seats.push({ id, x, y: .49, z, angle, label, approach: { x, z: z - look * .66 } });
  }

  function desk(x, z, width, count, family, label, depths = 1.12, hostSideOnly = false) {
    const top = .74;
    box(x, top - .05, z, width, .10, depths, palette.maple);
    box(x, top - .10, z, width - .08, .035, depths - .065, palette.walnut);
    for (const end of [-1, 1]) {
      box(x + end * (width / 2 - .15), .33, z, .115, .66, depths - .22, palette.oak);
    }
    obstacle(x, z, width, depths);
    const spacing = width / count;
    const sitters = hostSideOnly ? [-1] : [-1, 1];
    for (const side of sitters) {
      for (let position = 0; position < count; position += 1) {
        const offset = (position - (count - 1) / 2) * spacing;
        const number = (side > 0 ? count : 0) + position + 1;
        chair(x + offset, z + side * (depths / 2 + .29), -side,
          `${family}-${number}`, `${label} ${number}`);
        if (position % 2 || hostSideOnly) {
          notebook(x + offset + side * .08, z + side * depths * .29,
            top, side < 0 ? palette.brick : palette.oliveDark, .06 + side * .08);
        }
      }
    }
    lamp(x - width * .30, z, top);
    lamp(x + width * .30, z, top);
  }

  function rug(x, z, width, depth, color, ellipse = false) {
    const outer = ellipse
      ? cylinder(x, .013, z, 1, 1, .012, color, 64)
      : box(x, .014, z, width, .016, depth, color);
    const trim = ellipse
      ? cylinder(x, .019, z, 1, 1, .006, palette.apricot, 64)
      : box(x, .02, z, width - .16, .006, depth - .16, palette.apricot);
    const inner = ellipse
      ? cylinder(x, .023, z, 1, 1, .003, color, 64)
      : box(x, .024, z, width - .23, .004, depth - .23, color);
    if (ellipse) {
      outer.scale.set(width / 2, 1, depth / 2);
      trim.scale.set((width - .16) / 2, 1, (depth - .16) / 2);
      inner.scale.set((width - .23) / 2, 1, (depth - .23) / 2);
    }
    for (const layer of [outer, trim, inner]) layer.castShadow = false;
  }

  function couch(x, z, width, family, label, color = palette.olive) {
    const n = Math.floor(width / .74);
    const spacing = (width - .34) / n;
    box(x, .23, z, width, .36, .76, palette.walnut);
    box(x, .69, z - .33, width, .64, .20, color);
    for (const side of [-1, 1]) {
      box(x + side * (width / 2 - .08), .53, z, .18, .29, .79, palette.walnut);
    }
    for (let i = 0; i < n; i += 1) {
      const xx = x + spacing * (i - (n - 1) / 2);
      box(xx, .445, z + .035, spacing - .025, .115, .64, color);
      if (i === 0 || i === n - 1) {
        box(xx + (i === 0 ? -.12 : .12), .66, z - .16, .29, .30, .12,
          i === 0 ? palette.apricot : palette.cream).rotation.z = i === 0 ? .24 : -.17;
      }
      seats.push({
        id: `${family}-${i + 1}`, x: xx, y: .485, z: z + .07, angle: 0,
        label: `${label} ${i + 1}`, approach: { x: xx, z: z + .85 },
      });
    }
    obstacle(x, z, width, .88);
  }

  function coffeeTable(x, z) {
    cylinder(x, .18, z, .085, .20, .36, palette.walnut);
    cylinder(x, .40, z, .44, .44, .08, palette.maple);
    notebook(x - .16, z + .06, .441, palette.oliveDark, -.11);
    cylinder(x + .18, .48, z - .08, .064, .049, .085, palette.cream, 15);
    cylinder(x + .18, .523, z - .08, .054, .054, .006, palette.walnut, 15);
    obstacle(x, z, .78, .78);
  }

  function cafe() {
    rug(-2.9, .6, 10.8, 8.0, 0xb46956, true);
    couch(-4.35, -3.22, 3.8, "lounge", "왼쪽 소파", palette.leather);
    couch(2.45, -3.27, 3.8, "lounge-east", "오른쪽 소파", palette.oliveDark);
    coffeeTable(-4.35, -1.60);
    coffeeTable(2.45, -1.60);
    desk(-4.10, 2.37, 3.45, 2, "cafe", "왼쪽 카페 테이블", 1.03);
    desk(3.45, 2.37, 3.45, 2, "cafe-east", "오른쪽 카페 테이블", 1.03);
    couch(4.80, -7.15, 4.3, "window", "창가 좌석");
    points.window = { x: 4.80, z: -6.20 };
    points.table = { x: -4.1, z: 3.86 };
  }

  function reading() {
    rug(-2.40, .25, 11.8, 12.1, roomMode === "module" ? 0x687a67 : palette.brick);
    const studyTables = roomMode === "module" ? [
      [-4.9, -3.13, 4.75, 3], [2.9, .68, 4.65, 3], [-4.9, 3.67, 4.75, 3],
    ] : [
      [-3.98, -3.28, 5.9, 4], [-3.34, .16, 6.9, 5], [-2.26, 3.62, 7.1, 5],
    ];
    studyTables.forEach(([x, z, width, count], index) => {
      desk(x, z, width, count, `desk-${index + 1}`, `${index + 1}번 테이블 좌석`);
    });
    points.table = { x: 1.9, z: 4.85 };
    couch(4.9, -7.15, 4.7, "window", "창가 좌석");
    points.window = { x: 4.9, z: -6.20 };
    if (roomMode === "module") {
      box(7.65, 1.40, -7.25, 2.60, 1.10, .10, palette.walnut);
      box(7.65, 1.40, -7.19, 2.50, 1.00, .036, 0xeee6d0);
      box(7.65, .83, -7.12, 2.61, .065, .28, palette.oak);
      box(7.65, .42, -7.25, 2.65, .84, .36, palette.walnut);
      obstacle(7.65, -7.25, 2.65, .39);
    } else {
      desk(6.8, -3.72, 3.1, 2, "carrel", "창가 책상 좌석", .92, true);
    }
  }

  const ground = floor();
  shell();
  bookshelf(-4.3, 5.0);
  bookshelf(1.35, 5.2);
  bookshelf(5.7, 2.2);
  plant(-9.35, -7.06, 1.30);
  plant(-8.78, 6.50, 1.04);
  plant(9.50, -6.95, 1.15);
  plant(9.52, 4.90, .94);
  if (roomMode === "break") cafe();
  else reading();
  rug(6.45, 6.17, 4.05, 2.30, 0x7b6d51, true);
  points.rug = { x: 6.45, z: 6.12 };
  assemblePieces();

  return { group, ground, walls, obstacles, seats, bounds, points, spawn: { x: 6.45, z: 6.12 } };
}
