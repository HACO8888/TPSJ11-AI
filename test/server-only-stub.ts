// Test-only stub for the `server-only` package. In a real Next.js build `server-only`
// throws if a Server-only module is pulled into a Client bundle; under vitest (plain
// Node, no `react-server` export condition) importing it would otherwise throw, so we
// alias it to this empty module (see vitest.config.ts). Importing this is a no-op.
export {};
