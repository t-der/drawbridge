import { PathUtils } from './tar.js';

export class TextEditor {
  constructor(state) {
    this.state = state;
    this.container = document.getElementById('editor-container');
    this.renderContainer();

    this.filenameEl = document.getElementById('editor-filename');
    this.dirtyEl = document.getElementById('editor-dirty');
    this.textarea = document.getElementById('text-editor');

    this.textarea.addEventListener('input', () => this.handleInput());
    this.state.subscribe(event => {
      if (['fileSelected', 'projectLoaded'].includes(event)) this.render();
    });
  }

  renderContainer() {
    this.container.innerHTML = `
      <div class="editor-header">
        <span id="editor-filename">filename.ext</span>
        <span id="editor-dirty" class="dirty-indicator hidden">● Geändert</span>
      </div>
      <textarea id="text-editor" class="code-textarea" spellcheck="false" placeholder="Wähle eine Textdatei zum Bearbeiten aus..."></textarea>
    `;
  }

  render() {
    const file = this.state.activeFile ? this.state.files.get(this.state.activeFile) : null;
    if (!file || !PathUtils.isTextFile(file.path) || (file.path.endsWith('.svg') && !this.state.svgSourceMode)) {
      this.container.classList.add('hidden');
      return;
    }

    this.container.classList.remove('hidden');
    this.filenameEl.textContent = file.path;
    this.dirtyEl.classList.toggle('hidden', !file.modified);

    const decoder = new TextDecoder('utf-8');
    this.textarea.value = decoder.decode(file.data);
  }

  handleInput() {
    if (!this.state.activeFile) return;
    const file = this.state.files.get(this.state.activeFile);
    if (!file) return;

    file.data = new TextEncoder().encode(this.textarea.value);
    file.size = file.data.length;
    file.modified = true;

    this.dirtyEl.classList.remove('hidden');
    this.state.notify('fileUpdated');
  }
}