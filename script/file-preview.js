import { PathUtils } from './tar.js';

export class FilePreview {
  constructor(state) {
    this.state = state;
    this.container = document.getElementById('preview-file-container');
    this.emptyEditor = document.getElementById('empty-editor');
    
    this.renderContainer();
    this.imgPreview = document.getElementById('image-preview');
    this.imgFilename = document.getElementById('image-filename');
    this.btnSvgMode = document.getElementById('btn-toggle-svg-mode');

    this.btnSvgMode.addEventListener('click', () => {
      this.state.svgSourceMode = !this.state.svgSourceMode;
      this.state.notify('fileSelected');
    });

    this.state.subscribe(event => {
      if (['fileSelected', 'projectLoaded'].includes(event)) this.render();
    });
  }

  renderContainer() {
    this.container.innerHTML = `
      <div id="image-subpane" class="preview-pane hidden">
        <div class="preview-header">
          <span id="image-filename">image.png</span>
          <button id="btn-toggle-svg-mode" class="btn btn-sm hidden">Code anzeigen</button>
        </div>
        <div class="image-wrapper">
          <img id="image-preview" src="" alt="Vorschau">
        </div>
      </div>
      <div id="binary-subpane" class="preview-pane hidden">
        <div class="panel-card centered">
          <h3>Binärdatei</h3>
          <p>Für diesen Dateityp ist keine Vorschau verfügbar.</p>
        </div>
      </div>
    `;
  }

  render() {
    const file = this.state.activeFile ? this.state.files.get(this.state.activeFile) : null;
    const imgSubpane = document.getElementById('image-subpane');
    const binarySubpane = document.getElementById('binary-subpane');

    this.container.classList.add('hidden');
    imgSubpane.classList.add('hidden');
    binarySubpane.classList.add('hidden');
    this.emptyEditor.classList.add('hidden');

    if (!file) {
      this.emptyEditor.classList.remove('hidden');
      return;
    }

    const isImg = PathUtils.isImageFile(file.path);
    const isText = PathUtils.isTextFile(file.path);

    if (isImg && !(file.path.endsWith('.svg') && this.state.svgSourceMode)) {
      this.container.classList.remove('hidden');
      imgSubpane.classList.remove('hidden');
      this.imgFilename.textContent = file.path;
      
      const blob = new Blob([file.data], { type: PathUtils.getMimeType(file.path) });
      this.imgPreview.src = URL.createObjectURL(blob);
      
      this.btnSvgMode.classList.toggle('hidden', !file.path.endsWith('.svg'));
    } else if (!isText) {
      this.container.classList.remove('hidden');
      binarySubpane.classList.remove('hidden');
    }
  }
}