#!/usr/bin/env bash
# =============================================================================
# verdict-gate.sh — Phase 8 A1/A6 verdict and historical-record gate
#
# Plan 08-18 re-pointed A1 on 2026-08-31 after the repaired three-valued probe
# produced a favourable measurement. The invalid 2026-08-27 reading remains
# RETRACTED as of 2026-08-28; the new reading does not rehabilitate the old one.
#
# ARM A discovers every explicit A1 correction under .planning/ and packages/
# with the existing historical-record exclusions. Every discovered record is
# parsed with the same exact grammar used by --self-test, and zero discovery is
# an error. ARM B validates the exact eight-carrier census, the two live
# pointers, the immutable Spike, and the unchanged A6 contract. ARM C pins the
# dated SUMMARY class by HEAD blob and rejects working-tree rewrites or an
# unexpected name.
#
# Diagnostics intentionally contain paths and record labels only. They never
# echo a matched line, environment value, token, or token-bearing runtime path.
# Exit 0 = all three arms pass.
# =============================================================================
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT" || { echo 'FAIL [SETUP] repository root unavailable'; exit 3; }

CURRENT_MEASUREMENT_DATE='2026-08-31'
LEGACY_READING_DATE='2026-08-27'
RETRACTION_DATE='2026-08-28'
CURRENT_RESULT_TOKEN='CONFIRMED'
CURRENT_INSTRUMENT_TOKEN='repaired'
CURRENT_OUTCOME_TOKEN='favourable'
RETRACTION_TOKEN='RETRACTED'

MARKDOWN_BEGIN='<!-- DRIFT:A1-CORRECTION:BEGIN -->'
MARKDOWN_END='<!-- DRIFT:A1-CORRECTION:END -->'
SOURCE_BEGIN='// DRIFT:A1-CORRECTION:BEGIN'
SOURCE_END='// DRIFT:A1-CORRECTION:END'
TRACEABILITY_BEGIN='<!-- DRIFT:LIF-02-TRACEABILITY:BEGIN -->'
TRACEABILITY_END='<!-- DRIFT:LIF-02-TRACEABILITY:END -->'
TRACEABILITY_CURRENT_LINE='**CURRENT LIF-02 traceability correction (2026-08-31, Plan 08-23):** Plan 08-18 CLOSED deferred item 10 by propagating the repaired A1 result to exactly eight mutable A1 carriers and two live pointers. LIF-01 and LIF-02 remain unchecked. LIF-02 remains open because the argv-marker reap lacks an executed shipping-runtime assertion, no Control exists for a non-Claude provider, and the redundancy question is unresolved.'
WINDOWS_BEGIN='<!-- DRIFT:WINDOWS-TWO-CASE:BEGIN -->'
WINDOWS_END='<!-- DRIFT:WINDOWS-TWO-CASE:END -->'
WINDOWS_CURRENT_DESCRIPTION="Exactly two native win32 kill-tree cases form the 2/2 contract; both remain unexecuted because no windows-latest/native run exists. CI pins expectedTotal=2 and the behavioral full name win32 process-tree termination (LIF-01) the plan's argv brings down a real process tree. Commit e1ac837 removed the former already-exited/dead-pid exit-code and stderr measurement because a recycled pid could target an unrelated process. No reserved block exists. The missing exit-code/stderr datum is deferred and accepted until a safe owned-live-process measurement is designed; LIF-01 remains open."
WINDOWS_CURRENT_LINE="**CURRENT Windows two-case correction (2026-08-31, Plan 08-23):** $WINDOWS_CURRENT_DESCRIPTION"

SPIKE_PATH='.planning/phases/08-process-lifecycle/08-SPIKE.md'
SPIKE_SHA256='7c482d7fd539f84c8e44fcfe9036b454a868767b719bd8a91d35ac70d8a9745f'
SPIKE_A1_LINE='  A1: "CONFIRMED 2026-08-31 (causal half, patched probe); topology half measured as a control pair; the 2026-08-27 reading stays RETRACTED"'

FAILED=0
fail() { echo "FAIL [$1] $2"; FAILED=1; }

# Existing exclusions only. Plans, summaries, verification reports, and the
# dated review record may quote obsolete claims as their subject. ARM C closes
# the SUMMARY exclusion in the other direction; the immutable Spike is checked
# explicitly by ARM B rather than excluded here.
is_excluded() {
  case "$1" in
    *-SUMMARY.md)      return 0 ;;
    *-PLAN.md)         return 0 ;;
    *08-REVIEW-FIX.md) return 0 ;;
    *-VERIFICATION.md) return 0 ;;
    */verdict-gate.sh) return 0 ;;
  esac
  return 1
}

