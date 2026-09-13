import { FocusChallenge, remainingSeconds, TrailFollower, facingBetween } from './journey.js?v=fba0f5a53fa6';
import { createWorld, WORLD_ASSETS, SCENES, LIBRARY_START, LIBRARY_EXIT } from './world.js?v=415db02b8a9a';
import { createRewardExperience, REWARD_ASSETS } from './reward.js?v=4cda0dcc2964';

const $ = selector => document.querySelector(selector);
const canvas = $('#world');
const ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const challenge = new FocusChallenge();
const assets = {};
const sourceNames = ['hero', 'friend-blue', 'friend-pink', 'picky', 'picky-happy', 'picky-walk',
  'school', 'gym', 'castle', 'villas', 'terrain', 'library', 'room', 'tree', 'desk'];
const sources = Object.fromEntries(sourceNames.map(name => [name, `assets/${name}.png`]));
Object.assign(sources, WORLD_ASSETS, REWARD_ASSETS, { appIcon: 'assets/app-icon.png' });
const directionX = { right: 0, up: 96, left: 192, down: 288 };
const scrollKeys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
const heldKeys = new Set();
const transition = document.createElement('div');
transition.className = 'scene-transition';
transition.setAttribute('aria-hidden', 'true');
document.body.append(transition);


let width, height, chapterHeight, mobile, scale, world, follower, reward;
let lastScroll = 0, lastProgress = 0, lastMovement = -1000, lastFrame = 0;
let lastPoint, facing = 'down', joined = false, lastSeconds = -1, lastChapter = -1;
let unlocked = false, automaticRewardShown = false, rewardTimeout, resetting = false;
let touchY = null, previousFriends = [];
let scene = 'outdoor', passage = null;
let cameraScroll = 0;

try {
  await Promise.all(Object.entries(sources).map(async ([name, source]) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    assets[name] = image;
  }));
  await document.fonts.ready;
  initialize();
} catch (error) {
  const notice = document.createElement('p');
  notice.className = 'noscript';
  notice.textContent = 'The village could not load. Please refresh to try again.';
  document.body.append(notice);
  console.error('Pixiverse could not start', error);
}

function sprite(name, crop, x, y, spriteScale = scale, flip = false) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) {
    ctx.translate(crop[2] * spriteScale, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(assets[name], ...crop, 0, 0, crop[2] * spriteScale, crop[3] * spriteScale);
  ctx.restore();
}

function shadow(x, y, radius) {
  ctx.fillStyle = 'rgba(34,44,28,.2)';
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * .30, 0, 0, Math.PI * 2);
  ctx.fill();
}

function character(name, point, direction, now, walking, seated = false) {
  const interval = walking ? 100 : 500;
  const frame = reducedMotion.matches ? 0 : Math.floor(now / interval) % 6;
  const sx = seated ? 0 : directionX[direction];
  const sy = seated ? 128 : walking ? 64 : 32;
  shadow(point.x, point.y, scale * 6);
  sprite(name, [sx + frame * 16, sy, 16, 32],
    point.x - 8 * scale, point.y - 30 * scale);
}

function drawPicky(now) {
  const point = follower.position;
  const frame = follower.moving && !passage && !reducedMotion.matches ? Math.floor(now / 250) % 2 : 0;
  shadow(point.x, point.y, scale * 6);
  sprite(follower.moving && !passage ? 'picky-walk' : 'picky', [frame * 16, 0, 16, 16],
    point.x - 8 * scale, point.y - 16 * scale, scale, follower.facingLeft);
  if (!joined) {
    ctx.font = `${mobile ? 10 : 12}px Pixeloid`;
    ctx.textAlign = 'center';
    const text = 'Oh, hi! I’m Picky.';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = '#fff3d1';
    ctx.fillRect(point.x - w / 2 - 12, point.y - 29 * scale, w + 24, 28);
    ctx.fillRect(point.x - 4, point.y - 29 * scale + 28, 8, 6);
    ctx.fillStyle = '#284737';
    ctx.fillText(text, point.x, point.y - 29 * scale + 18);
  }
}

