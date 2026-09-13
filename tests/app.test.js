import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

function createContext(calls = []) {
  const context = {
    measureText(text) {
      return { width: String(text).length * 8 };
    },
    setTransform(...args) {
      calls.push(['setTransform', ...args]);
    },
    fillText(...args) {
      calls.push(['fillText', ...args]);
    },
    translate(...args) {
      calls.push(['translate', ...args]);
    },
  };
  return new Proxy(context, {
    get(target, property) {
      if (!(property in target)) target[property] = () => {};
      return target[property];
    },
  });
}

class FakeElement {
  constructor(tagName = 'div', contextCalls = []) {
    this.tagName = tagName.toUpperCase();
    this.style = createStyle();
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
    };
    this.hidden = false;
    this.open = false;
    this.textContent = '';
    this.context = createContext(contextCalls);
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  removeAttribute(name) {
    delete this[name];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelectorAll() {
    return [];
  }

  closest() {
    return null;
  }

  getContext() {
    return this.context;
  }

  getBoundingClientRect() {
    return { width: 282, height: 282 };
  }

  focus() {}

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

test('every page uses the safe-area viewport and shared navigation', async () => {
  const [pages, styles] = await Promise.all([
    Promise.all(['index', 'privacy', 'credits'].map(async name => ({
      name,
      html: await readFile(new URL(`../${name === 'index' ? 'index.html' : name + '/index.html'}`, import.meta.url), 'utf8'),
    }))),
    readFile(new URL('../style.css', import.meta.url), 'utf8'),
  ]);

  for (const { name, html } of pages) {
    assert.match(html, /<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*">/, name);
    assert.match(html, /<header class="topbar">/, name);
    assert.match(html, /<a class="brand"[^>]*>/, name);
    assert.match(html, /<nav class="primary-nav" aria-label="Primary navigation">/, name);
  }

  const journey = pages.find(({ name }) => name === 'index').html;
  assert.doesNotMatch(journey, /building-labels|focus-progress/);
  assert.match(styles, /#journey\s*{[^}]*padding-bottom:\s*var\(--scroll-room\)/);
});

test('mobile resize keeps page geometry stable through browser toolbar changes', async () => {
  const mainContextCalls = [];
  const canvas = new FakeElement('canvas', mainContextCalls);
  const signTitle = new FakeElement();
  signTitle.textContent = 'Stop Scrolling!';
  const focusStatus = new FakeElement();
  focusStatus.textContent = 'Your focus challenge starts when you sit down.';
  const elements = new Map([
    ['#world', canvas],
    ['.hero', new FakeElement()],
    ['#sign-title', signTitle],
    ['#focus-status', focusStatus],
  ]);
  const getElement = selector => {
    if (['.building-labels', '.focus-progress', '#focus-progress'].includes(selector)) return null;
    if (!elements.has(selector)) elements.set(selector, new FakeElement());
    return elements.get(selector);
  };
  const root = new FakeElement('html');
  Object.defineProperty(root, 'scrollHeight', {
    get() {
      const chapter = Number.parseFloat(root.style.getPropertyValue('--chapter')) || 0;
      const scrollRoom = Number.parseFloat(root.style.getPropertyValue('--scroll-room')) || 0;
      return 4.8 * chapter + scrollRoom;
    },
  });
  const body = new FakeElement('body');
  const documentListeners = new Map();

  globalThis.document = {
    hidden: false,
    activeElement: null,
    body,
    documentElement: root,
    fonts: { ready: Promise.resolve() },
    createElement: tag => new FakeElement(tag),
    querySelector: getElement,
    querySelectorAll: () => [],
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
  };

  const windowListeners = new Map();
  globalThis.window = globalThis;
  globalThis.addEventListener = (type, listener) => windowListeners.set(type, listener);
  globalThis.innerWidth = 390;
  globalThis.innerHeight = 700;
  globalThis.devicePixelRatio = 2;
  globalThis.scrollY = 0;
  globalThis.screen = { height: 844 };
  globalThis.location = { hash: '', pathname: '/' };
  globalThis.history = { scrollRestoration: 'auto', replaceState() {} };
  globalThis.matchMedia = query => ({
    matches: query === '(pointer: coarse)',
    addEventListener() {},
    removeEventListener() {},
  });
  const scrollCalls = [];
  globalThis.scrollTo = (_x, y) => {
    const chapter = Number.parseFloat(root.style.getPropertyValue('--chapter')) || 0;
    const scrollRoom = Number.parseFloat(root.style.getPropertyValue('--scroll-room')) || 0;
    const maxScroll = Math.max(0, 4.8 * chapter + scrollRoom - globalThis.innerHeight);
    globalThis.scrollY = Math.max(0, Math.min(y, maxScroll));
    scrollCalls.push(globalThis.scrollY);
  };
  const animationFrames = [];
  globalThis.requestAnimationFrame = callback => {
    animationFrames.push(callback);
    return animationFrames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.Image = class {
    constructor() {
      this.complete = true;
      this.naturalWidth = 16;
    }

    decode() {
      return Promise.resolve();
    }

    addEventListener() {}
  };
  let worldCanvasCount = 0;
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.context = createContext();
      worldCanvasCount += 1;
    }

    getContext() {
      return this.context;
    }
  };
  globalThis.ResizeObserver = class {
    observe() {}
  };

  await import('../app.js');

  assert.equal(canvas.style.width, '390px');
  assert.equal(canvas.style.height, '844px');
  assert.equal(canvas.width, 780);
  assert.equal(canvas.height, 1688);
  assert.equal(root.style.getPropertyValue('--chapter'), '700px');
  assert.equal(root.style.getPropertyValue('--scroll-room'), '0px');
  assert.equal(worldCanvasCount, 2);
  assert.equal(typeof windowListeners.get('resize'), 'function');

  globalThis.scrollY = -120;
  animationFrames.shift()(16);
  const topBounceCamera = mainContextCalls
    .filter(([method, x]) => method === 'translate' && x === 0)
    .at(-1);
  assert.equal(Math.abs(topBounceCamera[2]), 0);

  globalThis.scrollY = 1400;
  animationFrames.shift()(32);
  assert.equal(mainContextCalls.some(([method]) => method === 'fillText'), false);

  const scrollCountBeforeToolbarResize = scrollCalls.length;
  globalThis.innerHeight = 844;
  windowListeners.get('resize')();

  assert.equal(canvas.style.height, '844px');
  assert.equal(root.style.getPropertyValue('--chapter'), '700px');
  assert.equal(root.style.getPropertyValue('--scroll-room'), '144px');
  assert.equal(worldCanvasCount, 2);
  assert.equal(scrollCalls.length, scrollCountBeforeToolbarResize);

  const runFrame = now => {
    const callback = animationFrames.shift();
    assert.equal(typeof callback, 'function');
    callback(now);
  };
  const hardScrollToBottom = () => {
    scrollTo(0, Number.POSITIVE_INFINITY);
    windowListeners.get('scroll')();
  };

  hardScrollToBottom();
  assert.equal(globalThis.scrollY, 3.8 * 700);

  runFrame(100);
  assert.equal(globalThis.scrollY, 3.3 * 700);
  runFrame(500);
  runFrame(900);

  const maxScroll = 3.8 * 700;
  globalThis.scrollY = maxScroll + 120;
  windowListeners.get('scroll')();
  const scrollCountBeforeBottomBounce = scrollCalls.length;
  runFrame(1000);
  assert.equal(globalThis.scrollY, maxScroll + 120);
  assert.equal(scrollCalls.length, scrollCountBeforeBottomBounce);
  assert.deepEqual(
    mainContextCalls.filter(([method, x]) => method === 'translate' && x === 0).at(-1),
    ['translate', 0, -maxScroll],
  );
  assert.equal(getElement('#focus-sign').hidden, false);
  assert.equal(getElement('#seconds').textContent, '05');

  runFrame(5999);
  assert.equal(signTitle.textContent, 'Stop Scrolling!');
  assert.equal(getElement('#seconds').textContent, '01');

  runFrame(6000);
  assert.equal(signTitle.textContent, 'Nice work!');
  assert.equal(getElement('#seconds').textContent, '00');

  getElement('#restart').listeners.get('click')();
});
