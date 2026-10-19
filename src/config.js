// All tunable numbers live here.

export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const CONFIG = {
  render: {
    maxPixelRatioMobile: 1.5,
    maxPixelRatioDesktop: 2,
    fov: 60,
    near: 0.1,
    far: 160,
  },

  loop: {
    tickRate: 60,          // fixed logic steps per second
    maxFrameTime: 0.25,    // clamp after tab switch / hitch
  },

  fog: {
    color: 0xc8d4de,
    near: 25,
    far: 140,
  },

  light: {
    skyColor: 0xdfe9f3,
    groundColor: 0x55606a,
    hemiIntensity: 1.6,
    sunColor: 0xfff1dc,
    sunIntensity: 1.6,
    sunDir: [0.5, 0.8, 0.3],
  },

  terrain: {
    seed: 7331,
    size: 480,             // world units, square, centred on origin
    segments: 120,         // cells per side
    hillHeight: 7,         // rolling noise amplitude in the valley
    hillScale: 0.018,
    rimStart: 0.42,        // normalised radius where the valley wall begins
    rimHeight: 70,
    peak: { x: 0, z: -175, height: 95, radius: 75 },
    flatRadius: 22,        // flattened area at the centre (future village)
    snowLine: 22,
    rockSlope: 0.75,       // normal.y below this = rock
    colors: {
      grass: 0x5d7a4a,
      grassDark: 0x4a6640,
      dirt: 0x7a6a52,
      rock: 0x6e7177,
      snow: 0xf2f5f8,
    },
  },

  props: {
    seed: 4242,
    trees: 420,
    rocks: 160,
    treeMaxHeight: 30,     // no trees above this terrain height
    treeMaxSlope: 0.8,     // min normal.y for a tree
    clearRadius: 26,       // keep the centre clear
    treeCollideRadius: 0.6,
    rockCollideScale: 0.8,
  },

  snow: {
    count: 900,
    area: 40,              // box around the player
    height: 25,
    fallSpeed: 2.2,
    drift: 0.8,
    size: 0.12,
  },

  player: {
    walkSpeed: 4.5,
    runSpeed: 7.5,
    accel: 12,             // velocity smoothing (higher = snappier)
    turnSpeed: 12,         // facing smoothing
    radius: 0.4,
    maxClimb: 1.1,         // max rise per unit moved (slope limit)
    worldMargin: 12,       // keep away from terrain edge
    spawn: [0, 0],
  },

  camera: {
    distance: 6,
    height: 1.6,           // look-at height above player feet
    minPitch: -0.35,
    maxPitch: 1.1,
    startPitch: 0.3,
    follow: 10,            // position smoothing
    groundClearance: 0.6,
  },

  input: {
    mouseSensitivity: 0.0025,
    touchLookSensitivity: 0.006,
    joystickRadius: 55,    // px
    joystickDeadzone: 0.12,
    runThreshold: 0.85,    // joystick push beyond this = run
  },
};
