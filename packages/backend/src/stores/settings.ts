import { DEFAULT_SETTINGS, type Settings, type UpdateSettingsInput } from "shared";

import { GlobalStore } from "./global-store";

type SettingsMessage =
  | { type: "UPDATE"; payload: UpdateSettingsInput };

class SettingsStore extends GlobalStore<Settings, SettingsMessage> {
  protected createInitialModel(): Settings {
    return DEFAULT_SETTINGS;
  }

  protected update(model: Settings, message: SettingsMessage): Settings {
    switch (message.type) {
      case "UPDATE":
        return { ...model, ...message.payload };
    }
  }

  getSettings(): Settings {
    return this.getModel();
  }

  async updateSettings(input: UpdateSettingsInput): Promise<void> {
    this.dispatch({ type: "UPDATE", payload: input });
    await this.persist();
    this.notify();
  }
}

let _store: SettingsStore | undefined;

export function getSettingsStore(): SettingsStore {
  if (!_store) {
    _store = new SettingsStore("settings");
  }
  return _store;
}
