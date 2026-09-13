export const SCENES = Object.freeze({
  home: 0,
  picky: 1,
  village: 2,
  focus: 3.8,
  friends: 4.8,
  end: 6,
});

export const LIBRARY_START = 3.30;
export const LIBRARY_EXIT = 4.65;

export const WORLD_ASSETS = Object.freeze({
  libraryDecor: 'assets/world-library-decor.png',
  officeDecor: 'assets/world-office-decor.png',
  gardenDecor: 'assets/world-garden-decor.png',
  carpetTiles: 'assets/world-carpet-tiles.png',
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawCrop(ctx, image, crop, x, y, scale = 1) {
  const [sx, sy, sw, sh] = crop;
  ctx.drawImage(
    image,
    sx,
    sy,
    sw,
    sh,
    Math.round(x),
    Math.round(y),
    Math.round(sw * scale),
    Math.round(sh * scale),
  );
}

function tiledCrop(ctx, image, crop, x, y, width, height, size) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  for (let tileY = y; tileY < y + height; tileY += size) {
    for (let tileX = x; tileX < x + width; tileX += size) {
      ctx.drawImage(image, ...crop, Math.floor(tileX), Math.floor(tileY), size, size);
    }
  }
  ctx.restore();
}

function drawRoadNetwork(ctx, paths) {
  const layers = [
    [18, '#7e9560'],
    [8, '#c5a970'],
    [0, '#e2ca97'],
  ];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [extraWidth, color] of layers) {
    for (const { points, width } of paths) {
      const lineWidth = width + extraWidth;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.fillStyle = color;
      for (const point of points.slice(1, -1)) {
        ctx.beginPath();
        ctx.arc(point[0], point[1], lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function makeProp(footY, draw, region = 'outdoor') {
  return { footY, draw, region };
}

function spriteProp(assets, name, crop, x, y, scale, footOffset = 0, region = 'outdoor') {
  const height = crop[3] * scale;
  return makeProp(
    y + height + footOffset,
    ctx => drawCrop(ctx, assets[name], crop, x, y, scale),
    region,
  );
}

function wholeProp(assets, name, x, y, size, footRatio = 0.93) {
  return makeProp(
    y + size * footRatio,
    ctx => ctx.drawImage(assets[name], Math.round(x), Math.round(y), Math.round(size), Math.round(size)),
  );
}

function samplePolyline(progress, route) {
  const value = clamp(progress, route[0][0], route.at(-1)[0]);
  const exact = route.find(stop => Math.abs(stop[0] - value) < 1e-9);
  if (exact) return { x: exact[1], y: exact[2] };
  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1];
    const to = route[index];
    if (value <= to[0]) {
      if (from[1] === to[1] && from[2] === to[2]) {
        return { x: from[1], y: from[2] };
      }
      const distance = to[0] - from[0];
      const t = distance === 0 ? 1 : (value - from[0]) / distance;
      return {
        x: from[1] + (to[1] - from[1]) * t,
        y: from[2] + (to[2] - from[2]) * t,
      };
    }
  }
  return { x: route.at(-1)[1], y: route.at(-1)[2] };
}

function routeMilestones(mobile) {
  const mainX = mobile ? .68 : .50;
  const carpetX = mobile ? .18 : .56;
  const seatX = mobile ? .38 : .72;
  const seatY = SCENES.focus + (mobile ? .78 : .70);
  return {
    outdoorEntry: mobile
      ? [[0, .38, .79], [.18, .38, .98], [.40, mainX, .98], [1, mainX, 1.72], [LIBRARY_START, mainX, 3.82]]
      : [[0, .24, .62], [.25, .24, 1], [.50, mainX, 1], [1, mainX, 1.67], [LIBRARY_START, mainX, 3.82]],
    library: [
      [LIBRARY_START, carpetX, 3.48],
      [3.72, carpetX, seatY],
      [SCENES.focus, seatX, seatY],
      [4, seatX, seatY],
      [4.15, carpetX, seatY],
      [LIBRARY_EXIT, carpetX, 5.30],
    ],
    outdoorExit: mobile
      ? [[LIBRARY_EXIT, mainX, 5.30], [SCENES.friends, .50, 5.30], [5, .50, 5.74]]
      : [[LIBRARY_EXIT, mainX, 5.30], [5, .50, 5.72]],
  };
}

function sampledRoad(route, width, chapterHeight, from, to) {
  const points = route
    .filter(stop => stop[0] >= from && stop[0] <= to)
    .map(stop => [stop[1] * width, stop[2] * chapterHeight]);
  const start = samplePolyline(from, route);
  const end = samplePolyline(to, route);
  points.unshift([start.x * width, start.y * chapterHeight]);
  points.push([end.x * width, end.y * chapterHeight]);
  return points;
}

function scatterEdgeDetails(props, assets, width, chapterHeight, mobile) {
  const worldScale = width < 820 ? 3 : 4;
  const left = mobile ? -.08 : -.025;
  const right = mobile ? .83 : .88;
  const trees = [
    [right, .03], [right + .03, .17], [right + .07, .30], [right, .43],
    [right + .01, .58], [left, .72], [right, 1.10],
    [right + .05, 1.23], [right + .07, 1.36], [right + .02, 1.51], [right, 1.64],
    [left, 1.75], [right + .05, 1.91], [right + .04, 2.05], [right, 2.18],
    [right + .02, 2.31], [right + .07, 2.44], [right + .04, 2.57], [right, 2.70],
    [right + .02, 2.84], [right + .06, 2.97], [right + .04, 3.11], [right, 3.24],
    [right + .02, 3.38], [right + .07, 3.51],
    [right + .05, 4.96], [right + .07, 5.30], [right + .04, 5.64],
  ];
  for (const [x, y] of trees) {
    props.push(spriteProp(
      assets,
      'tree',
      [0, 1008, 64, 64],
      x * width,
      y * chapterHeight,
      worldScale,
      -2 * worldScale,
    ));
  }

  const flowers = mobile
    ? [[.08, .94], [.88, 1.88]]
    : [[.08, .98], [.9, .94], [.92, 1.88]];
  for (const [x, y] of flowers) {
    props.push(spriteProp(
      assets,
      'gardenDecor',
      [176, 880, 32, 32],
      x * width,
      y * chapterHeight,
      worldScale,
      -2 * worldScale,
    ));
  }

  const finalDecor = [
    // Keep the finale framed by small edge props so the actors remain unobstructed.
    [[400, 80, 16, 32], 6, chapterHeight * 5.70],
    [[400, 80, 16, 32], width - 16 * worldScale - 6, chapterHeight * 5.76],
  ];
  for (const [crop, x, y] of finalDecor) {
    props.push(spriteProp(assets, 'gardenDecor', crop, x, y, worldScale, -2 * worldScale));
  }
}

function drawLibraryGround(ctx, assets, width, chapterHeight, mobile, carpetX) {
  const top = LIBRARY_START * chapterHeight;
  const bottom = 5.40 * chapterHeight;
  const floorTop = top + chapterHeight * .14;
  ctx.fillStyle = '#263a35';
  ctx.fillRect(0, top, width, bottom - top);
  tiledCrop(ctx, assets.room, [560, 352, 16, 16], 0, floorTop, width, bottom - floorTop, 48);
  ctx.fillStyle = 'rgba(62, 43, 30, .24)';
  ctx.fillRect(0, floorTop, width, bottom - floorTop);

  ctx.fillStyle = '#203932';
  ctx.fillRect(0, top, width, chapterHeight * .14);
  ctx.fillStyle = '#725c3f';
  ctx.fillRect(0, floorTop, width, 9);
  ctx.fillStyle = '#b4965f';
  ctx.fillRect(0, floorTop + 9, width, 3);

  const centerX = width * carpetX;
  const entryY = 3.48 * chapterHeight;
  const exitY = 5.30 * chapterHeight;
  const carpetScale = width < 820 ? 3 : 4;
  const carpetWidth = 32 * carpetScale;
  const carpetTileHeight = 16 * carpetScale;
  for (let y = entryY; y < exitY + carpetTileHeight; y += carpetTileHeight) {
    drawCrop(
      ctx,
      assets.carpetTiles,
      [64, 448, 32, 16],
      centerX - carpetWidth / 2,
      y,
      carpetScale,
    );
  }

  const doorWidth = mobile ? 92 : 128;
  ctx.fillStyle = '#172722';
  ctx.fillRect(centerX - doorWidth / 2, top, doorWidth, chapterHeight * .15 + 10);
  ctx.fillStyle = '#ae8a55';
  ctx.fillRect(centerX - doorWidth / 2, top + chapterHeight * .14, doorWidth, 8);
}

function addLibraryProps(props, assets, width, chapterHeight, mobile, seat) {
  const top = LIBRARY_START * chapterHeight;
  const shelfScale = width < 820 ? 3 : 4;
  const shelfFootY = top + chapterHeight * (mobile ? .24 : .22);
  const shelfY = shelfFootY - 48 * shelfScale;
  const shelfWidth = 32 * shelfScale;
  const shelfRanges = mobile
    ? [[8, seat.x - 65], [seat.x + 65, width - 8]]
    : [[18, width * .47], [width * .79, width - 18]];
  for (const [start, end] of shelfRanges) {
    for (let x = start; x + shelfWidth < end; x += shelfWidth + 8) {
      props.push(spriteProp(assets, 'libraryDecor', [96, 208, 32, 48], x, shelfY, shelfScale, 0, 'library'));
    }
  }

  const furnitureScale = width < 820 ? 3 : 4;
  const deskX = seat.x + 7 * furnitureScale;
  const deskY = seat.y - 15 * furnitureScale;
  props.push(spriteProp(assets, 'desk', [0, 8, 48, 40], deskX, deskY, furnitureScale, -18 * furnitureScale, 'library'));
  props.push(spriteProp(
    assets,
    'libraryDecor',
    [80, 80, 16, 24],
    seat.x - 9 * furnitureScale,
    seat.y - 15 * furnitureScale,
    furnitureScale,
    -10 * furnitureScale,
    'library',
  ));

  const sideFurniture = mobile
    ? [
        ['officeDecor', [96, 160, 16, 24], .84, 4.85],
        ['libraryDecor', [192, 112, 32, 40], .62, 4.90],
        ['libraryDecor', [48, 16, 16, 24], .43, 5.08],
      ]
    : [
        ['officeDecor', [96, 120, 16, 32], .92, 4.82],
        ['officeDecor', [72, 384, 24, 24], .82, 5.02],
        ['libraryDecor', [120, 56, 32, 24], .06, 4.86],
        ['libraryDecor', [16, 56, 16, 16], .12, 5.05],
        ['libraryDecor', [48, 16, 16, 24], .36, 5.08],
      ];
  for (const [name, crop, x, y] of sideFurniture) {
    props.push(spriteProp(assets, name, crop, x * width, y * chapterHeight, furnitureScale, -5, 'library'));
  }
}

export function createWorld({ assets, width, chapterHeight, mobile }) {
  const worldHeight = Math.ceil(SCENES.end * chapterHeight);
  const routes = routeMilestones(mobile);
  const ground = createCanvas(Math.ceil(width), worldHeight);
  const ctx = ground.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  tiledCrop(ctx, assets.terrain, [16, 112, 16, 16], 0, 0, width, worldHeight, 48);
  ctx.fillStyle = 'rgba(190, 207, 145, .66)';
  ctx.fillRect(0, 0, width, worldHeight);

  const roadWidth = mobile ? 64 : 92;
  const buildingSize = mobile
    ? width * .38
    : Math.min(300, width * .255);
  const buildingLeft = mobile ? 12 : Math.max(24, width * .05);
  const buildingGap = mobile ? 52 : 60;
  const firstBuildingY = 2.34 * chapterHeight;
  const buildingTops = [
    firstBuildingY,
    firstBuildingY + buildingSize + buildingGap,
    firstBuildingY + (buildingSize + buildingGap) * 2,
  ];
  const entranceXs = buildingTops.map(() => buildingLeft + buildingSize * .53);
  const entranceYs = buildingTops.map(value => value + buildingSize);
  const outdoorEntryRoad = sampledRoad(routes.outdoorEntry, width, chapterHeight, 0, LIBRARY_START);
  outdoorEntryRoad.unshift([routes.outdoorEntry[0][1] * width, -80]);
  drawRoadNetwork(ctx, [{ points: outdoorEntryRoad, width: roadWidth }]);

  const portalPoint = samplePolyline(LIBRARY_START, routes.outdoorEntry);
  const portal = { x: portalPoint.x * width, y: portalPoint.y * chapterHeight };
  const portalWidth = mobile ? 72 : 96;
  const portalHeight = mobile ? 66 : 82;
  const portalBottom = portal.y + roadWidth * .58;
  const portalTop = portal.y - portalHeight;
  ctx.fillStyle = '#6e5a3c';
  ctx.fillRect(
    portal.x - portalWidth / 2 - 6,
    portalTop - 6,
    portalWidth + 12,
    portalBottom - portalTop + 12,
  );
  ctx.fillStyle = '#172b28';
  ctx.fillRect(portal.x - portalWidth / 2, portalTop, portalWidth, portalBottom - portalTop);
  ctx.fillStyle = '#f2d38b';
  ctx.beginPath();
  ctx.moveTo(portal.x, portalTop + 14);
  ctx.lineTo(portal.x - 9, portalTop + 28);
  ctx.lineTo(portal.x + 9, portalTop + 28);
  ctx.closePath();
  ctx.fill();
  const cueY = portal.y - portalHeight * .42;
  const cueEnd = portal.x - portalWidth / 2 - 10;
  ctx.save();
  ctx.fillStyle = '#29453d';
  ctx.font = `${mobile ? 10 : 13}px Pixeloid`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('Enter library', cueEnd - 26, cueY);
  ctx.fillRect(cueEnd - 20, cueY - 2, 16, 4);
  ctx.beginPath();
  ctx.moveTo(cueEnd, cueY);
  ctx.lineTo(cueEnd - 8, cueY - 7);
  ctx.lineTo(cueEnd - 8, cueY + 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = .17;
  for (let index = 0; index < 1250; index += 1) {
    const x = (index * 317 + 29) % width;
    const y = (index * 191 + 71) % worldHeight;
    if (y >= LIBRARY_START * chapterHeight && y < 5.40 * chapterHeight) continue;
    ctx.fillStyle = index % 3 ? '#61794b' : '#fff1b8';
    ctx.fillRect(x, y, index % 5 === 0 ? 4 : 2, 2);
  }
  ctx.restore();

  const outdoorGround = createCanvas(Math.ceil(width), worldHeight);
  const outdoorContext = outdoorGround.getContext('2d');
  outdoorContext.imageSmoothingEnabled = false;
  outdoorContext.drawImage(ground, 0, 0);

  const carpetX = routes.library[0][1];
  drawLibraryGround(ctx, assets, width, chapterHeight, mobile, carpetX);

  const props = [];
  scatterEdgeDetails(props, assets, width, chapterHeight, mobile);

  const houseScale = mobile ? 1.15 : 1.75;
  props.push(spriteProp(
    assets,
    'villas',
    [0, 0, 144, 208],
    mobile ? width - 144 * houseScale - 4 : width * .70,
    chapterHeight * (mobile ? .47 : .82),
    houseScale,
    -10,
  ));

  const buildings = ['school', 'gym', 'castle'].map((name, index) => {
    const bounds = {
      x: buildingLeft,
      y: buildingTops[index],
      width: buildingSize,
      height: buildingSize,
    };
    props.push(wholeProp(
      assets,
      name,
      bounds.x,
      bounds.y,
      buildingSize,
    ));
    return {
      name,
      bounds,
      entrance: { x: entranceXs[index], y: entranceYs[index] },
      label: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height + 12 },
    };
  });

  const seat = {
    x: width * (mobile ? .38 : .72),
    y: (SCENES.focus + (mobile ? .78 : .70)) * chapterHeight,
  };
  addLibraryProps(props, assets, width, chapterHeight, mobile, seat);
  const meetingPoint = samplePolyline(1, routes.outdoorEntry);
  const librarySpawnPoint = samplePolyline(LIBRARY_START, routes.library);
  const libraryExitPoint = samplePolyline(LIBRARY_EXIT, routes.library);
  const sampleOutdoorRoute = progress => samplePolyline(
    progress,
    progress <= LIBRARY_START ? routes.outdoorEntry : routes.outdoorExit,
  );
  const sampleLibraryRoute = progress => samplePolyline(progress, routes.library);

  return {
    ground,
    outdoorGround,
    props,
    buildings,
    sampleOutdoorRoute,
    sampleLibraryRoute,
    sampleRoute(progress) {
      if (progress < LIBRARY_START || progress > LIBRARY_EXIT) return sampleOutdoorRoute(progress);
      return sampleLibraryRoute(progress);
    },
    libraryStart: LIBRARY_START,
    libraryExitProgress: LIBRARY_EXIT,
    interiorTop: LIBRARY_START * chapterHeight,
    interiorBottom: 5.40 * chapterHeight,
    portal,
    librarySpawn: {
      x: librarySpawnPoint.x * width,
      y: librarySpawnPoint.y * chapterHeight,
    },
    libraryExit: {
      x: libraryExitPoint.x * width,
      y: libraryExitPoint.y * chapterHeight,
    },
    seat,
    meeting: {
      x: meetingPoint.x * width - (mobile ? 52 : 80),
      y: meetingPoint.y * chapterHeight,
    },
    libraryEntrance: {
      x: portal.x,
      y: portal.y,
    },
  };
}

export function validateWorldRoute(world, { width, chapterHeight, from = 0, to = 5 } = {}) {
  const errors = [];
  const step = .01;
  for (let progress = from; progress <= to + step / 2; progress += step) {
    const point = world.sampleRoute(Math.min(progress, to));
    const viewportY = point.y - progress;
    if (point.x < .04 || point.x > .96) {
      errors.push(`route leaves horizontal view at ${progress.toFixed(2)}`);
    }
    if (viewportY < .12 || viewportY > .92) {
      errors.push(`route leaves vertical view at ${progress.toFixed(2)}`);
    }
    const x = point.x * width;
    const y = point.y * chapterHeight;
    for (const building of world.buildings) {
      const bounds = building.bounds;
      if (
        x > bounds.x
        && x < bounds.x + bounds.width
        && y > bounds.y
        && y < bounds.y + bounds.height
      ) {
        errors.push(`route crosses ${building.name} at ${progress.toFixed(2)}`);
      }
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
