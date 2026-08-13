/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INSTITUTION_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
