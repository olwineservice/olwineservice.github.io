import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('about and features titles include the shared app icon before the app name', () => {
  for (const file of ['about.html', 'features.html']) {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /<h1 class="app-title"><span class="app-title-brand"><img src="images\/app-icon\.png" width="180" height="180" alt="">OL~ WINE<\/span>/);
  }
  assert.ok(existsSync(new URL('../images/app-icon.png', import.meta.url)));
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.app-title-brand img\s*\{[^}]*width: 1em;[^}]*height: 1em;/);
});
