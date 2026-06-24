import { customType } from "drizzle-orm/pg-core";

/**
 * Postgres BYTEA column that round-trips a Node Buffer in and out.
 * postgres.js returns bytea as a Uint8Array; we normalize to Buffer so the
 * image-serving route can hand it straight to a Response body.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === "string") {
      // Defensive: hex string form "\x...." (shouldn't happen with postgres.js)
      const hex = value.startsWith("\\x") ? value.slice(2) : value;
      return Buffer.from(hex, "hex");
    }
    return Buffer.from(value as ArrayBufferLike);
  },
});
