import { defineStore } from "pinia";
import { ref } from "vue";

function makeKey(group: string, toolName: string): string {
  return `${group}:${toolName}`;
}

export const useApprovalsStore = defineStore("approvals", () => {
  // sessionId → Set<"group:toolName">. Never persisted: forgetting on reload is the
  // safety floor, so a stale approval cannot be reused after the plugin reboots.
  const sessionApprovals = ref(new Map<string, Set<string>>());

  function isSessionApproved(sessionId: string, group: string, toolName: string): boolean {
    const bucket = sessionApprovals.value.get(sessionId);
    if (bucket === undefined) return false;
    return bucket.has(makeKey(group, toolName));
  }

  function allowForSession(sessionId: string, group: string, toolName: string): void {
    let bucket = sessionApprovals.value.get(sessionId);
    if (bucket === undefined) {
      bucket = new Set();
      sessionApprovals.value.set(sessionId, bucket);
    }
    bucket.add(makeKey(group, toolName));
  }

  function clearForSession(sessionId: string): void {
    sessionApprovals.value.delete(sessionId);
  }

  function clearAll(): void {
    sessionApprovals.value.clear();
  }

  return {
    sessionApprovals,
    isSessionApproved,
    allowForSession,
    clearForSession,
    clearAll,
  };
});
