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
LEDGER_HEADING='## T-08-51..T-08-94 Roll-up Evidence Ledger'
LEDGER_HEADER='| Threat ID | Severity | Disposition | Owner | Evidence | Outcome |'
LEDGER_DELIMITER='|-----------|----------|-------------|-------|----------|---------|'
NEWLINE_PATH_LABEL='newline-path-rejected'
SECURITY_RELATIVE='.planning/phases/08-process-lifecycle/08-SECURITY.md'
REGISTER_MAX=94
LEDGER_MIN=51
EXPECTED_LEDGER_COUNT=44
EXPECTED_ACCEPTED_RESIDUALS=13
EXPECTED_FORMER_PACKAGE_COMMITS=64

declare -a REGISTER_SEEN
declare -a REGISTER_SEVERITY
declare -a REGISTER_DISPOSITION
declare -a REGISTER_MITIGATION
declare -a REGISTER_STATUS
declare -a LEDGER_SEEN
declare -a PACKAGE_PATH
declare -a SUPPORT_PATH
declare -a PACKAGE_FILE_ID_SEEN
declare -a SUPPORT_FILE_ID_SEEN
declare -a PACKAGE_FILES
declare -a SUPPORT_FILES

REGISTER_NUMERIC_COUNT=0
REGISTER_SENTINEL_COUNT=0
PACKAGE_TEXT_COUNT=0
SUPPORT_TEXT_COUNT=0
NEWLINE_PATH_COUNT=0
SCAN_ERROR_COUNT=0
FOUND_PRODUCTION_GATE=0
FOUND_INDEPENDENT_TEST=0
LEDGER_COUNT=0
SELF_TEST_FIXTURE=''

cleanup_self_test_fixture() {
  if [ -n "$SELF_TEST_FIXTURE" ] && [ -d "$SELF_TEST_FIXTURE" ]; then
    rm -rf -- "$SELF_TEST_FIXTURE" >/dev/null 2>&1
  fi
}

reset_state() {
  REGISTER_SEEN=()
  REGISTER_SEVERITY=()
  REGISTER_DISPOSITION=()
  REGISTER_MITIGATION=()
  REGISTER_STATUS=()
  LEDGER_SEEN=()
  PACKAGE_PATH=()
  SUPPORT_PATH=()
  PACKAGE_FILE_ID_SEEN=()
  SUPPORT_FILE_ID_SEEN=()
  PACKAGE_FILES=()
  SUPPORT_FILES=()
  REGISTER_NUMERIC_COUNT=0
  REGISTER_SENTINEL_COUNT=0
  PACKAGE_TEXT_COUNT=0
  SUPPORT_TEXT_COUNT=0
  NEWLINE_PATH_COUNT=0
  SCAN_ERROR_COUNT=0
  FOUND_PRODUCTION_GATE=0
  FOUND_INDEPENDENT_TEST=0
  LEDGER_COUNT=0
}

trim_cell() {
  local value="$1"

  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

normalize_enum_cell() {
  local value

  value="$(trim_cell "$1")"
  value="${value//\*/}"
  printf '%s' "$value"
}

normalize_severity_cell() {
  local value

  value="$(normalize_enum_cell "$1")"
  case "$value" in
    critical*) printf '%s' critical ;;
    high*) printf '%s' high ;;
    medium*) printf '%s' medium ;;
    low*) printf '%s' low ;;
    *) printf '%s' "$value" ;;
  esac
}

pipe_count() {
  local pipes="${1//[^|]/}"
  printf '%d' "${#pipes}"
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
      packages/backend/src/mcp-lifecycle.ts:89)
        PACKAGE_FILE_ID_SEEN[89]=1
        ;;
      packages/backend/src/mcp-lifecycle.ts:90)
        PACKAGE_FILE_ID_SEEN[90]=1
        ;;
      packages/backend/src/owned-temp-file.ts:91)
        PACKAGE_FILE_ID_SEEN[91]=1
        ;;
      packages/backend/src/owned-temp-file.ts:92)
        PACKAGE_FILE_ID_SEEN[92]=1
        ;;
      packages/backend/src/mcp-runtime-artifacts.ts:93)
        PACKAGE_FILE_ID_SEEN[93]=1
        ;;
      packages/backend/src/mcp-runtime-artifacts.ts:94)
        PACKAGE_FILE_ID_SEEN[94]=1
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

