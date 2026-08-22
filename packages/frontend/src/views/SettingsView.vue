<script setup lang="ts">
import { computed, ref } from "vue";
import { useSettingsStore } from "../stores/settings";
import { useChatStore } from "../stores/chat";
import { useSDK } from "../plugins/sdk";
import {
  CliProvider,
  CLI_PROVIDER_DEFAULT_COMMANDS,
  CLI_PROVIDER_DISPLAY_NAMES,
  isProviderUsable,
  type McpToolPermissionGroup,
} from "shared";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Button from "primevue/button";
import Tag from "primevue/tag";

const store = useSettingsStore();
const chatStore = useChatStore();
const sdk = useSDK();
const mcpError = ref<string | undefined>(undefined);
const selfTestError = ref<string | undefined>(undefined);
const diagnostics = ref<Record<string, string> | undefined>(undefined);
const supportBundleStatus = ref<string | undefined>(undefined);

async function runDiagnostics() {
  const result = await sdk.backend.getDiagnostics();
  if (result.kind === "Ok") diagnostics.value = result.value;
}

async function copySupportBundle() {
  supportBundleStatus.value = undefined;
  try {
    const bundle = await store.exportSupportBundle();
    await navigator.clipboard.writeText(bundle.content);
    supportBundleStatus.value = "Diagnostics report copied to the clipboard.";
  } catch (error) {
    supportBundleStatus.value = `Failed to copy the diagnostics report. ${String(error)}`;
  }
}

