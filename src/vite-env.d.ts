/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KAIROS_ACTIVATION_ENDPOINT?: string;
  readonly VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
