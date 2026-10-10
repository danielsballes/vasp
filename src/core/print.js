/* Printing data: Qidi Q2 nozzles and the layer-support calculation. */

export const PLATE = { x: 270, y: 270, z: 256, name: 'Qidi Q2' };
export const PLA = 1.24; // g/cm³

/* Layer-height limits, stock profile heights and line width that OrcaSlicer ships for the
   Qidi Q2 with each nozzle. */
export const NOZZLES = {
  0.4: { lhMin: 0.08, lhMax: 0.32, lhDef: 0.2, lwDef: 0.42, profiles: [0.12, 0.16, 0.2, 0.24, 0.28] },
  0.6: { lhMin: 0.12, lhMax: 0.42, lhDef: 0.3, lwDef: 0.62, profiles: [0.18, 0.24, 0.3, 0.36, 0.42] },
  0.8: { lhMin: 0.16, lhMax: 0.56, lhDef: 0.4, lwDef: 0.82, profiles: [0.24, 0.32, 0.4, 0.48, 0.56] },
};
export const NOZZLE_SIZES = [0.4, 0.6, 0.8];
export const nozzleOf = (nozzle) => NOZZLES[nozzle] || NOZZLES[0.4];

/* The Orca wiki advises against line widths above 150 % of the nozzle diameter. */
export const LW_MAX = 1.5;
export const lwMaxOf = (nozzle) => +(nozzle * LW_MAX).toFixed(2);

/* Share of each line that rests on the previous layer on a wall tilted `deg` degrees from
   vertical: 1 is full support, 0 or less means the layer lands outside the previous one. */
export const supportAt = (deg, lh, lw) => 1 - (lh * Math.tan((deg * Math.PI) / 180)) / lw;

/* Support badge levels. They are this app's own rule of thumb, not taken from the Orca docs.
   `level` is the message key under `support.*`. */
export function supportLevel(pct) {
  if (pct >= 50) return { cls: 'ok', level: 'ample' };
  if (pct >= 40) return { cls: 'ok', level: 'enough' };
  if (pct >= 15) return { cls: 'warn', level: 'tight' };
  if (pct > 0) return { cls: 'bad', level: 'scarce' };
  return { cls: 'bad', level: 'none' };
}

/* Finds the tallest layer that still supports the steepest area without exceeding the maximum line
   width: first half a line of support using a stock Orca profile height, then 40 %, and finally the
   minimum layer height. */
export function suggestPrint(deg, nozzle) {
  const profile = nozzleOf(nozzle), tiltTan = Math.tan((deg * Math.PI) / 180), lwMax = lwMaxOf(nozzle);
  const heights = [...profile.profiles].sort((a, b) => b - a).filter((height) => height > profile.lhMin);
  /* First layer height in the list whose line, rounded up to 0.02 mm, rests `share` on the layer below. */
  const firstThatFits = (list, share) => {
    for (const lh of list) {
      const lw = Math.max(profile.lwDef, Math.ceil((lh * tiltTan) / (1 - share) / 0.02 - 1e-6) * 0.02);
      if (lw <= lwMax + 1e-9) return { lh, lw: +lw.toFixed(2), ok: true };
    }
    return null;
  };
  return firstThatFits(heights, 0.5) || firstThatFits(heights, 0.4)
    || firstThatFits([profile.lhMin], 0.5) || firstThatFits([profile.lhMin], 0.4)
    || { lh: profile.lhMin, lw: lwMax, ok: false };
}
