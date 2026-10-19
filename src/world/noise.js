// Seeded RNG and 2D value noise (deterministic world every load).

export function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const SIZE = 256, perm = new Uint8Array(SIZE * 2), vals = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) { perm[i] = i; vals[i] = rand() * 2 - 1; }
  for (let i = SIZE - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < SIZE; i++) perm[i + SIZE] = perm[i];

  const lattice = (x, y) => vals[perm[(x & 255) + perm[y & 255]]];
  const fade = t => t * t * (3 - 2 * t);

  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = fade(x - xi), v = fade(y - yi);
    const a = lattice(xi, yi), b = lattice(xi + 1, yi);
    const c = lattice(xi, yi + 1), d = lattice(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  // Fractal sum, roughly -1..1
  return (x, y, octaves = 4) => {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };
}
