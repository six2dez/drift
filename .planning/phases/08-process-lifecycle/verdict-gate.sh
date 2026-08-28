#!/usr/bin/env bash
# =============================================================================
# verdict-gate.sh — Phase 8 A1/A6 verdict gate
#
# Authored by plan 08-10 (2026-08-27). RE-POINTED by plan 08-11 (2026-08-28)
# after `08-VERIFICATION.md` retracted A1. Re-runnable, committed deliberately so
# it is a standing control rather than a one-time check. Threat T-08-44.
#
# WHAT IT ASSERTS
#   No LIVING artifact in this repository still presents assumption A1 as
#   MEASURED or CLOSED FAVOURABLY, and none presents A6 as unmeasured.
#
#   A1's favourable reading of 2026-08-27 was RETRACTED on 2026-08-28: the probe
#   at 68199fa decided liveness with
#   `signalRef.process?.kill?.(pid, 0) ?? false` on a runtime where the SAME
#   diagnostics run measured `process.kill` ABSENT, so the optional chain
#   yielded `undefined`, `?? false` made `alive === false`, and the favourable
#   string was emitted UNCONDITIONALLY. The red input did not exist, so the
#   reading carries no information. A6 was measured by direct `ps` observation on
#   the same date and is FALSIFIED; that reading is NOT withdrawn.
#
#   Consequently this gate now asserts the OPPOSITE of what plan 08-10 wrote:
#   the favourable A1 verdict is the STALE string, and `RETRACTED` is the word
#   every A1 carrier must carry.
#
# WHY IT IS A REPO-WIDE SCAN WITH AN EXCLUSION LIST, AND NOT A LIST OF CARRIERS.
#   The census of carriers was wrong THREE times while plan 08-10 was being
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
#   A  discovery (fail-closed), TWO scans: A1-STALE (no live favourable A1
#      verdict anywhere outside the excluded historical-record class) and
#      A1-READING (a file may quote the raw 2026-08-27 instrument output — it is
#      a fact and deleting it would falsify the record — but only if the word
#      RETRACTED travels with it in the same file)
#   B  positive content on the known carriers
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
# THE STALE PATTERN — AN ERE COVERING EVERY SPELLING MEASURED IN THE TREE.
#
# MEASURED 2026-08-28 by plan 08-11, over `.planning/` and `packages/` with
# node_modules/dist/.git pruned, case-insensitively on the stem `favourabl`,
# BEFORE this pattern was written. No count from any plan document was trusted:
# the carrier census in this phase has now been wrong FIVE times, which is why
# this gate consumes no count and enumerates nothing it did not measure.
#
# The five spellings the tree actually uses, and the file each was verified
# against BEFORE the alternative shipped (an alternative matching nothing is a
# vacuous branch, and this phase has shipped thirteen of those):
#
#   1. "CLOSED-FAVOURABLY"          hyphenated frontmatter form   3 files
#                                   e.g. 08-SPIKE.md `A1: CLOSED-FAVOURABLY`
#   2. "CLOSED FAVOURABLY"          spaced uppercase prose form  15 files
#                                   e.g. kill-plan.ts `Verdict: **CLOSED FAVOURABLY — measured**`
#   3. "closed favourably"          lowercase prose form         15 files
#                                   e.g. STATE.md `(A1 closed favourably, A6 **FALSIFIED** ...)`
#   4. "measured favourably"        the ROADMAP/REQUIREMENTS form 7 files
#                                   e.g. REQUIREMENTS.md LIF-02, ROADMAP.md SC-2
#   5. "favourably by measurement"  the LINE-WRAPPED form         1 file
#                                   08-SECURITY.md:601-602 wraps between
#                                   "closed" and "favourably", so spellings 2
#                                   and 3 both miss it. A line-oriented gate
#                                   that does not enumerate the wrap fails OPEN
#                                   on exactly one file, silently.
#
# Spellings 1-2 are matched case-SENSITIVELY as written; the pattern is
# deliberately NOT anchored on the token "A1", because kill-plan.ts:77 states the
# verdict in a table cell (`Verdict: **CLOSED FAVOURABLY — measured**`) with the
# assumption name three lines above it. Anchoring on A1 would fail open there.
# -----------------------------------------------------------------------------
STALE_VERDICT_ERE='CLOSED[- ]FAVOURABLY|closed favourably|measured favourably|favourably by measurement'

