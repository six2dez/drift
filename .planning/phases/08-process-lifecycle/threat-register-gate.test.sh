#!/usr/bin/env bash

# Independent red/green matrix for the standing Phase 08 citation gate (T-08-88).
# Invalid and unregistered tokens are assembled only after this support artifact
# is running, so the live self-scan cannot mistake fixture intent for a citation.

set -u
set -o pipefail

TEST_PATH="${BASH_SOURCE[0]}"
TEST_DIR="$(cd "$(dirname "$TEST_PATH")" && pwd)"
TEST_PATH="$TEST_DIR/$(basename "$TEST_PATH")"
REPOSITORY_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
PRODUCTION_GATE="$TEST_DIR/threat-register-gate.sh"
LIVE_SECURITY="$TEST_DIR/08-SECURITY.md"
REGISTER_HEADER='| Threat ID | Category | Component | Sev | Disposition | Mitigation (verified) | Status |'
REGISTER_DELIMITER='|---|---|---|---|---|---|---|'
NEWLINE_PATH_LABEL='newline-path-rejected'
REGISTER_MAX=94

FIXTURE_ROOT=''
TEST_COUNT=0

cleanup_fixture() {
  if [ -n "$FIXTURE_ROOT" ] && [ -d "$FIXTURE_ROOT" ]; then
    rm -rf -- "$FIXTURE_ROOT" >/dev/null 2>&1
  fi
}

fail_test() {
  printf 'threat-register-gate.test.sh: FAIL label=%s\n' "$1"
  return 1
}

assert_contains() {
  local output="$1"
  local expected="$2"
  local label="$3"

  if [[ "$output" != *"$expected"* ]]; then
    fail_test "$label"
    return 1
  fi
  return 0
}

assert_excludes() {
  local output="$1"
  local forbidden="$2"
  local label="$3"

  if [ -n "$forbidden" ] && [[ "$output" == *"$forbidden"* ]]; then
    fail_test "$label"
    return 1
  fi
  return 0
}

invoke_gate() {
  local root="$1"
  bash "$PRODUCTION_GATE" --root "$root" 2>&1
}

expect_fixture_pass() {
  local label="$1"
  local output
  local gate_rc

  output="$(invoke_gate "$FIXTURE_ROOT")"
  gate_rc=$?
  TEST_COUNT=$((TEST_COUNT + 1))
  if [ "$gate_rc" -ne 0 ]; then
    fail_test "$label-status"
    return 1
  fi
  assert_contains "$output" 'register_numeric=94 register_sentinel=1' "$label-register" || return 1
  assert_contains "$output" 'threat-register-gate.sh: PASS' "$label-pass" || return 1
  return 0
}

expect_fixture_failure() {
  local label="$1"
  local expected="${2:-}"
  local forbidden_one="${3:-}"
  local forbidden_two="${4:-}"
  local output
  local gate_rc

  output="$(invoke_gate "$FIXTURE_ROOT")"
  gate_rc=$?
  TEST_COUNT=$((TEST_COUNT + 1))
  if [ "$gate_rc" -eq 0 ]; then
    fail_test "$label-status"
    return 1
  fi
  if [ -n "$expected" ]; then
    assert_contains "$output" "$expected" "$label-expected" || return 1
  fi
  assert_excludes "$output" "$forbidden_one" "$label-forbidden-one" || return 1
  assert_excludes "$output" "$forbidden_two" "$label-forbidden-two" || return 1
  return 0
}

register_maximum() {
  awk '
    /^## Threat Register$/ { in_register=1; next }
    in_register && /^## / { exit }
    in_register && /^\| \*\*T-08-[0-9][0-9]\*\*/ {
      first=$2
      sub(/^.*T-08-/, "", first)
      sub(/[^0-9].*$/, "", first)
      numeric=first+0
      if (numeric > maximum) maximum=numeric
    }
    END { print maximum+0 }
  ' "$LIVE_SECURITY"
}