# Exact marker parser shared by default mode and --self-test.
VALIDATION_REASON=''
validate_marker_record() {
  local file=$1 style=$2 begin end begin_count end_count begin_line end_line body flattened
  VALIDATION_REASON=''
  if [ ! -f "$file" ]; then VALIDATION_REASON='record file missing'; return 1; fi
  case "$style" in
    markdown) begin=$MARKDOWN_BEGIN; end=$MARKDOWN_END ;;
    source) begin=$SOURCE_BEGIN; end=$SOURCE_END ;;
    *) VALIDATION_REASON='unknown record style'; return 1 ;;
  esac
  begin_count=$(grep -Fxc "$begin" "$file" 2>/dev/null || true)
  end_count=$(grep -Fxc "$end" "$file" 2>/dev/null || true)
  if [ "$begin_count" != '1' ] || [ "$end_count" != '1' ]; then
    VALIDATION_REASON='expected exactly one marker pair'; return 1
  fi
  begin_line=$(grep -nFx "$begin" "$file" | cut -d: -f1)
  end_line=$(grep -nFx "$end" "$file" | cut -d: -f1)
  if [ "$begin_line" -ge "$end_line" ]; then VALIDATION_REASON='marker order is reversed'; return 1; fi
  if [ $((end_line - begin_line)) -le 1 ]; then VALIDATION_REASON='correction body is empty'; return 1; fi
  body=$(sed -n "$((begin_line + 1)),$((end_line - 1))p" "$file")
  if printf '%s\n' "$body" | grep -Fq 'DRIFT:A1-CORRECTION:'; then
    VALIDATION_REASON='nested or malformed marker in body'; return 1
  fi
  if [ "$style" = 'markdown' ]; then
    if printf '%s\n' "$body" | grep -Eq '^[[:space:]]*$'; then
      VALIDATION_REASON='Markdown body spans more than one paragraph'; return 1
    fi
    flattened=$(printf '%s\n' "$body" | tr '\n' ' ')
  else
    if printf '%s\n' "$body" | grep -Evq '^[[:space:]]*//'; then
      VALIDATION_REASON='source body contains a non-comment line'; return 1
    fi
    if printf '%s\n' "$body" | grep -Eq '^[[:space:]]*//[[:space:]]*$'; then
      VALIDATION_REASON='source body spans more than one comment paragraph'; return 1
    fi
    flattened=$(printf '%s\n' "$body" | sed -E 's/^[[:space:]]*\/\/[[:space:]]?//' | tr '\n' ' ')
  fi
  if ! printf '%s\n' "$flattened" | grep -Eq "${CURRENT_INSTRUMENT_TOKEN}.*${CURRENT_RESULT_TOKEN}.*${CURRENT_OUTCOME_TOKEN}.*${CURRENT_MEASUREMENT_DATE}"; then
    VALIDATION_REASON='current repaired-probe epoch/result clause missing'; return 1
  fi
  if ! printf '%s\n' "$flattened" | grep -Eq "${LEGACY_READING_DATE}.*${RETRACTION_TOKEN}.*${RETRACTION_DATE}"; then
    VALIDATION_REASON='legacy reading/retraction epoch clause missing'; return 1
  fi
  if printf '%s\n' "$flattened" | grep -Eiq 'A1.{0,24}(is |remains |stays )?(OPEN|unmeasured|not measured)|OPEN.{0,24}A1'; then
    VALIDATION_REASON='marked current record carries the stale OPEN verdict'; return 1
  fi
  return 0
}

# Immutable canonical Spike parser. Content checks precede the digest check so
# a scalar mutation is diagnosed as content rather than merely as changed bytes.
SPIKE_REASON=''
validate_spike_record() {
  local file=$1 expected_digest=$2 frontmatter measured_line measured_count scalar_count actual_digest
  SPIKE_REASON=''
  if [ ! -f "$file" ]; then SPIKE_REASON='canonical Spike missing'; return 1; fi
  scalar_count=$(grep -Fxc "$SPIKE_A1_LINE" "$file" 2>/dev/null || true)
  if [ "$scalar_count" != '1' ]; then SPIKE_REASON='canonical assumptions.A1 scalar changed or duplicated'; return 1; fi
  if grep -Fq 'DRIFT:A1-CORRECTION:' "$file"; then SPIKE_REASON='immutable Spike must not contain mutable-carrier markers'; return 1; fi
  frontmatter=$(awk '
    NR == 1 && $0 == "---" { inside = 1; next }
    inside && $0 == "---" { exit }
    inside { print }
  ' "$file")
  measured_count=$(printf '%s\n' "$frontmatter" | grep -c '^measured:' || true)
  if [ "$measured_count" != '1' ]; then SPIKE_REASON='frontmatter measured scalar missing or duplicated'; return 1; fi
  measured_line=$(printf '%s\n' "$frontmatter" | grep '^measured:')
  if ! printf '%s\n' "$measured_line" | grep -Fq "$LEGACY_READING_DATE" ||
     ! printf '%s\n' "$measured_line" | grep -Fq "$RETRACTION_DATE" ||
     ! printf '%s\n' "$measured_line" | grep -Fq "$RETRACTION_TOKEN"; then
    SPIKE_REASON='frontmatter measured scalar lost the legacy retraction epoch'; return 1
  fi
  actual_digest=$(shasum -a 256 "$file" | awk '{print $1}')
  if [ "$actual_digest" != "$expected_digest" ]; then SPIKE_REASON='canonical Spike digest mismatch'; return 1; fi
  return 0
}

# Fail-closed discovery. Newline-bearing paths are rejected before the portable
# newline-delimited loop; any correction token found is parsed, not just counted.
DISCOVERY_REASON=''
DISCOVERY_PATH='record-set'
DISCOVERY_COUNT=0
audit_discovered_records() {
  local roots=("$@") n_nul n_line root file style
  DISCOVERY_REASON=''; DISCOVERY_PATH='record-set'; DISCOVERY_COUNT=0
  if [ "${#roots[@]}" -eq 0 ]; then DISCOVERY_REASON='no discovery roots supplied'; return 1; fi
  for root in "${roots[@]}"; do
    if [ ! -e "$root" ]; then DISCOVERY_PATH=$root; DISCOVERY_REASON='discovery root missing'; return 1; fi
  done
  n_nul=$(find "${roots[@]}" \
    \( -name node_modules -o -name dist -o -name .git \) -prune -o \
    -type f -print0 2>/dev/null | tr -cd '\0' | wc -c | tr -d ' ')
  n_line=$(find "${roots[@]}" \
    \( -name node_modules -o -name dist -o -name .git \) -prune -o \
    -type f -print 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n_nul" != "$n_line" ]; then DISCOVERY_REASON='newline-bearing path cannot be enumerated safely'; return 1; fi
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if is_excluded "$file"; then continue; fi
    DISCOVERY_COUNT=$((DISCOVERY_COUNT + 1))
    case "$file" in *.ts|*.js|*.mjs) style=source ;; *) style=markdown ;; esac
    if ! validate_marker_record "$file" "$style"; then
      DISCOVERY_PATH=$file; DISCOVERY_REASON=$VALIDATION_REASON; return 1
    fi
  done < <(
    find "${roots[@]}" \
      \( -name node_modules -o -name dist -o -name .git \) -prune -o \
      -type f -exec grep -lIF 'DRIFT:A1-CORRECTION:' {} + 2>/dev/null | sort -u
  )
  if [ "$DISCOVERY_COUNT" = '0' ]; then DISCOVERY_REASON='zero current-verdict records discovered'; return 1; fi
  return 0
}

