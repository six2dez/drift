import type { BackendSDK } from "./types";

let _sdk: BackendSDK | undefined;

export function setSDK(sdk: BackendSDK): void {
  _sdk = sdk;
}

export function requireSDK(): BackendSDK {
  if (!_sdk) {
    throw new Error("SDK not initialized");
  }
  return _sdk;
}
