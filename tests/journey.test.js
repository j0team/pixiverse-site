import test from 'node:test';
import assert from 'node:assert/strict';
import { FocusChallenge, facingBetween, remainingSeconds, TrailFollower } from '../journey.js';

test('a newer input timestamp cannot display six seconds', () => {
  const focus = new FocusChallenge();
  focus.update(100, true);
  focus.interrupt(120);
  assert.equal(focus.update(110, true), 0);
  assert.equal(remainingSeconds(focus.update(110, true)), 5);
  assert.equal(remainingSeconds(-.01), 5);
});

test('Picky follows the traveled corner without teleporting or cutting it', () => {
  const picky = new TrailFollower({x:0,y:0}, 20);
  picky.record({x:100,y:0});
  picky.record({x:100,y:100});
  picky.update(.1, 60);
  assert.deepEqual(picky.position, {x:6,y:0});
  picky.update(2, 60);
  assert.equal(picky.position.x, 100);
  assert.equal(picky.position.y, 26);
  picky.update(10, 60);
  assert.deepEqual(picky.position, {x:100,y:80});
  picky.record({x:0,y:100});
  picky.update(1,60);
  assert.deepEqual(picky.position, {x:60,y:100});
  assert.equal(picky.facingLeft, true);
});

test('requires five full uninterrupted seconds and resets on scroll', () => {
  const focus = new FocusChallenge();
  assert.equal(focus.update(1000, true), 0);
  assert.equal(focus.update(5999, true) < 1, true);
  focus.interrupt(5999);
  assert.equal(focus.update(6000, true) < .01, true);
  assert.equal(focus.complete, false);
  assert.equal(focus.update(10999, true), 1);
  assert.equal(focus.complete, true);
});

test('time away from the library or in a hidden tab never counts', () => {
  const focus = new FocusChallenge();
  focus.update(0, true);
  focus.update(2000, false);
  assert.equal(focus.update(90000, true), 0);
  assert.equal(focus.complete, false);
  assert.equal(focus.update(95000, true), 1);
});

test('completion persists on backtracking; replay clears it', () => {
  const focus = new FocusChallenge();
  focus.update(0, true);
  focus.update(5000, true);
  focus.interrupt(6000);
  assert.equal(focus.update(10000, false), 1);
  focus.reset();
  assert.equal(focus.complete, false);
  assert.equal(focus.update(11000, true), 0);
});

test('sprite facing supports forward and reverse travel in all directions', () => {
  const origin = {x:0,y:0};
  assert.equal(facingBetween(origin,{x:1,y:0},1,1), 'right');
  assert.equal(facingBetween(origin,{x:-1,y:0},1,1), 'left');
  assert.equal(facingBetween(origin,{x:0,y:1},1,1), 'down');
  assert.equal(facingBetween(origin,{x:0,y:-1},1,1), 'up');
  assert.equal(facingBetween(origin,origin,1,1,'left'), 'left');
});