function positionAt(progress) {
  const sample = scene === 'library' ? world.sampleLibraryRoute : world.sampleOutdoorRoute;
  const point = sample(progress);
  return { x: point.x * width, y: point.y * chapterHeight };
}

function isSeated(progress) {
  return scene === 'library' && !passage && progress >= SCENES.focus - .002 && (!unlocked || progress <= SCENES.focus + .20);
}

function updateFollower(progress, delta) {
  if (!joined && progress >= SCENES.picky + .06) {
    joined = true;
    lastProgress = SCENES.picky;
  }
  if (!joined) return;
  const steps = Math.max(1, Math.ceil(Math.abs(progress - lastProgress) / .008));
  for (let i = 1; i <= steps; i++) {
    const sample = lastProgress + (progress - lastProgress) * i / steps;
    follower.record(isSeated(sample) ? world.seat : positionAt(sample));
  }
  const distance = Math.hypot(lastPoint.x - follower.position.x, lastPoint.y - follower.position.y);
  const catchUp = Math.min(3, Math.max(1, distance / (120 * scale)));
  follower.update(delta, 140 * scale * catchUp);
}

function friendActors(progress, now) {
  if (progress < SCENES.friends - .25 || !unlocked) return [];
  const start = SCENES.friends - .25;
  const end = SCENES.friends + .18;
  const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  const main = positionAt(progress);
  const destination = positionAt(end);
  const spacing = scale * 19;
  const result = [];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const startX = width * (i === 0 ? .09 : .91);
    let point;
    if (t < .72) {
      const fraction = t / .72;
      point = {
        x: startX + (destination.x + side * spacing - startX) * fraction,
        y: (SCENES.friends + .57 + fraction * .13) * chapterHeight,
      };
    } else {
      const fraction = (t - .72) / .28;
      point = {
        x: destination.x + side * spacing,
        y: (SCENES.friends + .70) * chapterHeight +
          (destination.y + scale * 3 - (SCENES.friends + .70) * chapterHeight) * fraction,
      };
    }
    if (t === 1) point = { x: main.x + side * spacing, y: main.y + scale * 3 };
    const previous = previousFriends[i] ?? point;
    const direction = facingBetween(previous, point, 1, 1, t === 1 ? 'down' : i === 0 ? 'right' : 'left');
    const walking = Math.hypot(point.x - previous.x, point.y - previous.y) > .2;
    previousFriends[i] = point;
    result.push({ footY: point.y, draw: () => character(i === 0 ? 'friend-blue' : 'friend-pink', point, direction, now, walking) });
  }
  return result;
}

function beginPassage(to, progress, now) {
  passage = { to, progress, started: now, swapped: false, fromPoint: { ...lastPoint } };
  scrollTo(0, progress * chapterHeight);
  challenge.update(now, false);
  transition.innerHTML = '<span class="portal-ring"></span>';
  document.body.classList.add('in-passage');
}

