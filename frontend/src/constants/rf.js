// frontend/src/constants/rf.js
export const RF_RANGES = {
  len:            { min: 10,  max: 1000, step: 1,    suggest: [60, 100, 150, 200, 300] },
  num:            { min: 1,   max: 20,   step: 1,    suggest: [1, 3, 5, 10] },
  num_steps:      { min: 10,  max: 200,  step: 1,    suggest: [30, 50, 60, 80, 100] },
  temperature:    { min: 0.1, max: 2.0,  step: 0.01, suggest: [0.8, 1.0, 1.1, 1.2] },
  guidance_scale: { min: 0.5, max: 5.0,  step: 0.1,  suggest: [1.0, 2.0, 2.5, 3.0] },
  recycle:        { min: 0,   max: 5,    step: 1,    suggest: [0, 1, 2, 3] },
  seed:           { min: 0,   max: 2147483647, step: 1, suggest: [] },
  symmetry_order: { min: 2,   max: 12,   step: 1,    suggest: [2, 3, 4, 5, 6] },
  min_plddt:      { min: 0,   max: 100,  step: 0.1,  suggest: [60, 70, 80] },
};

export function clamp(v, { min, max }) {
  if (v === '' || v === null || Number.isNaN(Number(v))) return '';
  const x = Number(v);
  return Math.min(max, Math.max(min, x));
}
