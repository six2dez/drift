import {
  Result,
  type CreateCliSessionInput,
  type SendCliMessageInput,
  type CloseCliSessionInput,
  type CliSessionStateEvent,
  type ProviderStatus,
  type CliProvider,
} from "shared";

import type { BackendSDK } from "../types";
import { getSessionManager } from "../cli/session-manager";
import { getSettingsStore } from "../stores/settings";

export async function createCliSession(
  sdk: BackendSDK,
  input: CreateCliSessionInput
): Promise<Result<string>> {
  try {
    const manager = getSessionManager();
    const settings = getSettingsStore().getSettings();
    const sessionId = await manager.createSession(sdk, input.providerId, input.chatId, settings);
    return Result.ok(sessionId);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export async function sendCliMessage(
  sdk: BackendSDK,
  input: SendCliMessageInput
): Promise<Result<string>> {
  try {
    const manager = getSessionManager();
    const settings = getSettingsStore().getSettings();
    const response = await manager.sendMessage(sdk, input, settings);
    return Result.ok(response);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export function closeCliSession(
  _sdk: BackendSDK,
  input: CloseCliSessionInput
): Result<void> {
  try {
    const manager = getSessionManager();
    manager.closeSession(input.sessionId);
    return Result.ok(undefined);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export function getCliSessionState(
  _sdk: BackendSDK,
  sessionId: string
): Result<CliSessionStateEvent> {
  try {
    const manager = getSessionManager();
    const state = manager.getSessionState(sessionId);
    return Result.ok(state);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export function cancelCliMessage(
  _sdk: BackendSDK,
  sessionId: string
): Result<void> {
  try {
    const manager = getSessionManager();
    manager.cancelMessage(sessionId);
    return Result.ok(undefined);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export function getProviderStatuses(
  _sdk: BackendSDK
): Result<ProviderStatus[]> {
  try {
    const manager = getSessionManager();
    const settings = getSettingsStore().getSettings();
    const statuses = manager.checkAllProviders(settings);
    return Result.ok(statuses);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export function checkProviderAvailability(
  _sdk: BackendSDK,
  providerId: CliProvider
): Result<ProviderStatus> {
  try {
    const manager = getSessionManager();
    const settings = getSettingsStore().getSettings();
    const status = manager.checkProvider(providerId, settings);
    return Result.ok(status);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}
