/* Text that describes how to print a model: the suggested Orca Slicer settings shown in the panel and
   the notes file that ships next to the STL files.

   This module stays free of Vue: the caller injects `tr = { t, nf }`, where `t(key, named)`
   translates a message and `nf(value, digits)` formats a number for the current language.
   ctx = { p, q, m, caps }. */

/* Suggested Orca Slicer settings as [title, text] pairs. */
export function orcaLines({ p, q, m, caps }, { t, nf }) {
  const anyCap = !!(caps.bottom || caps.top);
  const threadOver = Math.max(m.overBot, m.overTop);
  const layers = Math.max(1, Math.round(q.baseT / q.lh));
  const printer = [t('orca.printerTitle'), t('orca.printer', { nozzle: nf(p.nozzle, 1), lh: nf(q.lh, 2), lw: nf(q.lw, 2) })];
  const base = [t('orca.baseTitle'), q.closed
    ? t(q.uneven ? 'orca.baseClosedWalls' : 'orca.baseClosed', { layers, floor: nf(q.baseT, 1) })
    : t(q.thB ? 'orca.baseThread' : 'orca.baseOpen')];
  /* An uneven mouth cannot go in vase mode: the top layers are open arcs. The body is a shell
     with a two-line wall, printed with normal walls. */
  const lines = q.uneven
    ? [
      printer,
      [t('orca.noVaseTitle'), t('orca.noVase', { drop: nf(q.drop), where: t(q.dropBack ? 'editor.dropBack' : 'editor.dropFront'), wall: nf(q.shellWall, 2) })],
      [t('orca.wallsTitle'), t('orca.walls', { lw: nf(q.lw, 2) })],
      base,
      [t('orca.seamTitle'), t('orca.seam')],
    ]
    : [printer, [t('orca.vaseTitle'), t('orca.vase')], base, [t('orca.smoothTitle'), t('orca.smooth')]];
  if (!q.closed) lines.push([t('orca.brimTitle'), t(q.uneven ? 'orca.brimWalls' : 'orca.brim')]);
  if (anyCap) lines.push([t('orca.capsTitle'), t('orca.caps', { over: nf(threadOver) })]);
  return lines;
}

/* Body of the notes file. `files` lists the names packed in the ZIP and `paramsFile` is the one
   that restores the design. */
export function readme(ctx, files, paramsFile, tr) {
  const { q, m, caps } = ctx;
  const { t, nf } = tr;
  const L = [];
  L.push(t('readme.heading'), '');
  L.push(t('readme.part', { h: nf(q.H), d: nf(2 * m.rMax, 1) }));
  L.push(t('readme.units'));
  L.push(q.uneven ? t('readme.contourUneven', { drop: nf(q.drop), where: t(q.dropBack ? 'editor.dropBack' : 'editor.dropFront'), wall: nf(q.shellWall, 2) }) : t('readme.contour'), '');
  L.push(t('readme.files'));
  for (const f of files) L.push('  - ' + f);
  L.push('', t('readme.settings'));
  for (const [title, text] of orcaLines(ctx, tr)) L.push(`  - ${title}: ${text}`);
  if (q.thB || q.thT) {
    L.push('', t('readme.thread', { pitch: nf(q.pitch, 1), c: nf(q.c, 2) }));
    L.push(t('readme.capsNormal'));
    L.push(t('readme.capsFlip'));
    for (const [which, key] of [['bottom', 'readme.holeBottom'], ['top', 'readme.holeTop']]) {
      const c = caps[which];
      if (c && c.spec.hole > 0) L.push(t(key, { d: nf(2 * c.spec.hole, 1) }));
    }
  }
  L.push('', t('readme.resume', { file: paramsFile }));
  return L.join('\r\n');
}
