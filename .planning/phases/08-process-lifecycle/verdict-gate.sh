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
#      — asserted against PINNED BLOB HASHES in HEAD (committed rewrites) plus a
#        working-tree diff (uncommitted ones). See ARM C's own header for why the
#        original `git diff --stat HEAD` alone asserted nothing.
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
# WHITESPACE-SAFE DISCOVERY (review WR-05), and this is the arm's own design
# argument applied to its own plumbing rather than a tidy-up.
#
# WHAT IT USED TO BE:
#
#   find … -type f -print | xargs grep -lE "$STALE_ERE" 2>/dev/null
#
# `xargs` without `-0` splits on WHITESPACE and honours quotes, so a path
# containing a space, a tab, a single quote or a double quote was silently split
# into operands that do not exist. `grep` reported "No such file or directory"
# into the `2>/dev/null`, the real carrier never reached the loop, and the gate
# stayed GREEN with the stale claim sitting in it. That is the FAIL-OPEN property
# ARM A's header spends a paragraph arguing an inclusion list has — reintroduced
# through the pipe, in the arm built to avoid it.
#
# Measured before the fix: the repo has zero such paths today, so this was LATENT
# rather than live. It does not stay latent by itself — "Application Support" is
# a path this project already reasons about, and one artifact named
# `08 UAT notes.md` is the whole exploit. Verified on exactly that fixture: the
# old pipeline finds 0, the new one names the file.
#
# `-exec … {} +` rather than `xargs -0`, and this is the SECOND attempt at this
# line rather than the first — the record is kept because the first attempt was
# worse than the bug. It used `grep -lIZE` plus `read -r -d ''`, on the assumption
# that `-Z` means `--null`. On GNU grep it does. On FreeBSD/macOS grep, and on the
# `ugrep` many developers have shadowing `grep` on PATH, **`-Z` means
# `--decompress`** — so the output stayed newline-delimited, `read -d ''` found no
# NUL, and the loop ran ZERO times. ARM A would have gone from failing open on
# whitespace paths to failing open on EVERYTHING, while still printing "pass".
# Caught by running the fixture; recorded so the flag is not "restored" later.
#
# So: only flags GNU grep, BSD grep and ugrep all agree on — `-l`, `-I`, `-E` —
# and a newline-delimited read. `-I` skips binary files, which `grep -l` would
# otherwise name and the loop below would then `sed` as text.
#
# THE ONE PATH SHAPE THIS STILL CANNOT ENUMERATE is a filename containing a
# NEWLINE. Rather than leave that as an unstated hole in a fail-closed arm, it is
# DETECTED: `find -print0` and `find -print` must agree on the number of names,
# and they cannot when one contains a newline. A repository that ever grows such
# a path turns this arm RED instead of quietly skipping it.
N_NUL=$(find .planning packages \
        \( -name node_modules -o -name dist -o -name .git \) -prune -o \
        -type f -print0 2>/dev/null | tr -cd '\0' | wc -c | tr -d ' ')
N_LINE=$(find .planning packages \
         \( -name node_modules -o -name dist -o -name .git \) -prune -o \
         -type f -print 2>/dev/null | wc -l | tr -d ' ')
if [ "$N_NUL" != "$N_LINE" ]; then
  fail "ARM A" "a path under .planning/ or packages/ contains a NEWLINE ($N_NUL names, $N_LINE lines) — the discovery loop cannot enumerate it safely."
fi

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
       -type f -exec grep -lIE "$STALE_ERE" {} + 2>/dev/null
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
#
# REWRITTEN 2026-08-27 (review WR-04). WHAT THIS ARM USED TO BE, AND WHY IT
# ASSERTED NOTHING:
#
#   SUMMARY_DIFF=$(git diff --stat HEAD -- '…/*-SUMMARY.md')
#
# `git diff HEAD` compares the index and the working tree against HEAD. At every
# COMMIT BOUNDARY — which is the only state a standing control is ever run in: a
# CI checkout, a fresh clone, a `git bisect` checkout — that output is empty BY
# CONSTRUCTION, whatever the history contains. Someone who rewrote a SUMMARY and
# COMMITTED it got a green ARM C forever after; only an UNCOMMITTED edit was ever
# red, and only until it was committed. The arm that exists to police the
# exclusion list was itself the "green by accident" shape ARM A's commentary sets
# out to eliminate.
#
# WHY A PINNED BLOB HASH AND NOT `git log --oneline --follow | wc -l`. Counting
# commits per file asserts the right thing but only where the full history is
# present: under `actions/checkout`'s default `fetch-depth: 1`, or any shallow
# clone, every file reads as one commit and the check passes VACUOUSLY — the same
# failure being fixed, relocated. `git rev-parse HEAD:<path>` reads the blob out
# of HEAD's own tree, which exists in a shallow clone, so this arm asserts
# CONTENT rather than history and is depth-independent.
#
# THE PIN IS DELIBERATE FRICTION. Regenerating one of these files now requires
# editing this script, in a commit that says so. That is the point: "historical
# records are never rewritten" should cost something to override.
# =============================================================================
echo "== ARM C: the dated *-SUMMARY.md class is unmodified =="

# path-relative-to-repo-root  <space>  blob hash in HEAD, pinned 2026-08-27.
SUMMARY_PINS="
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
"

SUMMARY_DIR=.planning/phases/08-process-lifecycle
PINNED_COUNT=0
while read -r name pin; do
  [ -n "$name" ] || continue
  PINNED_COUNT=$((PINNED_COUNT + 1))
  actual=$(git rev-parse "HEAD:$SUMMARY_DIR/$name" 2>/dev/null || echo "MISSING")
  if [ "$actual" != "$pin" ]; then
    fail "ARM C" "$name is $actual in HEAD, pinned at $pin — a dated SUMMARY is written once"
  fi
done <<EOF
$SUMMARY_PINS
EOF

# THE FAIL-CLOSED HALF. A pin list is an INCLUSION list, and ARM A's own header
# explains what those are worth on their own: a SUMMARY added later and never
# pinned would be invisible to the loop above. Counting the files on disk and
# requiring the two numbers to agree is what stops that — a new summary makes
# this red until it is pinned.
ON_DISK_COUNT=$(find "$SUMMARY_DIR" -maxdepth 1 -name '*-SUMMARY.md' -type f | wc -l | tr -d ' ')
if [ "$ON_DISK_COUNT" != "$PINNED_COUNT" ]; then
  fail "ARM C" "$ON_DISK_COUNT dated SUMMARY files on disk but $PINNED_COUNT pinned — pin the new one"
fi

# THE SECOND, CHEAPER ARM, KEPT. The pins read HEAD's tree, so they cannot see an
# edit that has not been committed yet. This is the original check, retained for
# exactly the one case it does cover.
SUMMARY_DIFF=$(git diff --stat HEAD -- "$SUMMARY_DIR/*-SUMMARY.md" 2>/dev/null)
if [ -n "$SUMMARY_DIFF" ]; then
  fail "ARM C" "a dated SUMMARY is modified in the working tree — historical records are never rewritten:"
  echo "$SUMMARY_DIFF"
fi

[ "$FAILED" = "0" ] && echo "   ARM C: pass ($PINNED_COUNT pinned blobs match HEAD; working tree clean)"

echo
if [ "$FAILED" = "0" ]; then
  echo "verdict-gate.sh: PASS (ARM A, ARM B, ARM C)"
  exit 0
fi
echo "verdict-gate.sh: FAIL"
exit 1