# -----------------------------------------------------------------------------
# THE OUTCOME-MAPPING EXEMPTION, AND ITS COUNTERWEIGHT.
#
# `08-SPIKE.md` § *How to run this spike later* maps each possible instrument
# output onto the verdict it would license:
#
#   - `grandchild-died (detached honoured)` → A1 closed favourably; ...
#   Equal → A6 closed favourably: the MCP child sits in the CLI's group ...
#
# Those two lines are DECISION RULES for a future re-run, not claims about what
# was measured, and they remain true after the retraction. Byte-for-byte they are
# indistinguishable from a live claim, so the only discriminator available is the
# arrow: the verdict phrase appears as the CONSEQUENT of "→".
#
# MEASURED 2026-08-28: exactly two lines in the whole tree match this shape, both
# in 08-SPIKE.md, and both are in the procedure section. This is a hole, so it is
# closed in the other direction rather than trusted: the A1 line ALSO carries the
# raw 2026-08-27 reading string, so scan A1-READING below requires its file to
# carry `RETRACTED`, and the A6 line states a verdict this gate does not police
# in that direction (A6 is FALSIFIED; a favourable A6 claim would be caught by
# ARM B's FALSIFIED requirement on the same file).
#
# Note that "→" is NOT the em dash "—" used in prose, and ROADMAP.md's
# `SIGTERM→SIGKILL` is unaffected because that line carries spelling 4 rather
# than spellings 2-3; verified by measurement before this exemption shipped.
# -----------------------------------------------------------------------------
OUTCOME_RULE_ERE='→.*(closed favourably|CLOSED[- ]FAVOURABLY)'

# -----------------------------------------------------------------------------
# THE RAW READING, AND THE WORD THAT MUST TRAVEL WITH IT.
#
# `grandchild-died (detached honoured)` is what the instrument PRINTED on
# 2026-08-27. That is a fact and deleting it from any artifact would falsify the
# record — the reading is real; the verdict drawn from it was not. So the raw
# string is allowed to live anywhere, on ONE condition: the file that quotes it
# must also carry RETRACTION_TOKEN, so a reader cannot meet the reading without
# meeting its withdrawal.
#
# Parentheses are escaped: this is consumed as an ERE, not a fixed string.
# -----------------------------------------------------------------------------
READING_ERE='grandchild-died \(detached honoured\)'

# One word, in one variable, so ARM A and ARM B can never drift onto two
# different spellings of the same requirement.
RETRACTION_TOKEN='RETRACTED'

# The date the retraction landed in the carriers. A carrier that still says only
# 2026-08-27 is a carrier nobody corrected, so ARM B requires BOTH dates on every
# file that states an A1 verdict: the measurement date and the retraction date.
RETRACTION_DATE='2026-08-28'

