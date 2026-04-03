import { Result, DEFAULT_SETTINGS, type Settings, type UpdateSettingsInput } from "shared";

import type { BackendSDK } from "../types";
import { getSettingsStore } from "../stores/settings";

export function getSettings(_sdk: BackendSDK): Result<Settings> {
  console.log("[drift] getSettings() called");
  try {
    const store = getSettingsStore();
    const settings = store.getSettings();
    console.log("[drift] getSettings() returning OK");
    return { kind: "Ok" as const, value: settings };
  } catch (error) {
    console.error("[drift] getSettings() error:", error);
    // Return defaults even on error so UI is usable
    return { kind: "Ok" as const, value: DEFAULT_SETTINGS };
  }
}

export async function updateSettings(
  _sdk: BackendSDK,
  input: UpdateSettingsInput
): Promise<Result<Settings>> {
  try {
    const store = getSettingsStore();
    await store.updateSettings(input);
    return { kind: "Ok" as const, value: store.getSettings() };
  } catch (error) {
    return { kind: "Error" as const, error: String(error) };
  }
}
