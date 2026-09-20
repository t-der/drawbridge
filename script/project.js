import { TarReader, TarWriter } from './tar.js';
import { encryptProject, decryptProject, createEncryptedContainer, readClearMetadata } from './encryption.js';

export class ProjectManager {
  constructor(state, ui) {
    this.state = state;
    this.ui = ui;
  }

  createNewProject() {
    this.state.files.clear();
    this.state.projectName = 'neues-projekt.prj';

    const defaultIndex = `<!DOCTYPE html>\n<html lang="de">\n<head>\n  <meta charset="UTF-8">\n  <title>Neues Projekt</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hallo Welt</h1>\n  <script src="script.js"></script>\n</body>\n</html>`;
    const defaultCss = `body {\n  font-family: sans-serif;\n  background: #1e1e1e;\n  color: #fff;\n  padding: 20px;\n}`;
    const defaultJs = `console.log("Projekt erfolgreich gestartet!");`;

    const encoder = new TextEncoder();
    this.state.files.set('index.html', { path: 'index.html', type: 'file', size: encoder.encode(defaultIndex).length, data: encoder.encode(defaultIndex), modified: false });
    this.state.files.set('style.css', { path: 'style.css', type: 'file', size: encoder.encode(defaultCss).length, data: encoder.encode(defaultCss), modified: false });
    this.state.files.set('script.js', { path: 'script.js', type: 'file', size: encoder.encode(defaultJs).length, data: encoder.encode(defaultJs), modified: false });

    this.state.activeFile = 'index.html';
    this.state.notify('projectLoaded');
    this.state.notify('fileSelected');
    this.ui.switchView('editor');
  }

  async loadProjectFile(file) {
    if (file.name.endsWith('.prj.enc')) {
      await this.loadEncryptedProject(file);
      return;
    }
    if (!/\.(?:prj|tar)$/i.test(file.name)) {
      this.ui.showError("Ungültiges Dateiformat. Bitte wähle eine .prj oder .tar Datei.");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      let extractedFiles = TarReader.parse(buffer);

      if (!extractedFiles || extractedFiles.length === 0) {
        this.ui.showError("Das gewählte Projektarchiv ist leer oder beschädigt.");
        return;
      }

      // Falls die TAR-Datei in einem Unterordner verpackt war, Stammordner entfernen
      const fileEntries = extractedFiles.filter(f => f.type === 'file');
      if (fileEntries.length > 0) {
        const firstParts = fileEntries[0].path.split('/');
        if (firstParts.length > 1) {
          const possibleRoot = firstParts[0] + '/';
          if (fileEntries.every(f => f.path.startsWith(possibleRoot))) {
            extractedFiles = extractedFiles
              .map(f => ({
                ...f,
                path: f.path.startsWith(possibleRoot) ? f.path.substring(possibleRoot.length) : f.path
              }))
              .filter(f => f.path.length > 0);
          }
        }
      }

      this.state.files.clear();
      this.state.projectName = file.name;

      for (const item of extractedFiles) {
        if (item.path) {
          this.state.files.set(item.path, { ...item, modified: false });
        }
      }

      let entry = this.state.files.has('index.html') ? 'index.html' : null;
      if (!entry) {
        for (const [path, f] of this.state.files.entries()) {
          if (f.type === 'file' && path.toLowerCase().endsWith('index.html')) {
            entry = path;
            break;
          }
        }
      }
      if (!entry) {
        for (const [path, f] of this.state.files.entries()) {
          if (f.type === 'file') {
            entry = path;
            break;
          }
        }
      }

      this.state.activeFile = entry;
      this.state.notify('projectLoaded');
      if (entry) this.state.notify('fileSelected');
      this.ui.switchView('editor');

    } catch (err) {
      this.ui.showError(`Fehler beim Einlesen der PRJ-Datei: ${err.message}`);
    }
  }

  async encryptCurrentProject() {
    if (this.state.files.size === 0) return;
    const result = await this.ui.requestEncryptionPassword();
    if (!result) return;
    if (!result.confirmed) { this.ui.showError('Die Passwörter stimmen nicht überein.'); return; }
    try {
      const payload = await encryptProject(this.state.files, result.password);
      const projectName = this.state.projectName || 'project.prj';
      const container = createEncryptedContainer(payload, projectName);
      const blob = new Blob([container], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const base = projectName.replace(/\.(?:prj|tar)$/i, '') || 'project';
      const a = document.createElement('a'); a.href = url; a.download = `${base}.prj.enc`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err) {
      this.ui.showError(`Fehler beim Verschlüsseln: ${err.message}`);
    }
  }

  async loadEncryptedProject(file) {
    try {
      const outer = new Uint8Array(await file.arrayBuffer());
      const metadata = readClearMetadata(outer);
      const result = await this.ui.requestDecryptionPassword(metadata.version);
      if (!result) return;
      const decrypted = await decryptProject(metadata.payload, result.password);
      let extractedFiles = decrypted.files;
      const fileEntries = extractedFiles.filter(f => f.type === 'file');
      if (fileEntries.length > 0) {
        const firstParts = fileEntries[0].path.split('/');
        if (firstParts.length > 1) {
          const root = firstParts[0] + '/';
          if (fileEntries.every(f => f.path.startsWith(root))) {
            extractedFiles = extractedFiles.map(f => ({ ...f, path: f.path.startsWith(root) ? f.path.substring(root.length) : f.path })).filter(f => f.path.length > 0);
          }
        }
      }
      this.state.files.clear();
      this.state.projectName = file.name.replace(/\.enc$/i, '');
      for (const item of extractedFiles) if (item.path) this.state.files.set(item.path, { ...item, modified: false });
      let entry = this.state.files.has('index.html') ? 'index.html' : null;
      if (!entry) for (const [path, f] of this.state.files) if (f.type === 'file' && path.toLowerCase().endsWith('index.html')) { entry = path; break; }
      if (!entry) for (const [path, f] of this.state.files) if (f.type === 'file') { entry = path; break; }
      this.state.activeFile = entry;
      this.state.notify('projectLoaded');
      if (entry) this.state.notify('fileSelected');
      this.ui.switchView('editor');
    } catch (err) {
      this.ui.showError(`Fehler beim Entschlüsseln: ${err.message}`);
    }
  }

  exportProject() {
    if (this.state.files.size === 0) return;

    try {
      const tarBytes = TarWriter.create(this.state.files);
      const blob = new Blob([tarBytes], { type: 'application/x-tar' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = this.state.projectName.endsWith('.prj') ? this.state.projectName : `${this.state.projectName}.prj`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      this.ui.showError(`Fehler beim Exportieren: ${err.message}`);
    }
  }
}