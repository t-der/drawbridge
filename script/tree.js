import { PathUtils } from './tar.js';

export class ProjectTree {
  constructor(state, ui) {
    this.state = state;
    this.ui = ui;
    this.container = document.getElementById('tree-container');

    this.state.subscribe(event => {
      if (['projectLoaded', 'fileSelected', 'fileUpdated'].includes(event)) {
        this.render();
      }
    });
  }

  render() {
    this.container.innerHTML = '';
    if (this.state.files.size === 0) {
      this.container.innerHTML = '<div class="empty-tree">Öffne eine .prj Datei</div>';
      return;
    }

    for (const [path, file] of this.state.files.entries()) {
      const itemEl = document.createElement('div');
      itemEl.className = `tree-item ${this.state.activeFile === path ? 'selected' : ''}`;
      
      let icon = file.type === 'directory' ? '📁' : '📄';
      if (file.type === 'file') {
        if (PathUtils.isImageFile(path)) icon = '🖼️';
        else if (path.endsWith('.html')) icon = '🌐';
        else if (path.endsWith('.css')) icon = '🎨';
        else if (path.endsWith('.js')) icon = '⚡';
      }

      itemEl.innerHTML = `<span class="tree-icon">${icon}</span><span class="tree-name">${path}</span>`;

      if (file.type === 'file') {
        itemEl.addEventListener('click', () => {
          this.state.activeFile = path;
          this.state.notify('fileSelected');
          this.ui.switchView('editor');
        });
      }

      this.container.appendChild(itemEl);
    }
  }
}