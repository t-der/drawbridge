export class PathUtils {
  static normalize(path) {
    if (!path) return '';
    let cleaned = path.replace(/\\/g, '/').replace(/\/+/g, '/');
    if (cleaned.startsWith('/')) cleaned = cleaned.substring(1);
    const parts = cleaned.split('/');
    const safeParts = [];
    for (const part of parts) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        if (safeParts.length > 0) safeParts.pop();
      } else { safeParts.push(part); }
    }
    return safeParts.join('/');
  }

  static resolveRelative(basePath, relativePath) {
    if (!relativePath || relativePath.startsWith('http://') || relativePath.startsWith('https://') || relativePath.startsWith('data:') || relativePath.startsWith('blob:')) return relativePath;
    if (relativePath.startsWith('/')) return PathUtils.normalize(relativePath);
    const baseDirParts = basePath.split('/').slice(0, -1);
    return PathUtils.normalize([...baseDirParts, ...relativePath.split('/')].join('/'));
  }

  static getMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
      'html': 'text/html', 'htm': 'text/html', 'css': 'text/css', 'js': 'text/javascript',
      'json': 'application/json', 'svg': 'image/svg+xml', 'png': 'image/png',
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif',
      'webp': 'image/webp', 'bmp': 'image/bmp', 'txt': 'text/plain',
      'md': 'text/markdown', 'xml': 'application/xml'
    };
    return map[ext] || 'application/octet-stream';
  }

  static isTextFile(filename) {
    return ['html', 'htm', 'css', 'js', 'json', 'txt', 'md', 'xml', 'svg'].includes(filename.split('.').pop().toLowerCase());
  }

  static isImageFile(filename) {
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(filename.split('.').pop().toLowerCase());
  }
}

export class TarReader {
  static parse(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const files = [];
    let offset = 0;
    const decoder = new TextDecoder('utf-8');

    while (offset + 512 <= bytes.length) {
      let isZeroBlock = true;
      for (let i = 0; i < 512; i++) { if (bytes[offset + i] !== 0) { isZeroBlock = false; break; } }
      if (isZeroBlock) break;

      const readString = (start, length) => decoder.decode(bytes.subarray(start, start + length)).split('\0')[0].trim();
      const nameRaw = readString(offset, 100);
      const sizeOctal = readString(offset + 124, 12);
      const typeByte = bytes[offset + 156];
      const prefixRaw = readString(offset + 345, 155);

      const size = parseInt(sizeOctal, 8) || 0;
      let rawPath = prefixRaw ? `${prefixRaw}/${nameRaw}` : nameRaw;
      const isDirectory = (typeByte === 53) || rawPath.endsWith('/');
      let fullPath = PathUtils.normalize(rawPath);

      const fileData = bytes.slice(offset + 512, offset + 512 + size);
      if (fullPath) files.push({ path: fullPath, type: isDirectory ? 'directory' : 'file', size: isDirectory ? 0 : size, data: isDirectory ? new Uint8Array(0) : fileData });

      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
  }
}

export class TarWriter {
  static create(filesMap) {
    const encoder = new TextEncoder();
    const blocks = [];

    for (const [path, file] of filesMap.entries()) {
      const header = new Uint8Array(512);
      let name = path, prefix = '';

      if (encoder.encode(name).length > 100) {
        const lastSlash = name.lastIndexOf('/');
        if (lastSlash > 0 && lastSlash < 155) { prefix = name.substring(0, lastSlash); name = name.substring(lastSlash + 1); }
      }

      header.set(encoder.encode(name).subarray(0, 100), 0);
      header.set(encoder.encode(prefix).subarray(0, 155), 345);

      const isDir = file.type === 'directory';
      header.set(encoder.encode((isDir ? '0000755\0' : '0000644\0').padStart(8, '0')), 100);
      header.set(encoder.encode('0000000\0'), 108);
      header.set(encoder.encode('0000000\0'), 116);

      const dataBytes = isDir ? new Uint8Array(0) : file.data;
      header.set(encoder.encode(dataBytes.length.toString(8).padStart(11, '0') + ' '), 124);
      header.set(encoder.encode(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + ' '), 136);

      header[156] = isDir ? 53 : 48;
      header.set(encoder.encode('ustar\0'), 257);
      header.set(encoder.encode('00'), 263);

      for (let i = 148; i < 156; i++) header[i] = 32;

      let chksum = 0;
      for (let i = 0; i < 512; i++) chksum += header[i];
      header.set(encoder.encode(chksum.toString(8).padStart(6, '0') + '\0 '), 148);

      blocks.push(header);
      if (!isDir && dataBytes.length > 0) {
        blocks.push(dataBytes);
        const padding = (512 - (dataBytes.length % 512)) % 512;
        if (padding > 0) blocks.push(new Uint8Array(padding));
      }
    }

    blocks.push(new Uint8Array(1024));
    const result = new Uint8Array(blocks.reduce((acc, b) => acc + b.length, 0));
    let offset = 0;
    for (const block of blocks) { result.set(block, offset); offset += block.length; }
    return result;
  }
}