reset_fixture() {
  local support_dir
  local package_dir
  local audit_head
  local package_tree
  local package_digest
  local security
  local temporary

  rm -rf -- "$FIXTURE_ROOT/.git" "$FIXTURE_ROOT/packages" "$FIXTURE_ROOT/.planning"
  support_dir="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle"
  package_dir="$FIXTURE_ROOT/packages/backend/src"
  mkdir -p "$package_dir" "$support_dir"
  printf '%s\n' 'T-08-55 T-08-59 T-08-75' > "$package_dir/kill-plan.ts"
  printf '%s\n' 'T-08-89 T-08-90' > "$package_dir/mcp-lifecycle.ts"
  printf '%s\n' 'T-08-91 T-08-92' > "$package_dir/owned-temp-file.ts"
  printf '%s\n' 'T-08-93 T-08-94' > "$package_dir/mcp-runtime-artifacts.ts"
  printf '%s\n' 'T-08-67' > "$support_dir/verify-a1-patch.sh"
  printf '%s\n' 'T-08-76' > "$support_dir/a1-probe-fix.patch"

  git -C "$FIXTURE_ROOT" init -q >/dev/null 2>&1 || return 1
  git -C "$FIXTURE_ROOT" config user.name 'Drift Gate Fixture' || return 1
  git -C "$FIXTURE_ROOT" config user.email 'fixture@invalid.example' || return 1
  git -C "$FIXTURE_ROOT" add packages .planning || return 1
  git -C "$FIXTURE_ROOT" commit -qm 'fixture baseline' || return 1
  audit_head="$(git -C "$FIXTURE_ROOT" rev-parse HEAD)" || return 1
  package_tree="$(git -C "$FIXTURE_ROOT" rev-parse "${audit_head}:packages")" || return 1
  if command -v shasum >/dev/null 2>&1; then
    package_digest="$(git -C "$FIXTURE_ROOT" ls-tree -r "$audit_head" -- packages | shasum -a 256 | awk '{print $1}')" || return 1
  else
    package_digest="$(git -C "$FIXTURE_ROOT" ls-tree -r "$audit_head" -- packages | sha256sum | awk '{print $1}')" || return 1
  fi

  security="$support_dir/08-SECURITY.md"
  temporary="$security.tmp"
  cp "$LIVE_SECURITY" "$security"
  awk -v audit_head="$audit_head" -v package_tree="$package_tree" -v package_digest="$package_digest" '
    /^audited_at_head:/ { print "audited_at_head: " audit_head; next }
    /^package_tree_at_audit:/ { print "package_tree_at_audit: " package_tree; next }
    /^package_tree_sha256_at_audit:/ { print "package_tree_sha256_at_audit: " package_digest; next }
    /^package_commits_after_audit:/ { print "package_commits_after_audit: 0"; next }
    { print }
  ' "$security" > "$temporary" && mv "$temporary" "$security"
}

remove_register_row() {
  local id="$1"
  local security="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/08-SECURITY.md"
  local temporary="$security.tmp"

  awk -v target="$id" '
    index($0, "**" target "**") == 0 { print }
  ' "$security" > "$temporary" && mv "$temporary" "$security"
}

duplicate_register_row() {
  local id="$1"
  local security="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/08-SECURITY.md"
  local temporary="$security.tmp"

  awk -v target="$id" '
    { print }
    index($0, "**" target "**") != 0 { print }
  ' "$security" > "$temporary" && mv "$temporary" "$security"
}

remove_ledger_row() {
  local id="$1"
  local security="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/08-SECURITY.md"
  local temporary="$security.tmp"

  awk -v target="$id" '
    index($0, "| " target " |") == 0 { print }
  ' "$security" > "$temporary" && mv "$temporary" "$security"
}

mark_register_row_open() {
  local id="$1"
  local security="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/08-SECURITY.md"
  local temporary="$security.tmp"

  awk -v target="$id" '
    index($0, "**" target "**") != 0 { sub(/\| closed[^|]*\|$/, "| open |") }
    { print }
  ' "$security" > "$temporary" && mv "$temporary" "$security"
}

blank_register_mitigation() {
  local id="$1"
  local security="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/08-SECURITY.md"
  local temporary="$security.tmp"

  awk -v target="$id" '
    index($0, "**" target "**") != 0 {
      sub(/\| [^|]* \| closed[^|]*\|$/, "|  | closed |")
    }
    { print }
  ' "$security" > "$temporary" && mv "$temporary" "$security"
}

corrupt_audit_digest() {
  local security="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/08-SECURITY.md"
  local temporary="$security.tmp"

  awk '
    /^package_tree_sha256_at_audit:/ {
      print "package_tree_sha256_at_audit: 0000000000000000000000000000000000000000000000000000000000000000"
      next
    }
    { print }
  ' "$security" > "$temporary" && mv "$temporary" "$security"
}

write_empty_register() {
  local security="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/08-SECURITY.md"

  {
    printf '%s\n\n' '## Threat Register'
    printf '%s\n' "$REGISTER_HEADER"
    printf '%s\n' "$REGISTER_DELIMITER"
    printf '\n%s\n' '## Accepted Risks Log'
  } > "$security"
}

