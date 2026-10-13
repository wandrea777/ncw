/// <reference types="vite/client" />
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

interface ImportMetaEnv {
  readonly VITE_ONRAMP_PROVIDER?: "ramp" | "moonpay";
  readonly VITE_ONRAMP_ENV?: "demo" | "production";
  readonly VITE_ONRAMP_KEY?: string;
}
