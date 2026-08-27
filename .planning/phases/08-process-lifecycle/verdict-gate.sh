#!/usr/bin/env bash
# =============================================================================
# verdict-gate.sh — Phase 8 A1/A6 verdict gate
#
# Authored by plan 08-10 (2026-08-27). Re-runnable, committed deliberately so it
# is a standing control rather than a one-time check. Threat T-08-44.
#
# WHAT IT ASSERTS
#   No LIVING artifact in this repository still presents assumption A1 or A6 as
#   unmeasured. A1 was closed favourably and A6 was FALSIFIED by readings taken
#   on real hardware on 2026-08-27 (08-UAT.md tests 1 and 2).
#
# WHY IT IS A REPO-WIDE SCAN WITH AN EXCLUSION LIST, AND NOT A LIST OF CARRIERS.
#   The census of carriers was wrong THREE times while this plan was being
#   written: four, then seven, then nine. That is the evidence, not an anecdote.
#   An INCLUSION-list loop can only ever open the files it already names, so a
#   carrier missing from the list is invisible to it BY CONSTRUCTION — it fails
#   OPEN, silently green. Two files (.planning/WINDOWS.md and .planning/STATE.md)
#   were in fact missing from an earlier draft's list and would have shipped
#   stale under a green gate.
#
#   ARM A therefore INVERTS the shape: it scans .planning/ and packages/ and
#   skips a short, commented EXCLUSION list. The default for any new or
#   forgotten carrier is FAIL. Do NOT "simplify" ARM A back into ARM B's
#   enumerated form — ARM B's list is sound ONLY because ARM A already covers
#   the hard direction, so ARM B can only ever be too short in the harmless
#   direction.
#
# THREE ARMS
#   A  discovery (fail-closed): repo-wide, exclusion-list, block-quote-stripped
#   B  positive content on the nine known carriers
#   C  historical-record immutability: the dated *-SUMMARY.md class is untouched
#
# Exit 0 = pass. Any non-zero exit names the offending file and the failing arm.
# =============================================================================
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT" || { echo "FAIL: cannot cd to repo root"; exit 3; }

# -----------------------------------------------------------------------------
# THE STALE PATTERN — AN ERE COVERING ALL THREE SPELLINGS. NOT OPTIONAL.
#
# Measured at HEAD 2026-08-27, 15 hits across nine carriers, in THREE spellings:
#   * 11 hits / 7 files:  "OPEN — not measured"      (EM DASH)
#   *  2 hits:            "A1 — OPEN, not measured"  (COMMA)   08-SECURITY.md
#   *  2 hits:            "OPEN - not measured"      (ASCII HYPHEN)  WINDOWS.md
#
# A gate greping only the em-dash form returns 0 for 08-SECURITY.md AND for
# WINDOWS.md VACUOUSLY — green while both stale claims sit untouched. That is the
# same pass-by-accident shape this gap set removed from plan 08-09.
#
# The hyphen sits LAST inside the bracket so it is a literal, not a range
# endpoint. All three forms were verified to match before this script was
# committed.
# -----------------------------------------------------------------------------
STALE_ERE='OPEN[[:space:]]*[,—-][[:space:]]*not measured'

# Strips MARKED-CORRECTION block quotes in both dialects before counting:
#   markdown  "> superseded text"
#   source    "// > superseded text"
# Preserved superseded text must NOT satisfy the gate, and a re-introduced
# ACTIVE claim must not be able to hide inside a quote. Stripping first is what
# makes the gate red in both directions.
QUOTE_STRIP='/^[[:space:]]*(\/\/[[:space:]]*)?>/d'

FAILED=0
fail() { echo "FAIL [$1] $2"; FAILED=1; }

# -----------------------------------------------------------------------------
# EXCLUSION LIST — the HISTORICAL-RECORD class, plus this script itself.
#
# Deliberately short. EVERY entry is a hole in the scan, so every entry carries
# a written reason and was verified to actually carry the stale string rather
# than assumed to.
#
#   *-SUMMARY.md      Dated execution records. A SUMMARY dated 2026-08-24 stating
#                     the verdicts were open was CORRECT ON ITS DATE; rewriting
#                     one would falsify the record rather than correct it.
#                     Measured 2026-08-27: 8 matching lines / 9 occurrences
#                     across the five dated 08-0x summaries. ARM C asserts this
#                     class is UNMODIFIED, so the exclusion is checked in both
#                     directions rather than merely trusted.
#   *-PLAN.md         08-06-PLAN.md and 08-10-PLAN.md quote the stale string as
#                     their SUBJECT. Without this, the gate is red on the very
#                     plan that defines it.
#   08-REVIEW-FIX.md  A dated review record. Same rule as a SUMMARY.
#   verdict-gate.sh   THIS FILE defines the pattern. A repo-wide scan that did
#                     not skip itself would match its own source and be
#                     permanently, unfixably red. Easy to miss; not optional.
# -----------------------------------------------------------------------------
is_excluded() {
  case "$1" in
    *-SUMMARY.md)     return 0 ;;
    *-PLAN.md)        return 0 ;;
    *08-REVIEW-FIX.md) return 0 ;;
    */verdict-gate.sh) return 0 ;;
  esac
  return 1
}