# The correction-marker census cannot prove that REQUIREMENTS' separate
# traceability roll-up carries the post-08-18 meaning. Keep that meaning in one
# bounded, exact record: stale prose outside it may survive only as explicitly
# superseded history. Diagnostics report the record class, never its content.
TRACEABILITY_REASON=''
validate_lif02_traceability() {
  local file=$1 begin_count end_count begin_line end_line body flattened
  TRACEABILITY_REASON=''
  if [ ! -f "$file" ]; then TRACEABILITY_REASON='traceability file missing'; return 1; fi
  begin_count=$(grep -Fxc "$TRACEABILITY_BEGIN" "$file" 2>/dev/null || true)
  end_count=$(grep -Fxc "$TRACEABILITY_END" "$file" 2>/dev/null || true)
  if [ "$begin_count" != '1' ] || [ "$end_count" != '1' ]; then
    TRACEABILITY_REASON='expected exactly one bounded traceability record'; return 1
  fi
  begin_line=$(grep -nFx "$TRACEABILITY_BEGIN" "$file" | cut -d: -f1)
  end_line=$(grep -nFx "$TRACEABILITY_END" "$file" | cut -d: -f1)
  if [ "$begin_line" -ge "$end_line" ]; then TRACEABILITY_REASON='traceability marker order is reversed'; return 1; fi
  if [ $((end_line - begin_line)) -le 1 ]; then TRACEABILITY_REASON='traceability record is empty'; return 1; fi
  body=$(sed -n "$((begin_line + 1)),$((end_line - 1))p" "$file")
  if printf '%s\n' "$body" | grep -Fq 'DRIFT:LIF-02-TRACEABILITY:'; then
    TRACEABILITY_REASON='nested traceability marker'; return 1
  fi
  if printf '%s\n' "$body" | grep -Eq '^[[:space:]]*$'; then
    TRACEABILITY_REASON='traceability record is separated'; return 1
  fi
  flattened=$(printf '%s\n' "$body" | tr '\n' ' ' | sed -E 's/[[:space:]]+$//')
  if [ "$flattened" != "$TRACEABILITY_CURRENT_LINE" ]; then
    TRACEABILITY_REASON='current Plan 08-18/eight-carrier/two-pointer/open contract missing or contradictory'; return 1
  fi
  return 0
}

# Five living files carry the Windows contract, while WINDOWS.md carries it in
# both a table and JSON register. The marker parser establishes which prose is
# current; the ledger parser additionally requires its two machine-readable
# representations to be byte-identical in meaning and still open.
WINDOWS_REASON=''
WINDOWS_PATH='windows-contract'
validate_windows_carrier_record() {
  local file=$1 begin_count end_count begin_line end_line body flattened
  WINDOWS_REASON=''; WINDOWS_PATH=$file
  if [ ! -f "$file" ]; then WINDOWS_REASON='Windows carrier missing'; return 1; fi
  begin_count=$(grep -Fxc "$WINDOWS_BEGIN" "$file" 2>/dev/null || true)
  end_count=$(grep -Fxc "$WINDOWS_END" "$file" 2>/dev/null || true)
  if [ "$begin_count" != '1' ] || [ "$end_count" != '1' ]; then
    WINDOWS_REASON='expected exactly one bounded current Windows record'; return 1
  fi
  begin_line=$(grep -nFx "$WINDOWS_BEGIN" "$file" | cut -d: -f1)
  end_line=$(grep -nFx "$WINDOWS_END" "$file" | cut -d: -f1)
  if [ "$begin_line" -ge "$end_line" ]; then WINDOWS_REASON='Windows marker order is reversed'; return 1; fi
  if [ $((end_line - begin_line)) -le 1 ]; then WINDOWS_REASON='Windows record is empty'; return 1; fi
  body=$(sed -n "$((begin_line + 1)),$((end_line - 1))p" "$file")
  if printf '%s\n' "$body" | grep -Eq '^[[:space:]]*$'; then WINDOWS_REASON='Windows record is separated'; return 1; fi
  flattened=$(printf '%s\n' "$body" | tr '\n' ' ' | sed -E 's/[[:space:]]+$//')
  if [ "$flattened" != "$WINDOWS_CURRENT_LINE" ]; then
    WINDOWS_REASON='safe 2/2/e1ac837/recycled-pid/open contract missing or contradictory'; return 1
  fi
  return 0
}

validate_windows_ledger() {
  local file=$1 table_record json_record expected_record
  WINDOWS_REASON=''; WINDOWS_PATH=$file
  table_record=$(awk -F '|' '
    function trim(value) { gsub(/^[[:space:]]+|[[:space:]]+$/, "", value); return value }
    trim($2) == "12" { count += 1; description = trim($7); status = trim($8) }
    END { if (count != 1) exit 1; print description; print status }
  ' "$file" 2>/dev/null) || { WINDOWS_REASON='entry 12 table row missing or duplicated'; return 1; }
  json_record=$(awk '
    $0 == "````json" { inside = 1; next }
    inside && $0 == "````" { exit }
    inside { print }
  ' "$file" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      try {
        const rows = JSON.parse(input);
        const matches = Array.isArray(rows) ? rows.filter((row) => row?.id === 12) : [];
        if (matches.length !== 1 || typeof matches[0].description !== "string" || typeof matches[0].status !== "string") process.exit(1);
        process.stdout.write(`${matches[0].description}\n${matches[0].status}`);
      } catch { process.exit(1); }
    });
  ' 2>/dev/null) || { WINDOWS_REASON='entry 12 JSON object missing, duplicated, or malformed'; return 1; }
  expected_record=$(printf '%s\n%s' "$WINDOWS_CURRENT_DESCRIPTION" 'open')
  if [ "$table_record" != "$json_record" ]; then WINDOWS_REASON='entry 12 table and JSON meanings diverge'; return 1; fi
  if [ "$table_record" != "$expected_record" ]; then WINDOWS_REASON='entry 12 safe two-case meaning or open status is stale'; return 1; fi
  return 0
}

validate_windows_two_case_contract() {
  local windows=$1 file
  shift
  if [ "$#" != '4' ]; then WINDOWS_PATH='windows-contract'; WINDOWS_REASON='expected exactly five living carriers'; return 1; fi
  if ! validate_windows_ledger "$windows"; then return 1; fi
  if ! validate_windows_carrier_record "$windows"; then return 1; fi
  for file in "$@"; do
    if ! validate_windows_carrier_record "$file"; then return 1; fi
  done
  return 0
}

