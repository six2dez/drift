import { computed, ref } from "vue";
import type { ScannerPendingActiveScan } from "shared";

// Queue of context-menu-driven active-scan requests. Commands in
// `index.ts` enqueue items here; `App.vue` watches the length to
// force-switch to the Scanner tab; `ScannerView.vue` watches the
// head to drain it and fire the backend RPC.
//
// A queue (not a single ref slot) is required so a second click on
// "Active scan this request" while a previous scan is still running
// does not silently overwrite the first.

export const pendingActiveScanQueue = ref<ScannerPendingActiveScan[]>([]);

export const pendingActiveScan = computed<ScannerPendingActiveScan | undefined>(
  () => pendingActiveScanQueue.value[0],
);

export function enqueuePendingActiveScan(req: ScannerPendingActiveScan): void {
  pendingActiveScanQueue.value = [...pendingActiveScanQueue.value, req];
}

export function consumePendingActiveScan(): ScannerPendingActiveScan | undefined {
  const q = pendingActiveScanQueue.value;
  if (q.length === 0) return undefined;
  const [head, ...rest] = q;
  pendingActiveScanQueue.value = rest;
  return head;
}

export function clearPendingActiveScanQueue(): void {
  if (pendingActiveScanQueue.value.length === 0) return;
  pendingActiveScanQueue.value = [];
}
