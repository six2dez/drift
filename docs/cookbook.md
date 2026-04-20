# Drift cookbook — real workflows

Seven worked examples of how to use Drift for day-to-day manual security
testing in Caido. Each recipe shows the starting context, the Drift action
or prompt to fire, what a good answer looks like, and the follow-up that
closes the loop.

These are opinionated starting points, not scripts to run blindly. Drift
answers in context of your active Caido project, filter, and scope, so the
specific payloads and next steps it suggests will vary with your target.

---

## 1. IDOR suspected in `/api/users/:id`

**When to use** — you have a request like `GET /api/users/4821` and you want
to know whether swapping the id to another user's id leaks data.

**Steps**

1. In Caido History, right-click the request → **Drift: Build Test Plan**.
2. Drift auto-opens a chat and sends a "Build a focused manual test plan…"
   prompt with the raw request attached.
3. A good answer lists: hypothesis (broken object-level authorization),
   payloads to try (different user ids from the same tenant, ids from
   another tenant, `0`, `-1`, `admin`, UUIDs if applicable), exact replay
   steps (change `:id`, compare response codes and bodies), and confirmation
   criteria (any non-403/404 response for an id you do not own).
4. Run the replays from Caido's Replay tab or ask Drift to do it with
   `send_request` (approve the sensitive tool call in the dialog).
5. If one returns 200 with a different user's data, switch to
   **Validate → Draft Finding**.

**Next chain** — a valid IDOR on a user-profile endpoint frequently lets you
escalate by trying mutating verbs (`PUT /api/users/<victim-id>`) on the same
resource. Ask Drift "Based on this IDOR, what write-side endpoints likely
share the same flaw?" before closing the investigation.

---

## 2. Auth bypass on `/admin`

**When to use** — `/admin` returns 302 to `/login` for you, and you want a
structured go/no-go on whether there is a bypass path.

**Steps**

1. From Request/Replay, right-click → **Drift: Review Request**.
2. Ask a follow-up: "What are the top 5 auth-bypass vectors I should try for
   this endpoint? Rank by hit-rate for this stack."
3. A good answer enumerates: header-based (`X-Forwarded-For`, `X-Real-IP`,
   `X-Original-URL`, `X-Rewrite-URL`), path-based (`/admin/`,
   `/admin/..;/`, `//admin`, `/%2e%2e/admin`), method-based (`POST` / `HEAD`
   when only `GET` was blocked), parameter-based (role=admin in body).
4. For each candidate, ask Drift: "Give me the exact curl I should run."
   Copy-as-curl on the attachment preview, paste, tweak, replay.
5. If one returns 200 with admin content, go to **Validate Hypothesis** to
   confirm scope and impact before reporting.

**Tip** — ask Drift `"before drafting, is any of this in scope according to
get_scope?"`. Drift calls the MCP `get_scope` tool and confirms.

---

## 3. Audit responses of the current project for data leaks

**When to use** — you want a sanity pass over every response in the current
Caido history for common leak patterns.

**Prompt**

> Audit the last 200 responses in the current Caido context. Look for: PII
> (emails, phone numbers, full names in JSON), secrets (AWS keys, Bearer
> tokens, private keys), stack traces, debug endpoints, open directories.
> For each hit, cite the request id, what you found, and the risk. Skip
> 401/403/404.

**What you get** — Drift iterates `search_history` with appropriate filters
and returns a ranked table. Ambiguous cases get flagged rather than
asserted. This is a triage lane, not an exploit; move confirmed findings to
recipe #7.

**Cost note** — if you have the token counter on, this recipe typically
shows in the 15-40k-in / 2-5k-out range on Claude. Scope it tighter (smaller
filter, fewer requests) if you want to iterate cheaply.

---

## 4. Weak `Set-Cookie` from response review to PoC

**When to use** — you are reading a response and notice `Set-Cookie:
session=...` without `Secure`, `HttpOnly`, or `SameSite`.

**Steps**

1. Right-click the response → **Drift: Review Response**.
2. Drift highlights the weak cookie flags + explains per-flag impact.
3. Follow-up: "Build the exact PoC that exploits this specific cookie's
   missing `HttpOnly` in the context of this app." Drift asks for one or
   two details (where the cookie is consumed, whether XSS is otherwise
   possible) and drafts a proof.