# The date A6 was measured. NOT withdrawn, NOT softened, NOT bundled into the A1
# retraction — the two assumptions were measured by different instruments and
# only one reading is being taken back.
MEASUREMENT_DATE='2026-08-27'

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
#                     the verdicts were open, or one dated 2026-08-27 stating A1
#                     closed favourably, was CORRECT ON ITS DATE; rewriting one
#                     would falsify the record rather than correct it.
#                     ARM C asserts this class is UNMODIFIED, so the exclusion is
#                     checked in both directions rather than merely trusted.
#   *-PLAN.md         08-06-PLAN.md, 08-10-PLAN.md and 08-11-PLAN.md quote the
#                     stale string as their SUBJECT. Without this, the gate is
#                     red on the very plan that defines it.
#   08-REVIEW-FIX.md  A dated review record. Same rule as a SUMMARY.
#   *-VERIFICATION.md ADDED 2026-08-28 by plan 08-11. A verification report is a
#                     dated historical record, and `08-VERIFICATION.md` is the
#                     document that RETRACTED the reading — its prose necessarily
#                     quotes the retracted claim in order to describe it (4 live
#                     occurrences, measured), and the report states explicitly
#                     that it must not be reworded to make this gate green.
#                     Excluding it is unavoidable; leaving it unchecked is not,
#                     so ARM A closes this hole in the other direction exactly as
#                     ARM C closes the SUMMARY hole: every *-VERIFICATION.md
#                     under .planning/phases/ that mentions A1 at all MUST carry
#                     RETRACTION_TOKEN. Verified by inspection 2026-08-28:
#                     08-VERIFICATION.md carries "reading RETRACTED" (§ Truth
#                     Verification, A1 row) and "RECORDS A RETRACTED READING"
#                     (§ Required Artifacts, 08-SPIKE.md row).
#   verdict-gate.sh   THIS FILE defines the pattern. A repo-wide scan that did
#                     not skip itself would match its own source and be
#                     permanently, unfixably red. Easy to miss; not optional.
# -----------------------------------------------------------------------------
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

