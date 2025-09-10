type Patch = Record<string, any>;

export const sur5alPatch: Patch = {
  // 4.25 - DI bonus mess order
  n02H: {
    hotkey: 'Q',
  },
  // 4.25 - DI range
  R09Q: {
    iconsCount: 3,
  },
  // 4.25 - artifacts bonus spell
  A0C5: {
    hotkey: 'C',
  },
};

export const ozPatch: Patch = {};
