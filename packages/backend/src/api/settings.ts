import { Result, type Settings, type UpdateSettingsInput } from "shared";

import type { BackendSDK } from "../types";
import { getSettingsStore } from "../stores/settings";

export function getSettings(_sdk: BackendSDK): Result<Settings> {
  try {
    const store = getSettingsStore();
    return Result.ok(store.getSettings());
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export async function updateSettings(
  _sdk: BackendSDK,
  input: UpdateSettingsInput
): Promise<Result<Settings>> {
  try {
    const store = getSettingsStore();
    await store.updateSettings(input);
    return Result.ok(store.getSettings());
  } catch (error) {
    return Result.err((error as Error).message);
  }
}