async function downloadSupportBundle() {
  supportBundleStatus.value = undefined;
  try {
    const bundle = await store.exportSupportBundle();
    const blob = new Blob([bundle.content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = bundle.fileName;
    link.click();
    URL.revokeObjectURL(url);
    supportBundleStatus.value = `Diagnostics report downloaded as ${bundle.fileName}.`;
  } catch (error) {
    supportBundleStatus.value = `Failed to download the diagnostics report. ${String(error)}`;
  }
}

const allProviders = [
  CliProvider.Claude,
  CliProvider.Gemini,
  CliProvider.Codex,
  CliProvider.Copilot,
] as const;
const permissionGroups = [
  "read",
  "replay",
  "findings",
  "environment",
  "intercept",
  "workflow",
] as const satisfies readonly McpToolPermissionGroup[];
const permissionGroupLabels: Record<McpToolPermissionGroup, string> = {
  read: "Read/context",
  replay: "Replay",
  findings: "Findings",
  environment: "Environment",
  intercept: "Intercept",
  workflow: "Workflow",
};

const allToolGroupsDisabled = computed(() =>
  permissionGroups.every((group) => !store.settings.mcpPermissions.enabledGroups[group]),
);

async function updateProviderCommand(providerId: string, command: string) {
  const providers = { ...store.settings.providers };
  const existing = providers[providerId];
  if (existing !== undefined) providers[providerId] = { ...existing, command };
  await store.updateSettings({ providers });
  await store.refreshProviders();
}

async function toggleProvider(providerId: string) {
  const providers = { ...store.settings.providers };
  const existing = providers[providerId];
  if (existing !== undefined) providers[providerId] = { ...existing, enabled: !existing.enabled };
  await store.updateSettings({ providers });
  await store.refreshProviders();
}

async function updateCaidoUrl(value: string) {
  await store.updateSettings({ caidoApi: { ...store.settings.caidoApi, url: value } });
}

async function updateNumber(field: "processTimeoutSeconds" | "maxHistoryMessages", value: number) {
  await store.updateSettings({ [field]: value });
}

async function toggleDebugLogging(value: boolean) {
  await store.updateSettings({ debugLogging: value });
}

function getStatus(pid: string) {
  return store.providerStatuses.find((s) => s.id === pid);
}

function getMcpIndicatorClass() {
  if (store.mcpStatus?.authState === "invalid" || store.mcpStatus?.authState === "error") {
    return "text-red-500";
  }
  return store.mcpStatus?.running ? "text-green-500" : "text-surface-500";
}

function getMcpStatusLabel() {
  if (store.mcpStatus?.running) {
    return `Running (${store.mcpStatus.toolCount}/${store.mcpStatus.supportedToolCount} tools)`;
  }
  if (store.mcpStatus?.authState === "invalid" || store.mcpStatus?.authState === "error") {
    return "Auth failed";
  }
  return "Stopped";
}

const selfTestRunning = computed(() =>
  Object.values(store.mcpStatus?.selfTestResults ?? {}).some((result) => result.state === "running")
);

function getSelfTestResult(pid: string) {
  return store.mcpStatus?.selfTestResults?.[pid];
}

function isProviderEnabled(pid: string) {
  return store.settings.providers[pid]?.enabled ?? false;
}

function isProviderAvailable(pid: string) {
  // No private definition of usable lives in this component — a limited
  // provider is usable, and only the shared predicate gets to say so (PD-01).
  return isProviderUsable(getStatus(pid));
}

// Three-way, not two-way. A limitation is neither success nor failure, which is
// precisely why it cannot ride either existing class: red would tell a user
// their working provider is broken, green would hide that something is off.
function getProviderDotClass(pid: string) {
  const capability = getStatus(pid)?.capability;
  if (capability === "available") return "text-green-500";
  if (capability === "limited") return "text-amber-400";
  return "text-red-500";
}

// A hint, and ONLY a hint — deliberately no validator, no extension allow-list
// and no file dialog: the frontend has no filesystem access, cannot know the
// host platform, and `checkProvider` already returns a precise per-case error
// that a second weaker check here would contradict (UX-01 / SC-6).
function getCommandPlaceholder(pid: CliProvider) {
  const bare = CLI_PROVIDER_DEFAULT_COMMANDS[pid];
  return `${bare} — or a full path, e.g. C:\\Users\\you\\AppData\\Roaming\\npm\\${bare}.cmd`;
}

function getSelfTestLabel(pid: string) {
  if (!isProviderEnabled(pid)) return "Disabled";
  if (!isProviderAvailable(pid)) return "Unavailable";
  const state = getSelfTestResult(pid)?.state ?? "idle";
  switch (state) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "running":
      return "Running";
    default:
      return "Idle";
  }
}

function getSelfTestSeverity(pid: string) {
  if (!isProviderEnabled(pid)) return "secondary";
  if (!isProviderAvailable(pid)) return "warning";
  const state = getSelfTestResult(pid)?.state ?? "idle";
  switch (state) {
    case "passed":
      return "success";
    case "failed":
      return "danger";
    case "running":
      return "warning";
    default:
      return "secondary";
  }
}

function formatContextValue(value: string | undefined) {
  return value !== undefined && value.trim() !== "" ? value : "none";
}

async function runSelfTest(providerId?: string) {
  selfTestError.value = await store.runMcpSelfTest(providerId);
}

function getReadinessSeverity(status: "pass" | "warn" | "fail") {
  switch (status) {
    case "pass":
      return "success";
    case "warn":
      return "warning";
    default:
      return "danger";
  }
}

function getReadinessIcon(status: "pass" | "warn" | "fail") {
  switch (status) {
    case "pass":
      return "fas fa-check-circle text-green-500";
    case "warn":
      return "fas fa-triangle-exclamation text-amber-400";
    default:
      return "fas fa-circle-xmark text-red-500";
  }
}

async function togglePermissionGroup(group: McpToolPermissionGroup) {
  const enabled = store.settings.mcpPermissions.enabledGroups[group];
  await store.updateMcpPermissionGroup(group, !enabled);
}

async function toggleSensitiveConfirmations() {
  await store.updateSensitiveActionConfirmations(
    !store.settings.mcpPermissions.confirmSensitiveActions,
  );
}

</script>

<template>
  <div class="mx-auto h-full w-full overflow-y-auto p-4" style="max-width: 1040px;">
    <!-- Init error -->
    <div
      v-if="store.initError"
      class="mb-4 px-3 py-2 text-xs text-red-400 bg-red-950 border border-red-800 rounded"
    >
      {{ store.initError }}
    </div>
    <div
      v-if="chatStore.persistenceError"
      class="mb-4 px-3 py-2 text-xs text-amber-300 bg-amber-950 border border-amber-800 rounded flex items-center gap-2"
    >
      <span class="flex-1">{{ chatStore.persistenceError }}</span>
      <Button
        label="Dismiss"
        text
        size="small"
        severity="warning"
        @click="chatStore.clearPersistenceError()"
      />
    </div>

    <!-- Preflight -->
    <div class="flex items-center gap-2 mb-3">
      <h2 class="text-lg font-semibold text-surface-100">Health check</h2>
      <Button
        label="Run Health Check"
        icon="fas fa-list-check"
        text
        size="small"
        :loading="store.preflightRunning"
        @click="store.runPreflight()"
      />
    </div>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <p class="text-xs text-surface-400">
          The health check reviews provider availability, Caido authentication, MCP startup, the latest live MCP test result, and whether the active Caido context is synced.
        </p>
        <p v-if="store.preflightError" class="mt-2 text-xs text-red-400">
          {{ store.preflightError }}
        </p>
        <div class="mt-3 flex flex-col gap-2">
          <div
            v-for="check in store.readinessChecks"
            :key="check.id"
            class="rounded border border-surface-700 px-3 py-2"
          >
            <div class="flex items-center gap-2">
              <i :class="getReadinessIcon(check.status)" />
              <span class="text-sm text-surface-100">{{ check.label }}</span>
              <div class="flex-1" />
              <Tag :value="check.status" :severity="getReadinessSeverity(check.status)" />
            </div>
            <div class="mt-1 text-xs text-surface-300">{{ check.detail }}</div>
            <div class="mt-1 text-[11px] text-surface-500">{{ check.nextAction }}</div>
          </div>
        </div>
      </template>
    </Card>

    <!-- CLI Providers -->
    <div class="flex items-center gap-2 mb-3">
      <h2 class="text-lg font-semibold text-surface-100">CLI Providers</h2>
      <Button
        label="Refresh"
        icon="fas fa-sync"
        text
        size="small"
        @click="store.refreshProviders()"
      />
    </div>

    <div class="flex flex-col gap-3 mb-6">
      <Card
        v-for="pid in allProviders"
        :key="pid"
        :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }"
      >
        <template #content>
          <div class="flex items-center gap-3 mb-2">
            <i
              class="fas fa-circle text-xs"
              :class="getProviderDotClass(pid)"
            />
            <span class="font-medium text-surface-100">
              {{ CLI_PROVIDER_DISPLAY_NAMES[pid] }}
            </span>
            <div class="flex-1" />
            <Tag
              :value="store.settings.providers[pid]?.enabled ? 'Enabled' : 'Disabled'"
              :severity="store.settings.providers[pid]?.enabled ? 'success' : 'secondary'"
              class="cursor-pointer"
              @click="toggleProvider(pid)"
            />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-surface-400 w-16">Command:</label>
            <!-- placeholder only: no validator here, see getCommandPlaceholder -->
            <InputText
              :modelValue="store.settings.providers[pid]?.command ?? ''"
              :placeholder="getCommandPlaceholder(pid)"
              class="flex-1 p-inputtext-sm"
              @change="(e: Event) => updateProviderCommand(pid, (e.target as HTMLInputElement).value)"
            />
          </div>
          <div v-if="getStatus(pid)?.resolvedPath !== undefined" class="mt-1 text-xs text-surface-400">
            {{ getStatus(pid)?.resolvedPath }}
          </div>
          <div v-if="getStatus(pid)?.error !== undefined" class="mt-1 text-xs text-red-400">
            {{ getStatus(pid)?.error }}
          </div>
          <div v-if="getStatus(pid)?.limitation !== undefined" class="mt-1 text-xs text-amber-400">
            {{ getStatus(pid)?.limitation }}
          </div>
        </template>
      </Card>
    </div>

    <!-- Caido API -->
    <h2 class="text-lg font-semibold text-surface-100 mb-3">Caido API</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-300 w-14">URL:</label>
            <InputText
              :modelValue="store.settings.caidoApi.url"
              placeholder="http://localhost:8080"
              class="flex-1 p-inputtext-sm"
              @change="(e: Event) => updateCaidoUrl((e.target as HTMLInputElement).value)"
            />
          </div>
          <p class="text-xs text-surface-400">
            Drift uses your current Caido session token automatically. Point this URL at the Caido HTTP API of the instance you want Drift to call (default: the local Caido you're logged into).
          </p>
        </div>
      </template>
    </Card>

    <!-- MCP Server -->
    <h2 class="text-lg font-semibold text-surface-100 mb-3">MCP Server</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <div class="flex items-center gap-3">
          <i
            class="fas fa-circle text-xs"
            :class="getMcpIndicatorClass()"
          />
          <span class="text-sm text-surface-100">
            {{ getMcpStatusLabel() }}
          </span>
          <div class="flex-1" />
          <Button
            :label="store.mcpStatus?.running ? 'Stop' : 'Start'"
            :icon="store.mcpStatus?.running ? 'fas fa-stop' : 'fas fa-play'"
            :severity="store.mcpStatus?.running ? 'danger' : 'success'"
            size="small"
            @click="store.toggleMcp().then(e => { mcpError = e; })"
          />
        </div>
        <p v-if="mcpError" class="text-xs text-red-400 mt-2">
          {{ mcpError }}
        </p>
        <p
          v-else-if="store.mcpStatus?.authState === 'invalid' || store.mcpStatus?.authState === 'error'"
          class="text-xs text-red-400 mt-2"
        >
          <i class="fas fa-triangle-exclamation mr-1" />
          {{ store.mcpStatus?.authMessage || "Caido authentication failed. Open any Caido page to refresh the session token and retry." }}
        </p>
        <p v-else-if="store.mcpStatus?.running" class="text-xs text-green-400 mt-2">
          <i class="fas fa-check-circle mr-1" />
            Drift will expose 18 Caido tools to supported CLI providers when chatting, using your current Caido session and active Caido History context automatically when available.
          </p>
        <p v-else class="text-xs text-surface-400 mt-2">
          Start to expose Caido tools (search history, replay requests, create findings, etc.) to supported CLI providers. Drift will try your current Caido session first and mirror the active project/filter/query/scope from Caido History.
        </p>
        <div class="mt-3 pt-3 border-t border-surface-700/70 text-xs text-surface-300 flex flex-col gap-1.5">
          <div class="flex items-center gap-2">
            <span class="w-28 text-surface-500">UI project:</span>
            <span class="font-mono">{{ formatContextValue(store.mcpStatus?.uiContext.projectId) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-28 text-surface-500">Override project:</span>
            <span class="font-mono">{{ formatContextValue(store.mcpStatus?.overrideContext.projectId) }}</span>
            <Tag
              v-if="store.mcpStatus?.effectiveContext.overrideActive"
              value="Active override"
              severity="warning"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="w-28 text-surface-500">Effective project:</span>
            <span class="font-mono">{{ formatContextValue(store.mcpStatus?.effectiveContext.projectId) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-28 text-surface-500">Filter:</span>
            <span>{{ formatContextValue(store.mcpStatus?.uiContext.filterName) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-28 text-surface-500">History query:</span>
            <span class="font-mono break-all">{{ formatContextValue(store.mcpStatus?.uiContext.historyQuery) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-28 text-surface-500">Scope:</span>
            <span class="font-mono">{{ formatContextValue(store.mcpStatus?.effectiveContext.historyScopeId) }}</span>
          </div>
        </div>
        <div class="mt-3 pt-3 border-t border-surface-700/70">
          <div class="flex items-center gap-2">
            <span class="text-sm text-surface-100 font-medium">Live MCP test</span>
            <div class="flex-1" />
            <Button
              label="Run Live Test"
              icon="fas fa-vial"
              size="small"
              severity="secondary"
              :loading="selfTestRunning"
              @click="runSelfTest()"
            />
          </div>
          <p v-if="selfTestError" class="text-xs text-red-400 mt-2">
            {{ selfTestError }}
          </p>
          <p class="mt-2 text-xs text-surface-400">
            Use the live MCP test when you want Drift to perform a real smoke test against the currently available providers. It checks tool discovery, a safe <span class="font-mono">get_environment</span>, and a safe <span class="font-mono">search_history(limit: 1)</span>.
          </p>
          <div class="flex flex-col gap-2 mt-3">
            <div
              v-for="pid in allProviders"
              :key="`self-test-${pid}`"
              class="border border-surface-700 rounded px-3 py-2"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm text-surface-100">
                  {{ CLI_PROVIDER_DISPLAY_NAMES[pid] }}
                </span>
                <Tag :value="getSelfTestLabel(pid)" :severity="getSelfTestSeverity(pid)" />
              </div>
              <div class="mt-1 text-xs text-surface-400">
                {{ getSelfTestResult(pid)?.cliMessage || getStatus(pid)?.error || "Live test not run yet." }}
              </div>
              <div v-if="getSelfTestResult(pid)" class="mt-2 flex flex-col gap-1 text-xs">
                <div
                  v-for="check in getSelfTestResult(pid)?.checks"
                  :key="`${pid}-${check.name}`"
                  class="flex items-start gap-2"
                >
                  <i
                    class="fas fa-circle pt-1"
                    style="font-size: 6px;"
                    :class="check.ok ? 'text-green-500' : 'text-red-500'"
                  />
                  <span class="w-28 text-surface-500">{{ check.label }}</span>
                  <span class="flex-1 break-all">{{ check.message || "Pending" }}</span>
                </div>
                <div
                  v-if="getSelfTestResult(pid)?.error"
                  class="text-red-400"
                >
                  {{ getSelfTestResult(pid)?.error }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </Card>

    <!-- Tool safety -->
    <h2 class="text-lg font-semibold text-surface-100 mb-3">Tool safety</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <p class="text-xs text-surface-400">
          Full MCP access stays enabled by default, but sensitive actions can require explicit confirmation before the provider is allowed to execute them.
        </p>
        <div class="mt-3 flex items-center gap-2">
          <span class="text-sm text-surface-300">Sensitive confirmations:</span>
          <Tag
            :value="store.settings.mcpPermissions.confirmSensitiveActions ? 'Required' : 'Disabled'"
            :severity="store.settings.mcpPermissions.confirmSensitiveActions ? 'warning' : 'secondary'"
            class="cursor-pointer"
            @click="toggleSensitiveConfirmations"
          />
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <Tag
            v-for="group in permissionGroups"
            :key="group"
            :value="`${permissionGroupLabels[group]}: ${store.settings.mcpPermissions.enabledGroups[group] ? 'On' : 'Off'}`"
            :severity="store.settings.mcpPermissions.enabledGroups[group] ? 'success' : 'secondary'"
            class="cursor-pointer"
            @click="togglePermissionGroup(group)"
          />
        </div>
        <div
          v-if="allToolGroupsDisabled"
          class="mt-3 rounded border border-amber-700 bg-amber-950 px-3 py-2 text-xs text-amber-300"
        >
          <i class="fas fa-triangle-exclamation mr-1" />
          Every tool group is off. Drift still attaches the MCP server but exposes
          <strong>no</strong> tools — the assistant cannot read history, send requests, or
          create findings until you re-enable at least one group.
        </div>
        <div class="mt-3 text-xs text-surface-400">
          Enabled now: {{ store.mcpStatus?.toolCount ?? 0 }}/{{ store.mcpStatus?.supportedToolCount ?? 18 }} tools.
          <span v-if="store.mcpStatus?.toolPolicy.confirmationRequiredToolNames.length">
            Confirmed tools: {{ store.mcpStatus?.toolPolicy.confirmationRequiredToolNames.join(", ") }}
          </span>
        </div>
      </template>
    </Card>


    <!-- Quick help -->
    <h2 class="text-lg font-semibold text-surface-100 mb-3">Quick help</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <div class="grid gap-3 md:grid-cols-3 text-xs text-surface-300">
          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="mb-1 font-medium text-surface-100">What the live test proves</div>
            <div>
              A passed live test means the selected provider could discover MCP tools, call
              <span class="font-mono">get_environment</span>, and run
              <span class="font-mono">search_history(limit: 1)</span> with the current auth/context.
              It does not prove every mutating tool or approval path.
            </div>
          </div>
          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="mb-1 font-medium text-surface-100">Context overrides</div>
            <div>
              Drift follows the active Caido UI project/filter/query/scope until an MCP tool selects
              a different project. While that override is active, the override wins until it is cleared.
            </div>
          </div>
          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="mb-1 font-medium text-surface-100">Recovery path</div>
            <div>
              If a provider loses tools or context, run the health check, restart or close the chat session,
              then export a diagnostics report if the issue persists.
            </div>
          </div>
        </div>
      </template>
    </Card>

    <!-- Process -->
    <h2 class="text-lg font-semibold text-surface-100 mb-3">Process</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }">
      <template #content>
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-300">Timeout (s):</label>
            <InputNumber
              :modelValue="store.settings.processTimeoutSeconds"
              :min="10"
              :max="600"
              class="w-24"
              inputClass="p-inputtext-sm"
              @update:modelValue="(v: number) => updateNumber('processTimeoutSeconds', v)"
            />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-300">Max history msgs:</label>
            <InputNumber
              :modelValue="store.settings.maxHistoryMessages"
              :min="1"
              :max="50"
              class="w-24"
              inputClass="p-inputtext-sm"
              @update:modelValue="(v: number) => updateNumber('maxHistoryMessages', v)"
            />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-300 flex items-center gap-2">
              <input
                type="checkbox"
                :checked="store.settings.debugLogging"
                @change="(e: Event) => toggleDebugLogging((e.target as HTMLInputElement).checked)"
              />
              Enable session debug log (writes to /tmp, removed when session ends)
            </label>
          </div>
        </div>
      </template>
    </Card>

    <!-- Diagnostics -->
    <h2 class="text-lg font-semibold text-surface-100 mb-3">Diagnostics</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }">
      <template #content>
        <div class="flex flex-wrap items-center gap-2">
          <Button
            label="Show Diagnostics"
            icon="fas fa-stethoscope"
            severity="secondary"
            size="small"
            @click="runDiagnostics"
          />
          <Button
            label="Copy Diagnostics Report"
            icon="fas fa-copy"
            severity="secondary"
            size="small"
            :loading="store.supportBundleRunning"
            @click="copySupportBundle"
          />
          <Button
            label="Download Diagnostics Report"
            icon="fas fa-file-arrow-down"
            severity="secondary"
            size="small"
            :loading="store.supportBundleRunning"
            @click="downloadSupportBundle"
          />
        </div>
        <p class="mt-2 text-xs text-surface-400">
          The diagnostics report is a redacted debug export you can share when Drift behaves unexpectedly. It includes provider resolution, MCP status, effective context, persistence issues, and chat/session summaries without secrets.
        </p>
        <p
          v-if="supportBundleStatus"
          class="mt-2 text-xs"
          :class="supportBundleStatus.startsWith('Failed') ? 'text-red-400' : 'text-green-400'"
        >
          {{ supportBundleStatus }}
        </p>
        <div v-if="diagnostics !== undefined" class="mt-3 text-xs font-mono" style="color: #9ca3b0;">
          <div v-for="(value, key) in diagnostics" :key="key" class="flex gap-2 py-0.5">
            <span style="color: #6b7280; min-width: 160px;">{{ key }}:</span>
            <span style="color: #d1d5db; word-break: break-all;">{{ value }}</span>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>
