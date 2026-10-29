// Password hashing with Node's built-in scrypt: no bcrypt package needed.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
// N=2^14, r=8, p=5 is one of the scrypt settings OWASP recommends (~16 MB per hash).
const OPTIONS = { N: 2 ** 14, r: 8, p: 5 };

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, OPTIONS, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// Stored as "scrypt$<salt hex>$<key hex>". A fresh random salt every time,
// so two people with the same password get different hashes.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"));
  // Constant-time compare: the time taken doesn't reveal how many bytes matched.
  return timingSafeEqual(expected, actual);
}
