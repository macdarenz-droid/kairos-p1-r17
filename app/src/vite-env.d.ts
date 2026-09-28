/// <reference types="vite/client" />

declare const __KAIROS_APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_KAIROS_ACTIVATION_ENDPOINT?: string;
  readonly VITE_KAIROS_ACTIVATION_PUBLIC_KEY_SPKI?: string;
  /** U1: the Kairos server's origin, such as https://kairos-api.<subdomain>.workers.dev. */
  readonly VITE_KAIROS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
