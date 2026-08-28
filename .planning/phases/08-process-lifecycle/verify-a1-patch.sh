#!/usr/bin/env bash
# =============================================================================
# verify-a1-patch.sh — the standing control for a1-probe-fix.patch
#
# Authored by plan 08-15 (2026-08-28). Committed deliberately, in the same
# spirit as `verdict-gate.sh`: a control that can be re-run is a control, and a
# one-time transcript in a SUMMARY is an anecdote. Threat T-08-67.
#
# WHAT IT ASSERTS — three things, in order, and each has a red input:
#
#   1. `a1-probe-fix.patch` STILL APPLIES to `packages/backend/src/index.ts` as
#      that file exists at commit 68199fa.
#      RED INPUT: corrupt a hunk header, or let the patch drift from the commit
#      it targets, and `git apply` fails here — the script exits non-zero naming
#      the apply failure, and still removes its scratch worktree.
#
#   2. The patched source TYPE-CHECKS. The patch calls four helpers from
#      `kill-plan.ts` that DO NOT EXIST at 68199fa (plan 08-02 created that
#      module, plan 08-12 added the liveness half), so HEAD's `kill-plan.ts` and
#      HEAD's `platform.ts` are copied in beside it — `kill-plan.ts` imports
#      `resolveWindowsSystemBinary`, which the historical `platform.ts` does not
#      export.
#      RED INPUT: a signature change at HEAD that the patch's call sites no
#      longer satisfy, and `tsc --noEmit` fails here rather than on the
#      maintainer's machine an hour into a hardware session.
#
#   3. The build STILL PRODUCES A PACKAGE. Type-checking is not the same claim:
#      the bundler resolves the `caido:plugin` virtual import and the assets
#      glob, and either can break independently.
#      RED INPUT: `caido-dev build` exits non-zero, or emits no
#      `dist/plugin_package`, and this script fails naming which.
#
# WHAT IT DELIBERATELY DOES NOT DO — DO NOT ADD IT LATER.
#   It does NOT run vitest inside the scratch worktree. The source censuses in
#   `index.source.test.ts` at HEAD assert properties of HEAD's `index.ts`, and
#   the worktree holds a HISTORICAL one with a temporary probe spliced into it.
#   They fail there, and that is CORRECT behaviour rather than a finding. Adding
#   the run would produce a red control that says nothing about the patch.
#
# THE MAIN WORKING TREE IS NEVER MUTATED. Everything happens inside a DETACHED
#   scratch worktree at 68199fa, created under the system temp directory and
#   removed on EVERY exit path — success, failure, and interrupt — by the trap
#   below. That is the whole reason this is a worktree rather than a
#   `git stash` + `git checkout` dance: the tree you are working in is never
#   touched, so this control is safe to run mid-edit.
#
# WHY IT INSTALLS DEPENDENCIES, WHICH IS NOT WASTE. A fresh worktree has no
#   `node_modules`, and neither `tsc` nor `caido-dev` exists without one.
#   pnpm's content-addressable store means this is a hard-link population of
#   packages already on the disk rather than a network fetch, so it costs
#   seconds rather than minutes. `--frozen-lockfile` pins it to the historical
#   `pnpm-lock.yaml`, so the control measures the patch and not a dependency
#   that moved underneath it.
#
# USAGE
#   bash verify-a1-patch.sh [OUT_DIR] [PATCH_FILE]
#
#   OUT_DIR     optional. When given, the built `plugin_package` is copied there
#               before the worktree is removed, so plan 08-17 can reuse this
#               script to PRODUCE the probe build rather than reimplementing the
#               recipe by hand — hand reconstruction is the activity that
#               produced five wrong censuses in this phase.
#   PATCH_FILE  optional. Defaults to `a1-probe-fix.patch` beside this script.
#               Overridable so a red input can be constructed against a
#               deliberately corrupted copy without touching the real one.
#
# Exit 0 = the patch applies, type-checks and builds. Any non-zero exit names
# the step that failed.
# =============================================================================
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT" || { echo "FAIL: cannot cd to repo root"; exit 3; }

# The commit the patch targets, spelled ONCE. It is also named in the patch's
# own header; if these two ever disagree, step 1 fails, which is the correct
# outcome rather than a silent mismatch.
PROBE_COMMIT="68199fa"

