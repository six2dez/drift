import { inject, type Plugin } from "vue";

import type { FrontendSDK } from "../types";

const SDK_KEY = Symbol("sdk");

export const SDKPlugin: Plugin = {
  install(app, sdk: FrontendSDK) {
    app.provide(SDK_KEY, sdk);
  },
};

export function useSDK(): FrontendSDK {
  const sdk = inject<FrontendSDK>(SDK_KEY);
  if (!sdk) {
    throw new Error("SDK not provided");
  }
  return sdk;
}
