const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const PBKDF2_ITERATIONS = 600000;
export const SALT_LENGTH = 16;
export const IV_LENGTH = 12;
export const CHECK_PLAINTEXT = 'quiet-pages-check-v1';

export function toUint8(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new TypeError('expected binary data');
}

export function randomBytes(length) {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export async function deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toUint8(salt),
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBytes(key, bytes) {
  const iv = randomBytes(IV_LENGTH);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)
  );
  return { iv, ciphertext };
}

export async function decryptBytes(key, iv, ciphertext) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toUint8(iv) },
    key,
    toUint8(ciphertext)
  );
  return new Uint8Array(plain);
}

export async function encryptJson(key, value) {
  return encryptBytes(key, textEncoder.encode(JSON.stringify(value)));
}

export async function decryptJson(key, iv, ciphertext) {
  const bytes = await decryptBytes(key, iv, ciphertext);
  return JSON.parse(textDecoder.decode(bytes));
}

export async function encryptCheck(key) {
  return encryptBytes(key, textEncoder.encode(CHECK_PLAINTEXT));
}

export async function verifyCheck(key, record) {
  const text = textDecoder.decode(await decryptBytes(key, record.iv, record.ciphertext));
  return text === CHECK_PLAINTEXT;
}

export function bytesToBase64(data) {
  const bytes = toUint8(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(String(value).replace(/\s+/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
