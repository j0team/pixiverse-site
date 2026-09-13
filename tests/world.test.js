import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIBRARY_EXIT,
  LIBRARY_START,
  SCENES,
  WORLD_ASSETS,
  createWorld,
  validateWorldRoute,
} from '../world.js';

globalThis.OffscreenCanvas = class MockCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return new Proxy({}, {
      get(target, property) {
        return target[property] ?? (() => {});
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    });
  }
};

const assets = new Proxy({}, { get: () => ({}) });
const layouts = [
  { width: 1440, chapterHeight: 900, mobile: false },
  { width: 390, chapterHeight: 844, mobile: true },
  { width: 320, chapterHeight: 568, mobile: true },
  { width: 942, chapterHeight: 1090, mobile: false },
  { width: 701, chapterHeight: 700, mobile: false },
];

function assertWorldPoint(sample, point, layout) {
  assert.ok(Math.abs(sample.x * layout.width - point.x) < 1e-9);
  assert.ok(Math.abs(sample.y * layout.chapterHeight - point.y) < 1e-9);
}

test('world exports the scene and asset contract', () => {
  assert.deepEqual(SCENES, {
    home: 0,
    picky: 1,
    village: 2,
    focus: 3.8,
    friends: 4.8,
    end: 6,
  });
  assert.equal(WORLD_ASSETS.carpetTiles, 'assets/world-carpet-tiles.png');

  for (const layout of layouts) {
    const world = createWorld({ assets, ...layout });
    assert.equal(world.ground.height, layout.chapterHeight * SCENES.end);
    assert.equal(world.outdoorGround.height, layout.chapterHeight * SCENES.end);
    assert.equal(world.buildings.length, 3);
    assert.equal(world.libraryStart, LIBRARY_START);
    assert.equal(world.libraryExitProgress, LIBRARY_EXIT);
    assert.equal(world.interiorTop, LIBRARY_START * layout.chapterHeight);
    assert.equal(world.interiorBottom, 5.4 * layout.chapterHeight);
    assertWorldPoint(world.sampleOutdoorRoute(LIBRARY_START), world.portal, layout);
    assertWorldPoint(world.sampleLibraryRoute(LIBRARY_START), world.librarySpawn, layout);
    assertWorldPoint(world.sampleLibraryRoute(LIBRARY_EXIT), world.libraryExit, layout);
    for (const building of world.buildings) {
      assert.equal(building.label.x, building.bounds.x + building.bounds.width / 2);
      assert.equal(building.label.y, building.bounds.y + building.bounds.height + 12);
      assert.equal(building.entrance.y, building.bounds.y + building.bounds.height);
    }
    const gaps = world.buildings.slice(1).map((building, index) => (
      building.bounds.y
      - world.buildings[index].bounds.y
      - world.buildings[index].bounds.height
    ));
    assert.ok(gaps.every(gap => gap >= (layout.mobile ? 51.9 : 59.9)));
    assert.ok(world.props.every(prop => Number.isFinite(prop.footY) && typeof prop.draw === 'function'));
  }
});

test('route stays orthogonal, visible, and clear of every building', () => {
  for (const layout of layouts) {
    const world = createWorld({ assets, ...layout });
    assert.deepEqual(validateWorldRoute(world, layout), { valid: true, errors: [] });

    const segments = [
      [world.sampleOutdoorRoute, 0, LIBRARY_START],
      [world.sampleLibraryRoute, LIBRARY_START, LIBRARY_EXIT],
      [world.sampleOutdoorRoute, LIBRARY_EXIT, 5],
    ];
    for (const [sample, start, end] of segments) {
      for (let progress = start; progress < end; progress += .005) {
        const current = sample(progress);
        const next = sample(Math.min(end, progress + 1e-6));
        const dx = Math.abs(next.x - current.x);
        const dy = Math.abs(next.y - current.y);
        assert.ok(dx < 1e-10 || dy < 1e-10, `diagonal motion near ${progress.toFixed(3)}`);
      }
    }
  }
});

test('route reaches the exact seat and pauses there through focus', () => {
  for (const layout of layouts) {
    const world = createWorld({ assets, ...layout });
    const expected = {
      x: world.seat.x / layout.width,
      y: world.seat.y / layout.chapterHeight,
    };
    const arrival = world.sampleRoute(3.8);
    assert.ok(Math.abs(arrival.x - expected.x) < 1e-12);
    assert.ok(Math.abs(arrival.y - expected.y) < 1e-12);
    assert.deepEqual(world.sampleRoute(3.9), arrival);
    assert.deepEqual(world.sampleRoute(4), arrival);
  }
});