discover_text_file() {
  local family="$1"
  local root="$2"
  local absolute="$3"
  local relative
  local next_index

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

  if [ ! -r "$absolute" ]; then
    printf 'ERROR unreadable-file family=%s path=%s\n' "$family" "$relative"
    SCAN_ERROR_COUNT=$((SCAN_ERROR_COUNT + 1))
    return
  fi

  # Empty and binary files cannot carry a citation and are not text-bearing.
  if ! LC_ALL=C grep -Iq . -- "$absolute" 2>/dev/null; then
    return
  fi

  if [ "$family" = package ]; then
    next_index="${#PACKAGE_FILES[@]}"
    PACKAGE_FILES[$next_index]="$absolute"
    PACKAGE_TEXT_COUNT=$((PACKAGE_TEXT_COUNT + 1))
  else
    next_index="${#SUPPORT_FILES[@]}"
    SUPPORT_FILES[$next_index]="$absolute"
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

}

scan_citations_in_file() {
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

  while IFS= read -r token; do
    [ -n "$token" ] || continue
    record_citation "$family" "$relative" "$token"
  done < <(LC_ALL=C grep -Eo 'T-08-[0-9]+' -- "$absolute" 2>/dev/null || true)
}

scan_collected_citations() {
  local root="$1"
  local index

  for ((index = 0; index < ${#PACKAGE_FILES[@]}; index++)); do
    scan_citations_in_file package "$root" "${PACKAGE_FILES[$index]}"
  done
  for ((index = 0; index < ${#SUPPORT_FILES[@]}; index++)); do
    scan_citations_in_file support "$root" "${SUPPORT_FILES[$index]}"
  done
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
    discover_text_file package "$root" "$file"
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
      discover_text_file support "$root" "$file"
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
  local leading
  local id_cell
  local category
  local component
  local severity
  local disposition
  local mitigation
  local status
  local trailing

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
      if [ "$(pipe_count "$line")" -ne 8 ]; then
        printf 'ERROR register-column-count id=T-08-%s\n' "$digits"
        return 1
      fi
      IFS='|' read -r leading id_cell category component severity disposition mitigation status trailing <<< "$line"
      REGISTER_SEVERITY[$index]="$(normalize_severity_cell "$severity")"
      REGISTER_DISPOSITION[$index]="$(normalize_enum_cell "$disposition")"
      REGISTER_MITIGATION[$index]="$(trim_cell "$mitigation")"
      REGISTER_STATUS[$index]="$(normalize_enum_cell "$status")"
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

  for ((id = 1; id <= REGISTER_MAX; id++)); do
    if [ "${REGISTER_SEEN[$id]:-0}" -ne 1 ]; then
      printf 'ERROR register-row-missing id=T-08-%02d\n' "$id"
      errors=$((errors + 1))
    fi
  done

  if [ "$REGISTER_NUMERIC_COUNT" -ne "$REGISTER_MAX" ]; then
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

read_frontmatter_value() {
  local security_file="$1"
  local key="$2"

  awk -v key="$key" '
    NR == 1 && $0 == "---" { in_frontmatter=1; next }
    in_frontmatter && $0 == "---" { in_frontmatter=0; exit }
    in_frontmatter && index($0, key ":") == 1 {
      count += 1
      sub("^" key ":[[:space:]]*", "")
      value=$0
    }
    END {
      if (count == 1) print value
      else exit 1
    }
  ' "$security_file"
}

check_frontmatter_value() {
  local security_file="$1"
  local key="$2"
  local expected="$3"
  local actual

  actual="$(read_frontmatter_value "$security_file" "$key")" || {
    printf 'ERROR security-frontmatter-field-count path=%s\n' "$SECURITY_RELATIVE"
    return 1
  }
  if [ "$actual" != "$expected" ]; then
    printf 'ERROR security-frontmatter-mismatch path=%s\n' "$SECURITY_RELATIVE"
    return 1
  fi
  return 0
}

parse_evidence_ledger() {
  local security_file="$1"
  local heading_count
  local in_ledger=0
  local header_seen=0
  local delimiter_seen=0
  local line
  local digits
  local index
  local leading
  local id_cell
  local severity
  local disposition
  local owner
  local evidence
  local outcome
  local trailing
  local expected_source
  local expected_test

  heading_count="$(LC_ALL=C grep -cFx "$LEDGER_HEADING" "$security_file" || true)"
  if [ "$heading_count" -ne 1 ]; then
    printf 'ERROR ledger-heading-count=%s\n' "$heading_count"
    return 1
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    if [ "$in_ledger" -eq 0 ]; then
      if [ "$line" = "$LEDGER_HEADING" ]; then
        in_ledger=1
      fi
      continue
    fi
    if [[ "$line" == '## '* ]]; then
      break
    fi
    if [ "$header_seen" -eq 0 ]; then
      case "$line" in
        '|'*)
          if [ "$line" != "$LEDGER_HEADER" ]; then
            printf 'ERROR ledger-header-mismatch\n'
            return 1
          fi
          header_seen=1
          ;;
      esac
      continue
    fi
    if [ "$delimiter_seen" -eq 0 ]; then
      if [ "$line" != "$LEDGER_DELIMITER" ]; then
        printf 'ERROR ledger-delimiter-mismatch\n'
        return 1
      fi
      delimiter_seen=1
      continue
    fi
    if [[ "$line" =~ ^\|\ T-08-([0-9][0-9])\ \| ]]; then
      digits="${BASH_REMATCH[1]}"
      index=$((10#$digits))
      if [ "$index" -lt "$LEDGER_MIN" ] || [ "$index" -gt "$REGISTER_MAX" ]; then
        printf 'ERROR ledger-id-out-of-range id=T-08-%s\n' "$digits"
        return 1
      fi
      if [ "${LEDGER_SEEN[$index]:-0}" -ne 0 ]; then
        printf 'ERROR duplicate-ledger-id id=T-08-%s\n' "$digits"
        return 1
      fi
      if [ "$(pipe_count "$line")" -ne 7 ]; then
        printf 'ERROR ledger-column-count id=T-08-%s\n' "$digits"
        return 1
      fi
      IFS='|' read -r leading id_cell severity disposition owner evidence outcome trailing <<< "$line"
      severity="$(normalize_enum_cell "$severity")"
      disposition="$(normalize_enum_cell "$disposition")"
      owner="$(trim_cell "$owner")"
      evidence="$(trim_cell "$evidence")"
      outcome="$(trim_cell "$outcome")"
      if [ "$severity" != "${REGISTER_SEVERITY[$index]:-}" ] ||
        [ "$disposition" != "${REGISTER_DISPOSITION[$index]:-}" ]; then
        printf 'ERROR ledger-register-mismatch id=T-08-%s\n' "$digits"
        return 1
      fi
      case "$owner" in
        six2dez:implementation|six2dez:risk-acceptance|six2dez:evidence-coordination) ;;
        *)
          printf 'ERROR ledger-owner-invalid id=T-08-%s\n' "$digits"
          return 1
          ;;
      esac
      if [ -z "$evidence" ] || [ -z "$outcome" ] ||
        [[ "$evidence" == *TBD* ]] || [[ "$outcome" == *TBD* ]]; then
        printf 'ERROR ledger-evidence-empty id=T-08-%s\n' "$digits"
        return 1
      fi
      expected_source=''
      expected_test=''
      case "$index" in
        89|90)
          expected_source='mcp-lifecycle.ts'
          expected_test='mcp-lifecycle.test.ts'
          ;;
        91|92)
          expected_source='owned-temp-file.ts'
          expected_test='owned-temp-file.test.ts'
          ;;
        93|94)
          expected_source='mcp-runtime-artifacts.ts'
          expected_test='mcp-runtime-artifacts.test.ts'
          ;;
      esac
      if [ -n "$expected_source" ] &&
        { [[ "$evidence" != *"$expected_source"* ]] || [[ "$evidence" != *"$expected_test"* ]]; }; then
        printf 'ERROR ledger-evidence-mapping id=T-08-%s\n' "$digits"
        return 1
      fi
      LEDGER_SEEN[$index]=1
      LEDGER_COUNT=$((LEDGER_COUNT + 1))
    fi
  done < "$security_file"

  if [ "$in_ledger" -ne 1 ] || [ "$header_seen" -ne 1 ] || [ "$delimiter_seen" -ne 1 ]; then
    printf 'ERROR ledger-parser-incomplete\n'
    return 1
  fi
  for ((index = LEDGER_MIN; index <= REGISTER_MAX; index++)); do
    if [ "${LEDGER_SEEN[$index]:-0}" -ne 1 ]; then
      printf 'ERROR ledger-row-missing id=T-08-%02d\n' "$index"
      return 1
    fi
  done
  if [ "$LEDGER_COUNT" -ne "$EXPECTED_LEDGER_COUNT" ]; then
    printf 'ERROR ledger-row-count=%d\n' "$LEDGER_COUNT"
    return 1
  fi
  return 0
}

check_aggregate_integrity() {
  local security_file="$1"
  local errors=0
  local id
  local severity
  local disposition
  local mitigation
  local status
  local accepted_rows=0
  local open_blocking=0
  local accepted_risk_rows
  local front_status
  local front_open

  for ((id = 1; id <= REGISTER_MAX; id++)); do
    severity="${REGISTER_SEVERITY[$id]:-}"
    disposition="${REGISTER_DISPOSITION[$id]:-}"
    mitigation="${REGISTER_MITIGATION[$id]:-}"
    status="${REGISTER_STATUS[$id]:-}"
    case "$severity" in critical|high|medium|low) ;; *)
      printf 'ERROR register-severity-invalid id=T-08-%02d\n' "$id"
      errors=$((errors + 1))
      ;;
    esac
    case "$disposition" in mitigate|accept|transfer) ;; *)
      printf 'ERROR register-disposition-invalid id=T-08-%02d\n' "$id"
      errors=$((errors + 1))
      ;;
    esac
    if [ "$disposition" = accept ]; then
      accepted_rows=$((accepted_rows + 1))
    fi
    if { [ "$severity" = high ] || [ "$severity" = critical ]; } &&
      [ "$disposition" = mitigate ]; then
      if [ -z "$mitigation" ] || [ "$mitigation" = '-' ] || [[ "$status" != closed* ]]; then
        printf 'ERROR open-high-mitigation id=T-08-%02d\n' "$id"
        open_blocking=$((open_blocking + 1))
      fi
    fi
  done

  accepted_risk_rows="$(LC_ALL=C grep -Ec '^\| \*\*AR-[0-9][0-9]\*\* \|' "$security_file" || true)"
  if [ "$accepted_risk_rows" -ne "$EXPECTED_ACCEPTED_RESIDUALS" ] ||
    [ "$accepted_rows" -ne "$EXPECTED_ACCEPTED_RESIDUALS" ]; then
    printf 'ERROR accepted-residual-count=%d\n' "$accepted_risk_rows"
    errors=$((errors + 1))
  fi
  for ((id = 1; id <= EXPECTED_ACCEPTED_RESIDUALS; id++)); do
    if [ "$(LC_ALL=C grep -Ec "^\\| \\*\\*AR-$(printf '%02d' "$id")\\*\\* \\|" "$security_file" || true)" -ne 1 ]; then
      printf 'ERROR accepted-residual-row id=AR-%02d\n' "$id"
      errors=$((errors + 1))
    fi
  done

  check_frontmatter_value "$security_file" register_numeric_rows "$REGISTER_MAX" || errors=$((errors + 1))
  check_frontmatter_value "$security_file" register_sentinel_rows 1 || errors=$((errors + 1))
  check_frontmatter_value "$security_file" accepted_residuals "$EXPECTED_ACCEPTED_RESIDUALS" || errors=$((errors + 1))
  check_frontmatter_value "$security_file" former_baseline_package_commits "$EXPECTED_FORMER_PACKAGE_COMMITS" || errors=$((errors + 1))

  front_status="$(read_frontmatter_value "$security_file" status)" || front_status=''
  front_open="$(read_frontmatter_value "$security_file" threats_open)" || front_open='invalid'
  if [ "$front_open" != "$open_blocking" ]; then
    printf 'ERROR aggregate-open-high-count=%d\n' "$open_blocking"
    errors=$((errors + 1))
  fi
  if { [ "$open_blocking" -eq 0 ] && [ "$front_status" != secured ]; } ||
    { [ "$open_blocking" -ne 0 ] && [ "$front_status" = secured ]; }; then
    printf 'ERROR aggregate-status-mismatch count=%d\n' "$open_blocking"
    errors=$((errors + 1))
  fi
  return "$errors"
}

