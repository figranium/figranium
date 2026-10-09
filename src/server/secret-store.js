'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./constants');
const KEY_FILE = process.env.MASTER_KEY_FILE || path.join(DATA_DIR, 'master.key');
let keyPromise;
function configuredMasterKey() {
  const raw = process.env.MASTER_KEY;
  if (!raw) return null;
  const value = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64url');
  if (key.length !== 32) throw new Error('MASTER_KEY must contain exactly 32 bytes (base64url or hex)');
  return key;
}
function sessionDerivedKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  // Keep cookie signing and data encryption cryptographically separated.
  return crypto.createHash('sha256').update('figranium:secret-store:v1\0').update(secret).digest();
}
async function legacyFileMasterKey() {
  // During a cloud upgrade, MASTER_KEY may be configured before an older
  // data-volume key is retired. Read it only for decryption; never create it.
  try {
    const key = await fs.promises.readFile(KEY_FILE);
    if (key.length !== 32) throw new Error('Invalid encryption master key');
    return key;
  } catch (error) {
    if (error.code === 'ENOENT' || ['EACCES', 'EROFS', 'EPERM'].includes(error.code)) return null;
    throw error;
  }
}
async function masterKey() {
  if (!keyPromise) keyPromise = (async () => {
    const configured = configuredMasterKey();
    if (configured) return configured;
    try {
      await fs.promises.mkdir(path.dirname(KEY_FILE), { recursive: true, mode: 0o700 });
    } catch (error) {
      const fallback = sessionDerivedKey();
      if (fallback && ['EACCES', 'EROFS', 'EPERM'].includes(error.code)) return fallback;
      throw error;
    }
    try {
      const key = await fs.promises.readFile(KEY_FILE);
      if (key.length !== 32) throw new Error('Invalid encryption master key');
      return key;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        const fallback = sessionDerivedKey();
        if (fallback && ['EACCES', 'EROFS', 'EPERM'].includes(error.code)) return fallback;
        throw error;
      }
      const candidate = crypto.randomBytes(32);
      try {
        await fs.promises.writeFile(KEY_FILE, candidate, { flag: 'wx', mode: 0o600 });
        return candidate;
      } catch (writeError) {
        if (writeError.code === 'EEXIST') {
          const key = await fs.promises.readFile(KEY_FILE);
          if (key.length !== 32) throw new Error('Invalid encryption master key');
          return key;
        }
        const fallback = sessionDerivedKey();
        if (fallback && ['EACCES', 'EROFS', 'EPERM'].includes(writeError.code)) return fallback;
        throw writeError;
      }
    }
  })().catch(error => { keyPromise = null; throw error; });
  return keyPromise;
}
function seal(value, key, context) {
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  const wrapIv = crypto.randomBytes(12);
  const wrapper = crypto.createCipheriv('aes-256-gcm', key, wrapIv);
  wrapper.setAAD(Buffer.from(context + ':dek'));
  const wrapped = Buffer.concat([wrapper.update(dek), wrapper.final()]);
  dek.fill(0);
  return { version: 2, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64'), wrapIv: wrapIv.toString('base64'), wrapTag: wrapper.getAuthTag().toString('base64'), wrappedKey: wrapped.toString('base64') };
}
function open(envelope, key, context) {
  if (envelope?.version !== 2 || envelope.algorithm !== 'aes-256-gcm') throw new Error('Unsupported encrypted secret format');
  const wrapper = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.wrapIv, 'base64'));
  wrapper.setAAD(Buffer.from(context + ':dek'));
  wrapper.setAuthTag(Buffer.from(envelope.wrapTag, 'base64'));
  const dek = Buffer.concat([wrapper.update(Buffer.from(envelope.wrappedKey, 'base64')), wrapper.final()]);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  } finally { dek.fill(0); }
}
async function readSecretFile(file, context, fallback) {
  let value;
  try { value = JSON.parse(await fs.promises.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
  if (value?.__figraniumEncrypted === true) {
    const key = await masterKey();
    try {
      return open(value.envelope, key, context);
    } catch (error) {
      // A configured MASTER_KEY takes precedence for new writes, but v0.21
      // may have encrypted this file with the former local master key.
      const legacyKey = process.env.MASTER_KEY ? await legacyFileMasterKey() : null;
      if (!legacyKey || legacyKey.equals(key)) throw error;
      return open(value.envelope, legacyKey, context);
    }
  }
  await writeSecretFile(file, context, value);
  return value;
}
async function writeSecretFile(file, context, value) {
  const payload = { __figraniumEncrypted: true, envelope: seal(value, await masterKey(), context) };
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    await fs.promises.writeFile(temp, JSON.stringify(payload), { mode: 0o600, flag: 'wx' });
    await fs.promises.rename(temp, file);
  } finally { await fs.promises.rm(temp, { force: true }).catch(() => {}); }
}
module.exports = { masterKey, seal, open, readSecretFile, writeSecretFile };
