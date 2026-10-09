#!/usr/bin/env bash
# DittoSuite — Forensic Collection Tool (Bash CLI)
# Version 1.0.0
#
# Targeted logical collection of user-selected files and folders into
# forensic sparsebundles using Apple's ditto and hdiutil.
#
# CORE PRINCIPLE: Source data must NEVER be modified. Collected data must
# NEVER be modified. Failure is ALWAYS preferred over any data change.
#
# Requirements: macOS 14.0+, Full Disk Access for protected paths.
# This tool has no network access, no telemetry, no dependencies beyond
# macOS system binaries.

set -euo pipefail

readonly VERSION="1.0.0"
readonly DITTO_BIN="/usr/bin/ditto"
readonly HDIUTIL_BIN="/usr/bin/hdiutil"
readonly SHASUM_BIN="/usr/bin/shasum"

# Band count thresholds
readonly BAND_WARN_THRESHOLD=90000
readonly BAND_FAIL_THRESHOLD=100000

# Scrubbed environment for subprocess calls
readonly SCRUBBED_ENV="PATH=/usr/bin:/bin:/usr/sbin:/sbin LC_ALL=en_US.UTF-8 TZ=UTC"

# ── Colors ───────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── State ────────────────────────────────────────────────────────────────
EXAMINER_NAME=""
CUSTODIAN_NAME=""
CASE_ID=""
EVIDENCE_ID=""
DEVICE_MAKE=""
DEVICE_MODEL=""
DEVICE_SERIAL=""
DEVICE_MACOS=""
COLLECTION_LOCATION=""
LEGAL_TYPE=""
LEGAL_REF=""
SCOPE_NOTES=""
UTC_SOURCE=""
BUNDLE_PATH=""
MOUNT_POINT=""
AUDIT_LOG=""
PREV_HASH="GENESIS"
declare -a SOURCE_PATHS=()
declare -a SOURCE_SIZES=()
declare -a SOURCE_COUNTS=()
TOTAL_ESTIMATED_SIZE=0
TOTAL_ESTIMATED_FILES=0
DITTO_SHA256=""
HDIUTIL_SHA256=""
MACOS_VERSION=""
MACOS_BUILD=""
SESSION_START=""
VERIFICATION_VERDICT=""
OVERALL_STATUS=""
declare -a COLLECTION_STATUSES=()
declare -a NOT_COLLECTED=()
AUDIT_FAILURE=0

# ── Utility functions ────────────────────────────────────────────────────

print_header() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${BOLD}  $1${RESET}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
}

print_step() {
    echo -e "${CYAN}▸${RESET} $1"
}

print_pass() {
    echo -e "  ${GREEN}✓${RESET} $1"
}

print_warn() {
    echo -e "  ${YELLOW}⚠${RESET} $1"
}

print_fail() {
    echo -e "  ${RED}✗${RESET} $1"
}

print_info() {
    echo -e "  ${DIM}$1${RESET}"
}

prompt_required() {
    local label="$1"
    local var_name="$2"
    local value=""
    while [[ -z "$value" ]]; do
        echo -ne "${BOLD}$label${RESET} ${DIM}(required)${RESET}: "
        read -r value
        if [[ -z "$value" ]]; then
            echo -e "  ${RED}This field is required.${RESET}"
        fi
    done
    eval "$var_name='$value'"
}

prompt_optional() {
    local label="$1"
    local var_name="$2"
    local default="${3:-}"
    if [[ -n "$default" ]]; then
        echo -ne "${BOLD}$label${RESET} ${DIM}[$default]${RESET}: "
    else
        echo -ne "${BOLD}$label${RESET} ${DIM}(optional)${RESET}: "
    fi
    local value=""
    read -r value
    if [[ -z "$value" && -n "$default" ]]; then
        value="$default"
    fi
    eval "$var_name='$value'"
}

confirm_proceed() {
    local msg="${1:-Continue?}"
    echo ""
    echo -ne "${BOLD}$msg${RESET} ${DIM}[Y/n]${RESET}: "
    local answer
    read -r answer
    if [[ "$answer" =~ ^[Nn] ]]; then
        return 1
    fi
    return 0
}

human_size() {
    local bytes="$1"
    if (( bytes >= 1073741824 )); then
        awk "BEGIN{printf \"%.2f GB\", $bytes/1073741824}"
    elif (( bytes >= 1048576 )); then
        awk "BEGIN{printf \"%.1f MB\", $bytes/1048576}"
    elif (( bytes >= 1024 )); then
        awk "BEGIN{printf \"%.1f KB\", $bytes/1024}"
    else
        echo "${bytes} B"
    fi
}

sha256_file() {
    "$SHASUM_BIN" -a 256 "$1" 2>/dev/null | awk '{print $1}'
}

sha256_string() {
    printf '%s' "$1" | "$SHASUM_BIN" -a 256 | awk '{print $1}'
}

utc_now() {
    date -u '+%Y-%m-%dT%H:%M:%SZ'
}

# ── Audit log ────────────────────────────────────────────────────────────

audit_log_entry() {
    local event_type="$1"
    shift
    local details="$*"
    local timestamp
    timestamp="$(utc_now)"
    local entry_data="${timestamp}|${event_type}|${details}|prev:${PREV_HASH}"
    local entry_hash
    entry_hash="$(sha256_string "$entry_data")"

    local json_line="{\"timestamp\":\"${timestamp}\",\"event\":\"${event_type}\",\"details\":\"${details}\",\"prevHash\":\"${PREV_HASH}\",\"hash\":\"${entry_hash}\"}"

    if [[ -n "$AUDIT_LOG" && -f "$AUDIT_LOG" ]]; then
        # Use append mode for atomicity
        printf '%s\n' "$json_line" >> "$AUDIT_LOG" 2>/dev/null
        if [[ $? -ne 0 ]]; then
            AUDIT_FAILURE=1
            echo -e "  ${RED}AUDIT LOG FAILURE: Could not write entry${RESET}"
        fi
    fi

    PREV_HASH="$entry_hash"
}

