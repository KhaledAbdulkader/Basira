import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// OWASP scrypt profile: 32 MiB, N=2^15, r=8, p=3. Async work avoids blocking Node.
const settings = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const prefix = "scrypt$32768$8$3";
const dummy = `${prefix}$${"0".repeat(32)}$${"0".repeat(128)}`;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, settings, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${prefix}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string | null) {
  // Never accept variable work factors from a malformed/untrusted stored hash.
  const valid =
    encoded !== null &&
    /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded);
  const parts = (valid ? encoded : dummy).split("$");
  const actual = await derive(password, Buffer.from(parts[4]!, "hex"));
  const matches = timingSafeEqual(actual, Buffer.from(parts[5]!, "hex"));
  return valid && matches;
}
