// One-click update: refetch every game file past the browser cache (fetch with
// cache: 'reload' overwrites the cached copy), then reload the page. No cache clearing by hand.
// The file list is found by following the imports from src/main.js. Music is left alone.
import { CONFIG } from './config.js';

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g;

async function moduleGraph(entry) {
  const seen = new Set(), queue = [entry];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const text = await (await fetch(url, { cache: 'reload' })).text();   // refreshes it too
      for (const m of text.matchAll(IMPORT)) queue.push(new URL(m[1], url).href);
    } catch { /* offline: keep going with what we have */ }
  }
  return seen;
}

// Returns a promise that never resolves (the page reloads).
export async function updateGame() {
  const base = new URL('.', location.href);
  await moduleGraph(new URL('src/main.js', base).href);
  const extra = ['index.html', 'version.json', CONFIG.net.peerjsUrl, ''];
  await Promise.all(extra.map(p => fetch(new URL(p, base).href, { cache: 'reload' }).catch(() => {})));
  location.reload();
  return new Promise(() => {});
}
