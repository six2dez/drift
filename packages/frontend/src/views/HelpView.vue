<script setup lang="ts">
import Card from "primevue/card";
</script>

<template>
  <div class="mx-auto h-full w-full overflow-y-auto p-4" style="max-width: 1040px;">
    <h2 class="text-lg font-semibold text-surface-100 mb-3">What is Drift?</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <p class="text-sm text-surface-300 leading-relaxed">
          Drift is a Caido plugin that lets you chat with a local CLI AI agent
          (Claude Code, Gemini CLI, Codex CLI, or GitHub Copilot CLI) while
          giving it live access to your Caido session through an embedded
          MCP server. It is designed as a security copilot for manual work:
          the agent can review HTTP traffic, help you validate hypotheses,
          replay requests, inspect scope and environment, and draft findings
          or reports — all scoped to the Caido project you are currently
          looking at.
        </p>
        <p class="mt-2 text-sm text-surface-300 leading-relaxed">
          Drift does not send your traffic to a remote service. Every chat
          runs a local CLI you already have installed; MCP calls go through
          a Node script Drift spawns on your machine.
        </p>
      </template>
    </Card>

    <h2 class="text-lg font-semibold text-surface-100 mb-3">Prerequisites</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <ul class="text-sm text-surface-300 leading-relaxed list-disc pl-5 space-y-1">
          <li>
            <span class="font-medium text-surface-100">Node.js on your PATH.</span>
            Drift launches the MCP server via <span class="font-mono">node</span>.
            Any recent Node (18+) works. Drift will try common locations
            (<span class="font-mono">/opt/homebrew/bin</span>,
            <span class="font-mono">~/.nvm</span>,
            <span class="font-mono">~/.volta</span>,
            <span class="font-mono">~/.local/bin</span>) if it's not on your shell PATH.
          </li>
          <li>
            <span class="font-medium text-surface-100">At least one AI CLI installed.</span>
            Drift supports <span class="font-mono">claude</span>,
            <span class="font-mono">gemini</span>,
            <span class="font-mono">codex</span>, and
            <span class="font-mono">copilot</span>. You need whichever one you
            plan to chat with to be runnable from your shell.
          </li>
          <li>
            <span class="font-medium text-surface-100">A logged-in Caido session.</span>
            Drift reuses your active Caido session token automatically — no
            PAT or manual credential setup needed.
          </li>
        </ul>
      </template>
    </Card>

    <h2 class="text-lg font-semibold text-surface-100 mb-3">First-time setup</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <ol class="text-sm text-surface-300 leading-relaxed list-decimal pl-5 space-y-2">
          <li>
            Open <span class="font-medium text-surface-100">Settings</span>.
            Under <span class="font-medium text-surface-100">CLI Providers</span>,
            verify each provider you plan to use shows a green dot and a
            resolved path. If one is red, either install the CLI or type its
            absolute path into the <span class="font-mono">Command</span> field.
          </li>
          <li>
            Under <span class="font-medium text-surface-100">Caido API</span>,
            leave the URL at <span class="font-mono">http://localhost:8080</span>
            unless your Caido is listening on a different port.
          </li>
          <li>
            Under <span class="font-medium text-surface-100">MCP Server</span>,
            click <span class="font-medium text-surface-100">Start</span>.
            The status should flip to
            <span class="font-mono">Running (N/18 tools)</span>.
          </li>
          <li>
            Click <span class="font-medium text-surface-100">Run Live Test</span>
            to confirm the MCP server can discover tools and call
            <span class="font-mono">get_environment</span> and
            <span class="font-mono">search_history</span> end-to-end against
            your Caido.
          </li>
          <li>
            Open the <span class="font-medium text-surface-100">Chat</span> tab
            and send a prompt. A good first message is
            "Help me validate a security hypothesis in the active Caido
            context. Build a focused test plan with the best payloads to
            try and what outcomes would confirm or refute the issue."
          </li>
        </ol>
      </template>
    </Card>

    <h2 class="text-lg font-semibold text-surface-100 mb-3">Using the context menu</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <p class="text-sm text-surface-300 leading-relaxed">
          Right-click any HTTP request or response in Caido (history, sitemap,
          replay, or the request editor) and pick one of Drift's actions:
        </p>
        <ul class="mt-2 text-sm text-surface-300 leading-relaxed list-disc pl-5 space-y-1">
          <li>
            <span class="font-medium text-surface-100">Review Request</span>
            — summarize what the request does, surface the most relevant
            attack paths, and suggest the next three manual checks.
          </li>
          <li>
            <span class="font-medium text-surface-100">Build Test Plan</span>
            — turn a request into a focused validation plan with payloads,
            replay steps, and confirmation criteria.
          </li>
          <li>
            <span class="font-medium text-surface-100">Review Response</span>
            — inspect the response for security-relevant headers, caching
            behaviour, data exposure, and the next validation step.
          </li>
          <li>
            <span class="font-medium text-surface-100">Inspect JavaScript</span>
            — extract endpoints, secrets, trust boundaries, and DOM XSS
            clues from a script or response body.
          </li>
        </ul>
        <p class="mt-2 text-sm text-surface-300 leading-relaxed">
          Each action switches you to the Chat tab and auto-sends the
          prompt with the request/response attached as context — you
          don't need to create the chat first. The agent then uses Caido's
          MCP tools to gather evidence, replay follow-up requests, and help
          you move from review to validation and reporting.
        </p>
      </template>
    </Card>

    <h2 class="text-lg font-semibold text-surface-100 mb-3">How a chat turn works</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <ol class="text-sm text-surface-300 leading-relaxed list-decimal pl-5 space-y-2">
          <li>
            You pick a provider from the dropdown next to the send button.
            The currently selected provider shows a green dot when its
            binary is resolved.
          </li>
          <li>
            Drift spawns the CLI as a child process with
            <span class="font-mono">--mcp-config</span> pointing at an
            embedded Drift MCP server. The MCP server exposes Caido tools
            (search_history, get_request, send_request, create_finding, …)
            scoped to the project and filter you are currently looking at.
          </li>
          <li>
            The agent thinks, calls MCP tools as needed, and streams its
            final answer back into the chat bubble. Sensitive tools
            (send_request, create_finding, set_environment, intercept
            controls, run_workflow) require an explicit
            <span class="font-mono">window.confirm</span> approval by
            default — you can disable that in Settings → Tool safety.
          </li>
          <li>
            Claude chats are resumable — Drift passes
            <span class="font-mono">--resume</span> so follow-up messages
            keep the same session id. Gemini / Codex / Copilot are
            stateless, so Drift prepends a trimmed history to each turn.
          </li>
        </ol>
      </template>
    </Card>

    <h2 class="text-lg font-semibold text-surface-100 mb-3">Provider maturity</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <ul class="text-sm text-surface-300 leading-relaxed list-disc pl-5 space-y-1">
          <li>
            <span class="font-medium text-surface-100">Claude Code — Stable.</span>
            Structured <span class="font-mono">stream-json</span> parser,
            dedicated tests, session resume across turns, watchdog-based
            recovery when the child goes silent.
          </li>
          <li>
            <span class="font-medium text-surface-100">Gemini / Codex / Copilot — Experimental.</span>
            Functional today but depend on each upstream CLI's text output;
            an upstream change can break parsing silently. Run the live MCP
            test in Settings before trusting an experimental provider for
            production work.
          </li>
        </ul>
      </template>
    </Card>

    <h2 class="text-lg font-semibold text-surface-100 mb-3">Troubleshooting</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <div class="flex flex-col gap-3">
          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-sm font-medium text-surface-100">
              CLI provider shows as unavailable
            </div>
            <div class="mt-1 text-xs text-surface-300 leading-relaxed">
              Drift could not resolve the binary. Install the provider you
              want, or set the absolute path in
              <span class="font-mono">Settings → CLI Providers → Command</span>.
              Install commands Drift suggests in its error messages:
            </div>
            <ul class="mt-1 text-xs text-surface-300 list-disc pl-5 space-y-0.5">
              <li>
                <span class="font-medium text-surface-100">Claude Code:</span>
                <span class="font-mono">curl -fsSL https://claude.ai/install.sh | bash</span>
              </li>
              <li>
                <span class="font-medium text-surface-100">Gemini CLI:</span>
                <span class="font-mono">npm install -g @google/gemini-cli</span>
              </li>
              <li>
                <span class="font-medium text-surface-100">Codex CLI:</span>
                <span class="font-mono">npm install -g @openai/codex</span>
              </li>
              <li>
                <span class="font-medium text-surface-100">Copilot CLI:</span>
                <span class="font-mono">gh extension install github/gh-copilot</span>
              </li>
            </ul>
          </div>

          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-sm font-medium text-surface-100">
              MCP status: "Auth failed"
            </div>
            <div class="mt-1 text-xs text-surface-300 leading-relaxed">
              Your Caido session token is stale or missing. Fix: open any
              Caido page (e.g. click into History) to refresh the session,
              then go back to Drift → Settings → MCP Server and click Start
              again.
            </div>
          </div>

          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-sm font-medium text-surface-100">
              "Drift could not locate a Node.js executable"
            </div>
            <div class="mt-1 text-xs text-surface-300 leading-relaxed">
              Caido is running in an environment where
              <span class="font-mono">node</span> is not on PATH. Fix: launch
              Caido from a shell that has Node, or install Node via Homebrew
              / nvm / volta and relaunch Caido. Drift looks in
              <span class="font-mono">/opt/homebrew/bin</span>,
              <span class="font-mono">/usr/local/bin</span>,
              <span class="font-mono">~/.volta/bin</span>,
              <span class="font-mono">~/.nvm/versions/node/*</span>, and
              <span class="font-mono">~/.fnm/node-versions/*</span>.
            </div>
          </div>

          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-sm font-medium text-surface-100">
              Chat spinner stays on "Waiting for…" forever
            </div>
            <div class="mt-1 text-xs text-surface-300 leading-relaxed">
              Drift has a watchdog that forces a shutdown if the child CLI
              goes silent for more than ~20 seconds, so a permanent hang
              usually means the CLI itself wedged. Click the Stop button,
              then try sending the prompt again. If it still hangs, run
              Settings → Diagnostics → Download Diagnostics Report and
              include the JSON in a bug report.
            </div>
          </div>

          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-sm font-medium text-surface-100">
              Context menu click does nothing visible
            </div>
            <div class="mt-1 text-xs text-surface-300 leading-relaxed">
              Drift should auto-switch to the Chat tab and send the prompt
              for you. If the new chat does not appear, reload Caido and try
              again. If the problem persists, open Settings → Diagnostics
              and share the report.
            </div>
          </div>

          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-sm font-medium text-surface-100">
              Agent answers without using Caido tools
            </div>
            <div class="mt-1 text-xs text-surface-300 leading-relaxed">
              Usually means MCP is stopped or the provider is not the one
              you think. Check the MCP badge at the top of the plugin
              header (it should say
              <span class="font-mono">MCP N/18</span> in green), and verify
              the provider dropdown in the chat input. Re-run the Live MCP
              Test from Settings if in doubt.
            </div>
          </div>

          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-sm font-medium text-surface-100">
              A sensitive tool is blocked even after you approve it
            </div>
            <div class="mt-1 text-xs text-surface-300 leading-relaxed">
              The approval confirm dialog returns false if you cancel or
              close it. Send the prompt again; when the confirm dialog
              appears, click OK. If you trust the agent fully you can
              disable confirmations in Settings → Tool safety, but that
              disables the check for every sensitive tool at once.
            </div>
          </div>

          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-sm font-medium text-surface-100">
              The chat ignores the project you're looking at
            </div>
            <div class="mt-1 text-xs text-surface-300 leading-relaxed">
              Drift follows the active Caido UI project/filter/query/scope
              until an MCP tool selects a different project. Once that
              override is active, it wins until you clear it — ask the
              agent to call <span class="font-mono">clear_context_override</span>
              or run <span class="font-mono">select_project</span> with the
              project you actually want.
            </div>
          </div>
        </div>
      </template>
    </Card>

    <h2 class="text-lg font-semibold text-surface-100 mb-3">Settings cheat sheet</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <div class="flex flex-col gap-2 text-xs text-surface-300 leading-relaxed">
          <div>
            <span class="font-medium text-surface-100">Health check</span>
            — one-click audit of providers, auth, MCP runtime, self-test,
            and context sync. Run this first when something breaks.
          </div>
          <div>
            <span class="font-medium text-surface-100">CLI Providers</span>
            — enable/disable each CLI, point at a specific binary path, see
            resolution errors inline.
          </div>
          <div>
            <span class="font-medium text-surface-100">Caido API</span>
            — URL of the Caido HTTP API Drift should hit (default
            <span class="font-mono">http://localhost:8080</span>).
          </div>
          <div>
            <span class="font-medium text-surface-100">MCP Server</span>
            — start/stop the embedded MCP server, see live context, run the
            live MCP test against each provider.
          </div>
          <div>
            <span class="font-medium text-surface-100">Tool safety</span>
            — per-group on/off (Read, Replay, Findings, Environment,
            Intercept, Workflow) and the sensitive-confirmation toggle.
          </div>
          <div>
            <span class="font-medium text-surface-100">Process</span>
            — CLI spawn timeout and max chat history messages sent to
            stateless providers.
          </div>
          <div>
            <span class="font-medium text-surface-100">Diagnostics</span>
            — inline key/value dump and a redacted JSON bundle you can
            copy or download for bug reports.
          </div>
        </div>
      </template>
    </Card>

    <h2 class="text-lg font-semibold text-surface-100 mb-3">Getting help</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <p class="text-sm text-surface-300 leading-relaxed">
          If you hit something this page doesn't cover, grab a diagnostics
          report from Settings → Diagnostics → Download Diagnostics Report
          and open a GitHub issue with it attached. The bundle is
          auto-redacted of secrets (tokens, credentials) and includes
          provider resolution, MCP status, effective Caido context,
          persistence issues, and a summary of your recent chats.
        </p>
      </template>
    </Card>
  </div>
</template>