sha256_stream() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    return 1
  fi
}

check_audit_integrity() {
  local root="$1"
  local security_file="$2"
  local errors=0
  local audit_head
  local recorded_tree
  local recorded_digest
  local recorded_after
  local actual_tree
  local actual_digest
  local actual_after
  local latest_package_head

  audit_head="$(read_frontmatter_value "$security_file" audited_at_head)" || audit_head=''
  recorded_tree="$(read_frontmatter_value "$security_file" package_tree_at_audit)" || recorded_tree=''
  recorded_digest="$(read_frontmatter_value "$security_file" package_tree_sha256_at_audit)" || recorded_digest=''
  recorded_after="$(read_frontmatter_value "$security_file" package_commits_after_audit)" || recorded_after='invalid'

  if ! [[ "$audit_head" =~ ^[0-9a-f]{40}$ ]] ||
    ! git -C "$root" cat-file -e "${audit_head}^{commit}" 2>/dev/null; then
    printf 'ERROR audit-head-invalid path=%s\n' "$SECURITY_RELATIVE"
    return 1
  fi

  actual_tree="$(git -C "$root" rev-parse "${audit_head}:packages" 2>/dev/null)" || actual_tree=''
  actual_digest="$(git -C "$root" ls-tree -r "$audit_head" -- packages 2>/dev/null | sha256_stream)" || actual_digest=''
  actual_after="$(git -C "$root" rev-list --count "$audit_head"..HEAD -- packages/ 2>/dev/null)" || actual_after='invalid'
  latest_package_head="$(git -C "$root" log -1 --format=%H HEAD -- packages/ 2>/dev/null)" || latest_package_head=''

  if [ -z "$actual_tree" ] || [ "$recorded_tree" != "$actual_tree" ]; then
    printf 'ERROR audit-package-tree-mismatch path=%s\n' "$SECURITY_RELATIVE"
    errors=$((errors + 1))
  fi
  if [ -z "$actual_digest" ] || [ "$recorded_digest" != "$actual_digest" ]; then
    printf 'ERROR audit-package-digest-mismatch path=%s\n' "$SECURITY_RELATIVE"
    errors=$((errors + 1))
  fi
  if [ "$actual_after" != 0 ] || [ "$recorded_after" != "$actual_after" ]; then
    printf 'ERROR audit-package-commits-after=%s\n' "$actual_after"
    errors=$((errors + 1))
  fi
  if [ "$latest_package_head" != "$audit_head" ]; then
    printf 'ERROR audit-head-not-latest path=%s\n' "$SECURITY_RELATIVE"
    errors=$((errors + 1))
  fi
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

  # Citation parsing begins only after every pathname in both families passed
  # the repository-wide preflight. This makes newline refusal truly fail closed.
  scan_collected_citations "$root"

  if ! parse_register "$security_file"; then
    return 1
  fi

  # This liveness record deliberately precedes every missing-row/join diagnostic.
  printf 'register_numeric=%d register_sentinel=%d\n' \
    "$REGISTER_NUMERIC_COUNT" "$REGISTER_SENTINEL_COUNT"
  if ! check_register_range; then
    return 1
  fi
  if ! parse_evidence_ledger "$security_file"; then
    return 1
  fi

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
  require_path_sentinel package 89 || errors=$((errors + 1))
  require_path_sentinel package 90 || errors=$((errors + 1))
  require_path_sentinel package 91 || errors=$((errors + 1))
  require_path_sentinel package 92 || errors=$((errors + 1))
  require_path_sentinel package 93 || errors=$((errors + 1))
  require_path_sentinel package 94 || errors=$((errors + 1))
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

  check_live_join || errors=$((errors + $?))
  check_aggregate_integrity "$security_file" || errors=$((errors + $?))
  check_audit_integrity "$root" "$security_file" || errors=$((errors + $?))
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
  local disposition
  local severity
  local owner
  local evidence
  local audit_head
  local package_tree
  local package_digest
  local malformed_prefix='T-08-'
  local malformed_digits='0''01'

  audit_head="$(git -C "$root" rev-parse HEAD)" || return 1
  package_tree="$(git -C "$root" rev-parse "${audit_head}:packages")" || return 1
  package_digest="$(git -C "$root" ls-tree -r "$audit_head" -- packages | sha256_stream)" || return 1

  {
    printf '%s\n' '---'
    printf '%s\n' 'phase: 8' 'slug: process-lifecycle' 'status: secured' 'threats_open: 0'
    printf 'audited_at_head: %s\n' "$audit_head"
    printf 'package_tree_at_audit: %s\n' "$package_tree"
    printf 'package_tree_sha256_at_audit: %s\n' "$package_digest"
    printf 'former_baseline_package_commits: %d\n' "$EXPECTED_FORMER_PACKAGE_COMMITS"
    printf '%s\n' 'package_commits_after_audit: 0'
    printf 'register_numeric_rows: %d\n' "$REGISTER_MAX"
    printf '%s\n' 'register_sentinel_rows: 1'
    printf 'accepted_residuals: %d\n' "$EXPECTED_ACCEPTED_RESIDUALS"
    printf '%s\n\n' '---'
    printf '%s\n\n' '# Fixture Security Register'
    if [ "$variant" = wrong-heading ]; then
      printf '%s\n\n' '## STRIDE Threat Register'
    else
      printf '%s\n\n' '## Threat Register'
    fi
    printf '%s\n' "$REGISTER_HEADER"
    printf '%s\n' "$REGISTER_DELIMITER"
    for ((id = 1; id <= REGISTER_MAX; id++)); do
      if [ "$variant" = gap ] && [ "$id" -eq 57 ]; then
        continue
      fi
      disposition=mitigate
      case "$id" in 7|8|20|26|32|35|43|47|50|54|59|68|73) disposition=accept ;; esac
      severity=low
      if [ "$id" -ge 89 ]; then severity=high; fi
      printf '| **T-08-%02d** | Test | fixture | %s | %s | fixture evidence | closed |\n' \
        "$id" "$severity" "$disposition"
      if [ "$variant" = duplicate ] && [ "$id" -eq 57 ]; then
        printf '| **T-08-%02d** | Test | duplicate fixture | low | mitigate | fixture evidence | closed |\n' "$id"
      fi
    done
    if [ "$variant" = malformed ]; then
      printf '| **%s%s** | Test | malformed fixture | low | mitigate | fixture evidence | closed |\n' \
        "$malformed_prefix" "$malformed_digits"
    fi
    printf '| **T-08-SC** | Test | fixture | n/a | accept | zero packages | closed |\n'
    printf '\n%s\n\n' "$LEDGER_HEADING"
    printf '%s\n' "$LEDGER_HEADER" "$LEDGER_DELIMITER"
    for ((id = LEDGER_MIN; id <= REGISTER_MAX; id++)); do
      disposition=mitigate
      owner='six2dez:implementation'
      case "$id" in
        54|59|68|73)
          disposition=accept
          owner='six2dez:risk-acceptance'
          ;;
      esac
      severity=low
      if [ "$id" -ge 89 ]; then severity=high; fi
      evidence='fixture evidence'
      case "$id" in
        89|90) evidence='WR-01 mcp-lifecycle.ts and mcp-lifecycle.test.ts' ;;
        91|92) evidence='WR-02 owned-temp-file.ts and owned-temp-file.test.ts' ;;
        93|94) evidence='WR-03 mcp-runtime-artifacts.ts and mcp-runtime-artifacts.test.ts' ;;
      esac
      printf '| T-08-%02d | %s | %s | %s | %s | closed |\n' \
        "$id" "$severity" "$disposition" "$owner" "$evidence"
    done
    printf '\n## Accepted Risks Log\n\n'
    printf '%s\n' '| Risk ID | Threat Ref | Rationale | Not mitigable here because | Owner next | Accepted By | Date |'
    printf '%s\n' '|---------|------------|-----------|----------------------------|------------|-------------|------|'
    for ((id = 1; id <= EXPECTED_ACCEPTED_RESIDUALS; id++)); do
      printf '| **AR-%02d** | fixture | fixture | fixture | fixture | fixture | 2026-08-31 |\n' "$id"
    done
  } > "$security"
}

