import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardExperience } from '../reward.js';

function createStyle() {
  const values = new Map();
  return {
    setProperty(name, value) {
      values.set(name, value);
    },
    getPropertyValue(name) {
      return values.get(name) ?? '';
    },
    removeProperty(name) {
      values.delete(name);
    },
  };
}

function createContext() {
  return new Proxy({}, {
    get(target, property) {
      if (!(property in target)) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.style = createStyle();
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.className = '';
    this.hidden = false;
    this.open = false;
    this.disabled = false;
    this.textContent = '';
    this.innerHTML = '';
    this.isConnected = true;
    this.context = createContext();
    this.classList = {
      add: (...names) => this.#setClasses([...this.#classes(), ...names]),
      remove: (...names) => this.#setClasses(this.#classes().filter(name => !names.includes(name))),
      toggle: (name, force) => {
        const names = this.#classes();
        const present = names.includes(name);
        const enabled = force ?? !present;
        this.#setClasses(enabled ? [...names, name] : names.filter(value => value !== name));
        return enabled;
      },
    };
  }

  #classes() {
    return this.className.split(/\s+/).filter(Boolean);
  }

  #setClasses(names) {
    this.className = [...new Set(names)].join(' ');
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.listeners.get('click')?.({ target: this });
  }

  querySelectorAll(selector) {
    const descendants = [];
    const visit = node => {
      for (const child of node.children) {
        descendants.push(child);
        visit(child);
      }
    };
    visit(this);
    if (selector === 'button:not([disabled]):not([hidden])') {
      return descendants.filter(node => node.tagName === 'BUTTON' && !node.disabled && !node.hidden);
    }
    return [];
  }

  closest(selector) {
    if (selector !== '[hidden]') return null;
    for (let node = this; node; node = node.parentElement) {
      if (node.hidden) return node;
    }
    return null;
  }

  getContext() {
    return this.context;
  }

  getBoundingClientRect() {
    return { width: 320, height: 320 };
  }

  focus() {
    document.activeElement = this;
    this.focused = true;
  }

  animate() {
    return { cancel() {}, finished: Promise.resolve() };
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }
}

function findByClass(root, className) {
  if (root.className.split(/\s+/).includes(className)) return root;
  for (const child of root.children) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

test('reward walkthrough guards automatic replay and resets the full interaction', () => {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const frames = new Map();
  const scrollCalls = [];
  const closeEvents = [];

  const body = new FakeElement('body');
  const previousFocus = new FakeElement('button');
  const documentElement = { scrollHeight: 2000 };
  globalThis.document = {
    activeElement: previousFocus,
    body,
    documentElement,
    fonts: { ready: Promise.resolve() },
    createElement: tag => new FakeElement(tag),
  };
  globalThis.window = globalThis;
  globalThis.innerHeight = 1000;
  globalThis.devicePixelRatio = 2;
  globalThis.scrollY = 400;
  globalThis.scrollTo = (_x, y) => {
    globalThis.scrollY = y;
    scrollCalls.push(y);
  };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.performance = { now: () => now };
  globalThis.setTimeout = (callback, delay) => {
    const id = nextId++;
    timers.set(id, { callback, due: now + delay });
    return id;
  };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.requestAnimationFrame = callback => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.ResizeObserver = class {
    observe() {}
  };
  globalThis.Image = class {
    complete = true;
    naturalWidth = 16;
    addEventListener() {}
  };

  const runFrames = time => {
    now = time;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  };
  const advance = milliseconds => {
    const target = now + milliseconds;
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.due <= target)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      const [id, timer] = due;
      timers.delete(id);
      now = timer.due;
      timer.callback();
    }
    now = target;
  };

  const reward = createRewardExperience({
    reducedMotion: true,
    onClose: event => closeEvents.push(event),
  });
  const dialog = findByClass(body, 'reward-experience');
  const completion = findByClass(dialog, 'reward-completion');
  const wheel = findByClass(dialog, 'reward-wheel-stage');
  const toWheel = findByClass(dialog, 'reward-to-wheel');
  const spin = findByClass(dialog, 'reward-spin-button');
  const status = findByClass(dialog, 'reward-status');
  const effects = findByClass(dialog, 'reward-effects');
  const continueButton = findByClass(dialog, 'reward-result-continue');

  assert.equal(reward.open(), true);
  assert.equal(reward.isOpen(), true);
  assert.equal(reward.open(), true);
  assert.equal(body.className, 'reward-page-locked');
  assert.equal(body.style.getPropertyValue('--reward-scroll-lock'), '-400px');

  findByClass(dialog, 'reward-close').click();
  assert.equal(reward.isOpen(), false);
  assert.equal(closeEvents[0].reason, 'close');
  assert.equal(closeEvents[0].scrollY, 400);
  assert.equal(previousFocus.focused, true);
  assert.equal(reward.open(), false);

  documentElement.scrollHeight = 3000;
  globalThis.scrollY = 800;
  document.activeElement = previousFocus;
  assert.equal(reward.open({ replay: true }), true);
  assert.equal(completion.hidden, false);
  assert.equal(wheel.hidden, true);

  toWheel.click();
  runFrames(now);
  assert.equal(completion.hidden, true);
  assert.equal(wheel.hidden, false);
  assert.equal(spin.focused, true);

  spin.click();
  assert.equal(spin.disabled, true);
  assert.equal(status.textContent, 'Round and round we go…');
  runFrames(now);
  runFrames(now + 120);
  assert.equal(status.textContent, 'A big thumbs-up from Picky!');
  assert.equal(continueButton.hidden, false);
  assert.equal(effects.children.length, 1);

  advance(3599);
  assert.equal(effects.children.length, 1);
  advance(1);
  assert.equal(effects.children.length, 0);

  documentElement.scrollHeight = 4000;
  continueButton.click();
  assert.equal(reward.isOpen(), false);
  assert.equal(closeEvents.at(-1).reason, 'continue');
  assert.equal(closeEvents.at(-1).scrollY, 1200);
  assert.equal(scrollCalls.at(-1), 1200);
  assert.equal(previousFocus.focused, true);

  reward.reset();
  assert.equal(reward.open(), true);
  reward.reset();
  assert.equal(reward.isOpen(), false);
  assert.equal(closeEvents.length, 2);
  assert.equal(reward.open(), true);
  reward.reset();
});
