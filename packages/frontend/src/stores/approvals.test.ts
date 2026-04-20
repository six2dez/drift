import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useApprovalsStore } from "./approvals";

describe("useApprovalsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("returns false before any approval", () => {
    const store = useApprovalsStore();
    expect(store.isSessionApproved("s1", "replay", "send_request")).toBe(false);
  });

  it("remembers allowForSession per sessionId + group + toolName", () => {
    const store = useApprovalsStore();
    store.allowForSession("s1", "replay", "send_request");
    expect(store.isSessionApproved("s1", "replay", "send_request")).toBe(true);
    expect(store.isSessionApproved("s1", "replay", "create_replay_session")).toBe(false);
  });

  it("isolates approvals across multiple sessions", () => {
    const store = useApprovalsStore();
    store.allowForSession("s1", "findings", "create_finding");
    store.allowForSession("s2", "environment", "set_environment");
    expect(store.isSessionApproved("s1", "findings", "create_finding")).toBe(true);
    expect(store.isSessionApproved("s2", "findings", "create_finding")).toBe(false);
    expect(store.isSessionApproved("s1", "environment", "set_environment")).toBe(false);
    expect(store.isSessionApproved("s2", "environment", "set_environment")).toBe(true);
  });

  it("clearForSession wipes a session without affecting others", () => {
    const store = useApprovalsStore();
    store.allowForSession("s1", "replay", "send_request");
    store.allowForSession("s2", "findings", "create_finding");
    store.clearForSession("s1");
    expect(store.isSessionApproved("s1", "replay", "send_request")).toBe(false);
    expect(store.isSessionApproved("s2", "findings", "create_finding")).toBe(true);
  });

  it("clearAll wipes every session", () => {
    const store = useApprovalsStore();
    store.allowForSession("s1", "replay", "send_request");
    store.allowForSession("s2", "findings", "create_finding");
    store.clearAll();
    expect(store.isSessionApproved("s1", "replay", "send_request")).toBe(false);
    expect(store.isSessionApproved("s2", "findings", "create_finding")).toBe(false);
  });
});