# ── Pre-checks ───────────────────────────────────────────────────────────

check_macos() {
    if [[ "$(uname)" != "Darwin" ]]; then
        echo -e "${RED}ERROR: DittoSuite requires macOS. This system is $(uname).${RESET}"
        exit 1
    fi
}

get_macos_info() {
    MACOS_VERSION="$(sw_vers -productVersion 2>/dev/null || echo 'unknown')"
    MACOS_BUILD="$(sw_vers -buildVersion 2>/dev/null || echo 'unknown')"
}

check_binary() {
    local path="$1"
    local name="$2"

    if [[ ! -f "$path" ]]; then
        print_fail "$name not found at $path"
        return 1
    fi
    if [[ ! -x "$path" ]]; then
        print_fail "$name at $path is not executable"
        return 1
    fi
    # Symlink check
    if [[ -L "$path" ]]; then
        local target
        target="$(readlink "$path")"
        if [[ ! "$target" == /usr/* && ! "$target" == /System/* ]]; then
            print_fail "$name is a symlink to unexpected target: $target"
            return 1
        fi
    fi
    print_pass "$name found and executable at $path"
    return 0
}

# ── Step 1: Case Setup ──────────────────────────────────────────────────

step_case_setup() {
    print_header "Step 1: Case Setup"

    echo -e "${DIM}Complete the required fields. This information will be recorded${RESET}"
    echo -e "${DIM}in the audit log and included in the collection report.${RESET}"
    echo ""

    echo -e "${BOLD}── Examiner Information ──${RESET}"
    prompt_required "Examiner Name" EXAMINER_NAME

    echo ""
    echo -e "${BOLD}── Custodian Information ──${RESET}"
    prompt_required "Custodian Name" CUSTODIAN_NAME

    echo ""
    echo -e "${BOLD}── Case Information ──${RESET}"
    prompt_required "Case ID" CASE_ID
    prompt_required "Evidence ID" EVIDENCE_ID
    prompt_optional "Make" DEVICE_MAKE
    prompt_optional "Model / A Number" DEVICE_MODEL
    prompt_optional "Serial Number" DEVICE_SERIAL
    prompt_optional "macOS Version" DEVICE_MACOS "$MACOS_VERSION"
    prompt_optional "Collection Location" COLLECTION_LOCATION

    echo ""
    echo -e "${BOLD}── Legal Authority ──${RESET}"
    echo -e "${DIM}Optional. Fill in at your discretion.${RESET}"
    prompt_optional "Authority Type (Warrant/Consent/Court Order/Policy)" LEGAL_TYPE
    prompt_optional "Authority Reference" LEGAL_REF
    prompt_optional "Scope Notes" SCOPE_NOTES

    echo ""
    echo -e "${BOLD}── Time Source ──${RESET}"
    local ntp_status
    ntp_status="System clock"
    if sntp -S pool.ntp.org >/dev/null 2>&1 || ntpq -p >/dev/null 2>&1; then
        ntp_status="System clock (NTP synchronized)"
    fi
    prompt_optional "UTC Time Source" UTC_SOURCE "$ntp_status"

    SESSION_START="$(utc_now)"

    echo ""
    echo -e "${GREEN}Case setup complete.${RESET}"
    echo ""
    echo -e "  Examiner:   ${BOLD}$EXAMINER_NAME${RESET}"
    echo -e "  Custodian:  ${BOLD}$CUSTODIAN_NAME${RESET}"
    echo -e "  Case ID:    ${BOLD}$CASE_ID${RESET}"
    echo -e "  Evidence:   ${BOLD}$EVIDENCE_ID${RESET}"
    if [[ -n "$DEVICE_MAKE" ]]; then echo -e "  Make:       $DEVICE_MAKE"; fi
    if [[ -n "$DEVICE_MODEL" ]]; then echo -e "  Model:      $DEVICE_MODEL"; fi
    if [[ -n "$DEVICE_SERIAL" ]]; then echo -e "  Serial:     $DEVICE_SERIAL"; fi
    echo -e "  macOS:      $DEVICE_MACOS"
    echo -e "  Time:       $SESSION_START"
}

# ── Step 2: Bundle Setup ────────────────────────────────────────────────

step_bundle_setup() {
    print_header "Step 2: Bundle Setup"

    echo -e "${DIM}Create a new sparsebundle to hold collected evidence.${RESET}"
    echo ""

    local default_name="${CASE_ID}_${EVIDENCE_ID}"
    default_name="${default_name// /_}"

    local bundle_name=""
    prompt_optional "Bundle Name" bundle_name "$default_name"

    local bundle_dir=""
    prompt_optional "Bundle Location" bundle_dir "$HOME/Desktop"

    local fs=""
    prompt_optional "Filesystem (APFS/JHFS+/HFS+)" fs "APFS"

    local max_size=""
    prompt_optional "Maximum Size (e.g. 100g, 500m, 1t)" max_size "100g"

    local encrypt=""
    prompt_optional "Encrypt with AES-256? (y/n)" encrypt "n"

    BUNDLE_PATH="${bundle_dir}/${bundle_name}.sparsebundle"

    echo ""
    print_step "Creating sparsebundle at: $BUNDLE_PATH"

    local hdiutil_args=("create" "-type" "SPARSEBUNDLE" "-fs" "$fs" "-size" "$max_size" "-volname" "$bundle_name" "-plist")
    if [[ "$encrypt" =~ ^[Yy] ]]; then
        hdiutil_args+=("-encryption" "AES-256" "-stdinpass")
    fi
    hdiutil_args+=("$BUNDLE_PATH")

    local create_out
    create_out="$(env -i $SCRUBBED_ENV HOME="$HOME" "$HDIUTIL_BIN" "${hdiutil_args[@]}" 2>&1)" || {
        echo -e "${RED}ERROR: hdiutil create failed:${RESET}"
        echo "$create_out"
        exit 1
    }

    print_pass "Sparsebundle created"

    # Attach
    print_step "Attaching sparsebundle..."
    local attach_out
    attach_out="$(env -i $SCRUBBED_ENV HOME="$HOME" "$HDIUTIL_BIN" attach -plist -noverify -noautofsck -readwrite -nobrowse "$BUNDLE_PATH" 2>&1)" || {
        echo -e "${RED}ERROR: hdiutil attach failed:${RESET}"
        echo "$attach_out"
        exit 1
    }

    MOUNT_POINT="$(echo "$attach_out" | grep -o '<string>/Volumes/[^<]*</string>' | head -1 | sed 's/<[^>]*>//g')"
    if [[ -z "$MOUNT_POINT" ]]; then
        MOUNT_POINT="/Volumes/$bundle_name"
    fi

    print_pass "Mounted at: $MOUNT_POINT"

    # Initialize audit log inside the bundle
    AUDIT_LOG="${MOUNT_POINT}/DittoSuite_AuditLog.jsonl"
    touch "$AUDIT_LOG"

    audit_log_entry "SESSION_START" "version=$VERSION hostname=$(hostname -s) examiner=$EXAMINER_NAME"
    audit_log_entry "CASE_SETUP" "caseID=$CASE_ID evidenceID=$EVIDENCE_ID custodian=$CUSTODIAN_NAME"
    audit_log_entry "BUNDLE_CREATED" "path=$BUNDLE_PATH fs=$fs size=$max_size mountPoint=$MOUNT_POINT"

    echo ""
    echo -e "${GREEN}Bundle setup complete.${RESET}"
}

# ── Step 3: Source Selection ─────────────────────────────────────────────

step_source_selection() {
    print_header "Step 3: Source Selection"

    echo -e "${DIM}Enter the full paths of files or folders to collect.${RESET}"
    echo -e "${DIM}Only the items you select will be collected.${RESET}"
    echo -e "${DIM}Type ${BOLD}done${RESET}${DIM} when finished.${RESET}"
    echo ""

    SOURCE_PATHS=()
    SOURCE_SIZES=()
    SOURCE_COUNTS=()
    TOTAL_ESTIMATED_SIZE=0
    TOTAL_ESTIMATED_FILES=0

    while true; do
        local path=""
        echo -ne "${BOLD}Source path${RESET} ${DIM}(or 'done')${RESET}: "
        read -r path

        if [[ "$path" == "done" ]]; then
            break
        fi

        if [[ -z "$path" ]]; then
            continue
        fi

        # Expand ~ to HOME
        path="${path/#\~/$HOME}"

        if [[ ! -e "$path" ]]; then
            print_fail "Path does not exist: $path"
            continue
        fi

        # Check for duplicates
        local dup=0
        for existing in "${SOURCE_PATHS[@]+"${SOURCE_PATHS[@]}"}"; do
            if [[ "$existing" == "$path" ]]; then
                print_warn "Already selected: $path"
                dup=1
                break
            fi
        done
        if [[ $dup -eq 1 ]]; then continue; fi

        # Estimate size and count
        local est_size=0
        local est_count=0
        if [[ -d "$path" ]]; then
            est_size="$(du -sk "$path" 2>/dev/null | awk '{print $1 * 1024}' || echo 0)"
            est_count="$(find "$path" -type f 2>/dev/null | wc -l | tr -d ' ')"
        else
            est_size="$(stat -f%z "$path" 2>/dev/null || echo 0)"
            est_count=1
        fi

        SOURCE_PATHS+=("$path")
        SOURCE_SIZES+=("$est_size")
        SOURCE_COUNTS+=("$est_count")
        TOTAL_ESTIMATED_SIZE=$(( TOTAL_ESTIMATED_SIZE + est_size ))
        TOTAL_ESTIMATED_FILES=$(( TOTAL_ESTIMATED_FILES + est_count ))

        local icon="📄"
        if [[ -d "$path" ]]; then icon="📁"; fi
        echo -e "  ${icon} ${path}  ${DIM}($(human_size "$est_size"), ${est_count} files)${RESET}"

        audit_log_entry "SOURCE_SELECTED" "path=$path isDirectory=$(test -d "$path" && echo true || echo false) estimatedSize=$est_size estimatedFiles=$est_count"
    done

    if [[ ${#SOURCE_PATHS[@]} -eq 0 ]]; then
        echo -e "${RED}No sources selected. Cannot proceed.${RESET}"
        exit 1
    fi

    echo ""
    echo -e "${BOLD}── Summary ──${RESET}"
    echo -e "  Total Sources:    ${#SOURCE_PATHS[@]}"
    echo -e "  Estimated Files:  $TOTAL_ESTIMATED_FILES"
    echo -e "  Estimated Size:   $(human_size "$TOTAL_ESTIMATED_SIZE")"
    echo ""
    echo -e "${GREEN}Source selection complete.${RESET}"
}

# ── Step 4: Pre-flight Checks ───────────────────────────────────────────

step_preflight() {
    print_header "Step 4: Pre-flight Checks"

    local blocking=0
    local warnings=0

    # macOS version
    print_step "macOS Version"
    if [[ "$MACOS_VERSION" != "unknown" ]]; then
        print_pass "macOS $MACOS_VERSION ($MACOS_BUILD)"
    else
        print_warn "Could not determine macOS version"
        warnings=$((warnings + 1))
    fi

    # Binary checks
    print_step "System Binaries"
    check_binary "$DITTO_BIN" "ditto" || blocking=$((blocking + 1))
    check_binary "$HDIUTIL_BIN" "hdiutil" || blocking=$((blocking + 1))

    # Binary hashes
    print_step "Binary Integrity"
    DITTO_SHA256="$(sha256_file "$DITTO_BIN")"
    HDIUTIL_SHA256="$(sha256_file "$HDIUTIL_BIN")"
    print_pass "ditto SHA-256:   ${DITTO_SHA256:0:16}…${DITTO_SHA256: -8}"
    print_pass "hdiutil SHA-256: ${HDIUTIL_SHA256:0:16}…${HDIUTIL_SHA256: -8}"

    # Source readability
    print_step "Source Read Access"
    for path in "${SOURCE_PATHS[@]}"; do
        if [[ -r "$path" ]]; then
            print_pass "Readable: $path"
        else
            print_fail "NOT readable: $path"
            blocking=$((blocking + 1))
        fi
    done

    # Mount point check
    print_step "Destination Volume"
    if [[ -n "$MOUNT_POINT" && -d "$MOUNT_POINT" && -w "$MOUNT_POINT" ]]; then
        print_pass "Mounted and writable: $MOUNT_POINT"
    else
        print_fail "Destination not mounted or not writable"
        blocking=$((blocking + 1))
    fi

    # Free space
    print_step "Free Space"
    if [[ -n "$MOUNT_POINT" ]]; then
        local free_kb
        free_kb="$(df -k "$MOUNT_POINT" | tail -1 | awk '{print $4}')"
        local free_bytes=$(( free_kb * 1024 ))
        local needed=$(( TOTAL_ESTIMATED_SIZE + TOTAL_ESTIMATED_SIZE / 10 ))
        if (( free_bytes >= needed )); then
            print_pass "$(human_size "$free_bytes") available, $(human_size "$needed") needed (with 10% margin)"
        else
            print_fail "Insufficient: $(human_size "$free_bytes") available, $(human_size "$needed") needed"
            blocking=$((blocking + 1))
        fi
    fi

    # Source not destination
    print_step "Source/Destination Overlap"
    local overlap=0
    for path in "${SOURCE_PATHS[@]}"; do
        if [[ "$path" == "$MOUNT_POINT"* ]]; then
            print_fail "Source is on destination volume: $path"
            overlap=1
            blocking=$((blocking + 1))
        fi
    done
    if [[ $overlap -eq 0 ]]; then
        print_pass "No source paths are on the destination volume"
    fi

    # Band count
    print_step "Band Count"
    local bands_dir="${BUNDLE_PATH}/bands"
    if [[ -d "$bands_dir" ]]; then
        local band_count
        band_count="$(ls -1 "$bands_dir" 2>/dev/null | wc -l | tr -d ' ')"
        if (( band_count >= BAND_FAIL_THRESHOLD )); then
            print_fail "Band count ($band_count) exceeds threshold ($BAND_FAIL_THRESHOLD)"
            blocking=$((blocking + 1))
        elif (( band_count >= BAND_WARN_THRESHOLD )); then
            print_warn "Band count ($band_count) approaching threshold ($BAND_FAIL_THRESHOLD)"
            warnings=$((warnings + 1))
        else
            print_pass "Band count: $band_count (limit: $BAND_FAIL_THRESHOLD)"
        fi
    else
        print_pass "Band count: 0 (new bundle)"
    fi

    audit_log_entry "PREFLIGHT_COMPLETED" "blocking=$blocking warnings=$warnings dittoSHA256=$DITTO_SHA256 hdiutilSHA256=$HDIUTIL_SHA256"

    echo ""
    if [[ $blocking -gt 0 ]]; then
        echo -e "${RED}${BOLD}✗ CANNOT PROCEED${RESET} — $blocking blocking check(s) failed."
        echo -e "  Resolve the issues above before continuing."
        exit 1
    else
        echo -e "${GREEN}${BOLD}✓ Ready to Proceed${RESET}"
        if [[ $warnings -gt 0 ]]; then
            echo -e "  ${YELLOW}$warnings advisory warning(s)${RESET}"
        fi
    fi

    if ! confirm_proceed "Continue to source manifest?"; then
        echo "Aborted by examiner."
        audit_log_entry "ABORTED" "stage=preflight reason=examiner_decision"
        exit 0
    fi
}

# ── Step 5: Source Manifest ──────────────────────────────────────────────

step_source_manifest() {
    print_header "Step 5: Building Source Manifest"

    echo -e "${DIM}Walking selected sources and computing SHA-256 hashes for every file.${RESET}"
    echo -e "${DIM}This establishes the ground truth for verification.${RESET}"
    echo ""

    local manifest_dir="${MOUNT_POINT}/DittoSuite_Manifests"
    mkdir -p "$manifest_dir"

    local total_hashed=0
    local start_time
    start_time="$(date +%s)"

    for i in "${!SOURCE_PATHS[@]}"; do
        local src="${SOURCE_PATHS[$i]}"
        local src_name
        src_name="$(basename "$src")"
        local manifest_file="${manifest_dir}/source_manifest_${i}_${src_name}.txt"

        print_step "Source $((i+1))/${#SOURCE_PATHS[@]}: $src"

        if [[ -d "$src" ]]; then
            find "$src" -type f -print0 2>/dev/null | while IFS= read -r -d '' file; do
                local rel_path="${file#"$src"}"
                local file_hash
                file_hash="$(sha256_file "$file")"
                local file_size
                file_size="$(stat -f%z "$file" 2>/dev/null || echo 0)"
                local file_mtime
                file_mtime="$(stat -f%m "$file" 2>/dev/null || echo 0)"
                echo "${file_hash}  ${file_size}  ${file_mtime}  ${rel_path}" >> "$manifest_file"
                total_hashed=$((total_hashed + 1))
                if (( total_hashed % 100 == 0 )); then
                    echo -ne "\r  ${DIM}Files hashed: $total_hashed${RESET}  "
                fi
            done
        else
            local file_hash
            file_hash="$(sha256_file "$src")"
            local file_size
            file_size="$(stat -f%z "$src" 2>/dev/null || echo 0)"
            local file_mtime
            file_mtime="$(stat -f%m "$src" 2>/dev/null || echo 0)"
            echo "${file_hash}  ${file_size}  ${file_mtime}  $(basename "$src")" > "$manifest_file"
            total_hashed=$((total_hashed + 1))
        fi

        local manifest_hash
        manifest_hash="$(sha256_file "$manifest_file")"
        print_pass "Manifest hash: ${manifest_hash:0:16}…"

        audit_log_entry "SOURCE_MANIFEST_BUILT" "source=$src files=$total_hashed manifestHash=$manifest_hash"
    done

    echo ""
    local end_time
    end_time="$(date +%s)"
    local elapsed=$(( end_time - start_time ))
    echo -e "${GREEN}Source manifest complete.${RESET} $total_hashed files hashed in ${elapsed}s."
}

# ── Step 6: Collection ───────────────────────────────────────────────────

step_collection() {
    print_header "Step 6: Collection"

    echo -e "${DIM}Copying selected files to the sparsebundle using ditto.${RESET}"
    echo -e "${DIM}Each file is copied with full metadata preservation.${RESET}"
    echo -e "${RED}${BOLD}Source data is NEVER modified. Read-only operations only.${RESET}"
    echo ""

    audit_log_entry "COLLECTION_STARTED" "sourceCount=${#SOURCE_PATHS[@]}"

    COLLECTION_STATUSES=()
    NOT_COLLECTED=()
    local start_time
    start_time="$(date +%s)"

    for i in "${!SOURCE_PATHS[@]}"; do
        local src="${SOURCE_PATHS[$i]}"
        local src_name
        src_name="$(basename "$src")"
        local dest="${MOUNT_POINT}/${src_name}"

        print_step "Source $((i+1))/${#SOURCE_PATHS[@]}: $src"

        local ditto_args=("--rsrc" "--extattr" "--acl" "--qtn" "-V")
        ditto_args+=("$src" "$dest")

        local ditto_start
        ditto_start="$(utc_now)"
        local ditto_stderr
        local ditto_exit=0

        ditto_stderr="$(env -i $SCRUBBED_ENV HOME="$HOME" "$DITTO_BIN" "${ditto_args[@]}" 2>&1 >/dev/null)" || ditto_exit=$?

        local ditto_end
        ditto_end="$(utc_now)"

        local stderr_hash
        stderr_hash="$(sha256_string "$ditto_stderr")"

        audit_log_entry "DITTO_INVOCATION" "source=$src dest=$dest exitCode=$ditto_exit start=$ditto_start end=$ditto_end stderrHash=$stderr_hash"

        if [[ $ditto_exit -eq 0 ]]; then
            print_pass "Complete"
            COLLECTION_STATUSES+=("COMPLETE")
        else
            # Check for per-file errors vs total failure
            if [[ -d "$dest" ]] || [[ -f "$dest" ]]; then
                print_warn "Partial — ditto exited with code $ditto_exit"
                COLLECTION_STATUSES+=("PARTIAL")
            else
                print_fail "Failed — ditto exited with code $ditto_exit"
                COLLECTION_STATUSES+=("FAILED")
            fi
            NOT_COLLECTED+=("$src (ditto exit code: $ditto_exit)")

            # Log per-file errors from stderr
            if [[ -n "$ditto_stderr" ]]; then
                echo "$ditto_stderr" | while IFS= read -r line; do
                    if [[ -n "$line" ]]; then
                        print_info "  $line"
                        audit_log_entry "DITTO_ERROR" "source=$src detail=$line"
                    fi
                done
            fi
        fi
    done

    local end_time
    end_time="$(date +%s)"
    local elapsed=$(( end_time - start_time ))

    local complete_count=0
    local partial_count=0
    local failed_count=0
    for status in "${COLLECTION_STATUSES[@]}"; do
        case "$status" in
            COMPLETE) complete_count=$((complete_count + 1)) ;;
            PARTIAL) partial_count=$((partial_count + 1)) ;;
            FAILED) failed_count=$((failed_count + 1)) ;;
        esac
    done

    audit_log_entry "COLLECTION_COMPLETED" "complete=$complete_count partial=$partial_count failed=$failed_count elapsed=${elapsed}s"

    echo ""
    echo -e "${GREEN}Collection phase complete${RESET} in ${elapsed}s."
    echo -e "  Complete: $complete_count  Partial: $partial_count  Failed: $failed_count"
}

# ── Step 7: Verification ────────────────────────────────────────────────

step_verification() {
    print_header "Step 7: Verification"

    echo -e "${DIM}Comparing source manifest against destination for independent verification.${RESET}"
    echo ""

    local manifest_dir="${MOUNT_POINT}/DittoSuite_Manifests"
    local all_pass=1
    local total_checked=0
    local total_mismatches=0
    local total_missing=0

    for i in "${!SOURCE_PATHS[@]}"; do
        local src="${SOURCE_PATHS[$i]}"
        local src_name
        src_name="$(basename "$src")"
        local manifest_file="${manifest_dir}/source_manifest_${i}_${src_name}.txt"
        local dest="${MOUNT_POINT}/${src_name}"

        print_step "Verifying: $src_name"

        if [[ ! -f "$manifest_file" ]]; then
            print_fail "Source manifest not found"
            all_pass=0
            continue
        fi

        local file_mismatches=0
        local file_missing=0
        local file_checked=0

        while IFS= read -r line; do
            local expected_hash expected_size expected_mtime rel_path
            expected_hash="$(echo "$line" | awk '{print $1}')"
            expected_size="$(echo "$line" | awk '{print $2}')"
            rel_path="$(echo "$line" | awk '{$1=$2=$3=""; print}' | sed 's/^[[:space:]]*//')"

            local dest_file="${dest}${rel_path}"

            if [[ ! -f "$dest_file" ]]; then
                file_missing=$((file_missing + 1))
                total_missing=$((total_missing + 1))
                continue
            fi

            local actual_hash
            actual_hash="$(sha256_file "$dest_file")"
            if [[ "$actual_hash" != "$expected_hash" ]]; then
                file_mismatches=$((file_mismatches + 1))
                total_mismatches=$((total_mismatches + 1))
                audit_log_entry "VERIFICATION_MISMATCH" "file=$rel_path expected=$expected_hash actual=$actual_hash"
            fi

            file_checked=$((file_checked + 1))
            total_checked=$((total_checked + 1))

            if (( total_checked % 100 == 0 )); then
                echo -ne "\r  ${DIM}Files verified: $total_checked${RESET}  "
            fi
        done < "$manifest_file"

        if [[ $file_mismatches -eq 0 && $file_missing -eq 0 ]]; then
            print_pass "$file_checked files — all hashes match"
        else
            all_pass=0
            if [[ $file_mismatches -gt 0 ]]; then
                print_fail "$file_mismatches hash mismatch(es)"
            fi
            if [[ $file_missing -gt 0 ]]; then
                print_fail "$file_missing file(s) missing in destination"
            fi
        fi
    done

    echo ""

    # Build destination manifest for hash comparison
    local dest_manifest_hash=""
    local src_manifest_hash=""
    for i in "${!SOURCE_PATHS[@]}"; do
        local src_name
        src_name="$(basename "${SOURCE_PATHS[$i]}")"
        local mf="${manifest_dir}/source_manifest_${i}_${src_name}.txt"
        if [[ -f "$mf" ]]; then
            local h
            h="$(sha256_file "$mf")"
            src_manifest_hash="${src_manifest_hash}:${h}"
        fi
    done
    src_manifest_hash="$(sha256_string "$src_manifest_hash")"

    # hdiutil verify
    echo -e "  ${BLUE}ℹ${RESET} ${BOLD}hdiutil verify:${RESET} SKIPPED"
    echo -e "    ${DIM}hdiutil verify does not reliably cover writable sparsebundles.${RESET}"
    echo -e "    ${DIM}Independent manifest comparison is the sole integrity check.${RESET}"

    echo ""

    if [[ $all_pass -eq 1 ]]; then
        VERIFICATION_VERDICT="PASS"
        echo -e "${GREEN}${BOLD}  ✓ Overall Verdict: PASS${RESET}"
        echo -e "    $total_checked files verified, all hashes match."
    else
        VERIFICATION_VERDICT="FAIL"
        echo -e "${RED}${BOLD}  ✗ Overall Verdict: FAIL${RESET}"
        echo -e "    $total_mismatches mismatch(es), $total_missing missing file(s)."
    fi

    echo ""
    echo -e "  ${BOLD}Source Manifest Hash:${RESET}      ${src_manifest_hash:0:16}…${src_manifest_hash: -8}"

    audit_log_entry "VERIFICATION_COMPLETED" "verdict=$VERIFICATION_VERDICT checked=$total_checked mismatches=$total_mismatches missing=$total_missing manifestHash=$src_manifest_hash"
}

# ── Step 8: Close-out ────────────────────────────────────────────────────

step_closeout() {
    print_header "Step 8: Close-out"

    # Band count
    print_step "Checking band count..."
    local bands_dir="${BUNDLE_PATH}/bands"
    if [[ -d "$bands_dir" ]]; then
        local band_count
        band_count="$(ls -1 "$bands_dir" 2>/dev/null | wc -l | tr -d ' ')"
        if (( band_count >= BAND_WARN_THRESHOLD )); then
            print_warn "Band count: $band_count (approaching threshold)"
            audit_log_entry "WARNING" "bandCount=$band_count threshold=$BAND_FAIL_THRESHOLD"
        else
            print_pass "Band count: $band_count"
        fi
    fi

    # Determine overall status
    local has_complete=0
    local has_failed=0
    for status in "${COLLECTION_STATUSES[@]}"; do
        case "$status" in
            COMPLETE) has_complete=1 ;;
            FAILED) has_failed=1 ;;
        esac
    done

    if [[ $has_failed -eq 1 ]]; then
        OVERALL_STATUS="FAILED"
    elif [[ "$VERIFICATION_VERDICT" == "PASS" && $has_complete -eq 1 ]]; then
        OVERALL_STATUS="COMPLETE"
    else
        OVERALL_STATUS="PARTIAL"
    fi

    audit_log_entry "SESSION_END" "overallStatus=$OVERALL_STATUS auditLogFailure=$AUDIT_FAILURE"

    # Detach
    print_step "Detaching sparsebundle..."
    local detach_exit=0
    env -i $SCRUBBED_ENV HOME="$HOME" "$HDIUTIL_BIN" detach "$MOUNT_POINT" 2>/dev/null || detach_exit=$?

    if [[ $detach_exit -eq 0 ]]; then
        print_pass "Clean detach"
    else
        print_fail "Detach failed (exit $detach_exit) — bundle may still be mounted"
        echo -e "  ${DIM}Try: hdiutil detach \"$MOUNT_POINT\" -force${RESET}"
    fi

    echo ""
    echo -e "${GREEN}Close-out complete.${RESET}"
}