write_fixture_sources() {
  local root="$1"
  local package_dir="$root/packages/backend/src"
  local support_dir="$root/.planning/phases/08-process-lifecycle"

  mkdir -p "$package_dir" "$support_dir"
  printf '%s\n' 'T-08-55 T-08-59 T-08-75' > "$package_dir/kill-plan.ts"
  printf '%s\n' 'T-08-89 T-08-90' > "$package_dir/mcp-lifecycle.ts"
  printf '%s\n' 'T-08-91 T-08-92' > "$package_dir/owned-temp-file.ts"
  printf '%s\n' 'T-08-93 T-08-94' > "$package_dir/mcp-runtime-artifacts.ts"
  printf '%s\n' 'T-08-67' > "$support_dir/verify-a1-patch.sh"
  printf '%s\n' 'T-08-76' > "$support_dir/a1-probe-fix.patch"
  printf '%s\n' 'T-08-84' > "$support_dir/peer-fixture.sh"
}

initialize_fixture_repository() {
  local root="$1"

  git -C "$root" init -q >/dev/null 2>&1 || return 1
  git -C "$root" config user.name 'Drift Gate Fixture' || return 1
  git -C "$root" config user.email 'fixture@invalid.example' || return 1
  git -C "$root" add packages .planning || return 1
  git -C "$root" commit -qm 'fixture baseline' || return 1
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
  local missing_digits='9''5'
  local missing_id="${prefix}${missing_digits}"
  local canary='drift-canary-7a91c4e2b653'
  local name
  local relative
  local file
  local security_file
  local temporary
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
  security_file="$support_dir/08-SECURITY.md"
  write_fixture_sources "$fixture"
  initialize_fixture_repository "$fixture" || {
    self_test_fail fixture-git
    return 1
  }
  write_fixture_register "$fixture" valid

  output="$(invoke_fixture "$fixture")"
  status=$?
  if [ "$status" -ne 0 ] || [[ "$output" != *'register_numeric=94 register_sentinel=1'* ]]; then
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

  printf '%s\n' 'T-08-90' > "$fixture/packages/backend/src/mcp-lifecycle.ts"
  expect_fixture_failure "$fixture" new-citation-sentinel \
    'liveness-sentinel-missing family=package id=T-08-89' || return 1
  printf '%s\n' 'T-08-89 T-08-90' > "$fixture/packages/backend/src/mcp-lifecycle.ts"

  temporary="$security_file.tmp"
  awk 'index($0, "| T-08-89 |") == 0 { print }' "$security_file" > "$temporary" &&
    mv "$temporary" "$security_file"
  expect_fixture_failure "$fixture" missing-new-ledger \
    'ledger-row-missing id=T-08-89' || return 1
  write_fixture_register "$fixture" valid

  temporary="$security_file.tmp"
  awk '
    index($0, "**T-08-89**") != 0 { sub(/\| closed \|$/, "| open |") }
    { print }
  ' "$security_file" > "$temporary" && mv "$temporary" "$security_file"
  expect_fixture_failure "$fixture" false-aggregate-closure \
    'aggregate-open-high-count=1' || return 1
  write_fixture_register "$fixture" valid

  temporary="$security_file.tmp"
  awk '
    index($0, "**T-08-89**") != 0 {
      sub(/\| [^|]* \| closed[^|]*\|$/, "|  | closed |")
    }
    { print }
  ' "$security_file" > "$temporary" && mv "$temporary" "$security_file"
  expect_fixture_failure "$fixture" missing-high-mitigation \
    'open-high-mitigation id=T-08-89' || return 1
  write_fixture_register "$fixture" valid

  temporary="$security_file.tmp"
  awk '
    /^package_tree_sha256_at_audit:/ {
      print "package_tree_sha256_at_audit: 0000000000000000000000000000000000000000000000000000000000000000"
      next
    }
    { print }
  ' "$security_file" > "$temporary" && mv "$temporary" "$security_file"
  expect_fixture_failure "$fixture" stale-audit-digest \
    'audit-package-digest-mismatch' || return 1
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

  rm -rf -- "$fixture/.git" "$fixture/packages" "$fixture/.planning"
  write_fixture_sources "$fixture"
  initialize_fixture_repository "$fixture" || {
    self_test_fail fixture-git-reset
    return 1
  }
  support_dir="$fixture/.planning/phases/08-process-lifecycle"
  security_file="$support_dir/08-SECURITY.md"
  write_fixture_register "$fixture" valid
  printf '%s\n' 'T-08-55 T-08-59 T-08-75 fixture-drift' \
    > "$fixture/packages/backend/src/kill-plan.ts"
  git -C "$fixture" add packages/backend/src/kill-plan.ts || return 1
  git -C "$fixture" commit -qm 'package drift fixture' || return 1
  expect_fixture_failure "$fixture" package-commit-after-audit \
    'audit-package-commits-after=1' || return 1

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
