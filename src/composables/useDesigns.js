import { ref } from 'vue';
import { mergeLibraries, parseLibrary, removeDesign, serializeLibrary, upsertDesign } from '../core/designs.js';
import { t } from '../i18n/index.js';
import { useExport } from './useExport.js';
import { useModel } from './useModel.js';
import { useStatus } from './useStatus.js';

/* Saved designs: named copies of the parameters, kept in the browser's local storage so they
   survive closing the page. Local storage belongs to one browser on one machine and is wiped when
   the user clears the site data, hence the backup file. */

const STORE = 'vasp-designs-v1';

const { setStatus } = useStatus();

function read() {
  try {
    return parseLibrary(JSON.parse(localStorage.getItem(STORE) || 'null')) || [];
  } catch {
    return [];
  }
}
/* Whether this browser lets the page write to local storage at all. */
function probe() {
  try {
    const key = STORE + '-probe';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const designs = ref(read());
const storageOk = ref(probe());

/* Replaces the library and writes it to storage. When the browser refuses (storage disabled or
   full) the library still works for this session; the status line says it will not last. */
function commit(list) {
  designs.value = list;
  try {
    localStorage.setItem(STORE, JSON.stringify(serializeLibrary(list)));
    storageOk.value = true;
    return true;
  } catch {
    storageOk.value = false;
    return false;
  }
}
/* Reports the outcome of a change: the given message, or the storage warning when it was not kept. */
function report(stored, key, named, kind) {
  if (stored) setStatus(key, named, kind);
  else setStatus('designs.noStorage', {}, 'bad');
}

/* Another tab of the app changed the library: follow it. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => { if (event.key === STORE) designs.value = read(); });
}

/* Saves the current parameters under `name`, replacing a design with the same name. */
function saveDesign(name) {
  const { session, snapshotParams } = useModel();
  const result = upsertDesign(designs.value, name, snapshotParams());
  if (!result) { setStatus('designs.needName', {}, 'bad'); return false; }
  const stored = commit(result.list);
  session.designName = result.design.name;
  report(stored, result.replaced ? 'designs.updated' : 'designs.saved', { name: result.design.name }, 'ok');
  return true;
}

function loadDesign(id) {
  const design = designs.value.find((saved) => saved.id === id);
  if (!design) return;
  useModel().loadDesignParams(design.params, design.name);
  setStatus('designs.loaded', { name: design.name }, 'ok');
}

function deleteDesign(id) {
  const design = designs.value.find((saved) => saved.id === id);
  if (!design) return;
  const { session } = useModel();
  const stored = commit(removeDesign(designs.value, id));
  if (session.designName === design.name) session.designName = '';
  report(stored, 'designs.removed', { name: design.name }, '');
}

/* Downloads every saved design as one JSON file. */
async function backupDesigns() {
  if (!designs.value.length) { setStatus('designs.nothingToBackup'); return; }
  const { saveFile, reportSaveError } = useExport();
  const file = t('files.designs');
  const blob = new Blob([JSON.stringify(serializeLibrary(designs.value), null, 2)], { type: 'application/json' });
  try {
    await saveFile(blob, file);
    setStatus('designs.backedUp', { file }, 'ok');
  } catch (err) {
    reportSaveError(err);
  }
}

/* The designs in the text of a backup file, or null when it is not one. */
function readBackup(text) {
  try {
    return parseLibrary(JSON.parse(text));
  } catch {
    return null;
  }
}

/* Merges the designs of a backup file (its text) into the library. */
function restoreDesigns(text) {
  const incoming = readBackup(text);
  if (!incoming) { setStatus('designs.badFile', {}, 'bad'); return false; }
  const { list, changed } = mergeLibraries(designs.value, incoming);
  report(changed ? commit(list) : true, 'designs.restored', { n: changed }, 'ok');
  return true;
}

export function useDesigns() {
  return { designs, storageOk, saveDesign, loadDesign, deleteDesign, backupDesigns, restoreDesigns };
}