run_independent_matrix() {
  local maximum
  local next_number
  local next_digits
  local prefix='T-08-'
  local next_id
  local malformed_digits
  local malformed_id
  local canary='drift-independent-canary-c6189e4f273a'
  local output
  local live_rc
  local support_dir
  local package_dir
  local plan_file
  local summary_file
  local file
  local relative
  local name
  local newline_file
  local -a adversarial_names

  maximum="$(register_maximum)"
  if [ "$maximum" -ne "$REGISTER_MAX" ]; then
    fail_test live-register-maximum
    return 1
  fi
  next_number=$((maximum + 1))
  printf -v next_digits '%02d' "$next_number"
  next_id="${prefix}${next_digits}"
  malformed_digits="0${next_digits}"
  malformed_id="${prefix}${malformed_digits}"

  output="$(bash "$PRODUCTION_GATE" 2>&1)"
  live_rc=$?
  TEST_COUNT=$((TEST_COUNT + 1))
  if [ "$live_rc" -ne 0 ]; then
    fail_test live-repository-status
    return 1
  fi
  assert_contains "$output" 'register_numeric=94 register_sentinel=1' live-register-count || return 1
  assert_contains "$output" 'packages=' live-package-family || return 1
  assert_contains "$output" 'support=' live-support-family || return 1

  reset_fixture
  expect_fixture_pass fixture-baseline || return 1

  printf '%s canary=%s\n' "$next_id" "$canary" > "$FIXTURE_ROOT/packages/missing-package.ts"
  expect_fixture_failure package-unregistered \
    "family=package id=$next_id path=packages/missing-package.ts" "$canary" || return 1

  reset_fixture
  support_dir="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle"
  printf '%s canary=%s\n' "$next_id" "$canary" > "$support_dir/missing-support.sh"
  expect_fixture_failure support-unregistered \
    "family=support id=$next_id path=.planning/phases/08-process-lifecycle/missing-support.sh" "$canary" || return 1

  reset_fixture
  remove_register_row 'T-08-55'
  expect_fixture_failure removed-live-sentinel 'register-row-missing id=T-08-55' "$canary" || return 1

  reset_fixture
  duplicate_register_row 'T-08-57'
  expect_fixture_failure duplicate-main-row 'duplicate-register-id id=T-08-57' "$canary" || return 1

  reset_fixture
  printf '%s\n' 'T-08-90' > "$FIXTURE_ROOT/packages/backend/src/mcp-lifecycle.ts"
  expect_fixture_failure missing-new-live-citation \
    'liveness-sentinel-missing family=package id=T-08-89' "$canary" || return 1

  reset_fixture
  remove_ledger_row 'T-08-89'
  expect_fixture_failure missing-new-ledger-row \
    'ledger-row-missing id=T-08-89' "$canary" || return 1

  reset_fixture
  mark_register_row_open 'T-08-89'
  expect_fixture_failure false-aggregate-closure \
    'aggregate-open-high-count=1' "$canary" || return 1

  reset_fixture
  blank_register_mitigation 'T-08-89'
  expect_fixture_failure missing-high-mitigation \
    'open-high-mitigation id=T-08-89' "$canary" || return 1

  reset_fixture
  corrupt_audit_digest
  expect_fixture_failure stale-audit-digest \
    'audit-package-digest-mismatch' "$canary" || return 1

  reset_fixture
  printf '%s\n' 'T-08-55 T-08-59 T-08-75 committed-drift' \
    > "$FIXTURE_ROOT/packages/backend/src/kill-plan.ts"
  git -C "$FIXTURE_ROOT" add packages/backend/src/kill-plan.ts || return 1
  git -C "$FIXTURE_ROOT" commit -qm 'package commit after audit' || return 1
  expect_fixture_failure package-commit-after-audit \
    'audit-package-commits-after=1' "$canary" || return 1

  reset_fixture
  support_dir="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle"
  printf '\n%s\n%s\n' '## Fixture Prose' "$next_id" >> "$support_dir/08-SECURITY.md"
  printf '%s\n' "$next_id" > "$FIXTURE_ROOT/packages/prose-only.ts"
  expect_fixture_failure outside-register-prose \
    "id=$next_id path=packages/prose-only.ts" "$canary" || return 1

  reset_fixture
  plan_file="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/08-20-PLAN.md"
  summary_file="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/08-20-SUMMARY.md"
  printf '%s\n' "$next_id" > "$plan_file"
  printf '%s\n' "$next_id" > "$summary_file"
  expect_fixture_pass plan-summary-excluded || return 1
  printf '%s\n' "$next_id" > "$FIXTURE_ROOT/packages/plan-is-not-proof.ts"
  expect_fixture_failure plan-summary-not-proof \
    "id=$next_id path=packages/plan-is-not-proof.ts" "$canary" || return 1

  reset_fixture
  printf '%s canary=%s\n' "$malformed_id" "$canary" > "$FIXTURE_ROOT/packages/malformed.ts"
  expect_fixture_failure malformed-live-id \
    "malformed-live-id id=$malformed_id path=packages/malformed.ts" "$canary" || return 1

  reset_fixture
  write_empty_register
  expect_fixture_failure empty-register 'register-numeric-empty' "$canary" || return 1

  reset_fixture
  rm -rf -- "$FIXTURE_ROOT/packages"
  mkdir -p "$FIXTURE_ROOT/packages"
  expect_fixture_failure empty-package-discovery 'package-discovery-empty' "$canary" || return 1

  reset_fixture
  rm -f -- "$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/verify-a1-patch.sh" \
    "$FIXTURE_ROOT/.planning/phases/08-process-lifecycle/a1-probe-fix.patch"
  expect_fixture_failure empty-support-discovery 'support-discovery-empty' "$canary" || return 1

  reset_fixture
  support_dir="$FIXTURE_ROOT/.planning/phases/08-process-lifecycle"
  package_dir="$FIXTURE_ROOT/packages/adversarial"
  mkdir -p "$package_dir"
  adversarial_names=(
    'with space'
    $'with\ttab'
    "single'quote"
    'double"quote'
    'glob*?['
  )

  for name in "${adversarial_names[@]}"; do
    printf '%s\n' 'T-08-55' > "$package_dir/$name.ts"
    printf '%s\n' 'T-08-67' > "$support_dir/$name.sh"
  done
  expect_fixture_pass registered-adversarial-matrix || return 1

  for name in "${adversarial_names[@]}"; do
    file="$package_dir/$name.ts"
    relative="${file#"$FIXTURE_ROOT"/}"
    printf '%s canary=%s\n' "$next_id" "$canary" > "$file"
    expect_fixture_failure package-adversarial-path "id=$next_id path=$relative" "$canary" || return 1
    printf '%s\n' 'T-08-55' > "$file"
  done

  for name in "${adversarial_names[@]}"; do
    file="$support_dir/$name.sh"
    relative="${file#"$FIXTURE_ROOT"/}"
    printf '%s canary=%s\n' "$next_id" "$canary" > "$file"
    expect_fixture_failure support-adversarial-path "id=$next_id path=$relative" "$canary" || return 1
    printf '%s\n' 'T-08-67' > "$file"
  done

  # The malformed token is in an ordinary file before the unsafe path is added.
  # A repository-wide pathname preflight must suppress all citation processing.
  reset_fixture
  printf '%s %s canary=%s\n' 'T-08-55 T-08-59 T-08-75' "$malformed_id" "$canary" \
    > "$FIXTURE_ROOT/packages/backend/src/kill-plan.ts"
  newline_file="$FIXTURE_ROOT/packages/backend/src/unsafe"$'\n'"path.ts"
  printf '%s canary=%s\n' "$next_id" "$canary" > "$newline_file"
  expect_fixture_failure newline-preflight "$NEWLINE_PATH_LABEL" "$malformed_id" "$next_id" || return 1

  reset_fixture
  output="$(bash "$PRODUCTION_GATE" --self-scan 2>&1)"
  live_rc=$?
  TEST_COUNT=$((TEST_COUNT + 1))
  if [ "$live_rc" -ne 0 ]; then
    fail_test production-self-scan-status
    return 1
  fi
  assert_contains "$output" 'register_numeric=94 register_sentinel=1' production-self-scan-register || return 1
  assert_contains "$output" 'threat-register-gate.sh: PASS' production-self-scan-pass || return 1

  return 0
}

FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/drift-threat-register-independent.XXXXXX")" || {
  fail_test temp-root
  exit 1
}
trap cleanup_fixture EXIT

if ! run_independent_matrix; then
  exit 1
fi

cleanup_fixture
FIXTURE_ROOT=''
trap - EXIT
printf 'threat-register-gate.test.sh: PASS cases=%d\n' "$TEST_COUNT"
