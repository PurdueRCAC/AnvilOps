// These are the necessary type augmentations to get pglite to build without adding "DOM"
// to the "lib" list in backend/tsconfig.json (which is undesirable because Node.js generally
// doesn't support DOM APIs and the project is never meant to run in a browser)

declare namespace WebAssembly {
  type Instance = unknown;
  type Imports = unknown;
  type Exports = unknown;
}

type IDBDatabase = unknown;
