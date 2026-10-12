/* Text that describes how to print a model: the suggested Orca Slicer settings shown in the panel and
   the notes file that ships next to the STL files.

   This module stays free of Vue: the caller injects `translator = { t, formatNumber }`, where
   `t(key, named)` translates a message and `formatNumber(value, digits)` formats a number for the
   current language.
   context = { params, shape, measures, caps }. */

/* Suggested Orca Slicer settings as [title, text] pairs. */
export function orcaLines({ params, shape, measures, caps }, { t, formatNumber }) {
  const anyCap = !!(caps.bottom || caps.top);
  const threadOver = Math.max(measures.overBottom, measures.overTop);
  const layers = Math.max(1, Math.round(shape.baseThickness / shape.layerHeight));
  const printer = [t('orca.printerTitle'), t('orca.printer', { nozzle: formatNumber(params.nozzle, 1), lh: formatNumber(shape.layerHeight, 2), lw: formatNumber(shape.lineWidth, 2) })];
  const base = [t('orca.baseTitle'), shape.closedBase
    ? t(shape.uneven ? 'orca.baseClosedWalls' : 'orca.baseClosed', { layers, floor: formatNumber(shape.baseThickness, 1) })
    : t(shape.bottomThread ? 'orca.baseThread' : 'orca.baseOpen')];
  const where = t(shape.dropBack ? 'editor.dropBack' : 'editor.dropFront');
  /* An uneven mouth cannot go in vase mode: the top layers are open arcs. The body is a shell
     with a two-line wall, printed with normal walls. */
  const lines = shape.uneven
    ? [
      printer,
      [t('orca.noVaseTitle'), t('orca.noVase', { drop: formatNumber(shape.drop), where, wall: formatNumber(shape.shellWall, 2) })],
      [t('orca.wallsTitle'), t('orca.walls', { lw: formatNumber(shape.lineWidth, 2) })],
      ...(shape.shellThin
        ? [[t('orca.thinWallTitle'), t('orca.thinWall', { thin: formatNumber(shape.shellWallMin, 2), wall: formatNumber(shape.shellWall, 2) })]]
        : []),
      base,
      [t('orca.seamTitle'), t('orca.seam')],
    ]
    : [printer, [t('orca.vaseTitle'), t('orca.vase')], base, [t('orca.smoothTitle'), t('orca.smooth')]];
  if (!shape.closedBase) lines.push([t('orca.brimTitle'), t(shape.uneven ? 'orca.brimWalls' : 'orca.brim')]);
  if (anyCap) lines.push([t('orca.capsTitle'), t('orca.caps', { over: formatNumber(threadOver) })]);
  return lines;
}

/* Body of the notes file. `files` lists the names packed in the ZIP and `paramsFile` is the one
   that restores the design. */
export function readme(context, files, paramsFile, translator) {
  const { shape, measures, caps } = context;
  const { t, formatNumber } = translator;
  const lines = [];
  lines.push(t('readme.heading'), '');
  lines.push(t('readme.part', { h: formatNumber(shape.height), d: formatNumber(2 * measures.maxRadius, 1) }));
  lines.push(t('readme.units'));
  lines.push(shape.uneven
    ? t('readme.contourUneven', {
      drop: formatNumber(shape.drop), where: t(shape.dropBack ? 'editor.dropBack' : 'editor.dropFront'), wall: formatNumber(shape.shellWall, 2),
    })
    : t('readme.contour'), '');
  lines.push(t('readme.files'));
  for (const file of files) lines.push('  - ' + file);
  lines.push('', t('readme.settings'));
  for (const [title, text] of orcaLines(context, translator)) lines.push(`  - ${title}: ${text}`);
  if (shape.bottomThread || shape.topThread) {
    lines.push('', t('readme.thread', { pitch: formatNumber(shape.pitch, 1), c: formatNumber(shape.clearance, 2) }));
    lines.push(t('readme.capsNormal'));
    lines.push(t('readme.capsFlip'));
    for (const [which, key] of [['bottom', 'readme.holeBottom'], ['top', 'readme.holeTop']]) {
      const cap = caps[which];
      if (cap && cap.spec.hole > 0) lines.push(t(key, { d: formatNumber(2 * cap.spec.hole, 1) }));
    }
  }
  lines.push('', t('readme.resume', { file: paramsFile }));
  return lines.join('\r\n');
}
