#!/usr/bin/env bash

# Standing Phase 08 citation-integrity gate (T-08-84 / T-08-88).
#
# Live proof is intentionally narrower than planning prose: package text files and
# depth-one executable, .sh, or .patch support artifacts must join to exactly one
# row in the bounded main register in 08-SECURITY.md.

set -u
set -o pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/$(basename "$SCRIPT_PATH")"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

REGISTER_HEADER='| Threat ID | Category | Component | Sev | Disposition | Mitigation (verified) | Status |'
REGISTER_DELIMITER='|---|---|---|---|---|---|---|'
NEWLINE_PATH_LABEL='newline-path-rejected'

declare -a REGISTER_SEEN
declare -a PACKAGE_PATH
declare -a SUPPORT_PATH
declare -a PACKAGE_FILE_ID_SEEN
declare -a SUPPORT_FILE_ID_SEEN

REGISTER_NUMERIC_COUNT=0
REGISTER_SENTINEL_COUNT=0
PACKAGE_TEXT_COUNT=0
SUPPORT_TEXT_COUNT=0
NEWLINE_PATH_COUNT=0
SCAN_ERROR_COUNT=0
FOUND_PRODUCTION_GATE=0
FOUND_INDEPENDENT_TEST=0
SELF_TEST_FIXTURE=''

cleanup_self_test_fixture() {
  if [ -n "$SELF_TEST_FIXTURE" ] && [ -d "$SELF_TEST_FIXTURE" ]; then
    rm -rf -- "$SELF_TEST_FIXTURE" >/dev/null 2>&1
  fi
}

reset_state() {
  REGISTER_SEEN=()
  PACKAGE_PATH=()
  SUPPORT_PATH=()
  PACKAGE_FILE_ID_SEEN=()
  SUPPORT_FILE_ID_SEEN=()
  REGISTER_NUMERIC_COUNT=0
  REGISTER_SENTINEL_COUNT=0
  PACKAGE_TEXT_COUNT=0
  SUPPORT_TEXT_COUNT=0
  NEWLINE_PATH_COUNT=0
  SCAN_ERROR_COUNT=0
  FOUND_PRODUCTION_GATE=0
  FOUND_INDEPENDENT_TEST=0
}

