export class AppState {
  constructor() {
    this.projectName = null;
    this.files = new Map(); // path -> { path, type, size, data, modified }
    this.activeFile = null;
    this.activeView = 'project';
    this.activeBlobUrls = [];
    this.svgSourceMode = false;
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
  }

  notify(event, data) {
    this.listeners.forEach(fn => fn(event, data));
  }
}