# @exam/config

Shared configuration presets consumed across the workspace.

- `tsconfig.node.json` — base for the NestJS API and Node scripts (CommonJS, decorators).
- `tsconfig.react.json` — base for the Vite web SPA (ESNext, JSX, DOM libs).

Both extend the repo-root `tsconfig.base.json`, which carries the strict compiler flags.
Apps reference these via `extends: "@exam/config/tsconfig.node.json"`.
