import { TarReader, TarWriter, PathUtils } from './tar.js';

export const PRJ_ENC_FORMAT = 'PRJ-ENC';
export const PRJ_ENC_VERSION = '1.0';
const MAGIC = new TextEncoder().encode('PRJENC1');
const PBKDF2_ITERATIONS = 310000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

function u32be(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

function readU32be(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptProject(filesMap, password) {
  if (!password || password.length < 8) throw new Error('Das Passwort muss mindestens 8 Zeichen lang sein.');

  const tarBytes = TarWriter.create(filesMap);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);
  const header = concat(MAGIC, new TextEncoder().encode(PRJ_ENC_VERSION), u32be(PBKDF2_ITERATIONS), salt, iv);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: header }, key, tarBytes
  ));
  return concat(header, encrypted);
}

export async function decryptProject(encryptedBytes, password) {
  if (!password) throw new Error('Bitte ein Passwort eingeben.');
  const bytes = encryptedBytes instanceof Uint8Array ? encryptedBytes : new Uint8Array(encryptedBytes);
  const min = MAGIC.length + 3 + 4 + SALT_BYTES + IV_BYTES + 16;
  if (bytes.length < min) throw new Error('Die verschlüsselte Datei ist zu kurz oder beschädigt.');

  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error('Unbekanntes PRJ-ENC-Format.');
  }
  const version = new TextDecoder().decode(bytes.subarray(7, 10));
  if (version !== PRJ_ENC_VERSION) throw new Error(`Nicht unterstützte Verschlüsselungsversion: ${version}`);
  const iterations = readU32be(bytes, 10);
  if (iterations < 100000 || iterations > 2000000) throw new Error('Ungültige KDF-Parameter.');
  const salt = bytes.slice(14, 14 + SALT_BYTES);
  const iv = bytes.slice(14 + SALT_BYTES, 14 + SALT_BYTES + IV_BYTES);
  const headerLength = 14 + SALT_BYTES + IV_BYTES;
  const header = bytes.slice(0, headerLength);
  const ciphertext = bytes.slice(headerLength);

  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  let plain;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: header }, key, ciphertext
    ));
  } catch {
    throw new Error('Passwort falsch oder verschlüsselte Daten beschädigt.');
  }
  const files = TarReader.parse(plain.buffer);
  if (!files.length) throw new Error('Entschlüsseltes Projektarchiv ist leer.');
  return { version, files };
}

export function createEncryptedContainer(encryptedPayload, projectName) {
  const encoder = new TextEncoder();
  const clear = [
    `${PRJ_ENC_FORMAT}`,
    `Version: ${PRJ_ENC_VERSION}`,
    `Project: ${projectName || 'project.prj'}`,
    `Cipher: AES-256-GCM`,
    `KDF: PBKDF2-SHA-256`,
    `KDF-Iterations: ${PBKDF2_ITERATIONS}`,
    '',
    'This file is intentionally left readable so the encryption format version can be inspected without the password.'
  ].join('\n');
  const map = new Map();
  const clearBytes = encoder.encode(clear);
  map.set('clear.md', { path: 'clear.md', type: 'file', size: clearBytes.length, data: clearBytes });
  map.set('project.bin.enc', { path: 'project.bin.enc', type: 'file', size: encryptedPayload.length, data: encryptedPayload });
  return TarWriter.create(map);
}

export function readClearMetadata(outerBytes) {
  const files = TarReader.parse(outerBytes);
  const clear = files.find(f => f.type === 'file' && PathUtils.normalize(f.path).toLowerCase() === 'clear.md');
  const payload = files.find(f => f.type === 'file' && PathUtils.normalize(f.path).toLowerCase() === 'project.bin.enc');
  if (!clear || !payload) throw new Error('Ungültiges .prj.enc: clear.md oder verschlüsseltes Projekt fehlt.');
  const text = new TextDecoder().decode(clear.data);
  const match = text.match(/^Version:\s*(.+)$/mi);
  return { text, version: match ? match[1].trim() : 'unbekannt', payload: payload.data };
}
