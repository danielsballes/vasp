/* Printing data: Qidi Q2 nozzles and the layer-support calculation. */

export const PLATE = { x: 270, y: 270, z: 256, name: 'Qidi Q2' };
export const PLA = 1.24; // g/cm³

/* Layer-height limits, stock profile heights and line width that OrcaSlicer ships for the
   Qidi Q2 with each nozzle. */
export const NOZZLES = {
  0.4: { minLayerHeight: 0.08, maxLayerHeight: 0.32, defaultLayerHeight: 0.2, defaultLineWidth: 0.42, profiles: [0.12, 0.16, 0.2, 0.24, 0.28] },
  0.6: { minLayerHeight: 0.12, maxLayerHeight: 0.42, defaultLayerHeight: 0.3, defaultLineWidth: 0.62, profiles: [0.18, 0.24, 0.3, 0.36, 0.42] },
  0.8: { minLayerHeight: 0.16, maxLayerHeight: 0.56, defaultLayerHeight: 0.4, defaultLineWidth: 0.82, profiles: [0.24, 0.32, 0.4, 0.48, 0.56] },
};
export const NOZZLE_SIZES = [0.4, 0.6, 0.8];
export const nozzleOf = (nozzle) => NOZZLES[nozzle] || NOZZLES[0.4];

/* The Orca wiki advises against line widths above 150 % of the nozzle diameter. */
export const MAX_LINE_WIDTH_RATIO = 1.5;
export const maxLineWidthOf = (nozzle) => +(nozzle * MAX_LINE_WIDTH_RATIO).toFixed(2);

/* Share of each line that rests on the previous layer on a wall tilted `tiltDegrees` degrees from
   vertical: 1 is full support, 0 or less means the layer lands outside the previous one. */
export const supportAt = (tiltDegrees, layerHeight, lineWidth) => 1 - (layerHeight * Math.tan((tiltDegrees * Math.PI) / 180)) / lineWidth;

/* Support badge levels. They are this app's own rule of thumb, not taken from the Orca docs.
   `level` is the message key under `support.*`. */
export function supportLevel(percent) {
  if (percent >= 50) return { cssClass: 'ok', level: 'ample' };
  if (percent >= 40) return { cssClass: 'ok', level: 'enough' };
  if (percent >= 15) return { cssClass: 'warn', level: 'tight' };
  if (percent > 0) return { cssClass: 'bad', level: 'scarce' };
  return { cssClass: 'bad', level: 'none' };
}

/* Finds the tallest layer that still supports the steepest area without exceeding the maximum line
   width: first half a line of support using a stock Orca profile height, then 40 %, and finally the
   minimum layer height. */
export function suggestPrint(tiltDegrees, nozzle) {
  const profile = nozzleOf(nozzle), tiltTan = Math.tan((tiltDegrees * Math.PI) / 180), maxLineWidth = maxLineWidthOf(nozzle);
  const heights = [...profile.profiles].sort((a, b) => b - a).filter((height) => height > profile.minLayerHeight);
  /* First layer height in the list whose line, rounded up to 0.02 mm, rests `share` on the layer below. */
  const firstThatFits = (list, share) => {
    for (const layerHeight of list) {
      const lineWidth = Math.max(profile.defaultLineWidth, Math.ceil((layerHeight * tiltTan) / (1 - share) / 0.02 - 1e-6) * 0.02);
      if (lineWidth <= maxLineWidth + 1e-9) return { layerHeight, lineWidth: +lineWidth.toFixed(2), ok: true };
    }
    return null;
  };
  return firstThatFits(heights, 0.5) || firstThatFits(heights, 0.4)
    || firstThatFits([profile.minLayerHeight], 0.5) || firstThatFits([profile.minLayerHeight], 0.4)
    || { layerHeight: profile.minLayerHeight, lineWidth: maxLineWidth, ok: false };
}