function updatePassage(progress, now) {
  if (!unlocked && progress > SCENES.focus) {
    progress = SCENES.focus;
    scrollTo(0, progress * chapterHeight);
  }
  if (!passage) {
    if (scene === 'outdoor' && progress >= LIBRARY_START) beginPassage('library', LIBRARY_START, now);
    else if (scene === 'library' && progress < LIBRARY_START - .01) beginPassage('outdoor', LIBRARY_START - .02, now);
    else if (scene === 'library' && progress >= LIBRARY_EXIT && unlocked) beginPassage('finale', LIBRARY_EXIT, now);
    else if (scene === 'finale' && progress < LIBRARY_EXIT - .01) beginPassage('library', LIBRARY_EXIT - .02, now);
  }
  if (!passage) return progress;
  const duration = reducedMotion.matches ? 100 : 800;
  const fraction = Math.min(1, (now - passage.started) / duration);
  if (scrollY !== passage.progress * chapterHeight) scrollTo(0, passage.progress * chapterHeight);
  transition.style.opacity = fraction < .4 ? fraction / .4 : fraction < .65 ? 1 : (1 - fraction) / .35;
  if (fraction >= .4 && !passage.swapped) {
    scene = passage.to;
    passage.swapped = true;
    const spawn = positionAt(passage.progress);
    lastPoint = { ...spawn };
    follower = new TrailFollower({ x: spawn.x, y: spawn.y - scale * 20 }, scale * 20);
    lastProgress = passage.progress;
    facing = 'down';
  }
  const pinnedProgress = passage.progress;
  if (fraction === 1) {
    passage = null;
    lastMovement = -1000;
    transition.style.opacity = 0;
    document.body.classList.remove('in-passage');
  }
  return pinnedProgress;
}

function clampedScroll() {
  const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  return Math.max(0, Math.min(scrollY, maximum));
}

function drawBackground() {
  const indoors = scene === 'library';
  if (indoors) {
    ctx.fillStyle = '#514938';
    ctx.fillRect(0, 0, width, height);
    const top = Math.round(world.interiorTop);
    const roomHeight = Math.round(world.interiorBottom - world.interiorTop);
    ctx.drawImage(world.ground, 0, top, width, roomHeight, 0, top - Math.round(cameraScroll), width, roomHeight);
  } else {
    const cameraY = Math.round(cameraScroll);
    ctx.drawImage(world.outdoorGround, 0, -cameraY);
    // Continue the grass under the extra scroll space and bottom safe area.
    const groundHeight = world.outdoorGround.height;
    for (let y = groundHeight - cameraY; y < height; y += 48) {
      ctx.drawImage(world.outdoorGround, 0, groundHeight - 48, width, 48, 0, y, width, 48);
    }
  }
  document.body.classList.toggle('indoors', indoors);
  document.body.classList.toggle('finale-visible', scene === 'finale' && !passage);
  return indoors;
}

