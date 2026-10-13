import { paramsFromFile } from '../core/params.js';
import { useModel } from './useModel.js';
import { useStatus } from './useStatus.js';

/* Loading a parameters file (the JSON saved inside every export ZIP, or a bare parameter set).
   Shared by every "Load parameters" control; the result is reported on the status line. */

const { importParams } = useModel();
const { setStatus } = useStatus();

/* `change` handler for a file input: reads the chosen file, applies it and clears the input so the
   same file can be chosen again. */
function onParamsFile(event) {
  const input = event.target, file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let source;
    try { source = paramsFromFile(JSON.parse(String(reader.result))); } catch { source = null; }
    if (source) {
      importParams(source);
      setStatus('exporting.paramsLoaded', { file: file.name }, 'ok');
    } else {
      setStatus('exporting.badFile', {}, 'bad');
    }
    input.value = '';
  };
  reader.onerror = () => { setStatus('exporting.unreadable', {}, 'bad'); input.value = ''; };
  reader.readAsText(file);
}

export function useParamsFile() {
  return { onParamsFile };
}
