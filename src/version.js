// Which build of the game this is. Bump BUILD here AND in /version.json in every PR that
// changes game files, so players get the "new version" notice and the Update button works.
export const BUILD = 6;

// Ask the server (never the cache) for the latest build. { latest, newer } (newer: false if offline).
export async function checkUpdate() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return { latest: null, newer: false };
    const latest = (await r.json()).build | 0;
    return { latest, newer: latest > BUILD };
  } catch {
    return { latest: null, newer: false };
  }
}
