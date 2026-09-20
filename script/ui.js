export class UIManager {
  constructor(state) {
    this.state = state;
    // Die Toolbar ist bewusst statisch in index.html. Dadurch bleiben die
    // Sicherheitsfunktionen auch sichtbar, wenn ein Modul später einen Fehler meldet.
    this.initDOM();
    this.bindEvents();

    this.state.subscribe(event => {
      if (['projectLoaded', 'fileUpdated'].includes(event)) this.updateStats();
    });
  }


  initDOM() {
    this.btnOpen = document.getElementById('btn-open');
    this.btnNew = document.getElementById('btn-new');
    this.btnExport = document.getElementById('btn-export');
    this.btnEncrypt = document.getElementById('btn-encrypt');
    this.btnLoadDecrypt = document.getElementById('btn-load-decrypt');
    this.fileInput = document.getElementById('file-input');
    this.encryptedFileInput = document.getElementById('encrypted-file-input');
    this.projectName = document.getElementById('project-name');
    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.errorBanner = document.getElementById('error-banner');
    this.errorMessage = document.getElementById('error-message');
    this.btnCloseError = document.getElementById('btn-close-error');

    this.welcomeBtnOpen = document.getElementById('welcome-btn-open');
    this.welcomeBtnNew = document.getElementById('welcome-btn-new');

    this.statFiles = document.getElementById('stat-files');
    this.statSize = document.getElementById('stat-size');
    this.statEntry = document.getElementById('stat-entry');

    this.views = {
      project: document.getElementById('view-project'),
      editor: document.getElementById('view-editor'),
      preview: document.getElementById('view-preview')
    };

    this.createSecurityDialogs();
  }

  bindEvents() {
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });
    this.btnCloseError.addEventListener('click', () => this.errorBanner.classList.add('hidden'));
  }

  createSecurityDialogs() {
    const host = document.createElement('div');
    host.innerHTML = `
      <dialog id="encrypt-dialog" class="security-dialog">
        <form method="dialog" id="encrypt-form">
          <h2>Projekt verschlüsseln</h2>
          <p>Das Projekt wird als <strong>.prj.enc</strong> gespeichert. Nur <code>clear.md</code> bleibt lesbar.</p>
          <label>Passwort<input id="encrypt-password" type="password" minlength="8" autocomplete="new-password" required></label>
          <label>Passwort wiederholen<input id="encrypt-password-confirm" type="password" minlength="8" autocomplete="new-password" required></label>
          <div class="dialog-actions"><button value="cancel" class="btn btn-secondary">Abbrechen</button><button id="encrypt-submit" value="default" class="btn btn-primary">Verschlüsseln</button></div>
        </form>
      </dialog>
      <dialog id="decrypt-dialog" class="security-dialog">
        <form method="dialog" id="decrypt-form">
          <h2>Projekt entschlüsseln</h2>
          <div id="decrypt-version" class="security-info"></div>
          <label>Passwort<input id="decrypt-password" type="password" autocomplete="current-password" required></label>
          <div class="dialog-actions"><button value="cancel" class="btn btn-secondary">Abbrechen</button><button id="decrypt-submit" value="default" class="btn btn-primary">Entschlüsseln</button></div>
        </form>
      </dialog>`;
    document.body.appendChild(host);
    this.encryptDialog = document.getElementById('encrypt-dialog');
    this.decryptDialog = document.getElementById('decrypt-dialog');
    this.encryptForm = document.getElementById('encrypt-form');
    this.decryptForm = document.getElementById('decrypt-form');
    this.encryptPassword = document.getElementById('encrypt-password');
    this.encryptPasswordConfirm = document.getElementById('encrypt-password-confirm');
    this.decryptPassword = document.getElementById('decrypt-password');
    this.decryptVersion = document.getElementById('decrypt-version');
    this.encryptForm.addEventListener('submit', e => {
      if (e.submitter?.id === 'encrypt-submit') { e.preventDefault(); this._encryptResolve?.({ password: this.encryptPassword.value, confirmed: this.encryptPassword.value === this.encryptPasswordConfirm.value }); }
    });
    this.decryptForm.addEventListener('submit', e => {
      if (e.submitter?.id === 'decrypt-submit') { e.preventDefault(); this._decryptResolve?.({ password: this.decryptPassword.value }); }
    });
    this.encryptDialog.addEventListener('cancel', e => { e.preventDefault(); this._encryptResolve?.(null); });
    this.decryptDialog.addEventListener('cancel', e => { e.preventDefault(); this._decryptResolve?.(null); });
  }

  requestEncryptionPassword() {
    this.encryptPassword.value = ''; this.encryptPasswordConfirm.value = '';
    this.encryptDialog.showModal(); this.encryptPassword.focus();
    return new Promise(resolve => { this._encryptResolve = result => { this.encryptDialog.close(); this._encryptResolve = null; resolve(result); }; });
  }

  requestDecryptionPassword(version) {
    this.decryptVersion.textContent = `Verschlüsselungsversion: ${version}`;
    this.decryptPassword.value = ''; this.decryptDialog.showModal(); this.decryptPassword.focus();
    return new Promise(resolve => { this._decryptResolve = result => { this.decryptDialog.close(); this._decryptResolve = null; resolve(result); }; });
  }

  showError(msg) {
    this.errorMessage.textContent = msg;
    this.errorBanner.classList.remove('hidden');
  }

  switchView(viewName) {
    this.state.activeView = viewName;
    this.tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
    Object.keys(this.views).forEach(v => this.views[v].classList.toggle('active', v === viewName));
    
    if (viewName === 'preview') {
      this.state.notify('renderPreview');
    }
  }

  updateStats() {
    let fileCount = 0, totalBytes = 0, hasIndex = false;
    for (const [path, file] of this.state.files.entries()) {
      if (file.type === 'file') {
        fileCount++;
        totalBytes += file.size;
        if (path.toLowerCase() === 'index.html' || path.toLowerCase().endsWith('/index.html')) hasIndex = true;
      }
    }
    this.statFiles.textContent = fileCount;
    this.statSize.textContent = `${(totalBytes / 1024).toFixed(1)} KB`;
    this.statEntry.textContent = hasIndex ? 'index.html' : 'Fehlt';
    this.projectName.textContent = this.state.projectName || 'Kein Projekt geladen';
    this.btnExport.disabled = fileCount === 0;
    this.btnEncrypt.disabled = fileCount === 0;
  }
}