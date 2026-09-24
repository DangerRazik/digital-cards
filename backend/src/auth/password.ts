import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const options = {
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
};

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt);

  return `scrypt-v1:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [version, salt, hash] = storedHash.split(':');

  if (version !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) {
    return false;
  }

  const actualKey = await deriveKey(password, salt);
  const expectedKey = Buffer.from(hash, 'hex');

  return timingSafeEqual(actualKey, expectedKey);
}