4. Validate the PoC in a throwaway context before drafting the report.

**Limitation** — Drift cannot infer whether the endpoint is actually
reachable from an attacker origin. Ask "what preconditions does this PoC
need?" to surface the assumptions.

---

## 5. Find an undocumented endpoint from a JS file

**When to use** — the app ships a SPA bundle, you suspect unlinked admin
routes.

**Steps**

1. Navigate to the response that holds the JS bundle in History.
2. Right-click → **Drift: Inspect JavaScript**.
3. Drift returns: `endpoints` table (path, HTTP method implied by code
   path), `trust boundaries` (auth guards vs. unguarded), `secrets` (hardcoded
   tokens, API keys), `DOM XSS sinks` if any.
4. Pick the most interesting unlinked endpoint. Ask: "Call `send_request`
   against this endpoint with no auth and show me the response." Approve
   the sensitive tool call.
5. If the response differs from `/login` (eg. 200 with real JSON, or 500
   with a stack trace), the endpoint is worth a closer look.

**Tip** — for very large bundles, ask Drift to stream the extraction in
chunks ("list the next 10 endpoints") rather than one blob. You'll burn
less context window.

---

## 6. Race condition on a balance-transfer endpoint

**When to use** — there is a `POST /api/transfer { from, to, amount }` and
you suspect the server does not lock on read.

**Steps**

1. Right-click the transfer request → **Drift: Build Test Plan**.
2. Add context: "I want to check whether this endpoint is vulnerable to a
   classic TOCTOU race on the balance read. Build a test that fires 20
   concurrent transfers of the full balance."
3. Drift drafts: preconditions (two accounts, known balance, enough session
   longevity), exact request body, a recipe for Turbo Intruder or
   `xargs -P 20 curl` that fires the concurrent burst, and the exact
   signal that confirms the race (aggregate balance transferred > original
   balance).
4. Run the burst outside Drift (Turbo Intruder / bash). If race hits, come
   back: "Given this output, draft a Finding explaining the exact CWE,
   impact, and remediation (lock, idempotency key, ledger design)."

**Why this is worth a recipe** — Drift can't execute concurrent bursts
(MCP is serial), so the split "draft plan in Drift, fire burst outside,
draft report in Drift" is the intended flow for timing bugs.

---

## 7. From hypothesis to submission-ready report

**When to use** — you already confirmed a bug and want a bounty-style
report draft that is 80% there.

**Steps**

1. Open a fresh chat (so you start on a clean context).
2. Fire **Draft Finding** from the empty-state workflow grid, or type:

> Draft a structured security finding from the evidence below. Title,
> severity rationale with CVSS 3.1, affected component, summary, impact,
> reproduction steps, PoC notes, remediation. Keep each section tight.
>
> Evidence:
> - Endpoint: POST /api/users/4821 (attached request)
> - Steps: change id to 9912; response 200 with another user's PII
> - Affected: every authenticated user's profile data
> - Versions observed: ...

3. Drift returns a draft. Review it *carefully* — it will occasionally
   over-state impact. Push back: "Trim this to only claims I can prove
   from the attached request/response." The second pass is usually
   cleaner.
4. Move to **Generate PoC** for a copy-paste ready reproduction block.
5. When ready, **Copy conversation** from the chat header, paste into your
   bounty platform, tweak the final wording.

**Validation step before you submit** — ask Drift one final time: "What in
this draft is not supported by the attached evidence?" If the answer is
"nothing", you are good. If anything comes back, cut those claims.

---

## Appendix: common pitfalls

- **The model confidently invents a header**. Double-check any `X-*` header
  Drift suggests by running a quick `send_request` approval and verifying
  the response shape before using it in a report.
- **Scope drift**. When investigating a finding, Drift sometimes wanders
  into adjacent endpoints. If that is not what you want, say "Stay on this
  endpoint only" in the next turn.
- **Cost creep on stateless providers**. Gemini / Codex / Copilot re-send
  the trimmed history every turn. For long investigations prefer Claude
  Code (session resume) or start a new chat when the existing one is past
  ~15 turns.
- **Approval fatigue**. Use "Allow for session" on tools you trust for this
  investigation (eg. `send_request` while running a scripted test plan),
  and rely on **Restart session** to clear the grants when you are done.
