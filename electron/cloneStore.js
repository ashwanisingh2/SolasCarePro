// electron/cloneStore.js
// AES-256-GCM encryption + clone history for PC Clone (Feature 8).
//
// .solasclone file format:
//   16 bytes: salt (for PBKDF2)
//   12 bytes: IV (for AES-256-GCM)
//   16 bytes: auth tag
//   rest:     ciphertext
//
// Key derivation: PBKDF2 with 100k iterations + SHA-256.
// Why Node.js crypto (not PowerShell): cross-platform, no native deps, already
// available in Electron. PS just writes raw JSON; JS handles crypto.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;  // 256-bit AES
const IV_LENGTH = 12;   // GCM standard
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let root = null;
let historyFile = null;

function initCloneStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'clone');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  historyFile = path.join(root, 'history.jsonl');
}

function ensureInit() { if (!root) initCloneStore(); }

// --- Encryption helpers ---

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

function encryptToFile(plaintextJson, password, outPath) {
  if (typeof plaintextJson !== 'string') throw new Error('plaintext must be string');
  if (typeof password !== 'string' || password.length < 4) throw new Error('Password too short (min 4 chars)');
  if (typeof outPath !== 'string' || !outPath.endsWith('.solasclone')) {
    throw new Error('Output path must end in .solasclone');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const plaintext = Buffer.from(plaintextJson, 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // File format: salt (16) + iv (12) + authTag (16) + ciphertext
  const fileContent = Buffer.concat([salt, iv, authTag, ciphertext]);
  fs.writeFileSync(outPath, fileContent);
  return { bytesWritten: fileContent.length };
}

function decryptFromFile(inPath, password) {
  if (typeof inPath !== 'string' || !fs.existsSync(inPath)) {
    throw new Error('Input file not found');
  }
  if (typeof password !== 'string' || password.length < 1) {
    throw new Error('Password required');
  }

  const fileContent = fs.readFileSync(inPath);
  if (fileContent.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('File too short — not a valid .solasclone file');
  }

  const salt = fileContent.slice(0, SALT_LENGTH);
  const iv = fileContent.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = fileContent.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = fileContent.slice(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (e) {
    throw new Error('Decryption failed — wrong password or corrupted file');
  }
}

// --- Clone history (append-only JSONL) ---

function appendHistory(entry) {
  ensureInit();
  if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
  fs.appendFileSync(historyFile, JSON.stringify(entry) + '\n', 'utf8');
}

function listHistory() {
  ensureInit();
  if (!fs.existsSync(historyFile)) return [];
  const lines = fs.readFileSync(historyFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch (_) {}
  }
  return out.reverse();  // newest first
}

function clearHistory() {
  ensureInit();
  fs.writeFileSync(historyFile, '', 'utf8');
}

module.exports = {
  initCloneStore,
  encryptToFile,
  decryptFromFile,
  appendHistory,
  listHistory,
  clearHistory,
  // Export constants for tests
  PBKDF2_ITERATIONS,
  KEY_LENGTH,
  IV_LENGTH,
  SALT_LENGTH,
  AUTH_TAG_LENGTH
};