# ROADMAP/REQUIREMENTS are pointers outside CARRIERS_A1. Open checkboxes prevent
# this evidence-only plan from closing Phase 8 or either lifecycle requirement.
POINTER_REASON=''
POINTER_PATH='pointer-set'
validate_pointer_records() {
  local roadmap=$1 requirements=$2 pointer_failures=0
  POINTER_REASON=''; POINTER_PATH="$roadmap, $requirements"
  if ! validate_marker_record "$roadmap" markdown; then pointer_failures=$((pointer_failures + 1)); fi
  if [ "$(grep -F -c -- '- [ ] **Phase 8: Process Lifecycle**' "$roadmap" 2>/dev/null || true)" != '1' ]; then
    pointer_failures=$((pointer_failures + 1))
  fi
  if ! validate_marker_record "$requirements" markdown; then pointer_failures=$((pointer_failures + 1)); fi
  if [ "$(grep -F -c -- '- [ ] **LIF-01**' "$requirements" 2>/dev/null || true)" != '1' ]; then
    pointer_failures=$((pointer_failures + 1))
  fi
  if [ "$(grep -F -c -- '- [ ] **LIF-02**' "$requirements" 2>/dev/null || true)" != '1' ]; then
    pointer_failures=$((pointer_failures + 1))
  fi
  if ! validate_lif02_traceability "$requirements"; then
    pointer_failures=$((pointer_failures + 1))
  fi
  if [ "$pointer_failures" != '0' ]; then POINTER_REASON='one or more marker/open-state checks failed'; return 1; fi
  return 0
}

# ARM C implementation shared by default mode and temporary Git fixtures.
# Pins are "name blob" lines. Expected outputs may be absent or present because
# their executor writes them only after this gate revision.
SUMMARY_REASON=''
SUMMARY_PATH='summary-class'
SUMMARY_PINNED_COUNT=0
SUMMARY_ON_DISK_COUNT=0
validate_summary_integrity() {
  local repo=$1 summary_dir=$2 pins=$3 expected_outputs=$4 name pin actual path base pin_match expected_match
  SUMMARY_REASON=''; SUMMARY_PATH='summary-class'; SUMMARY_PINNED_COUNT=0; SUMMARY_ON_DISK_COUNT=0
  if [ ! -d "$repo/$summary_dir" ]; then SUMMARY_REASON='summary directory missing'; return 1; fi
  if ! git -C "$repo" rev-parse --verify HEAD >/dev/null 2>&1; then SUMMARY_REASON='Git HEAD unavailable'; return 1; fi
  while read -r name pin; do
    [ -n "$name" ] || continue
    SUMMARY_PINNED_COUNT=$((SUMMARY_PINNED_COUNT + 1)); SUMMARY_PATH=$name
    if [ -z "$pin" ]; then SUMMARY_REASON='pin entry has no blob id'; return 1; fi
    actual=$(git -C "$repo" rev-parse "HEAD:$summary_dir/$name" 2>/dev/null || true)
    if [ "$actual" != "$pin" ]; then SUMMARY_REASON='pinned HEAD blob mismatch'; return 1; fi
  done <<EOF
$pins
EOF
  if [ "$SUMMARY_PINNED_COUNT" = '0' ]; then SUMMARY_REASON='zero pinned summaries'; return 1; fi
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    base=$(basename "$path"); SUMMARY_ON_DISK_COUNT=$((SUMMARY_ON_DISK_COUNT + 1))
    pin_match=$(printf '%s\n' "$pins" | awk -v wanted="$base" '$1 == wanted { count++ } END { print count + 0 }')
    expected_match=$(printf '%s\n' "$expected_outputs" | awk -v wanted="$base" '$1 == wanted { count++ } END { print count + 0 }')
    if [ "$pin_match" -gt 1 ] || [ "$expected_match" -gt 1 ]; then
      SUMMARY_PATH=$base; SUMMARY_REASON='duplicate pin or expected-output entry'; return 1
    fi
    if [ "$pin_match" = '0' ] && [ "$expected_match" = '0' ]; then
      SUMMARY_PATH=$base; SUMMARY_REASON='unexpected unpinned SUMMARY discovered'; return 1
    fi
  done < <(find "$repo/$summary_dir" -maxdepth 1 -name '*-SUMMARY.md' -type f 2>/dev/null | sort)
  if [ "$SUMMARY_ON_DISK_COUNT" = '0' ]; then SUMMARY_REASON='zero summaries discovered'; return 1; fi
  if ! git -C "$repo" diff --quiet HEAD -- "$summary_dir/*-SUMMARY.md" 2>/dev/null; then
    SUMMARY_REASON='dated SUMMARY modified in working tree'; return 1
  fi
  return 0
}

# Executable self-test. Every case calls the same production functions as the
# default audit. Fixture contents are never printed.
self_ok() { echo "   self-test: pass [$1]"; }
self_bad() { echo "FAIL [SELF-TEST/$1] $2"; SELF_TEST_FAILED=1; }
self_expect_pass() { local label=$1; shift; if "$@"; then self_ok "$label"; else self_bad "$label" 'expected pass'; fi; }
self_expect_fail() { local label=$1; shift; if "$@"; then self_bad "$label" 'expected red input to fail'; else self_ok "$label"; fi; }