# TRUE when a file makes a claim that the retraction must travel with:
#   (a) it carries a LIVE (non-block-quoted) occurrence of the raw reading, or
#   (b) it is a *-VERIFICATION.md under .planning/phases/ that mentions A1 —
#       the counterweight to that class's exclusion from scan A1-STALE.
requires_retraction() {
  case "$1" in
    .planning/phases/*-VERIFICATION.md)
      [ "$(grep -c 'A1' "$1")" != "0" ] && return 0 ;;
  esac
  [ "$(sed -E "$QUOTE_STRIP" "$1" | grep -cE "$READING_ERE")" != "0" ] && return 0
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
#
# RED INPUT: a non-excluded file under .planning/ or packages/ carrying, outside
# a block quote, any of the five measured spellings of A1's favourable verdict —
# or carrying the raw 2026-08-27 reading string without the word RETRACTED
# anywhere in the same file.
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

# --- Scan A1-STALE ----------------------------------------------------------
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if is_excluded "$f"; then continue; fi
  n=$(sed -E "$QUOTE_STRIP" "$f" | grep -E "$STALE_VERDICT_ERE" | grep -cvE "$OUTCOME_RULE_ERE")
  n=$(printf '%s' "$n" | tr -d ' ')
  if [ "$n" != "0" ]; then
    fail "ARM A/A1-STALE" "$f states A1's WITHDRAWN favourable verdict on $n live line(s) (outside any block quote). A1's reading was retracted $RETRACTION_DATE; the verdict is OPEN."
    ARM_A_HITS=$((ARM_A_HITS + n))
  fi
done < <(
  find .planning packages \
       \( -name node_modules -o -name dist -o -name .git \) -prune -o \
       -type f -exec grep -lIE "$STALE_VERDICT_ERE" {} + 2>/dev/null
)

# --- Scan A1-READING --------------------------------------------------------
# The raw instrument output may be quoted anywhere — but only with its
# withdrawal. The *-VERIFICATION.md class is deliberately NOT skipped here: this
# is the counterweight to its exclusion from scan A1-STALE above.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    *-VERIFICATION.md) ;;
    *) if is_excluded "$f"; then continue; fi ;;
  esac
  requires_retraction "$f" || continue
  if [ "$(grep -c "$RETRACTION_TOKEN" "$f")" = "0" ]; then
    fail "ARM A/A1-READING" "$f carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says $RETRACTION_TOKEN — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together."
    ARM_A_HITS=$((ARM_A_HITS + 1))
  fi
done < <(
  {
    find .planning packages \
         \( -name node_modules -o -name dist -o -name .git \) -prune -o \
         -type f -exec grep -lIE "$READING_ERE" {} + 2>/dev/null
    find .planning/phases -type f -name '*-VERIFICATION.md' 2>/dev/null
  } | sort -u
)

[ "$ARM_A_HITS" = "0" ] && echo "   ARM A: pass (0 live favourable-A1 verdicts and 0 unretracted readings outside the excluded historical-record class)"

# =============================================================================
# ARM B — POSITIVE CONTENT ON THE KNOWN CARRIERS
#
# An explicit list, and that is sound ONLY because ARM A covers the hard
# direction: a carrier forgotten entirely still trips ARM A, so this list can
# only ever be too short in the harmless direction.
#
# A6 IS UNCHANGED BY THE 2026-08-28 RE-POINTING. Every carrier that states an A6
# verdict must still carry the word FALSIFIED and the 2026-08-27 measurement
# date, because A6 was measured that day by direct `ps` observation and that
# measurement is NOT being withdrawn. Only the A1 half is flipped.
#
# THE A1 HALF, FLIPPED. Every carrier that states an A1 verdict must now carry
# RETRACTION_TOKEN and the RETRACTION_DATE. The second date is the point: a
# carrier that still says only 2026-08-27 is a carrier nobody corrected, and it
# would otherwise satisfy the arm on the strength of the very date whose reading
# was withdrawn.
#
# `08-VERIFICATION.md` is in the A6 list but NOT in the A1 list, and that is
# deliberate rather than an omission: it is the report that performed the
# retraction on 2026-08-27, it carries no 2026-08-28 date, and plan 08-11
# prohibits editing it. Its A1 obligation is asserted instead by ARM A's
# A1-READING scan, which requires every *-VERIFICATION.md mentioning A1 to carry
# RETRACTION_TOKEN.
#
# RED INPUT: any listed carrier that loses the word FALSIFIED or its 2026-08-27
# date, or any A1 carrier that does not carry both RETRACTED and 2026-08-28.
# =============================================================================
echo "== ARM B: positive content on the known carriers =="
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
  [ "$(grep -c "$MEASUREMENT_DATE" "$f")" != "0" ] || fail "ARM B" "$f carries no $MEASUREMENT_DATE measurement date"
  [ "$(grep -c 'FALSIFIED' "$f")" != "0" ] || fail "ARM B" "$f states an A6 verdict but never says FALSIFIED"
done

# The A1 carriers: every file that states an A1 VERDICT. index.ts is here rather
# than in the A6 list for the reason plan 08-06 recorded — its carrier is
# killTree's single-pid-rung comment, which states A1's verdict and only
# CROSS-REFERENCES A6 from the rung that does not defend against it.
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
for f in "${CARRIERS_A1[@]}"; do
  [ -f "$f" ] || { fail "ARM B" "$f does not exist"; continue; }
  [ "$(grep -c "$MEASUREMENT_DATE" "$f")" != "0" ] || fail "ARM B" "$f carries no $MEASUREMENT_DATE measurement date"
  [ "$(grep -c "$RETRACTION_TOKEN" "$f")" != "0" ] || fail "ARM B" "$f states an A1 verdict but never says $RETRACTION_TOKEN"
  [ "$(grep -c "$RETRACTION_DATE" "$f")" != "0" ] || fail "ARM B" "$f states an A1 verdict but carries no $RETRACTION_DATE retraction date"
done
[ "$FAILED" = "0" ] && echo "   ARM B: pass (${#CARRIERS_A6[@]} A6 carriers carry FALSIFIED and $MEASUREMENT_DATE; ${#CARRIERS_A1[@]} A1 carriers carry $RETRACTION_TOKEN and $RETRACTION_DATE)"

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
