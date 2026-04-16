export type ChatWorkflowAction = {
  id: string;
  label: string;
  icon: string;
  description: string;
  template: string;
};

export type ChatWorkflowGroup = {
  id: "review" | "validate" | "report";
  label: string;
  description: string;
  actions: ChatWorkflowAction[];
};

export type EmptyChatWorkflow = {
  id: "review" | "validate" | "report";
  label: string;
  description: string;
  cta: string;
  template: string;
};

export const REVIEW_REQUEST_PROMPT =
  "Review this HTTP request as a manual security tester. Summarize what the request does, identify the most relevant attack surfaces, and propose the next 3 manual tests to run in Caido. Focus on auth, access control, input handling, SSRF, IDOR, and sensitive data.";

export const BUILD_TEST_PLAN_PROMPT =
  "Build a focused manual test plan for this HTTP request. State the strongest vulnerability hypotheses, the payloads or mutations to try, the exact follow-up requests to send in Caido, and what result would confirm or refute each hypothesis. Prioritize the top 3 highest-signal tests.";

export const REVIEW_RESPONSE_PROMPT =
  "Review this HTTP response as part of manual security triage. Summarize what it reveals, call out security-relevant headers and caching behavior, note any sensitive data or internal details exposed, and explain the most relevant next validation step.";

export const INSPECT_JAVASCRIPT_PROMPT =
  "Inspect this JavaScript or HTTP response for client-side attack surface. Extract interesting endpoints, tokens, secrets, internal URLs, trust boundaries, and DOM XSS sinks or sources. Suggest the most relevant next manual checks in Caido.";

const reviewRequestAction: ChatWorkflowAction = {
  id: "review-request",
  label: "Review Request",
  icon: "fas fa-file-waveform",
  description: "Use when you want a fast request review plus the next tests worth running.",
  template: REVIEW_REQUEST_PROMPT,
};

const reviewResponseAction: ChatWorkflowAction = {
  id: "review-response",
  label: "Review Response",
  icon: "fas fa-window-maximize",
  description: "Use when the response may expose headers, data, cache issues, or trust boundaries.",
  template: REVIEW_RESPONSE_PROMPT,
};

const validateHypothesisAction: ChatWorkflowAction = {
  id: "validate-hypothesis",
  label: "Validate Hypothesis",
  icon: "fas fa-flask",
  description: "Use when you have a lead and want payloads, replay steps, and confirmation criteria.",
  template:
    "Help me validate a security hypothesis in the active Caido context. Build a focused test plan with the best payloads to try, the exact request mutations to send, and what outcomes would confirm or refute the issue.",
};

const explainFindingAction: ChatWorkflowAction = {
  id: "explain-finding",
  label: "Explain Finding",
  icon: "fas fa-magnifying-glass-chart",
  description: "Use when you already have a finding and need root cause, exploitability, and impact.",
  template:
    "Explain finding [FINDING_ID_OR_TITLE] in detail: root cause, exploitability, affected trust boundary, realistic impact, evidence to collect, and the best next validation step.",
};

const draftFindingAction: ChatWorkflowAction = {
  id: "draft-finding",
  label: "Draft Finding",
  icon: "fas fa-flag",
  description: "Use when you want Drift to turn evidence into a structured finding draft.",
  template:
    "Draft a structured security finding from the current hypothesis or evidence. Include a clear title, severity rationale, affected component, description, impact, reproduction outline, and remediation guidance.",
};

const recoveryHelpAction: ChatWorkflowAction = {
  id: "recovery-help",
  label: "Recovery Help",
  icon: "fas fa-life-ring",
  description: "Use when Drift feels degraded and you need the next recovery step quickly.",
  template:
    "I'm not seeing the expected Caido tools or context. Summarize the current MCP and session state, explain what is degraded, and tell me the single best next recovery step.",
};

const generatePocAction: ChatWorkflowAction = {
  id: "generate-poc",
  label: "Generate PoC",
  icon: "fas fa-code",
  description: "Use when you need a clean proof-of-concept from an existing finding or hypothesis.",
  template:
    "Generate a proof-of-concept for [FINDING_ID_OR_TITLE_OR_HYPOTHESIS]. Include prerequisites, exact requests or payloads, expected evidence, and concise step-by-step reproduction instructions.",
};

const writeReportAction: ChatWorkflowAction = {
  id: "write-report",
  label: "Write Report",
  icon: "fas fa-file-alt",
  description: "Use when you want a bug bounty style report ready for cleanup and submission.",
  template:
    "Write a bug bounty style report for [FINDING_ID_OR_TITLE_OR_HYPOTHESIS]. Include title, severity, affected asset, summary, impact, evidence, steps to reproduce, PoC notes, and remediation.",
};

export const CHAT_WORKFLOW_GROUPS: ChatWorkflowGroup[] = [
  {
    id: "review",
    label: "Review",
    description: "Understand the traffic and surface the best next manual checks.",
    actions: [reviewRequestAction, reviewResponseAction],
  },
  {
    id: "validate",
    label: "Validate",
    description: "Turn a hunch or finding into concrete replay steps and evidence.",
    actions: [
      validateHypothesisAction,
      explainFindingAction,
      draftFindingAction,
      recoveryHelpAction,
    ],
  },
  {
    id: "report",
    label: "Report",
    description: "Package confirmed evidence into findings, PoCs, and reports.",
    actions: [generatePocAction, writeReportAction],
  },
];

export const EMPTY_CHAT_WORKFLOWS: EmptyChatWorkflow[] = [
  {
    id: "review",
    label: "Review",
    description: "Use this when you want Drift to summarize a request or response and point to the next manual checks.",
    cta: "Start Review",
    template: reviewRequestAction.template,
  },
  {
    id: "validate",
    label: "Validate",
    description: "Use this when you already have a hypothesis and need payloads, mutations, and confirmation criteria.",
    cta: "Build Test Plan",
    template: validateHypothesisAction.template,
  },
  {
    id: "report",
    label: "Report",
    description: "Use this when you have enough evidence and want a finding, PoC, or report draft.",
    cta: "Draft Report",
    template: writeReportAction.template,
  },
];