write_self_markdown_record() {
  local path=$1
  {
    printf '%s\n' "$MARKDOWN_BEGIN"
    printf '%s\n' '**A1 correction:** The repaired three-valued probe CONFIRMED the favourable A1 outcome on 2026-08-31. The invalid 2026-08-27 reading remains RETRACTED as of 2026-08-28 and is preserved only as history.'
    printf '%s\n' "$MARKDOWN_END"
  } >"$path"
}
write_self_source_record() {
  local path=$1
  {
    printf '%s\n' "$SOURCE_BEGIN"
    printf '%s\n' '// A1 correction: The repaired three-valued probe CONFIRMED the favourable A1 outcome on 2026-08-31. The invalid 2026-08-27 reading remains RETRACTED as of 2026-08-28 and is preserved only as history.'
    printf '%s\n' "$SOURCE_END"
  } >"$path"
}
write_self_spike() {
  local path=$1
  {
    printf '%s\n' '---'
    printf '%s\n' 'measured: "2026-08-27 reading RETRACTED 2026-08-28; repaired probe run 2026-08-31"'
    printf '%s\n' 'assumptions:'
    printf '%s\n' "$SPIKE_A1_LINE"
    printf '%s\n' '---'
  } >"$path"
}
write_self_traceability_record() {
  local path=$1 line=${2:-$TRACEABILITY_CURRENT_LINE}
  {
    printf '%s\n' "$TRACEABILITY_BEGIN"
    printf '%s\n' "$line"
    printf '%s\n' "$TRACEABILITY_END"
  } >>"$path"
}
write_self_windows_record() {
  local path=$1 line=${2:-$WINDOWS_CURRENT_LINE}
  {
    printf '%s\n' "$WINDOWS_BEGIN"
    printf '%s\n' "$line"
    printf '%s\n' "$WINDOWS_END"
  } >>"$path"
}
write_self_windows_ledger() {
  local path=$1 table_description json_description status
  table_description=${2:-$WINDOWS_CURRENT_DESCRIPTION}
  json_description=${3:-$table_description}
  status=${4:-open}
  {
    printf '%s\n' '| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |'
    printf '%s\n' '|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|'
    printf '| 12 | 08 | unrun-verify | fixture.ts |  | %s | %s |  | date |  |\n' "$table_description" "$status"
    printf '%s\n' '````json'
    printf '[{"id":12,"description":"%s","status":"%s"}]\n' "$json_description" "$status"
    printf '%s\n' '````'
  } >"$path"
  write_self_windows_record "$path"
}
init_self_git_fixture() {
  local repo=$1 content=$2
  mkdir -p "$repo/summaries"
  git -C "$repo" init -q
  git -C "$repo" config user.name 'verdict-gate self-test'
  git -C "$repo" config user.email 'verdict-gate-self-test@invalid.example'
  printf '%s\n' "$content" >"$repo/summaries/08-11-SUMMARY.md"
  git -C "$repo" add summaries/08-11-SUMMARY.md
  git -C "$repo" commit -qm 'fixture: pin summary'
}