function draw(now) {
  requestAnimationFrame(draw);
  if (document.hidden) return;
  if (reward.isOpen()) {
    lastFrame = now;
    return;
  }
  const delta = Math.min(.06, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  const progress = updatePassage(clampedScroll() / chapterHeight, now);
  cameraScroll = clampedScroll();
  const seated = isSeated(progress);
  const point = passage && !passage.swapped ? passage.fromPoint : seated ? world.seat : positionAt(progress);
  $('.character-tag').hidden = progress > .16;
  if (!passage) updateFollower(progress, delta);
  const walking = !passage && !seated && now - lastMovement < 140;
  document.body.classList.toggle('reading-paused', !passage && now - lastMovement > 650);
  if (walking) facing = facingBetween(lastPoint, point, 1, 1, facing);
  updateFocus(now, seated);

  ctx.clearRect(0, 0, width, height);
  const indoors = drawBackground(progress);
  const layers = world.props.filter(prop =>
    (prop.region === 'library') === indoors &&
    prop.footY >= cameraScroll - 100 && prop.footY <= cameraScroll + height + 1200);
  layers.push({ footY: point.y, draw: () => character('hero', point, facing, now, walking, seated) });
  if (progress > .45 || joined) layers.push({ footY: follower.position.y, draw: () => drawPicky(now) });
  if (scene === 'finale' && !passage) layers.push(...friendActors(progress, now));
  layers.sort((a, b) => a.footY - b.footY);
  ctx.save();
  ctx.translate(0, -Math.round(cameraScroll));
  for (const layer of layers) layer.draw(ctx);
  ctx.restore();
  lastPoint = { ...point };
  lastProgress = progress;
  updateChapter(progress);
}

function updateChapter(progress) {
  let index = 0;
  const starts = [SCENES.home, SCENES.picky, SCENES.village, SCENES.focus, SCENES.friends];
  for (let i = 1; i < starts.length; i++) if (progress >= starts[i] - .15) index = i;
  if (index === lastChapter) return;
  $('#chapter-number').textContent = String(index + 1).padStart(2, '0');
  $('#chapter-name').textContent = ['THE BEGINNING', 'MEET PICKY', 'FIND YOUR FOCUS', 'A QUIET MOMENT', 'BETTER TOGETHER'][index];
  lastChapter = index;
}

function interruptFocus() {
  if (unlocked || !isSeated(scrollY / chapterHeight)) return;
  challenge.interrupt(performance.now());
  $('#focus-status').textContent = 'You moved! Five quiet seconds, starting again.';
}

function updateFocus(now, seated) {
  $('#focus-sign').hidden = !seated;
  const active = seated && !document.hidden && heldKeys.size === 0 && !reward.isOpen();
  const progress = challenge.update(now, active);
  const seconds = remainingSeconds(progress);
  if (seconds !== lastSeconds) {
    $('#seconds').textContent = String(seconds).padStart(2, '0');
    lastSeconds = seconds;
  }
  if (challenge.complete && !unlocked) {
    unlocked = true;
    $('#sign-title').textContent = 'Nice work!';
    $('#sign-subtitle').textContent = 'You did it.';
    $('#focus-status').textContent = 'Five seconds of focus. That deserves a little celebration.';
    if (!automaticRewardShown) {
      automaticRewardShown = true;
      rewardTimeout = setTimeout(() => reward.open(), reducedMotion.matches ? 100 : 750);
    }
  } else if (active && progress < .05 && $('#focus-status').textContent.startsWith('Your focus')) {
    $('#focus-status').textContent = 'Stay right here. You’ve got this.';
  }
}

function updateScrollRoom() {
  // Safari can grow the viewport after the chapter geometry has been fixed.
  // Preserve the last chapter's reachable scroll position without moving the map.
  const room = Math.max(0, innerHeight - chapterHeight);
  document.documentElement.style.setProperty('--scroll-room', `${room}px`);
}

function resize() {
  // Safari toolbar expansion changes innerHeight during a scroll. Keep the
  // map geometry stable until the screen width changes (including rotation).
  if (world && matchMedia('(pointer: coarse)').matches && innerWidth === width) {
    updateScrollRoom();
    return;
  }
  const oldWidth = width;
  const oldHeight = chapterHeight;
  const progress = reward?.isOpen() ? lastProgress : oldHeight ? scrollY / oldHeight : 0;
  width = innerWidth;
  const viewportHeight = innerHeight;
  height = matchMedia('(pointer: coarse)').matches ? Math.max(viewportHeight, screen.height) : viewportHeight;
  mobile = width <= 700;
  scale = width < 820 ? 3 : 4;
  chapterHeight = Math.max(viewportHeight, 560);
  updateScrollRoom();
  document.documentElement.style.setProperty('--chapter', `${chapterHeight}px`);
  const ratio = Math.min(devicePixelRatio, 2);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = false;
  world = createWorld({ assets, width, chapterHeight, mobile });
  if (passage && oldWidth) {
    passage.fromPoint.x *= width / oldWidth;
    passage.fromPoint.y *= chapterHeight / oldHeight;
  }
  if (follower) {
    follower.resize(width / oldWidth, chapterHeight / oldHeight);
    follower.gap = scale * 20;
  } else follower = new TrailFollower(world.meeting, scale * 20);
  const initial = positionAt(0);
  $('.hero').style.setProperty('--hero-x', `${initial.x - 18}px`);
  $('.hero').style.setProperty('--hero-y', `${initial.y - 22 * scale}px`);
  if (oldHeight && !reward?.isOpen()) scrollTo(0, progress * chapterHeight);
  lastPoint = isSeated(progress) ? { ...world.seat } : positionAt(progress);
  lastProgress = progress;
  lastScroll = scrollY;
  $('#continue').style.left = `${Math.min(width - 120, world.libraryExit.x + (mobile ? 150 : 180))}px`;
  $('#continue').style.top = `${world.libraryExit.y - SCENES.focus * chapterHeight - 40}px`;
}

function restart() {
  resetting = true;
  passage = null;
  scene = 'outdoor';
  transition.style.opacity = 0;
  document.body.classList.remove('in-passage', 'indoors', 'finale-visible');
  clearTimeout(rewardTimeout);
  reward.reset();
  challenge.reset();
  unlocked = false;
  automaticRewardShown = false;
  joined = false;
  heldKeys.clear();
  follower = new TrailFollower(world.meeting, scale * 20);
  previousFriends = [];
  $('#friends').hidden = true;
  $('#continue').hidden = true;
  $('#revisit').hidden = true;
  $('#focus-sign').hidden = true;
  $('#sign-title').textContent = 'Stop Scrolling!';
  $('#sign-subtitle').textContent = 'Focus!';
  $('#focus-status').textContent = 'Your focus challenge starts when you sit down.';
  scrollTo(0, 0);
  history.replaceState(null, '', location.pathname);
  lastScroll = 0;
  lastProgress = 0;
  lastPoint = positionAt(0);
  lastMovement = -1000;
  facing = 'down';
  resetting = false;
}

function initialize() {
  $('#friends').hidden = true;
  history.scrollRestoration = 'manual';
  scrollTo(0, 0);
  if (location.hash) history.replaceState(null, '', location.pathname);
  resize();
  reward = createRewardExperience({ assets, reducedMotion, onClose: () => {
    if (resetting) return;
    $('#friends').hidden = false;
    scrollTo(0, lastProgress * chapterHeight);
    $('#continue').hidden = false;
    $('#revisit').hidden = false;
    $('#focus-status').textContent = 'A little focus goes a long way. Keep exploring, or revisit your reward.';
  }});
  addEventListener('resize', resize);
  addEventListener('scroll', () => {
    if (scrollY === lastScroll) return;
    lastMovement = performance.now();
    interruptFocus();
    lastScroll = scrollY;
  }, { passive: true });
  addEventListener('wheel', event => {
    if (passage) { event.preventDefault(); return; }
    if (event.deltaX || event.deltaY) interruptFocus();
  }, { passive: false });
  addEventListener('touchstart', event => { touchY = event.touches[0]?.clientY; }, { passive: true });
  addEventListener('touchmove', event => {
    if (passage) { event.preventDefault(); return; }
    const current = event.touches[0]?.clientY;
    if (touchY !== null && Math.abs(current - touchY) > 2) interruptFocus();
    touchY = current;
  }, { passive: false });
  addEventListener('touchend', () => { touchY = null; }, { passive: true });
  addEventListener('keydown', event => {
    if (passage && scrollKeys.has(event.key)) { event.preventDefault(); return; }
    const typing = event.target.closest?.('input,textarea,select,[contenteditable="true"]');
    const activating = event.key === ' ' && event.target.closest?.('button,a');
    if (scrollKeys.has(event.key) && !typing && !activating && !reward.isOpen()) {
      heldKeys.add(event.key);
      interruptFocus();
    }
  });
  addEventListener('keyup', event => { heldKeys.delete(event.key); });
  addEventListener('blur', () => {
    heldKeys.clear();
    challenge.update(performance.now(), false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) challenge.update(performance.now(), false);
  });
  document.querySelectorAll('a[href="#home"]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    restart();
  }));
  $('#restart').addEventListener('click', restart);
  $('#replay').addEventListener('click', restart);
  $('#revisit').addEventListener('click', () => reward.open({ replay: true }));
  $('#discord').addEventListener('click', () => {
    $('#discord-status').textContent = 'The Discord invite will be added here soon.';
  });
  requestAnimationFrame(draw);
}
