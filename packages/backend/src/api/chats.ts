import { Result, type StoredChat } from "shared";

import type { BackendSDK } from "../types";
import { getChatsStore } from "../stores/chats";

export function getChat(
  _sdk: BackendSDK,
  chatId: string
): Result<StoredChat | undefined> {
  try {
    const store = getChatsStore();
    return Result.ok(store.getChat(chatId));
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export function getChats(_sdk: BackendSDK): Result<StoredChat[]> {
  try {
    const store = getChatsStore();
    return Result.ok(store.getChats());
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export async function saveChat(
  _sdk: BackendSDK,
  chat: StoredChat
): Promise<Result<void>> {
  try {
    const store = getChatsStore();
    await store.saveChat(chat);
    return Result.ok(undefined);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export async function deleteChat(
  _sdk: BackendSDK,
  chatId: string
): Promise<Result<void>> {
  try {
    const store = getChatsStore();
    await store.deleteChat(chatId);
    return Result.ok(undefined);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}