run_self_test() {
  local tmp valid_digest pin current_pin
  SELF_TEST_FAILED=0
  echo '== SELF-TEST: exact A1 records and historical pins =='
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/drift-verdict-gate.XXXXXX") || return 1

  write_self_markdown_record "$tmp/valid.md"
  self_expect_pass 'valid-markdown-record' validate_marker_record "$tmp/valid.md" markdown
  cp "$tmp/valid.md" "$tmp/duplicate.md"
  printf '%s\n' "$MARKDOWN_BEGIN" '**duplicate**' "$MARKDOWN_END" >>"$tmp/duplicate.md"
  self_expect_fail 'duplicate-marker-pair' validate_marker_record "$tmp/duplicate.md" markdown
  printf '%s\n' "$MARKDOWN_BEGIN" 'current only' >"$tmp/unpaired.md"
  self_expect_fail 'unpaired-marker' validate_marker_record "$tmp/unpaired.md" markdown
  printf '%s\n' "$MARKDOWN_END" 'reversed' "$MARKDOWN_BEGIN" >"$tmp/reversed.md"
  self_expect_fail 'reversed-markers' validate_marker_record "$tmp/reversed.md" markdown
  printf '%s\n' "$MARKDOWN_BEGIN" "$MARKDOWN_BEGIN" 'nested' "$MARKDOWN_END" "$MARKDOWN_END" >"$tmp/nested.md"
  self_expect_fail 'nested-markers' validate_marker_record "$tmp/nested.md" markdown
  {
    printf '%s\n' "$MARKDOWN_BEGIN"
    printf '%s\n' 'The repaired probe CONFIRMED the favourable A1 outcome on 2026-08-31.'
    printf '\n'
    printf '%s\n' 'The invalid 2026-08-27 reading remains RETRACTED as of 2026-08-28.'
    printf '%s\n' "$MARKDOWN_END"
  } >"$tmp/two-paragraphs.md"
  self_expect_fail 'markdown-paragraph-separation' validate_marker_record "$tmp/two-paragraphs.md" markdown

  write_self_source_record "$tmp/valid.ts"
  self_expect_pass 'valid-source-record' validate_marker_record "$tmp/valid.ts" source
  {
    printf '%s\n' "$SOURCE_BEGIN"
    printf '%s\n' '// The repaired probe CONFIRMED the favourable A1 outcome on 2026-08-31.'
    printf '%s\n' '//'
    printf '%s\n' '// The invalid 2026-08-27 reading remains RETRACTED as of 2026-08-28.'
    printf '%s\n' "$SOURCE_END"
  } >"$tmp/two-paragraphs.ts"
  self_expect_fail 'source-paragraph-separation' validate_marker_record "$tmp/two-paragraphs.ts" source
  {
    printf '%s\n' "$SOURCE_BEGIN"
    printf '%s\n' '// The repaired probe CONFIRMED the favourable A1 outcome on 2026-08-31.'
    printf '%s\n' 'const unrelated = true;'
    printf '%s\n' '// The invalid 2026-08-27 reading remains RETRACTED as of 2026-08-28.'
    printf '%s\n' "$SOURCE_END"
  } >"$tmp/non-comment.ts"
  self_expect_fail 'source-non-comment-line' validate_marker_record "$tmp/non-comment.ts" source

  cp "$tmp/valid.md" "$tmp/missing-current.md"
  sed -i.bak "s/$CURRENT_MEASUREMENT_DATE/2026-08-30/" "$tmp/missing-current.md"; rm -f "$tmp/missing-current.md.bak"
  self_expect_fail 'missing-current-epoch' validate_marker_record "$tmp/missing-current.md" markdown
  {
    printf '%s\n' 'Outside record: repaired probe CONFIRMED favourable A1 on 2026-08-31.'
    printf '%s\n' "$MARKDOWN_BEGIN"
    printf '%s\n' 'The invalid 2026-08-27 reading remains RETRACTED as of 2026-08-28.'
    printf '%s\n' "$MARKDOWN_END"
  } >"$tmp/epoch-outside.md"
  self_expect_fail 'epoch-outside-marker' validate_marker_record "$tmp/epoch-outside.md" markdown
  cp "$tmp/valid.md" "$tmp/missing-retraction.md"
  sed -i.bak "s/$RETRACTION_TOKEN/withdrawn/" "$tmp/missing-retraction.md"; rm -f "$tmp/missing-retraction.md.bak"
  self_expect_fail 'raw-reading-without-marked-retraction' validate_marker_record "$tmp/missing-retraction.md" markdown
  cp "$tmp/valid.md" "$tmp/stale-open.md"
  sed -i.bak 's/CONFIRMED the favourable A1 outcome/A1 is OPEN/' "$tmp/stale-open.md"; rm -f "$tmp/stale-open.md.bak"
  self_expect_fail 'stale-open-claim' validate_marker_record "$tmp/stale-open.md" markdown

  mkdir -p "$tmp/discovery-empty" "$tmp/discovery-live"
  cp "$tmp/valid.md" "$tmp/discovery-live/record.md"
  self_expect_fail 'empty-discovery' audit_discovered_records "$tmp/discovery-empty"
  self_expect_pass 'live-discovery' audit_discovered_records "$tmp/discovery-live"

  write_self_spike "$tmp/spike-valid.md"
  valid_digest=$(shasum -a 256 "$tmp/spike-valid.md" | awk '{print $1}')
  self_expect_pass 'canonical-spike-record' validate_spike_record "$tmp/spike-valid.md" "$valid_digest"
  cp "$tmp/spike-valid.md" "$tmp/spike-changed.md"
  sed -i.bak 's/CONFIRMED 2026-08-31/OPEN/' "$tmp/spike-changed.md"; rm -f "$tmp/spike-changed.md.bak"
  self_expect_fail 'changed-spike-scalar' validate_spike_record "$tmp/spike-changed.md" "$valid_digest"
  cp "$tmp/spike-valid.md" "$tmp/spike-duplicate.md"
  sed -n '4p' "$tmp/spike-valid.md" >>"$tmp/spike-duplicate.md"
  self_expect_fail 'duplicate-spike-scalar' validate_spike_record "$tmp/spike-duplicate.md" "$(shasum -a 256 "$tmp/spike-duplicate.md" | awk '{print $1}')"
  cp "$tmp/spike-valid.md" "$tmp/spike-measured.md"
  sed -i.bak 's/2026-08-28/2026-08-29/' "$tmp/spike-measured.md"; rm -f "$tmp/spike-measured.md.bak"
  self_expect_fail 'spike-measured-retraction-date' validate_spike_record "$tmp/spike-measured.md" "$(shasum -a 256 "$tmp/spike-measured.md" | awk '{print $1}')"

  mkdir -p "$tmp/pointers"
  write_self_markdown_record "$tmp/pointers/ROADMAP.md"
  printf '%s\n' '- [ ] **Phase 8: Process Lifecycle**' >>"$tmp/pointers/ROADMAP.md"
  write_self_markdown_record "$tmp/pointers/REQUIREMENTS.md"
  write_self_traceability_record "$tmp/pointers/REQUIREMENTS.md"
  printf '%s\n' '- [ ] **LIF-01**: open' '- [ ] **LIF-02**: open' >>"$tmp/pointers/REQUIREMENTS.md"
  self_expect_pass 'open-live-pointers' validate_pointer_records "$tmp/pointers/ROADMAP.md" "$tmp/pointers/REQUIREMENTS.md"
  : >"$tmp/pointers/stale-traceability.md"
  write_self_traceability_record "$tmp/pointers/stale-traceability.md" 'Plan 08-18 is pending; deferred item 10 must land before 08-SPIKE.md stops being the single carrier.'
  self_expect_fail 'stale-lif02-traceability' validate_lif02_traceability "$tmp/pointers/stale-traceability.md"
  cp "$tmp/pointers/REQUIREMENTS.md" "$tmp/pointers/empty-traceability.md"
  sed -i.bak "/CURRENT LIF-02 traceability correction/d" "$tmp/pointers/empty-traceability.md"; rm -f "$tmp/pointers/empty-traceability.md.bak"
  self_expect_fail 'empty-lif02-traceability' validate_lif02_traceability "$tmp/pointers/empty-traceability.md"
  cp "$tmp/pointers/REQUIREMENTS.md" "$tmp/pointers/duplicate-traceability.md"
  write_self_traceability_record "$tmp/pointers/duplicate-traceability.md"
  self_expect_fail 'duplicate-lif02-traceability' validate_lif02_traceability "$tmp/pointers/duplicate-traceability.md"
  cp "$tmp/pointers/REQUIREMENTS.md" "$tmp/pointers/separated-traceability.md"
  sed -i.bak "/CURRENT LIF-02 traceability correction/i\\
" "$tmp/pointers/separated-traceability.md"; rm -f "$tmp/pointers/separated-traceability.md.bak"
  self_expect_fail 'separated-lif02-traceability' validate_lif02_traceability "$tmp/pointers/separated-traceability.md"
  : >"$tmp/pointers/contradictory-traceability.md"
  write_self_traceability_record "$tmp/pointers/contradictory-traceability.md" "$TRACEABILITY_CURRENT_LINE 08-SPIKE.md is the single carrier."
  self_expect_fail 'contradictory-lif02-traceability' validate_lif02_traceability "$tmp/pointers/contradictory-traceability.md"
  sed -i.bak 's/- \[ \] \*\*LIF-02\*\*/- [x] **LIF-02**/' "$tmp/pointers/REQUIREMENTS.md"; rm -f "$tmp/pointers/REQUIREMENTS.md.bak"
  self_expect_fail 'closed-lif-checkbox' validate_pointer_records "$tmp/pointers/ROADMAP.md" "$tmp/pointers/REQUIREMENTS.md"

  mkdir -p "$tmp/windows"
  write_self_windows_ledger "$tmp/windows/WINDOWS.md"
  for file in REQUIREMENTS.md 08-VALIDATION.md 08-UAT.md STATE.md; do
    : >"$tmp/windows/$file"
    write_self_windows_record "$tmp/windows/$file"
  done
  self_expect_pass 'current-windows-two-case-contract' validate_windows_two_case_contract "$tmp/windows/WINDOWS.md" "$tmp/windows/REQUIREMENTS.md" "$tmp/windows/08-VALIDATION.md" "$tmp/windows/08-UAT.md" "$tmp/windows/STATE.md"
  write_self_windows_ledger "$tmp/windows/stale-three.md" 'Three native cases form the 3/3 contract and remain pending.'
  self_expect_fail 'stale-windows-three-of-three' validate_windows_two_case_contract "$tmp/windows/stale-three.md" "$tmp/windows/REQUIREMENTS.md" "$tmp/windows/08-VALIDATION.md" "$tmp/windows/08-UAT.md" "$tmp/windows/STATE.md"
  write_self_windows_ledger "$tmp/windows/promised-reserved.md" 'The reserved dead-pid block must record an exit code and stderr.'
  self_expect_fail 'promised-windows-reserved-block' validate_windows_two_case_contract "$tmp/windows/promised-reserved.md" "$tmp/windows/REQUIREMENTS.md" "$tmp/windows/08-VALIDATION.md" "$tmp/windows/08-UAT.md" "$tmp/windows/STATE.md"
  write_self_windows_ledger "$tmp/windows/divergent.md" "$WINDOWS_CURRENT_DESCRIPTION" 'The JSON representation is stale.'
  self_expect_fail 'windows-table-json-divergence' validate_windows_two_case_contract "$tmp/windows/divergent.md" "$tmp/windows/REQUIREMENTS.md" "$tmp/windows/08-VALIDATION.md" "$tmp/windows/08-UAT.md" "$tmp/windows/STATE.md"
  write_self_windows_ledger "$tmp/windows/closed.md" "$WINDOWS_CURRENT_DESCRIPTION" "$WINDOWS_CURRENT_DESCRIPTION" 'fixed'
  self_expect_fail 'windows-entry-must-stay-open' validate_windows_two_case_contract "$tmp/windows/closed.md" "$tmp/windows/REQUIREMENTS.md" "$tmp/windows/08-VALIDATION.md" "$tmp/windows/08-UAT.md" "$tmp/windows/STATE.md"

  init_self_git_fixture "$tmp/git-committed" 'pinned'
  pin=$(git -C "$tmp/git-committed" rev-parse HEAD:summaries/08-11-SUMMARY.md)
  self_expect_pass 'summary-valid-pin' validate_summary_integrity "$tmp/git-committed" summaries "08-11-SUMMARY.md $pin" '08-18-SUMMARY.md'
  printf '%s\n' 'committed rewrite' >"$tmp/git-committed/summaries/08-11-SUMMARY.md"
  git -C "$tmp/git-committed" add summaries/08-11-SUMMARY.md
  git -C "$tmp/git-committed" commit -qm 'fixture: rewrite pinned summary'
  self_expect_fail 'summary-committed-blob-mismatch' validate_summary_integrity "$tmp/git-committed" summaries "08-11-SUMMARY.md $pin" '08-18-SUMMARY.md'
  init_self_git_fixture "$tmp/git-working" 'pinned'
  current_pin=$(git -C "$tmp/git-working" rev-parse HEAD:summaries/08-11-SUMMARY.md)
  printf '%s\n' 'uncommitted rewrite' >"$tmp/git-working/summaries/08-11-SUMMARY.md"
  self_expect_fail 'summary-uncommitted-edit' validate_summary_integrity "$tmp/git-working" summaries "08-11-SUMMARY.md $current_pin" '08-18-SUMMARY.md'
  init_self_git_fixture "$tmp/git-unexpected" 'pinned'
  current_pin=$(git -C "$tmp/git-unexpected" rev-parse HEAD:summaries/08-11-SUMMARY.md)
  printf '%s\n' 'unexpected' >"$tmp/git-unexpected/summaries/08-99-SUMMARY.md"
  self_expect_fail 'summary-unexpected-discovery' validate_summary_integrity "$tmp/git-unexpected" summaries "08-11-SUMMARY.md $current_pin" '08-18-SUMMARY.md'

  rm -R -- "$tmp"
  if [ "$SELF_TEST_FAILED" = '0' ]; then echo 'verdict-gate.sh --self-test: PASS'; return 0; fi
  echo 'verdict-gate.sh --self-test: FAIL'; return 1
}

