import type { StoredChat } from "shared";

import { GlobalStore } from "./global-store";

type ChatsModel = {
  chats: StoredChat[];
};

type ChatsMessage =
  | { type: "SAVE_CHAT"; payload: StoredChat }
  | { type: "DELETE_CHAT"; payload: string };

class ChatsStore extends GlobalStore<ChatsModel, ChatsMessage> {
  protected createInitialModel(): ChatsModel {
    return { chats: [] };
  }

  protected update(model: ChatsModel, message: ChatsMessage): ChatsModel {
    switch (message.type) {
      case "SAVE_CHAT": {
        const existing = model.chats.findIndex(
          (c) => c.id === message.payload.id
        );
        const chats = [...model.chats];
        if (existing >= 0) {
          chats[existing] = message.payload;
        } else {
          chats.push(message.payload);
        }
        return { chats };
      }
      case "DELETE_CHAT":
        return {
          chats: model.chats.filter((c) => c.id !== message.payload),
        };
    }
  }

  getChat(id: string): StoredChat | undefined {
    return this.getModel().chats.find((c) => c.id === id);
  }

  getChats(): StoredChat[] {
    return this.getModel().chats;
  }

  async saveChat(chat: StoredChat): Promise<void> {
    this.dispatch({ type: "SAVE_CHAT", payload: chat });
    await this.persist();
  }

  async deleteChat(id: string): Promise<void> {
    this.dispatch({ type: "DELETE_CHAT", payload: id });
    await this.persist();
  }
}

let _store: ChatsStore | undefined;

export function getChatsStore(): ChatsStore {
  if (!_store) {
    _store = new ChatsStore("chats");
  }
  return _store;
}
