import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pages = ['index.html', 'privacy/index.html', 'credits/index.html', 'about/index.html', 'privacy.html', 'credits.html'];

test('published routes resolve every local HTML link and asset', async () => {
  for (const path of pages) {
    const page = new URL(path, root);
    const html = await readFile(page, 'utf8');
    for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|#)/.test(value)) continue;
      const target = new URL(value, page);
      target.search = '';
      target.hash = '';
      if (target.pathname.endsWith('/')) target.pathname += 'index.html';
      assert.ok((await stat(target)).isFile(), `${path}: ${value}`);
    }
  }
});

test('canonical game policy and existing about URL remain available', async () => {
  const policy = await readFile(new URL('privacy/index.html', root), 'utf8');
  assert.match(policy, /Device UUID used for authentication/);
  assert.doesNotMatch(policy, /does not describe the separate Pixiverse game/);
  assert.match(policy, /https:\/\/pixiverse\.app\/privacy\//);
  const about = await readFile(new URL('about/index.html', root), 'utf8');
  assert.match(about, /What Pixiverse is/);
});