CARRIERS_A6=(
  .planning/phases/08-process-lifecycle/08-SPIKE.md
  .planning/phases/08-process-lifecycle/08-VALIDATION.md
  .planning/phases/08-process-lifecycle/08-SECURITY.md
  .planning/phases/08-process-lifecycle/08-VERIFICATION.md
  .planning/WINDOWS.md
  .planning/STATE.md
  packages/backend/src/kill-plan.ts
  packages/backend/src/kill-tree.posix.test.ts
)
CARRIERS_A1=(
  .planning/phases/08-process-lifecycle/08-SPIKE.md
  .planning/phases/08-process-lifecycle/08-VALIDATION.md
  .planning/phases/08-process-lifecycle/08-SECURITY.md
  .planning/WINDOWS.md
  .planning/STATE.md
  packages/backend/src/index.ts
  packages/backend/src/kill-plan.ts
  packages/backend/src/kill-tree.posix.test.ts
)

SUMMARY_PINS='
08-01-SUMMARY.md 725ba461b1468a9b8017ea18e6852627766b62cf
08-02-SUMMARY.md 1c7c7026c3d408f5e900bd28a1201fb2ff359059
08-03-SUMMARY.md d8f71008292acd043a7e842bc59c95b68eeaad59
08-04-SUMMARY.md 24e4c5ddc1ff74a31adc9975d4162617accfb232
08-05-SUMMARY.md 26995e205bd8e84a93bf77eb07875e025ac4d459
08-06-SUMMARY.md f843d52f2836c58173d1958be4f6a7eeb9d4a4df
08-07-SUMMARY.md c49ddcc1f65eb2c7d545d90b56539cd876f85176
08-08-SUMMARY.md f29ce7df415c746c54b4c958e915602ee7a5edbb
08-09-SUMMARY.md 54ac7039438bb414a318f42326895c38cd133d21
08-10-SUMMARY.md b6d79bd04cc77491bf7d23603e49ac92e501d065
08-11-SUMMARY.md 7e59a0a6f3389bc99915f971113f6043dec6065e
08-12-SUMMARY.md 4593ca8062d2254f5e7e4964012708b0c73de9f0
08-13-SUMMARY.md e1be4120d7c89517aac7ed9aeb437eae3322a5f9
08-14-SUMMARY.md bd4173658bf7826b70ff9c72c405524ba8cae934
08-15-SUMMARY.md 1f42ea26f2808838c9f790fa02d06cafb272e837
08-16-SUMMARY.md d5a9740cd61418d977578ff38be0d4b6951d0cab
08-17-SUMMARY.md a0959cbec16e8d12156777f63ad799dc1476e115
08-18-SUMMARY.md 1151e0b51601f4aff82ccc663e8e24157df41eb5
08-19-SUMMARY.md 65018285c37e85ef960f2c40421107550dcae878
08-20-SUMMARY.md ba61f5818386e62eb32e1f706ac7e71f770cab50
08-21-SUMMARY.md 5a2b92c6bba9557be651147547bf432b7449c8de
08-22-SUMMARY.md 210f5f27114710565894a61c627c61296be574c7
'
SUMMARY_EXPECTED_OUTPUTS='
08-23-SUMMARY.md
'
SUMMARY_DIR='.planning/phases/08-process-lifecycle'

