import { ref } from 'vue';
import * as G from '../core/geometry.js';
import { toSTL } from '../core/stl.js';
import { zip } from '../core/zip.js';
import { QUALITY } from '../core/params.js';
import { readme } from '../core/notes.js';
import { formatNumber, t } from '../i18n/index.js';
import { useModel } from './useModel.js';
import { useStatus } from './useStatus.js';

/* Export: builds the STL files at the requested quality, packs them into a ZIP and downloads it.
   File names and the notes file follow the interface language. */

const { setStatus } = useStatus();
const busy = ref(false);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/* Downloads a file through a temporary link. */
function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* Reports a failed export on the status line. */
function reportSaveError(error) {
  console.error(error);
  setStatus('exporting.failed', {}, 'bad');
}

async function exportAll() {
  if (busy.value) return;
  const { params, model } = useModel();
  busy.value = true;
  try {
    setStatus('exporting.building');
    await pause(40);
    const shape = G.derive(params);
    const quality = QUALITY[params.quality];
    const tag = `${Math.round(shape.height)}x${Math.round(2 * shape.maxRadius)}`;
    const files = [{ name: t('files.body', { tag }), data: toSTL((shape.uneven ? G.buildShell : G.buildBody)(shape, quality.segments, quality.ringStep), 'body') }];
    for (const [which, key] of [['bottom', 'files.capBottom'], ['top', 'files.capTop']]) {
      const spec = G.capSpec(shape, which);
      if (!spec) continue;
      const capMesh = G.buildCap(shape, spec, quality.segments, Math.min(quality.ringStep, 0.25), false);
      files.push({ name: t(key, { d: Math.round(2 * spec.neckRadius) }), data: toSTL(capMesh, which + ' cap') });
    }
    const paramsFile = t('files.params'), readmeFile = t('files.readme');
    const names = files.map((file) => file.name).concat([paramsFile, readmeFile]);
    files.push({ name: paramsFile, data: JSON.stringify({ app: 'Vasp', version: 1, params }, null, 2) });
    files.push({ name: readmeFile, data: readme({ params, ...model.value }, names, paramsFile, { t, formatNumber }) });
    setStatus('exporting.zipping');
    await pause(20);
    const blob = await zip(files);
    const file = t('files.zip', { tag });
    const size = formatNumber(blob.size / 1e6, 1);
    saveFile(blob, file);
    setStatus('exporting.saved', { file, size }, 'ok');
  } catch (error) {
    reportSaveError(error);
  } finally {
    busy.value = false;
  }
}

export function useExport() {
  return { busy, exportAll, saveFile, reportSaveError };
}
