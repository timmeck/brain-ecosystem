export const nodeTypeError = `TypeError: Cannot read properties of undefined (reading 'map')
    at UserList (/app/src/components/UserList.tsx:15:23)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom.development.js:14985:18)
    at mountIndeterminateComponent (/app/node_modules/react-dom/cjs/react-dom.development.js:17811:13)`;

export const nodeModuleNotFound = `Error: Cannot find module './config'
Require stack:
- /app/src/server.ts
- /app/src/index.ts
    at Function.Module._resolveFilename (node:internal/modules/cjs/loader:995:15)
    at Function.Module._load (node:internal/modules/cjs/loader:841:27)`;

export const nodeReferenceError = `ReferenceError: process is not defined
    at Object.<anonymous> (/app/src/utils/env.ts:3:18)
    at Module._compile (node:internal/modules/cjs/loader:1234:14)`;

export const nodeSyntaxError = `SyntaxError: Unexpected token '}'
    at wrapSafe (node:internal/modules/cjs/loader:1278:20)
    at Module._compile (node:internal/modules/cjs/loader:1320:27)
    at /app/src/parser.ts:42:5`;

export const nodeEnoent = `Error: ENOENT: no such file or directory, open '/app/data/config.json'
    at Object.openSync (node:fs:600:3)
    at Object.readFileSync (node:fs:468:35)`;