safe_relative_path() {
  local root="$1"
  local absolute="$2"

  case "$absolute" in
    "$root"/*)
      printf '%s' "${absolute#"$root"/}"
      ;;
    *)
      return 1
      ;;
  esac
}

record_citation() {
  local family="$1"
  local relative="$2"
  local token="$3"
  local digits="${token#T-08-}"
  local index

  if [ "${#digits}" -ne 2 ]; then
    printf 'ERROR malformed-live-id id=%s path=%s\n' "$token" "$relative"
    SCAN_ERROR_COUNT=$((SCAN_ERROR_COUNT + 1))
    return
  fi

  index=$((10#$digits))
  if [ "$index" -eq 0 ]; then
    printf 'ERROR malformed-live-id id=%s path=%s\n' "$token" "$relative"
    SCAN_ERROR_COUNT=$((SCAN_ERROR_COUNT + 1))
    return
  fi

  if [ "$family" = package ]; then
    if [ -z "${PACKAGE_PATH[$index]:-}" ]; then
      PACKAGE_PATH[$index]="$relative"
    fi
    case "$relative:$index" in
      packages/backend/src/kill-plan.ts:55)
        PACKAGE_FILE_ID_SEEN[55]=1
        ;;
      packages/backend/src/kill-plan.ts:59)
        PACKAGE_FILE_ID_SEEN[59]=1
        ;;
      packages/backend/src/kill-plan.ts:75)
        PACKAGE_FILE_ID_SEEN[75]=1
        ;;
    esac
  else
    if [ -z "${SUPPORT_PATH[$index]:-}" ]; then
      SUPPORT_PATH[$index]="$relative"
    fi
    case "$relative:$index" in
      .planning/phases/08-process-lifecycle/verify-a1-patch.sh:67)
        SUPPORT_FILE_ID_SEEN[67]=1
        ;;
      .planning/phases/08-process-lifecycle/a1-probe-fix.patch:76)
        SUPPORT_FILE_ID_SEEN[76]=1
        ;;
    esac
  fi
}

scan_text_file() {
  local family="$1"
  local root="$2"
  local absolute="$3"
  local relative
  local token

  relative="$(safe_relative_path "$root" "$absolute")" || {
    printf 'ERROR path-outside-root\n'
    SCAN_ERROR_COUNT=$((SCAN_ERROR_COUNT + 1))
    return
  }

  case "$relative" in
    *$'\n'*)
      NEWLINE_PATH_COUNT=$((NEWLINE_PATH_COUNT + 1))
      return
      ;;
  esac

  # Empty and binary files cannot carry a citation and are not text-bearing.
  if ! LC_ALL=C grep -Iq . -- "$absolute"; then
    return
  fi

  if [ "$family" = package ]; then
    PACKAGE_TEXT_COUNT=$((PACKAGE_TEXT_COUNT + 1))
  else
    SUPPORT_TEXT_COUNT=$((SUPPORT_TEXT_COUNT + 1))
    case "$relative" in
      .planning/phases/08-process-lifecycle/threat-register-gate.sh)
        FOUND_PRODUCTION_GATE=1
        ;;
      .planning/phases/08-process-lifecycle/threat-register-gate.test.sh)
        FOUND_INDEPENDENT_TEST=1
        ;;
    esac
  fi

  while IFS= read -r token; do
    [ -n "$token" ] || continue
    record_citation "$family" "$relative" "$token"
  done < <(LC_ALL=C grep -Eo 'T-08-[0-9]+' -- "$absolute" || true)
}

discover_package_files() {
  local root="$1"
  local package_root="$root/packages"
  local file

  if [ ! -d "$package_root" ]; then
    printf 'ERROR package-root-missing\n'
    SCAN_ERROR_COUNT=$((SCAN_ERROR_COUNT + 1))
    return
  fi

  while IFS= read -r -d '' file; do
    scan_text_file package "$root" "$file"
  done < <(
    find "$package_root" \
      \( -type d \( -name node_modules -o -name dist -o -name coverage \) -prune \) \
      -o -type f -print0
  )
}

discover_support_files() {
  local root="$1"
  local support_root="$root/.planning/phases/08-process-lifecycle"
  local file

  if [ ! -d "$support_root" ]; then
    printf 'ERROR support-root-missing\n'
    SCAN_ERROR_COUNT=$((SCAN_ERROR_COUNT + 1))
    return
  fi

  while IFS= read -r -d '' file; do
    if [ -x "$file" ] || [[ "$file" == *.sh ]] || [[ "$file" == *.patch ]]; then
      scan_text_file support "$root" "$file"
    fi
  done < <(find "$support_root" -mindepth 1 -maxdepth 1 -type f -print0)
}

parse_register() {
  local security_file="$1"
  local heading_count
  local in_register=0
  local header_seen=0
  local delimiter_seen=0
  local line
  local digits
  local index

  if [ ! -f "$security_file" ]; then
    printf 'ERROR register-file-missing\n'
    return 1
  fi

  heading_count="$(LC_ALL=C grep -cFx '## Threat Register' "$security_file" || true)"
  if [ "$heading_count" -ne 1 ]; then
    printf 'ERROR register-heading-count=%s\n' "$heading_count"
    return 1
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    if [ "$in_register" -eq 0 ]; then
      if [ "$line" = '## Threat Register' ]; then
        in_register=1
      fi
      continue
    fi

    if [[ "$line" == '## '* ]]; then
      break
    fi

    if [ "$header_seen" -eq 0 ]; then
      case "$line" in
        '|'*)
          if [ "$line" != "$REGISTER_HEADER" ]; then
            printf 'ERROR register-header-mismatch\n'
            return 1
          fi
          header_seen=1
          ;;
      esac
      continue
    fi

    if [ "$delimiter_seen" -eq 0 ]; then
      if [ "$line" != "$REGISTER_DELIMITER" ]; then
        printf 'ERROR register-delimiter-mismatch\n'
        return 1
      fi
      delimiter_seen=1
      continue
    fi

    if [[ "$line" =~ ^\|\ \*\*T-08-([0-9]+)\*\* ]]; then
      digits="${BASH_REMATCH[1]}"
      if [ "${#digits}" -ne 2 ]; then
        printf 'ERROR malformed-register-id id=T-08-%s\n' "$digits"
        return 1
      fi
      index=$((10#$digits))
      if [ "$index" -eq 0 ]; then
        printf 'ERROR malformed-register-id id=T-08-%s\n' "$digits"
        return 1
      fi
      if [ "${REGISTER_SEEN[$index]:-0}" -ne 0 ]; then
        printf 'ERROR duplicate-register-id id=T-08-%s\n' "$digits"
        return 1
      fi
      REGISTER_SEEN[$index]=1
      REGISTER_NUMERIC_COUNT=$((REGISTER_NUMERIC_COUNT + 1))
      continue
    fi

    if [[ "$line" =~ ^\|\ \*\*T-08-SC\*\* ]]; then
      REGISTER_SENTINEL_COUNT=$((REGISTER_SENTINEL_COUNT + 1))
      if [ "$REGISTER_SENTINEL_COUNT" -ne 1 ]; then
        printf 'ERROR duplicate-register-id id=T-08-SC\n'
        return 1
      fi
    fi
  done < "$security_file"

  if [ "$in_register" -ne 1 ] || [ "$header_seen" -ne 1 ] || [ "$delimiter_seen" -ne 1 ]; then
    printf 'ERROR register-parser-incomplete\n'
    return 1
  fi

  if [ "$REGISTER_NUMERIC_COUNT" -eq 0 ]; then
    printf 'ERROR register-numeric-empty\n'
    return 1
  fi

  return 0
}

require_path_sentinel() {
  local family="$1"
  local id="$2"
  local seen=0

  if [ "$family" = package ]; then
    seen="${PACKAGE_FILE_ID_SEEN[$id]:-0}"
  else
    seen="${SUPPORT_FILE_ID_SEEN[$id]:-0}"
  fi

  if [ "$seen" -ne 1 ]; then
    printf 'ERROR liveness-sentinel-missing family=%s id=T-08-%02d\n' "$family" "$id"
    return 1
  fi
  return 0
}

check_register_range() {
  local errors=0
  local id

  for ((id = 1; id <= 88; id++)); do
    if [ "${REGISTER_SEEN[$id]:-0}" -ne 1 ]; then
      printf 'ERROR register-row-missing id=T-08-%02d\n' "$id"
      errors=$((errors + 1))
    fi
  done

  if [ "$REGISTER_NUMERIC_COUNT" -ne 88 ]; then
    errors=$((errors + 1))
  fi
  if [ "$REGISTER_SENTINEL_COUNT" -ne 1 ]; then
    printf 'ERROR register-row-missing id=T-08-SC\n'
    errors=$((errors + 1))
  fi

  return "$errors"
}

check_live_join() {
  local errors=0
  local id

  for ((id = 1; id <= 99; id++)); do
    if [ -n "${PACKAGE_PATH[$id]:-}" ] && [ "${REGISTER_SEEN[$id]:-0}" -ne 1 ]; then
      printf 'ERROR unregistered-live-citation family=package id=T-08-%02d path=%s\n' \
        "$id" "${PACKAGE_PATH[$id]}"
      errors=$((errors + 1))
    fi
    if [ -n "${SUPPORT_PATH[$id]:-}" ] && [ "${REGISTER_SEEN[$id]:-0}" -ne 1 ]; then
      printf 'ERROR unregistered-live-citation family=support id=T-08-%02d path=%s\n' \
        "$id" "${SUPPORT_PATH[$id]}"
      errors=$((errors + 1))
    fi
  done

  return "$errors"
}

run_gate() {
  local root="$1"
  local mode="${2:-default}"
  local security_file="$root/.planning/phases/08-process-lifecycle/08-SECURITY.md"
  local errors=0

  reset_state
  discover_package_files "$root"
  discover_support_files "$root"

  if [ "$NEWLINE_PATH_COUNT" -ne 0 ]; then
    printf 'ERROR %s count=%d\n' "$NEWLINE_PATH_LABEL" "$NEWLINE_PATH_COUNT"
    return 1
  fi

  if ! parse_register "$security_file"; then
    return 1
  fi

  # This liveness record deliberately precedes every missing-row/join diagnostic.
  printf 'register_numeric=%d register_sentinel=%d\n' \
    "$REGISTER_NUMERIC_COUNT" "$REGISTER_SENTINEL_COUNT"

  if [ "$PACKAGE_TEXT_COUNT" -eq 0 ]; then
    printf 'ERROR package-discovery-empty\n'
    errors=$((errors + 1))
  fi
  if [ "$SUPPORT_TEXT_COUNT" -eq 0 ]; then
    printf 'ERROR support-discovery-empty\n'
    errors=$((errors + 1))
  fi

  require_path_sentinel package 55 || errors=$((errors + 1))
  require_path_sentinel package 59 || errors=$((errors + 1))
  require_path_sentinel package 75 || errors=$((errors + 1))
  require_path_sentinel support 67 || errors=$((errors + 1))
  require_path_sentinel support 76 || errors=$((errors + 1))

  if [ "$mode" = self-scan ]; then
    if [ "$FOUND_PRODUCTION_GATE" -ne 1 ]; then
      printf 'ERROR support-self-scan-missing id=T-08-84\n'
      errors=$((errors + 1))
    fi
    if [ "$FOUND_INDEPENDENT_TEST" -ne 1 ]; then
      printf 'ERROR support-self-scan-missing id=T-08-88\n'
      errors=$((errors + 1))
    fi
  fi

  check_register_range || errors=$((errors + $?))
  check_live_join || errors=$((errors + $?))
  errors=$((errors + SCAN_ERROR_COUNT))

  if [ "$errors" -ne 0 ]; then
    printf 'threat-register-gate.sh: FAIL errors=%d\n' "$errors"
    return 1
  fi

  printf 'threat-register-gate.sh: PASS packages=%d support=%d register=%d+SC\n' \
    "$PACKAGE_TEXT_COUNT" "$SUPPORT_TEXT_COUNT" "$REGISTER_NUMERIC_COUNT"
  return 0
}

write_fixture_register() {
  local root="$1"
  local variant="${2:-valid}"
  local security="$root/.planning/phases/08-process-lifecycle/08-SECURITY.md"
  local id
  local malformed_prefix='T-08-'
  local malformed_digits='0''01'

  {
    if [ "$variant" = wrong-heading ]; then
      printf '%s\n\n' '## STRIDE Threat Register'
    else
      printf '%s\n\n' '## Threat Register'
    fi
    printf '%s\n' "$REGISTER_HEADER"
    printf '%s\n' "$REGISTER_DELIMITER"
    for ((id = 1; id <= 88; id++)); do
      if [ "$variant" = gap ] && [ "$id" -eq 57 ]; then
        continue
      fi
      printf '| **T-08-%02d** | Test | fixture | low | mitigate | fixture evidence | closed |\n' "$id"
      if [ "$variant" = duplicate ] && [ "$id" -eq 57 ]; then
        printf '| **T-08-%02d** | Test | duplicate fixture | low | mitigate | fixture evidence | closed |\n' "$id"
      fi
    done
    if [ "$variant" = malformed ]; then
      printf '| **%s%s** | Test | malformed fixture | low | mitigate | fixture evidence | closed |\n' \
        "$malformed_prefix" "$malformed_digits"
    fi
    printf '| **T-08-SC** | Test | fixture | n/a | accept | zero packages | closed |\n'
    printf '\n## Accepted Risks Log\n'
  } > "$security"
}

write_fixture_sources() {
  local root="$1"
  local package_file="$root/packages/backend/src/kill-plan.ts"
  local support_dir="$root/.planning/phases/08-process-lifecycle"

  mkdir -p "$(dirname "$package_file")" "$support_dir"
  printf '%s\n' 'T-08-55 T-08-59 T-08-75' > "$package_file"
  printf '%s\n' 'T-08-67' > "$support_dir/verify-a1-patch.sh"
  printf '%s\n' 'T-08-76' > "$support_dir/a1-probe-fix.patch"
  printf '%s\n' 'T-08-84' > "$support_dir/peer-fixture.sh"
}

invoke_fixture() {
  local root="$1"
  bash "$SCRIPT_PATH" --root "$root" 2>&1
}

self_test_fail() {
  printf 'threat-register-gate.sh --self-test: FAIL label=%s\n' "$1"
  return 1
}

expect_fixture_failure() {
  local root="$1"
  local label="$2"
  local expected="${3:-}"
  local forbidden="${4:-}"
  local output
  local status

  output="$(invoke_fixture "$root")"
  status=$?
  if [ "$status" -eq 0 ]; then
    self_test_fail "$label-status"
    return 1
  fi
  if [ -n "$expected" ] && [[ "$output" != *"$expected"* ]]; then
    self_test_fail "$label-expected"
    return 1
  fi
  if [ -n "$forbidden" ] && [[ "$output" == *"$forbidden"* ]]; then
    self_test_fail "$label-confidentiality"
    return 1
  fi
  return 0
}

run_self_test() {
  local fixture
  local support_dir
  local package_dir
  local output
  local status
  local prefix='T-08-'
  local missing_digits='8''9'
  local missing_id="${prefix}${missing_digits}"
  local canary='drift-canary-7a91c4e2b653'
  local name
  local relative
  local file
  local newline_file
  local -a adversarial_names

  fixture="$(mktemp -d "${TMPDIR:-/tmp}/drift-threat-register.XXXXXX")" || {
    self_test_fail temp-root
    return 1
  }
  SELF_TEST_FIXTURE="$fixture"
  trap cleanup_self_test_fixture EXIT

  support_dir="$fixture/.planning/phases/08-process-lifecycle"
  package_dir="$fixture/packages/adversarial"
  write_fixture_sources "$fixture"
  write_fixture_register "$fixture" valid

  output="$(invoke_fixture "$fixture")"
  status=$?
  if [ "$status" -ne 0 ] || [[ "$output" != *'register_numeric=88 register_sentinel=1'* ]]; then
    self_test_fail valid-baseline
    return 1
  fi

  printf '%s canary=%s\n' "$missing_id" "$canary" > "$fixture/packages/missing-live.ts"
  expect_fixture_failure "$fixture" package-join \
    "id=$missing_id path=packages/missing-live.ts" "$canary" || return 1
  rm -f -- "$fixture/packages/missing-live.ts"

  printf '%s canary=%s\n' "$missing_id" "$canary" > "$support_dir/peer-fixture.sh"
  expect_fixture_failure "$fixture" support-join \
    "id=$missing_id path=.planning/phases/08-process-lifecycle/peer-fixture.sh" "$canary" || return 1
  printf '%s\n' 'T-08-84' > "$support_dir/peer-fixture.sh"

  printf '%s\n' "$missing_id" >> "$support_dir/08-SECURITY.md"
  printf '%s\n' "$missing_id" > "$fixture/packages/outside-table.ts"
  expect_fixture_failure "$fixture" bounded-register \
    "id=$missing_id path=packages/outside-table.ts" || return 1
  rm -f -- "$fixture/packages/outside-table.ts"
  write_fixture_register "$fixture" valid

  write_fixture_register "$fixture" duplicate
  expect_fixture_failure "$fixture" duplicate-row 'duplicate-register-id id=T-08-57' || return 1
  write_fixture_register "$fixture" gap
  expect_fixture_failure "$fixture" gap-row 'register-row-missing id=T-08-57' || return 1
  write_fixture_register "$fixture" wrong-heading
  expect_fixture_failure "$fixture" wrong-heading 'register-heading-count=0' || return 1
  write_fixture_register "$fixture" malformed
  expect_fixture_failure "$fixture" malformed-row 'malformed-register-id' || return 1
  write_fixture_register "$fixture" valid

  adversarial_names=(
    'with space'
    $'with\ttab'
    "single'quote"
    'double"quote'
    'glob*?['
  )

  mkdir -p "$package_dir"
  for name in "${adversarial_names[@]}"; do
    file="$package_dir/$name.ts"
    relative="${file#"$fixture"/}"
    printf '%s\n' "$missing_id" > "$file"
    expect_fixture_failure "$fixture" package-adversarial "id=$missing_id path=$relative" || return 1
    printf '%s\n' 'T-08-55' > "$file"
  done

  for name in "${adversarial_names[@]}"; do
    file="$support_dir/$name.sh"
    relative="${file#"$fixture"/}"
    printf '%s\n' "$missing_id" > "$file"
    expect_fixture_failure "$fixture" support-adversarial "id=$missing_id path=$relative" || return 1
    printf '%s\n' 'T-08-67' > "$file"
  done

  newline_file="$package_dir/unsafe"$'\n'"path.ts"
  printf '%s\n' "$missing_id" > "$newline_file"
  expect_fixture_failure "$fixture" newline-path "$NEWLINE_PATH_LABEL" "$missing_id" || return 1
  rm -f -- "$newline_file"

  rm -rf -- "$fixture/packages"
  mkdir -p "$fixture/packages"
  expect_fixture_failure "$fixture" package-empty 'package-discovery-empty' || return 1
  rm -rf -- "$fixture/.planning/phases/08-process-lifecycle"
  mkdir -p "$fixture/.planning/phases/08-process-lifecycle"
  write_fixture_register "$fixture" valid
  expect_fixture_failure "$fixture" support-empty 'support-discovery-empty' || return 1

  cleanup_self_test_fixture
  SELF_TEST_FIXTURE=''
  trap - EXIT
  printf 'threat-register-gate.sh --self-test: PASS\n'
  return 0
}

usage() {
  printf 'usage: threat-register-gate.sh [--self-test | --self-scan | --root PATH]\n'
}

case "${1:-}" in
  '')
    run_gate "$REPOSITORY_ROOT"
    ;;
  --self-test)
    if [ "$#" -ne 1 ]; then
      usage
      exit 2
    fi
    run_self_test
    ;;
  --self-scan)
    if [ "$#" -ne 1 ]; then
      usage
      exit 2
    fi
    run_gate "$REPOSITORY_ROOT" self-scan
    ;;
  --root)
    if [ "$#" -ne 2 ] || [ ! -d "$2" ]; then
      usage
      exit 2
    fi
    run_gate "$(cd "$2" && pwd)"
    ;;
  *)
    usage
    exit 2
    ;;
esac
