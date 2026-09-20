export class LivePreview {
  constructor(state, ui) {
    this.state = state;
    this.ui = ui;
    this.iframe = document.getElementById('live-iframe');
    this.btnReload = document.getElementById('btn-reload-preview');
    this.status = document.getElementById('preview-status');
    this.session = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    this.registration = null;
    this.ready = null;
    this.btnReload.addEventListener('click', () => this.update());
  }

  async ensureServiceWorker() {
    if (!('serviceWorker' in navigator)) throw new Error('Dieser Browser unterstützt keine Service Worker.');
    if (location.protocol === 'file:') throw new Error('Die IDE muss über http://localhost oder https:// geöffnet werden, nicht über file://.');
    if (!this.ready) {
      const configuredSw = new URLSearchParams(location.search).get('__prj_sw');
      const swUrl = configuredSw ? new URL(configuredSw, location.href) : new URL('../preview-sw.js', import.meta.url);
      const scopeUrl = new URL('./', location.href);
      this.ready = navigator.serviceWorker.register(swUrl, {scope: scopeUrl.href})
        .then(async registration => {
          this.registration = registration;
          await registration.update();
          return navigator.serviceWorker.ready;
        });
    }
    await this.ready;
    if (!this.registration) this.registration = await navigator.serviceWorker.ready;
    if (!this.registration.active) throw new Error('Preview-Service konnte nicht aktiviert werden.');
    return this.registration;
  }

  async sendProject(registration) {
    const files=[];
    for (const [path,file] of this.state.files.entries()) {
      if (file.type !== 'file') continue;
      let data=file.data;
      if (!(data instanceof ArrayBuffer)) data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      files.push({path, data});
    }
    await new Promise((resolve,reject)=>{
      const channel=new MessageChannel();
      channel.port1.onmessage=e=>e.data?.ok ? resolve() : reject(new Error(e.data?.error || 'VirtualFS konnte nicht bereitgestellt werden.'));
      registration.active.postMessage({type:'SET_PROJECT',session:this.session,files},[channel.port2]);
    });
  }

  findEntry() {
    if (this.state.files.has('index.html')) return 'index.html';
    for (const [path,file] of this.state.files.entries()) {
      if (file.type === 'file' && /(?:^|\/)index\.html$/i.test(path)) return path;
    }
    return null;
  }

  async update() {
    const entry=this.findEntry();
    if (!entry) {
      this.iframe.removeAttribute('src');
      this.status.textContent='Keine index.html gefunden';
      return;
    }
    try {
      this.status.textContent='VirtualFS wird geladen …';
      const registration=await this.ensureServiceWorker();
      await this.sendProject(registration);
      const base=new URL('../', import.meta.url);
      const url=new URL('__preview__' + (entry.startsWith('/')?'':'/') + entry, base);
      const hostSw = new URL(this.registration?.active?.scriptURL || new URL('../preview-sw.js', import.meta.url), location.href);
      url.searchParams.set('__prj_sw', hostSw.href);
      url.searchParams.set('session',this.session);
      url.searchParams.set('v',String(Date.now()));
      this.iframe.src=url.href;
      this.status.textContent='Native Static Preview';
    } catch(err) {
      this.status.textContent='Preview-Fehler';
      this.ui.showError(`Fehler bei der Live Preview: ${err.message}`);
    }
  }
}