OUT_DIR="${1-}"
PATCH_FILE="${2-$SCRIPT_DIR/a1-probe-fix.patch}"

[ -f "$PATCH_FILE" ] || { echo "FAIL: no patch file at $PATCH_FILE"; exit 3; }

WORKTREE=""
cleanup() {
  # EVERY exit path, including the failure ones. A control that leaves a
  # worktree behind on failure is a control nobody runs twice.
  if [ -n "$WORKTREE" ]; then
    git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || rm -rf "$WORKTREE"
    git worktree prune >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/drift-a1-probe-XXXXXX")"
rmdir "$WORKTREE"

echo "== step 0: detached scratch worktree at $PROBE_COMMIT =="
if ! git worktree add --detach "$WORKTREE" "$PROBE_COMMIT" >/dev/null 2>&1; then
  echo "FAIL [step 0] could not create a detached worktree at $PROBE_COMMIT"
  exit 1
fi
echo "   worktree: $WORKTREE"

echo "== step 1: apply $(basename "$PATCH_FILE") =="
if ! git -C "$WORKTREE" apply --verbose "$PATCH_FILE" 2>&1; then
  echo "FAIL [step 1] the patch does not apply to packages/backend/src/index.ts at $PROBE_COMMIT"
  exit 1
fi
echo "   applied"

echo "== step 1b: carry in the HEAD helpers the patch calls =="
# `kill-plan.ts` does not exist at the probe commit and HEAD's version imports
# `resolveWindowsSystemBinary`, which the historical `platform.ts` does not
# export — so BOTH files travel, not one.
for helper in kill-plan.ts platform.ts; do
  if ! git show "HEAD:packages/backend/src/$helper" > "$WORKTREE/packages/backend/src/$helper" 2>/dev/null; then
    echo "FAIL [step 1b] could not read HEAD:packages/backend/src/$helper"
    exit 1
  fi
  echo "   carried in: $helper"
done

echo "== step 2: install dependencies (frozen lockfile, pnpm store hard-links) =="
if ! (cd "$WORKTREE" && pnpm install --frozen-lockfile --ignore-scripts >/dev/null 2>&1); then
  echo "FAIL [step 2] pnpm install failed in the scratch worktree"
  exit 1
fi
echo "   installed"

echo "== step 3: type-check the patched source =="
if ! (cd "$WORKTREE/packages/backend" && npx tsc --noEmit 2>&1); then
  echo "FAIL [step 3] the patched packages/backend/src/index.ts does not type-check"
  exit 1
fi
echo "   backend type-check: pass"

echo "== step 4: build =="
if ! (cd "$WORKTREE" && npx caido-dev build >/dev/null 2>&1); then
  echo "FAIL [step 4] caido-dev build failed on the patched source"
  exit 1
fi
if [ ! -d "$WORKTREE/dist/plugin_package" ]; then
  echo "FAIL [step 4] the build produced no dist/plugin_package"
  exit 1
fi
PACKAGE_BYTES=$(find "$WORKTREE/dist/plugin_package" -type f -exec cat {} + 2>/dev/null | wc -c | tr -d ' ')
PACKAGE_FILES=$(find "$WORKTREE/dist/plugin_package" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "   built: dist/plugin_package — $PACKAGE_FILES files, $PACKAGE_BYTES bytes"
if [ -f "$WORKTREE/dist/plugin_package.zip" ]; then
  ZIP_BYTES=$(wc -c < "$WORKTREE/dist/plugin_package.zip" | tr -d ' ')
  echo "   built: dist/plugin_package.zip — $ZIP_BYTES bytes"
fi

if [ -n "$OUT_DIR" ]; then
  echo "== step 5: copy the built package out to $OUT_DIR =="
  mkdir -p "$OUT_DIR" || { echo "FAIL [step 5] cannot create $OUT_DIR"; exit 1; }
  if ! cp -R "$WORKTREE/dist/plugin_package" "$OUT_DIR/" 2>&1; then
    echo "FAIL [step 5] could not copy the built package out"
    exit 1
  fi
  [ -f "$WORKTREE/dist/plugin_package.zip" ] && cp "$WORKTREE/dist/plugin_package.zip" "$OUT_DIR/"
  echo "   copied to $OUT_DIR"
fi

echo
echo "verify-a1-patch.sh: PASS (applies at $PROBE_COMMIT, type-checks, builds)"
exit 0
