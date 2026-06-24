import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12; // ~250ms; resists offline cracking if the DB leaks.

// Unambiguous charset (no O/0/I/l/1) — printed to a human operator.
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_";

/** CSPRNG-backed, unbiased (rejection-sampled by randomInt). 24 chars ≈ 144 bits. */
export function generatePassword(length = 24): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CHARSET[randomInt(CHARSET.length)];
  return out;
}

export const hashPassword = (pw: string): Promise<string> => bcrypt.hash(pw, BCRYPT_COST);
export const verifyPassword = (pw: string, hash: string): Promise<boolean> =>
  bcrypt.compare(pw, hash);

/**
 * A real bcrypt hash used to keep login timing constant when the username is
 * not found — avoids user-enumeration via response timing.
 */
export const DUMMY_HASH = "$2b$12$U75aPICNrxsmIuz6rwq81.hfToG/i9UBhRfBDiAoa0Oq6pcZGMQhu";
