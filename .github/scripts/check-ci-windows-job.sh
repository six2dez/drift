#!/usr/bin/env bash
# Static gate for the `Verify (Windows)` job in .github/workflows/ci.yml.
#
# Exists so the job's shape is a runnable assertion rather than a review
# convention: every property below is one this repo has already paid for once
# (a missing pnpm step, a non-blocking leg, a two-armed secret gate) and each is
# cheap to reintroduce by accident in a later edit.
#
# Prints PASS/FAIL per assertion, names the failing one, and exits non-zero if
# any failed. Run it from the repository root.
set -uo pipefail

CI=.github/workflows/ci.yml
PROBE=.github/workflows/windows-llrt-probe.yml
failures=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n      %s\n' "$1" "$2"; failures=$((failures + 1)); }

check_eq() { # name actual expected
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected $3, got $2"; fi
}

check_ge() { # name actual minimum
  if [ "$2" -ge "$3" ]; then pass "$1"; else fail "$1" "expected at least $3, got $2"; fi
}

if [ ! -f "$CI" ]; then
  echo "FAIL  ci.yml is missing at $CI" >&2
  exit 1
fi

# A comment-stripped view. Sound for a zero-gate on YAML because a key always
# precedes any trailing '#', so a real setting survives the strip and only prose
# about one is removed. Used ONLY for the two absence checks below — never for
# the secret gate, where a credential sitting in a comment is still a leaked
# credential.
STRIPPED=$(sed -e 's:#.*::' "$CI")

check_eq "exactly one Windows runner declaration" \
  "$(grep -c 'windows-latest' "$CI")" 1

check_eq "the leg is blocking — no continue-on-error setting" \
  "$(printf '%s\n' "$STRIPPED" | grep -c 'continue-on-error')" 0

# The Node setup action's pnpm cache default must stay untouched here: this job
# has a pnpm step ahead of it, unlike the probe workflow that has to disable it.
check_eq "the Node setup cache default is left alone" \
  "$(printf '%s\n' "$STRIPPED" | grep -c 'package-manager-cache')" 0

check_eq "a run ceiling is pinned exactly once" \
  "$(grep -c 'timeout-minutes' "$CI")" 1

check_ge "every run step in the Windows job pins bash" \
  "$(grep -c 'shell: bash' "$CI")" 6

check_eq "pnpm action pin matches the ubuntu job" \
  "$(grep -c 'pnpm/action-setup@v6' "$CI")" 2

check_eq "node setup action pin matches the ubuntu job" \
  "$(grep -c 'actions/setup-node@v5' "$CI")" 2

check_ge "the probe workflow is still a scan target" \
  "$(grep -c 'windows-llrt-probe.yml' "$CI")" 1

# Ordering, asserted by line number rather than by eye. Without a pnpm binary
# already on PATH the Node setup step dies with "Unable to locate executable
# file: pnpm" and nothing in the job ever runs.
JOB_LINE=$(grep -n 'runs-on: windows-latest' "$CI" | head -1 | cut -d: -f1)
PNPM_LINE=$(awk -v s="$JOB_LINE" 'NR>s && /- name: Setup pnpm/ {print NR; exit}' "$CI")
NODE_LINE=$(awk -v s="$JOB_LINE" 'NR>s && /- name: Setup Node/ {print NR; exit}' "$CI")
if [ -n "${PNPM_LINE:-}" ] && [ -n "${NODE_LINE:-}" ] && [ "$PNPM_LINE" -lt "$NODE_LINE" ]; then
  pass "Setup pnpm precedes Setup Node inside the Windows job (${PNPM_LINE} < ${NODE_LINE})"
else
  fail "Setup pnpm precedes Setup Node inside the Windows job" \
    "pnpm at line '${PNPM_LINE:-none}', node at line '${NODE_LINE:-none}'"
fi

# No job-level conditional: a leg that can skip itself is a leg nobody must heed.
JOB_BODY=$(awk 'f{print} /^  windows:$/{f=1}' "$CI")
check_eq "no job-level conditional on the Windows job" \
  "$(printf '%s\n' "$JOB_BODY" | grep -cE '^    if:')" 0

# --- The secret gate, proven at all three grep statuses ---------------------
# A zero from an unproven scanner is not evidence, so this exercises the same
# pattern the workflow runs: clean must be 1, a seeded match must be 0, and a
# missing target must be 2. The seeded literals are assembled from fragments so
# this script never itself contains the text the gate detects.
gate_status() { # files...
  local st=0
  grep -nE 'CAIDO_(TOKEN)|secret(s)\.' "$@" >/dev/null 2>&1 || st=$?
  printf '%s' "$st"
}

check_eq "secret gate arm 2 — the scanned files are clean (status 1)" \
  "$(gate_status "$CI" "$PROBE")" 1

TMPDIR_GATE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_GATE"' EXIT

SEEDED_TOKEN="$TMPDIR_GATE/seeded-token.yml"
cp "$CI" "$SEEDED_TOKEN"
printf '\n# seeded by the gate self-test: %s%s\n' 'CAIDO_' 'TOKEN' >> "$SEEDED_TOKEN"
check_eq "secret gate arm 1 — a seeded token reference is caught (status 0)" \
  "$(gate_status "$SEEDED_TOKEN" "$PROBE")" 0

SEEDED_EXPR="$TMPDIR_GATE/seeded-expr.yml"
cp "$CI" "$SEEDED_EXPR"
printf '\n# seeded by the gate self-test: %s%s%s\n' 'secret' 's' '.EXAMPLE' >> "$SEEDED_EXPR"
check_eq "secret gate arm 1 — a seeded secrets expression is caught (status 0)" \
  "$(gate_status "$SEEDED_EXPR" "$PROBE")" 0

check_eq "secret gate arm 3 — a missing scan target fails (status 2)" \
  "$(gate_status "$CI" "$TMPDIR_GATE/definitely-absent.yml")" 2

echo
if [ "$failures" -ne 0 ]; then
  printf '%s assertion(s) failed.\n' "$failures"
  exit 1
fi
echo "All assertions passed."
