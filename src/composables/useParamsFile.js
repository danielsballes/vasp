import { paramsFromFile } from '../core/params.js';
import { useModel } from './useModel.js';
import { useStatus } from './useStatus.js';

/* Loading a parameters file (the JSON saved inside every export ZIP, or a bare parameter set).
   Shared by every "Load parameters" control; the result is reported on the status line. */

const { importParams } = useModel();
const { setStatus } = useStatus();

/* `change` handler for a file input: reads the chosen file, applies it and clears the input so the
   same file can be chosen again. */
function onParamsFile(e) {
  const input = e.target, file = input.files && input.files[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    let src;
    try { src = paramsFromFile(JSON.parse(String(fr.result))); } catch { src = null; }
    if (src) {
      importParams(src);
      setStatus('exporting.paramsLoaded', { file: file.name }, 'ok');
    } else {
      setStatus('exporting.badFile', {}, 'bad');
    }
    input.value = '';
  };
  fr.onerror = () => { setStatus('exporting.unreadable', {}, 'bad'); input.value = ''; };
  fr.readAsText(file);
}

export function useParamsFile() {
  return { onParamsFile };
}