run_default_gate() {
  local file style arm_b_failures=0 arm_c_failures=0 current_records=0
  echo '== ARM A: fail-closed correction-record discovery =='
  if audit_discovered_records .planning packages; then
    echo "   ARM A: pass ($DISCOVERY_COUNT exact current-verdict record(s) discovered and parsed)"
  else
    fail 'ARM A/A1-DISCOVERY' "$DISCOVERY_PATH — $DISCOVERY_REASON"
  fi

  echo '== ARM B: fixed carriers, live pointers, and immutable Spike =='
  if [ "${#CARRIERS_A1[@]}" != '8' ]; then fail 'ARM B/A1-CENSUS' 'CARRIERS_A1 — expected exactly eight paths'; arm_b_failures=$((arm_b_failures + 1)); fi
  if [ "${#CARRIERS_A6[@]}" = '0' ]; then fail 'ARM B/A6-CENSUS' 'CARRIERS_A6 — zero carriers is invalid'; arm_b_failures=$((arm_b_failures + 1)); fi
  for file in "${CARRIERS_A6[@]}"; do
    if [ ! -f "$file" ]; then fail 'ARM B/A6' "$file — carrier missing"; arm_b_failures=$((arm_b_failures + 1)); continue; fi
    if [ "$(grep -c "$LEGACY_READING_DATE" "$file" 2>/dev/null || true)" = '0' ] || [ "$(grep -c 'FALSIFIED' "$file" 2>/dev/null || true)" = '0' ]; then
      fail 'ARM B/A6' "$file — unchanged 2026-08-27 FALSIFIED contract missing"; arm_b_failures=$((arm_b_failures + 1))
    fi
  done
  for file in "${CARRIERS_A1[@]}"; do
    if [ "$file" = "$SPIKE_PATH" ]; then
      if validate_spike_record "$file" "$SPIKE_SHA256"; then current_records=$((current_records + 1)); else fail 'ARM B/A1-SPIKE' "$file — $SPIKE_REASON"; arm_b_failures=$((arm_b_failures + 1)); fi
      continue
    fi
    case "$file" in *.ts|*.js|*.mjs) style=source ;; *) style=markdown ;; esac
    if validate_marker_record "$file" "$style"; then current_records=$((current_records + 1)); else fail 'ARM B/A1-RECORD' "$file — $VALIDATION_REASON"; arm_b_failures=$((arm_b_failures + 1)); fi
  done
  if validate_pointer_records .planning/ROADMAP.md .planning/REQUIREMENTS.md; then current_records=$((current_records + 2)); else fail 'ARM B/A1-POINTER' "$POINTER_PATH — $POINTER_REASON"; arm_b_failures=$((arm_b_failures + 1)); fi
  if ! validate_windows_two_case_contract .planning/WINDOWS.md .planning/REQUIREMENTS.md .planning/phases/08-process-lifecycle/08-VALIDATION.md .planning/phases/08-process-lifecycle/08-UAT.md .planning/STATE.md; then
    fail 'ARM B/WINDOWS-TWO-CASE' "$WINDOWS_PATH — $WINDOWS_REASON"
    arm_b_failures=$((arm_b_failures + 1))
  fi
  if [ "$current_records" = '0' ]; then fail 'ARM B/A1-LIVENESS' 'record-set — zero current-verdict records validated'; arm_b_failures=$((arm_b_failures + 1)); fi
  if [ "$arm_b_failures" = '0' ]; then echo "   ARM B: pass (${#CARRIERS_A1[@]} A1 carriers, 2 pointers, ${#CARRIERS_A6[@]} unchanged A6 carriers)"; fi

  echo '== ARM C: pinned dated SUMMARY class =='
  if ! validate_spike_record "$SPIKE_PATH" "$SPIKE_SHA256"; then
    fail 'ARM C/SPIKE' "$SPIKE_PATH — $SPIKE_REASON"
    arm_c_failures=$((arm_c_failures + 1))
  fi
  if validate_summary_integrity "$REPO_ROOT" "$SUMMARY_DIR" "$SUMMARY_PINS" "$SUMMARY_EXPECTED_OUTPUTS"; then
    if [ "$arm_c_failures" = '0' ]; then
      echo "   ARM C: pass (canonical Spike digest; $SUMMARY_PINNED_COUNT pinned blobs; $SUMMARY_ON_DISK_COUNT summaries accounted for)"
    fi
  else
    fail 'ARM C/SUMMARY' "$SUMMARY_PATH — $SUMMARY_REASON"
    arm_c_failures=$((arm_c_failures + 1))
  fi
  echo
  if [ "$FAILED" = '0' ]; then echo 'verdict-gate.sh: PASS (ARM A, ARM B, ARM C)'; return 0; fi
  echo 'verdict-gate.sh: FAIL'; return 1
}

if [ "${1:-}" = '--self-test' ]; then run_self_test; exit $?; fi
if [ "$#" != '0' ]; then echo 'FAIL [USAGE] supported mode: --self-test'; exit 2; fi
run_default_gate
exit $?
