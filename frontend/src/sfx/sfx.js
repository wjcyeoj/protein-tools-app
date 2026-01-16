// frontend/src/sfx/sfx.js
let enabled = true;
let volume = 1.00;

const cache = new Map();

function getAudio(src) {
  if (!cache.has(src)) {
    const a = new Audio(src);
    a.preload = 'auto';
    cache.set(src, a);
  }
  // Clone by creating a new Audio so overlapping clicks don't cut each other off
  return new Audio(src);
}

export function configureSfx({ isEnabled, vol } = {}) {
  if (typeof isEnabled === 'boolean') enabled = isEnabled;
  if (typeof vol === 'number') volume = Math.max(0, Math.min(1, vol));
}

export async function playSfx(src) {
  if (!enabled) return;

  // Respect reduced-motion as a proxy for "less sensory stuff"
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduce) return;

  try {
    const a = getAudio(src);
    a.volume = volume;
    a.currentTime = 0;
    await a.play();
  } catch {
    // Browser may block until user gesture; ignore silently
  }
}