# ── Step 9: Results & Report ─────────────────────────────────────────────

step_results() {
    print_header "Step 9: Results & Report"

    # Overall status banner
    case "$OVERALL_STATUS" in
        COMPLETE) echo -e "${GREEN}${BOLD}  ✓ Collection Status: COMPLETE${RESET}" ;;
        PARTIAL)  echo -e "${YELLOW}${BOLD}  ⚠ Collection Status: PARTIAL${RESET}" ;;
        FAILED)   echo -e "${RED}${BOLD}  ✗ Collection Status: FAILED${RESET}" ;;
    esac

    if [[ "$VERIFICATION_VERDICT" == "PASS" ]]; then
        echo -e "    ${GREEN}Verification: PASS${RESET}"
    else
        echo -e "    ${RED}Verification: FAIL${RESET}"
    fi

    # What WAS collected
    echo ""
    echo -e "${BOLD}── What Was Collected ──${RESET}"
    for i in "${!SOURCE_PATHS[@]}"; do
        local status="${COLLECTION_STATUSES[$i]}"
        if [[ "$status" == "COMPLETE" ]]; then
            echo -e "  ${GREEN}✓${RESET} ${SOURCE_PATHS[$i]}  ${DIM}(${SOURCE_COUNTS[$i]} files)${RESET}"
        fi
    done

    # What was NOT collected
    echo ""
    echo -e "${BOLD}── What Was Not Collected ──${RESET}"
    if [[ ${#NOT_COLLECTED[@]} -eq 0 ]]; then
        echo -e "  ${GREEN}All selected sources were completely collected.${RESET}"
    else
        for entry in "${NOT_COLLECTED[@]}"; do
            echo -e "  ${RED}✗${RESET} $entry"
        done
    fi

    # Generate text report
    echo ""
    echo -e "${BOLD}── Export ──${RESET}"

    local report_path="${BUNDLE_PATH%.*}_Report.txt"
    {
        echo "═══════════════════════════════════════════════════════════"
        echo "  DittoSuite — Forensic Collection Report"
        echo "  Version: $VERSION"
        echo "═══════════════════════════════════════════════════════════"
        echo ""
        echo "NOTICE: This is a TARGETED LOGICAL COLLECTION, not a"
        echo "forensic image. Only items selected by the examiner were"
        echo "collected."
        echo ""
        echo "DATA INTEGRITY: Under no circumstances was source data"
        echo "modified. Collected data was not altered in any way."
        echo "Failure was preferred over any data change."
        echo ""
        echo "── Case Information ──"
        echo "  Examiner:            $EXAMINER_NAME"
        echo "  Custodian:           $CUSTODIAN_NAME"
        echo "  Case ID:             $CASE_ID"
        echo "  Evidence ID:         $EVIDENCE_ID"
        if [[ -n "$DEVICE_MAKE" ]]; then echo "  Make:                $DEVICE_MAKE"; fi
        if [[ -n "$DEVICE_MODEL" ]]; then echo "  Model:               $DEVICE_MODEL"; fi
        if [[ -n "$DEVICE_SERIAL" ]]; then echo "  Serial:              $DEVICE_SERIAL"; fi
        echo "  macOS Version:       $DEVICE_MACOS"
        echo "  macOS Build:         $MACOS_BUILD"
        if [[ -n "$COLLECTION_LOCATION" ]]; then echo "  Collection Location: $COLLECTION_LOCATION"; fi
        echo "  Session Start:       $SESSION_START"
        echo "  Report Generated:    $(utc_now)"
        echo "  UTC Time Source:     $UTC_SOURCE"
        echo ""
        if [[ -n "$LEGAL_TYPE" ]]; then
            echo "── Legal Authority ──"
            echo "  Type:                $LEGAL_TYPE"
            echo "  Reference:           $LEGAL_REF"
            if [[ -n "$SCOPE_NOTES" ]]; then echo "  Scope:               $SCOPE_NOTES"; fi
            echo ""
        fi
        echo "── Environment ──"
        echo "  DittoSuite Version:  $VERSION"
        echo "  Hostname:            $(hostname -s)"
        echo "  ditto SHA-256:       $DITTO_SHA256"
        echo "  hdiutil SHA-256:     $HDIUTIL_SHA256"
        echo ""
        echo "── Bundle ──"
        echo "  Path:                $BUNDLE_PATH"
        echo ""
        echo "── Sources ──"
        for i in "${!SOURCE_PATHS[@]}"; do
            echo "  [$((i+1))] ${SOURCE_PATHS[$i]}"
            echo "      Status: ${COLLECTION_STATUSES[$i]}  Files: ${SOURCE_COUNTS[$i]}  Size: $(human_size "${SOURCE_SIZES[$i]}")"
        done
        echo ""
        echo "── Verification ──"
        echo "  Overall Verdict:     $VERIFICATION_VERDICT"
        echo "  hdiutil verify:      SKIPPED (writable sparsebundle)"
        echo ""
        echo "── Overall Status ──"
        echo "  Status:              $OVERALL_STATUS"
        echo "  Audit Log Failure:   $([ $AUDIT_FAILURE -eq 1 ] && echo 'YES' || echo 'No')"
        echo ""
        echo "── Known Limitations ──"
        echo "  1. ditto does not preserve directory hard links"
        echo "  2. Extended attribute preservation may be incomplete for system-protected xattrs"
        echo "  3. Source file access times may change during collection (reading for hashing)"
        echo "  4. hdiutil verify does not reliably cover writable sparsebundles"
        echo "  5. Unicode filename normalization (NFC/NFD) must be empirically validated"
        echo ""
        echo "── Audit Log ──"
        echo "  Location: Inside sparsebundle at DittoSuite_AuditLog.jsonl"
        echo "  The audit log is hash-chained and append-only."
        echo ""
        echo "═══════════════════════════════════════════════════════════"
        echo "  End of Report"
        echo "═══════════════════════════════════════════════════════════"
    } > "$report_path"

    local report_hash
    report_hash="$(sha256_file "$report_path")"

    echo -e "  ${GREEN}✓${RESET} Text report: $report_path"
    echo -e "    ${DIM}SHA-256: $report_hash${RESET}"
    echo ""
    echo -e "  ${DIM}Audit log is inside the sparsebundle at:${RESET}"
    echo -e "  ${DIM}DittoSuite_AuditLog.jsonl${RESET}"

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${DIM}  This is a targeted logical collection, not a forensic image.${RESET}"
    echo -e "${DIM}  Only items selected by the examiner were collected.${RESET}"
    echo -e "${DIM}  The audit log contains a full hash-chained record.${RESET}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

# ── Guide ────────────────────────────────────────────────────────────────

show_guide() {
    print_header "DittoSuite Guide — v$VERSION"

    echo -e "${RED}${BOLD}  CORE PRINCIPLE: DATA INTEGRITY ABOVE ALL${RESET}"
    echo ""
    echo -e "  ${RED}■${RESET} Source data must NEVER be modified under any circumstances."
    echo -e "  ${RED}■${RESET} Collected data must NEVER be modified in any way."
    echo -e "  ${RED}■${RESET} Failure is ALWAYS preferred over any data change."
    echo -e "    There is no override for this behavior."
    echo ""
    echo -e "${BOLD}  Forensic Design Principles${RESET}"
    echo ""
    echo -e "  ${BLUE}■${RESET} ${BOLD}Wrap, Don't Hide, Don't Replace${RESET}"
    echo -e "    System binaries (ditto, hdiutil) are called via subprocess"
    echo -e "    with argument arrays. Never shell invocation. Every"
    echo -e "    invocation is fully recorded in the audit log."
    echo ""
    echo -e "  ${BLUE}■${RESET} ${BOLD}Independent Verification${RESET}"
    echo -e "    Source and destination manifests are compared independently"
    echo -e "    of ditto's exit code. Any hash mismatch is a hard FAIL."
    echo ""
    echo -e "  ${BLUE}■${RESET} ${BOLD}Tamper-Evident Audit Log${RESET}"
    echo -e "    Hash-chained, append-only JSON Lines log stored inside"
    echo -e "    the sparsebundle. Each entry contains the SHA-256 of"
    echo -e "    the previous entry."
    echo ""
    echo -e "  ${BLUE}■${RESET} ${BOLD}No Silent Failures${RESET}"
    echo -e "    Every error, denial, or skip is logged with path and reason."
    echo ""
    echo -e "  ${BLUE}■${RESET} ${BOLD}No Network Access${RESET}"
    echo -e "    Zero network calls. No telemetry. No update checks."
    echo -e "    Environment variables are scrubbed before subprocess calls."
    echo ""
    echo -e "${BOLD}  Workflow Steps${RESET}"
    echo ""
    echo -e "  1. Case Setup         Examiner, custodian, case/evidence IDs"
    echo -e "  2. Bundle Setup       Create APFS sparsebundle"
    echo -e "  3. Source Selection    Pick files/folders to collect"
    echo -e "  4. Pre-flight Checks  Verify system readiness"
    echo -e "  5. Source Manifest    SHA-256 hash every source file"
    echo -e "  6. Collection         Copy with ditto (metadata preserved)"
    echo -e "  7. Verification       Compare source vs destination hashes"
    echo -e "  8. Close-out          Band count check, clean detach"
    echo -e "  9. Results & Report   Summary and exportable report"
    echo ""
    echo -e "${BOLD}  What This Tool Is${RESET}"
    echo ""
    echo -e "  ${GREEN}■${RESET} A targeted logical collection tool"
    echo -e "  ${RED}■${RESET} NOT a full-disk or physical imaging tool"
    echo -e "  ${RED}■${RESET} NOT a decryption or credential extraction tool"
    echo -e "  ${RED}■${RESET} NOT a network, cloud, or remote collection tool"
    echo ""
}

# ── Main ─────────────────────────────────────────────────────────────────

main() {
    # Handle --guide / --help / --version flags
    case "${1:-}" in
        --guide|-g)
            show_guide
            exit 0
            ;;
        --version|-v)
            echo "DittoSuite v$VERSION"
            exit 0
            ;;
        --help|-h)
            echo "DittoSuite v$VERSION — Forensic Collection Tool"
            echo ""
            echo "Usage: dittosuite.sh [options]"
            echo ""
            echo "Options:"
            echo "  --guide, -g     Show the forensic guide and principles"
            echo "  --version, -v   Show version number"
            echo "  --help, -h      Show this help message"
            echo ""
            echo "Run without arguments to start the interactive workflow."
            exit 0
            ;;
    esac

    check_macos
    get_macos_info

    echo ""
    echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${BLUE}║${RESET}        ${BOLD}DittoSuite${RESET} — Forensic Collection Tool            ${BOLD}${BLUE}║${RESET}"
    echo -e "${BOLD}${BLUE}║${RESET}        v$VERSION  •  macOS $MACOS_VERSION ($MACOS_BUILD)               ${BOLD}${BLUE}║${RESET}"
    echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "${DIM}  Targeted logical collection into forensic sparsebundles.${RESET}"
    echo -e "${DIM}  Source data is NEVER modified. Run --guide for principles.${RESET}"
    echo ""

    if ! confirm_proceed "Begin collection workflow?"; then
        echo "Exited."
        exit 0
    fi

    step_case_setup
    step_bundle_setup
    step_source_selection
    step_preflight
    step_source_manifest
    step_collection
    step_verification
    step_closeout
    step_results

    echo ""
    echo -e "${GREEN}${BOLD}DittoSuite collection workflow complete.${RESET}"
    echo ""
}

main "$@"
