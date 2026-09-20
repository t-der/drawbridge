import { AppState } from './state.js';
import { ProjectManager } from './project.js';
import { ProjectTree } from './tree.js';
import { TextEditor } from './editor.js';
import { FilePreview } from './file-preview.js';
import { LivePreview } from './live-preview.js';
import { UIManager } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const state = new AppState();
  const ui = new UIManager(state);
  const projectManager = new ProjectManager(state, ui);

  new ProjectTree(state, ui);
  new TextEditor(state);
  new FilePreview(state);

  const livePreview = new LivePreview(state, ui);
  state.subscribe(event => {
    if (event === 'renderPreview') livePreview.update();
  });

  // Event Handlers für Dateidialoge
  const triggerOpen = () => ui.fileInput.click();
  const triggerNew = () => projectManager.createNewProject();

  ui.btnOpen.addEventListener('click', triggerOpen);
  ui.btnNew.addEventListener('click', triggerNew);
  if (ui.welcomeBtnOpen) ui.welcomeBtnOpen.addEventListener('click', triggerOpen);
  if (ui.welcomeBtnNew) ui.welcomeBtnNew.addEventListener('click', triggerNew);

  ui.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      projectManager.loadProjectFile(e.target.files[0]);
      e.target.value = '';
    }
  });
  ui.btnExport.addEventListener('click', () => projectManager.exportProject());
  ui.btnEncrypt.addEventListener('click', () => projectManager.encryptCurrentProject());
  ui.btnLoadDecrypt.addEventListener('click', () => ui.encryptedFileInput.click());

  ui.encryptedFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) { projectManager.loadEncryptedProject(e.target.files[0]); e.target.value = ''; }
  });

  // Globales Drag & Drop für das gesamte Browserfenster
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    window.addEventListener(eventName, (e) => e.preventDefault(), false);
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (/\.prj\.enc$/i.test(file.name)) projectManager.loadEncryptedProject(file);
      else projectManager.loadProjectFile(file);
    }
  });
});