# =============================================================================
# ARM A — DISCOVERY (FAIL-CLOSED)
# =============================================================================
echo "== ARM A: repo-wide discovery (.planning/ and packages/, exclusion-list) =="
ARM_A_HITS=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if is_excluded "$f"; then continue; fi
  n=$(sed -E "$QUOTE_STRIP" "$f" | grep -cE "$STALE_ERE")
  if [ "$n" != "0" ]; then
    fail "ARM A" "$f carries $n live occurrence(s) of the stale A1/A6 verdict (outside any block quote)."
    ARM_A_HITS=$((ARM_A_HITS + n))
  fi
done < <(
  find .planning packages \
       \( -name node_modules -o -name dist -o -name .git \) -prune -o \
       -type f -print 2>/dev/null \
  | xargs grep -lE "$STALE_ERE" 2>/dev/null
)
[ "$ARM_A_HITS" = "0" ] && echo "   ARM A: pass (0 live stale verdicts outside the excluded historical-record class)"

# =============================================================================
# ARM B — POSITIVE CONTENT ON THE NINE KNOWN CARRIERS
#
# An explicit list, and that is sound ONLY because ARM A covers the hard
# direction: a carrier forgotten entirely still trips ARM A, so this list can
# only ever be too short in the harmless direction.
#
# Every carrier must carry the measurement DATE. Every carrier that states an
# A6 VERDICT must carry the word FALSIFIED.
#
# packages/backend/src/index.ts is asserted differently and DELIBERATELY: its
# carrier is killTree's single-pid-rung comment, which states A1's verdict and
# only CROSS-REFERENCES A6 ("measured FALSE") from the rung that does not
# defend against it. It is asserted on CLOSED FAVOURABLY, the verdict it
# actually states. This is a per-carrier tightening, not a relaxation — and
# plan 08-10 modifies no file under packages/, so the wording there is 08-06's.
# =============================================================================
echo "== ARM B: positive content on the nine known carriers =="
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
for f in "${CARRIERS_A6[@]}"; do
  [ -f "$f" ] || { fail "ARM B" "$f does not exist"; continue; }
  [ "$(grep -c '2026-08-27' "$f")" != "0" ] || fail "ARM B" "$f carries no 2026-08-27 measurement date"
  [ "$(grep -c 'FALSIFIED' "$f")" != "0" ] || fail "ARM B" "$f states an A6 verdict but never says FALSIFIED"
done
IDX=packages/backend/src/index.ts
[ -f "$IDX" ] || fail "ARM B" "$IDX does not exist"
[ "$(grep -c '2026-08-27' "$IDX")" != "0" ] || fail "ARM B" "$IDX carries no 2026-08-27 measurement date"
[ "$(grep -c 'CLOSED FAVOURABLY' "$IDX")" != "0" ] || fail "ARM B" "$IDX states A1's verdict but never says CLOSED FAVOURABLY"
[ "$FAILED" = "0" ] && echo "   ARM B: pass (9/9 carriers carry the date and their own verdict word)"

# =============================================================================
# ARM C — HISTORICAL-RECORD IMMUTABILITY
#
# The dated SUMMARY class is excluded from ARM A. That exclusion is checked in
# the OTHER direction here: the class must be UNMODIFIED. Rewriting a SUMMARY
# dated 2026-08-24 that recorded the verdicts as open would be falsifying the
# record, not correcting it.
# =============================================================================
echo "== ARM C: the dated *-SUMMARY.md class is unmodified =="
SUMMARY_DIFF=$(git diff --stat HEAD -- '.planning/phases/08-process-lifecycle/*-SUMMARY.md' 2>/dev/null)
if [ -n "$SUMMARY_DIFF" ]; then
  fail "ARM C" "a dated SUMMARY was modified — historical records are never rewritten:"
  echo "$SUMMARY_DIFF"
else
  echo "   ARM C: pass (no dated SUMMARY modified)"
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "verdict-gate.sh: PASS (ARM A, ARM B, ARM C)"
  exit 0
fi
echo "verdict-gate.sh: FAIL"
exit 1
