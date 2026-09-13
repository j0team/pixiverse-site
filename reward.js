export const REWARD_ASSETS = Object.freeze({
  pickyIdle: 'assets/reward-picky-idle-sheet.png',
  pickyThumbs: 'assets/reward-picky-thumbs.png',
  coin: 'assets/reward-coin.png',
  coins: 'assets/reward-coins-small.png',
  stack: 'assets/reward-coins-large.png',
  bag: 'assets/reward-coin-bag.png',
  chest: 'assets/reward-open-chest.png',
});

const SEGMENTS = Object.freeze([
  { amount: 10, rarity: 'common', icon: 'coins' },
  { amount: 50, rarity: 'uncommon', icon: 'stack' },
  { amount: 20, rarity: 'common', icon: 'coins' },
  { amount: 100, rarity: 'rare', icon: 'bag' },
  { amount: 30, rarity: 'common', icon: 'coins' },
  { amount: 150, rarity: 'epic', icon: 'bag' },
  { amount: 75, rarity: 'uncommon', icon: 'stack' },
  { amount: 300, rarity: 'legendary', icon: 'chest' },
]);

const RARITY_COLORS = Object.freeze({
  common: '#d4dee6',
  uncommon: '#ace89b',
  rare: '#95e3e3',
  epic: '#c6bdd5',
  legendary: '#ffe57b',
});

const TAU = Math.PI * 2;
const NON_LEGENDARY_INDICES = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
const easeOutQuint = value => 1 - Math.pow(1 - value, 5);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function assetUrl(value, fallback) {
  if (typeof value === 'string') return value;
  if (value && typeof value.src === 'string') return value.src;
  return fallback;
}

