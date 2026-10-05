import { ref } from 'vue';
import * as G from '../core/geometry.js';
import { toSTL } from '../core/stl.js';
import { zip } from '../core/zip.js';
import { QUALITY } from '../core/params.js';
import { readme } from '../core/notes.js';
import { nf, t } from '../i18n/index.js';
import { useModel } from './useModel.js';
import { useStatus } from './useStatus.js';

/* Export: builds the STL files at the requested quality, packs them into a ZIP and hands it over.
   Inside a Claude artifact the page cannot download on its own and uses the viewer's save function;
   anywhere else (local development, your own server) it downloads directly.
   File names and the notes file follow the interface language. */

const { setStatus } = useStatus();
const busy = ref(false);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const claudeDownloads = typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function'
  ? window.claude.use('downloads').catch(() => null)
  : Promise.resolve(null);

function saveLocally(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* Hands a file to the user. `onConfirm` runs when the viewer is about to ask for confirmation.
   Rejects with an error carrying `code` when the viewer refuses the download. */
async function saveFile(blob, filename, onConfirm) {
  const downloads = await claudeDownloads;
  if (!downloads) { saveLocally(blob, filename); return; }
  if (onConfirm) onConfirm();
  await downloads.save({ filename, data: blob });
}

/* Reports a failed download on the status line. */
function reportSaveError(err) {
  const code = err && err.code;
  const key = code === 'declined' ? 'exporting.declined'
    : code === 'rate_limited' ? 'exporting.busy'
    : code === 'too_large' ? 'exporting.tooLarge'
    : 'exporting.failed';
  if (!code) console.error(err);
  setStatus(key, {}, code === 'declined' ? '' : 'bad');
}

async function exportAll() {
  if (busy.value) return;
  const { params, model } = useModel();
  busy.value = true;
  try {
    setStatus('exporting.building');
    await pause(40);
    const q = G.derive(params);
    const Q = QUALITY[params.quality];
    const tag = `${Math.round(q.H)}x${Math.round(2 * q.Rmax)}`;
    const files = [{ name: t('files.body', { tag }), data: toSTL(G.buildBody(q, Q.seg, Q.dz), 'body') }];
    for (const [which, key] of [['bottom', 'files.capBottom'], ['top', 'files.capTop']]) {
      const spec = G.capSpec(q, which);
      if (!spec) continue;
      files.push({ name: t(key, { d: Math.round(2 * spec.R) }), data: toSTL(G.buildCap(q, spec, Q.seg, Math.min(Q.dz, 0.25), false), which + ' cap') });
    }
    const paramsFile = t('files.params'), readmeFile = t('files.readme');
    const names = files.map((f) => f.name).concat([paramsFile, readmeFile]);
    files.push({ name: paramsFile, data: JSON.stringify({ app: 'Torno Espiral', version: 1, params }, null, 2) });
    files.push({ name: readmeFile, data: readme({ p: params, ...model.value }, names, paramsFile, { t, nf }) });
    setStatus('exporting.zipping');
    await pause(20);
    const blob = await zip(files);
    const file = t('files.zip', { tag });
    const size = nf(blob.size / 1e6, 1);
    await saveFile(blob, file, () => setStatus('exporting.confirm', { size }));
    setStatus('exporting.saved', { file, size }, 'ok');
  } catch (err) {
    reportSaveError(err);
  } finally {
    busy.value = false;
  }
}

export function useExport() {
  return { busy, exportAll, saveFile, reportSaveError };
}