export function createRewardExperience({
  assets = {},
  reducedMotion = false,
  onClose = () => {},
} = {}) {
  const sources = { ...REWARD_ASSETS };
  for (const name of Object.keys(REWARD_ASSETS)) {
    sources[name] = assetUrl(assets[name], REWARD_ASSETS[name]);
  }

  const dialog = element('dialog', 'reward-experience');
  dialog.setAttribute('tabindex', '-1');
  dialog.setAttribute('aria-labelledby', 'reward-experience-title');
  dialog.setAttribute('aria-describedby', 'reward-experience-description');

  const shell = element('div', 'reward-shell');
  const closeButton = element('button', 'reward-close');
  closeButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close reward experience');
  shell.append(closeButton);

  const completion = element('section', 'reward-stage reward-completion');
  completion.dataset.stage = 'completion';
  completion.setAttribute('aria-labelledby', 'reward-experience-title');
  const completionStars = element('div', 'reward-completion-stars');
  completionStars.setAttribute('aria-hidden', 'true');
  completionStars.textContent = '✦  ·  ✦  ·  ✦';
  const eyebrow = element('p', 'reward-kicker', 'FOCUS COMPLETE');
  const title = element('h2', 'reward-completion-title', 'Nice work!');
  title.id = 'reward-experience-title';
  const description = element('p', 'reward-completion-copy', 'Five quiet seconds. One small promise kept.');
  description.id = 'reward-experience-description';

  const toWheel = element('button', 'reward-game-button reward-to-wheel', 'Continue to wheel');
  toWheel.type = 'button';
  const autoHint = element('p', 'reward-auto-hint', 'Picky’s celebration is next');
  completion.append(completionStars, eyebrow, title, description, toWheel, autoHint);

  const wheelStage = element('section', 'reward-stage reward-wheel-stage');
  wheelStage.dataset.stage = 'wheel';
  wheelStage.hidden = true;
  wheelStage.setAttribute('aria-labelledby', 'reward-wheel-title');

  const wheelHeading = element('div', 'reward-wheel-heading');
  const wheelKicker = element('p', 'reward-kicker', 'A LITTLE ROOM FOR FUN');
  const wheelTitle = element('h2', 'reward-wheel-title', 'Lucky Wheel');
  wheelTitle.id = 'reward-wheel-title';
  const preview = element('p', 'reward-preview-note', 'A practice spin. A thumbs-up from Picky.');
  preview.id = 'reward-wheel-description';
  wheelHeading.append(wheelKicker, wheelTitle, preview);

  const wheelArea = element('div', 'reward-wheel-area');
  const wheelButton = element('button', 'reward-wheel-button');
  wheelButton.type = 'button';
  wheelButton.setAttribute('aria-label', 'Spin the lucky wheel');
  const canvas = element('canvas', 'reward-wheel-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const centerPicky = element('span', 'reward-wheel-picky');
  centerPicky.setAttribute('aria-hidden', 'true');
  centerPicky.style.backgroundImage = `url("${sources.pickyIdle}")`;
  wheelButton.append(canvas, centerPicky);
  wheelArea.append(wheelButton);

  const controls = element('div', 'reward-wheel-controls');
  const spinButton = element('button', 'reward-game-button reward-spin-button', 'Spin');
  spinButton.type = 'button';
  const spins = element('p', 'reward-spins');
  spins.innerHTML = 'Spins <strong>1</strong>';
  const status = element('p', 'reward-status', 'Give the wheel a spin.');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const continueButton = element('button', 'reward-game-button reward-result-continue', 'Continue the journey');
  continueButton.type = 'button';
  continueButton.hidden = true;
  controls.append(spinButton, spins, status, continueButton);

  const effects = element('div', 'reward-effects');
  effects.setAttribute('aria-hidden', 'true');
  wheelStage.append(wheelHeading, wheelArea, controls, effects);
  shell.append(completion, wheelStage);
  dialog.append(shell);
  document.body.append(dialog);

  const imageCache = new Map();
  const activeAnimations = new Set();
  const frameRequests = new Set();
  const timers = new Set();
  let transitionTimer = 0;
  let previousFocus = null;
  let scrollY = 0;
  let scrollProgress = 0;
  let shown = false;
  let spinning = false;
  let rotation = 0;
  let stage = 'completion';

  function prefersReducedMotion() {
    return typeof reducedMotion === 'object' && 'matches' in reducedMotion
      ? reducedMotion.matches
      : Boolean(reducedMotion);
  }

  function getImage(name) {
    const supplied = assets[name];
    if (supplied && typeof supplied === 'object' && 'complete' in supplied) return supplied;
    if (!imageCache.has(name)) {
      const image = new Image();
      image.decoding = 'async';
      image.src = sources[name];
      image.addEventListener('load', () => {
        if (dialog.open && stage === 'wheel') drawWheel(rotation);
      }, { once: true });
      imageCache.set(name, image);
    }
    return imageCache.get(name);
  }

  function setTimer(callback, delay) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      callback();
    }, delay);
    timers.add(id);
    return id;
  }

  function requestFrame(callback) {
    const id = requestAnimationFrame(time => {
      frameRequests.delete(id);
      callback(time);
    });
    frameRequests.add(id);
    return id;
  }

  function clearActivity() {
    for (const frame of frameRequests) cancelAnimationFrame(frame);
    frameRequests.clear();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const animation of activeAnimations) animation.cancel();
    activeAnimations.clear();
    effects.replaceChildren();
    spinning = false;
  }

  function freezePage() {
    scrollY = window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollProgress = scrollY / maxScroll;
    document.body.style.setProperty('--reward-scroll-lock', `${-scrollY}px`);
    document.body.classList.add('reward-page-locked');
  }

  function unfreezePage() {
    document.body.classList.remove('reward-page-locked');
    document.body.style.removeProperty('--reward-scroll-lock');
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const restoredScrollY = maxScroll ? scrollProgress * maxScroll : scrollY;
    window.scrollTo(0, restoredScrollY);
    return restoredScrollY;
  }

  function focusControl(control) {
    const target = matchMedia('(pointer: coarse)').matches ? dialog : control;
    target.focus({ preventScroll: true });
  }

  function showStage(nextStage) {
    stage = nextStage;
    completion.hidden = nextStage !== 'completion';
    wheelStage.hidden = nextStage !== 'wheel';
    dialog.setAttribute(
      'aria-labelledby',
      nextStage === 'completion' ? 'reward-experience-title' : 'reward-wheel-title',
    );
    dialog.setAttribute(
      'aria-describedby',
      nextStage === 'completion' ? 'reward-experience-description' : 'reward-wheel-description',
    );
    if (transitionTimer) {
      clearTimeout(transitionTimer);
      timers.delete(transitionTimer);
    }
    transitionTimer = 0;
    if (nextStage === 'wheel') {
      requestFrame(() => {
        if (!dialog.open || stage !== 'wheel') return;
        drawWheel(rotation);
        focusControl(spinButton);
      });
    }
  }

  function resetView() {
    clearActivity();
    showStage('completion');
    dialog.classList.toggle('reward-reduced-motion', prefersReducedMotion());
    rotation = 0;
    spinning = false;
    spinButton.disabled = false;
    wheelButton.disabled = false;
    wheelButton.removeAttribute('aria-busy');
    spinButton.textContent = 'Spin';
    centerPicky.style.backgroundImage = `url("${sources.pickyIdle}")`;
    centerPicky.classList.remove('is-celebrating');
    spins.innerHTML = 'Spins <strong>1</strong>';
    status.textContent = 'Give the wheel a spin.';
    continueButton.hidden = true;
  }

  function drawWheel(selectorRotation = 0) {
    const bounds = canvas.getBoundingClientRect();
    const cssSize = Math.max(1, Math.round(Math.min(bounds.width, bounds.height)));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(cssSize * pixelRatio);
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const context = canvas.getContext('2d');
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, cssSize, cssSize);
    context.imageSmoothingEnabled = false;

    const center = cssSize / 2;
    const designScale = cssSize / 320;
    const radius = 122 * designScale;
    const segmentAngle = TAU / SEGMENTS.length;
    const outline = '#3a3a50';

    SEGMENTS.forEach((segment, index) => {
      const from = -Math.PI / 2 + (index - 0.5) * segmentAngle;
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, radius, from, from + segmentAngle);
      context.closePath();
      context.fillStyle = RARITY_COLORS[segment.rarity];
      context.fill();
    });

    context.strokeStyle = outline;
    context.lineWidth = Math.max(1.5, 1.5 * designScale);
    SEGMENTS.forEach((_, index) => {
      const angle = -Math.PI / 2 + (index - 0.5) * segmentAngle;
      context.beginPath();
      context.moveTo(center, center);
      context.lineTo(center + Math.cos(angle) * radius, center + Math.sin(angle) * radius);
      context.stroke();
    });

    context.fillStyle = outline;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${Math.max(11, 14 * designScale)}px Pixeloid, monospace`;
    SEGMENTS.forEach((segment, index) => {
      const angle = -Math.PI / 2 + index * segmentAngle;
      const image = getImage(segment.icon);
      const iconSize = 32 * designScale;
      const iconX = center + Math.cos(angle) * radius * 0.8 - iconSize / 2;
      const iconY = center + Math.sin(angle) * radius * 0.8 - iconSize / 2;
      if (image.complete && image.naturalWidth) context.drawImage(image, iconX, iconY, iconSize, iconSize);
      context.fillText(
        String(segment.amount),
        center + Math.cos(angle) * radius * 0.42,
        center + Math.sin(angle) * radius * 0.42,
      );
    });

    context.beginPath();
    context.arc(center, center, radius, 0, TAU);
    context.strokeStyle = outline;
    context.lineWidth = Math.max(3, 4 * designScale);
    context.stroke();

    const span = segmentAngle * 1.12;
    const selectorAngle = -Math.PI / 2 + selectorRotation;
    const selectorRadius = radius + 8 * designScale;
    const knobDistance = selectorRadius - 11 * designScale;
    const knobRadius = 16 * designScale;
    const knobX = center + Math.cos(selectorAngle) * knobDistance;
    const knobY = center + Math.sin(selectorAngle) * knobDistance;
    const clampUnit = value => Math.max(-1, Math.min(1, value));
    const wheelIntersection = Math.acos(clampUnit(
      (knobDistance ** 2 + selectorRadius ** 2 - knobRadius ** 2)
        / (2 * knobDistance * selectorRadius),
    ));
    const knobIntersection = Math.acos(clampUnit(
      (selectorRadius ** 2 - knobRadius ** 2 - knobDistance ** 2)
        / (2 * knobDistance * knobRadius),
    ));
    context.beginPath();
    context.moveTo(center, center);
    context.lineTo(
      center + Math.cos(selectorAngle - span / 2) * selectorRadius,
      center + Math.sin(selectorAngle - span / 2) * selectorRadius,
    );
    context.arc(
      center,
      center,
      selectorRadius,
      selectorAngle - span / 2,
      selectorAngle - wheelIntersection,
    );
    context.arc(
      knobX,
      knobY,
      knobRadius,
      selectorAngle - knobIntersection,
      selectorAngle + knobIntersection,
    );
    context.arc(
      center,
      center,
      selectorRadius,
      selectorAngle + wheelIntersection,
      selectorAngle + span / 2,
    );
    context.closePath();
    context.fillStyle = 'rgba(241, 255, 230, 0.45)';
    context.fill();
    context.strokeStyle = outline;
    context.lineWidth = Math.max(3, 4 * designScale);
    context.lineJoin = 'round';
    context.stroke();
  }

  function animateNode(node, keyframes, options) {
    const animation = node.animate(keyframes, options);
    activeAnimations.add(animation);
    animation.finished.catch(() => {}).finally(() => activeAnimations.delete(animation));
    return animation;
  }

  function launchCelebration() {
    effects.replaceChildren();
    const duration = 3600;
    const reduced = prefersReducedMotion();
    const cheer = element('span', 'reward-picky-cheer');
    const cheerSprite = element('span', 'reward-picky-sprite');
    cheerSprite.style.backgroundImage = `url("${sources.pickyThumbs}")`;
    cheer.append(cheerSprite);
    effects.append(cheer);

    if (!reduced) {
      const toss = element('span', 'reward-picky-toss');
      const sprite = element('span', 'reward-picky-sprite');
      sprite.style.backgroundImage = `url("${sources.pickyThumbs}")`;
      toss.append(sprite);
      effects.append(toss);
      const frames = Array.from({ length: 41 }, (_, frame) => {
        const t = frame / 40;
        // Almost vertical: a small drift, with symmetric rise and fall.
        const x = -34 + 4 * t;
        const y = 28 - 56 * 4 * t * (1 - t);
        return {
          transform: `translate(${x}vw, ${y}vh) rotate(${-3 * t}turn)`,
          opacity: t > .9 ? (1 - t) / .1 : 1,
          offset: t,
        };
      });
      animateNode(toss, frames, { duration, easing: 'linear', fill: 'forwards' });
    }
    // Both the toss and stationary cheer end together, including reduced motion.
    setTimer(() => effects.replaceChildren(), duration);
  }

  function completeSpin() {
    spinning = false;
    wheelButton.removeAttribute('aria-busy');
    spinButton.textContent = 'Nice spin!';
    spins.innerHTML = 'Spins <strong>0</strong>';
    status.textContent = 'A big thumbs-up from Picky!';
    continueButton.hidden = false;
    launchCelebration();
    focusControl(continueButton);
  }

  function spin() {
    if (spinning || spinButton.disabled) return;
    spinning = true;
    spinButton.disabled = true;
    wheelButton.disabled = true;
    wheelButton.setAttribute('aria-busy', 'true');
    status.textContent = 'Round and round we go…';
    const random = globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
      : Math.random();
    const index = NON_LEGENDARY_INDICES[Math.floor(random * NON_LEGENDARY_INDICES.length)];
    const start = rotation % TAU;
    const finish = TAU * 4 + index * (TAU / SEGMENTS.length);
    const duration = prefersReducedMotion() ? 120 : 3600;
    const started = performance.now();

    function tick(now) {
      const progressValue = Math.min(1, (now - started) / duration);
      rotation = start + (finish - start) * easeOutQuint(progressValue);
      drawWheel(rotation);
      if (progressValue < 1) {
        requestFrame(tick);
      } else {
        completeSpin();
      }
    }
    requestFrame(tick);
  }

  function close(reason = 'close', notify = true) {
    if (!dialog.open) return;
    clearActivity();
    dialog.close();
    const restoredScrollY = unfreezePage();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    if (notify) onClose({ reason, scrollY: restoredScrollY, scrollProgress });
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]):not([hidden])')]
      .filter(node => !node.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function open({ replay = false } = {}) {
    if (dialog.open) return true;
    if (shown && !replay) return false;
    shown = true;
    previousFocus = document.activeElement;
    resetView();
    freezePage();
    dialog.showModal();
    completion.classList.remove('is-entered');
    requestFrame(() => {
      if (dialog.open && stage === 'completion') completion.classList.add('is-entered');
    });
    focusControl(toWheel);
    transitionTimer = setTimer(() => showStage('wheel'), prefersReducedMotion() ? 1000 : 2200);
    return true;
  }

  function reset() {
    if (dialog.open) close('reset', false);
    clearActivity();
    shown = false;
    resetView();
  }

  closeButton.addEventListener('click', () => close('close'));
  toWheel.addEventListener('click', () => showStage('wheel'));
  spinButton.addEventListener('click', spin);
  wheelButton.addEventListener('click', spin);
  continueButton.addEventListener('click', () => close('continue'));
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close('escape');
  });
  dialog.addEventListener('keydown', trapFocus);

  const resizeObserver = new ResizeObserver(() => {
    if (dialog.open && stage === 'wheel') drawWheel(rotation);
  });
  resizeObserver.observe(canvas);
  document.fonts?.ready.then(() => {
    if (dialog.open && stage === 'wheel') drawWheel(rotation);
  });

  return {
    open,
    reset,
    isOpen: () => dialog.open,
  };
}
