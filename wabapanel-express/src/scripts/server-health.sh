#!/usr/bin/env bash
###############################################################################
# server-health.sh - Production-ready Server Health Monitoring
#
# A single, dependency-light Bash tool that auto-detects the hosting
# environment and produces a comprehensive, read-only health report.
#
# Design principles:
#   * READ-ONLY: never modifies the system. Only reads metrics.
#   * NEVER FAILS on a missing command - every external tool is optional and
#     checks gracefully degrade (marked "n/a") when a tool is absent.
#   * LOW FOOTPRINT: pure Bash + coreutils; heavy tools are optional.
#   * NO TELEMETRY: nothing leaves the box unless YOU configure a notifier.
#
# Supported: Ubuntu, Debian, AlmaLinux, Rocky, CentOS, Fedora (bash >= 4).
#
# Usage:  ./server-health.sh [options]
#   -c, --config FILE     Config file (YAML or JSON). Default: ./config.yaml
#   -f, --format LIST     Comma list: terminal,json,html,csv,pdf (default terminal)
#   -o, --output DIR      Report output directory (default ./reports)
#   -w, --website URL     Add a website to monitor (repeatable)
#   -q, --quiet           Suppress terminal report (still writes files)
#       --no-color        Disable ANSI colors
#       --no-net          Skip all outbound network calls (public IP, speed...)
#       --notify          Send notifications (per config) after the run
#   -v, --version         Print version
#   -h, --help            Show help
#
# Exit codes: 0 healthy/warn, 2 critical issues found, 1 usage error.
###############################################################################

SH_VERSION="1.0.0"

# ---- Do NOT use `set -e`: we must survive missing commands gracefully. ----
# Keep the DEFAULT IFS (space/tab/newline): many reads below split on spaces
# (df, /proc/loadavg, etc.). Overriding IFS globally would corrupt them.
set -uo pipefail

# Never let a child command page/prompt: this would hang when we run
# non-interactively (cron, systemd, or spawned from a web backend).
export SYSTEMD_PAGER="" PAGER=cat GIT_PAGER=cat DEBIAN_FRONTEND=noninteractive

###############################################################################
# 0. Globals & data stores
###############################################################################
declare -A M          # metric key   -> value          (flat namespace)
declare -A SCORES     # category      -> 0..100
declare -a CRIT=()    # critical issue strings
declare -a WARN=()    # warning strings
declare -a PASS=()    # passed-check strings
declare -a RECO=()    # AI recommendation strings
declare -a WEBSITES=()   # websites to monitor

CONFIG_FILE="./config.yaml"
OUTPUT_DIR="./reports"
FORMATS="terminal"
QUIET=0
USE_COLOR=1
USE_NET=1
DO_NOTIFY=0
LOG_FILE="/var/log/server-health.log"
TS="$(date +%Y%m%d-%H%M%S)"

# Notification config (populated from config file)
NOTIFY_TELEGRAM_TOKEN=""; NOTIFY_TELEGRAM_CHAT=""
NOTIFY_DISCORD_WEBHOOK=""
NOTIFY_SLACK_WEBHOOK=""
NOTIFY_EMAIL_TO=""
NOTIFY_WA_TOKEN=""; NOTIFY_WA_PHONE_ID=""; NOTIFY_WA_TO=""
NOTIFY_WEBHOOK_URL=""
declare -A NOTIFY_STATUS

# Thresholds (overridable via config: threshold_cpu, threshold_mem, ...)
TH_CPU=90; TH_MEM=90; TH_DISK=90; TH_LOAD_PER_CORE=2; TH_SSL_DAYS=14

###############################################################################
# 1. Core helpers
###############################################################################
have() { command -v "$1" >/dev/null 2>&1; }
# run a command, swallow errors, return its stdout (never aborts the script)
run() { "$@" 2>/dev/null || true; }

# Colors (respect --no-color and non-tty)
init_colors() {
  if [[ $USE_COLOR -eq 1 && -t 1 ]]; then
    C_RST=$'\e[0m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'
    C_RED=$'\e[31m'; C_GRN=$'\e[32m'; C_YEL=$'\e[33m'
    C_BLU=$'\e[34m'; C_CYN=$'\e[36m'; C_MAG=$'\e[35m'
  else
    C_RST=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""; C_CYN=""; C_MAG=""
  fi
}

# structured logging (best-effort). If the configured log isn't writable we
# silently fall back to a temp path once, so a run never spams stderr.
_LOG_READY=0
_ensure_log() {
  [[ $_LOG_READY -eq 1 ]] && return 0
  if { : >>"$LOG_FILE"; } 2>/dev/null; then _LOG_READY=1; return 0; fi
  LOG_FILE="${TMPDIR:-/tmp}/server-health.log"
  { : >>"$LOG_FILE"; } 2>/dev/null && _LOG_READY=1
  return 0
}
log() {
  local lvl="$1"; shift
  _ensure_log
  [[ $_LOG_READY -eq 1 ]] || return 0
  printf '%s [%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$lvl" "$*" >>"$LOG_FILE" 2>/dev/null || true
}

set_m() { M["$1"]="${2:-n/a}"; }
add_crit() { CRIT+=("$1"); log ERROR "CRITICAL: $1"; }
add_warn() { WARN+=("$1"); log WARN  "WARNING: $1"; }
add_pass() { PASS+=("$1"); }
add_reco() { RECO+=("$1"); }

# integer-ish comparison helper: is $1 > $2  (floats via awk)
gt() { awk -v a="${1:-0}" -v b="${2:-0}" 'BEGIN{exit !(a+0>b+0)}'; }
ge() { awk -v a="${1:-0}" -v b="${2:-0}" 'BEGIN{exit !(a+0>=b+0)}'; }

# JSON string escaper
json_escape() {
  local s="${1:-}"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/\\n}"; s="${s//$'\t'/\\t}"; s="${s//$'\r'/}"
  printf '%s' "$s"
}
# HTML escaper
html_escape() {
  local s="${1:-}"
  s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"
  printf '%s' "$s"
}

human_kb() { # KiB -> human
  awk -v k="${1:-0}" 'BEGIN{u="KMGTP";v=k;i=0;while(v>=1024&&i<5){v/=1024;i++}printf "%.1f%siB", v, substr(u,i+1,1)}'
}

###############################################################################
# 2. Argument parsing
###############################################################################
usage() { sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; }

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -c|--config)  CONFIG_FILE="${2:-}"; shift 2;;
      -f|--format)  FORMATS="${2:-terminal}"; shift 2;;
      -o|--output)  OUTPUT_DIR="${2:-./reports}"; shift 2;;
      -w|--website) WEBSITES+=("${2:-}"); shift 2;;
      -q|--quiet)   QUIET=1; shift;;
      --no-color)   USE_COLOR=0; shift;;
      --no-net)     USE_NET=0; shift;;
      --notify)     DO_NOTIFY=1; shift;;
      -v|--version) echo "server-health.sh v$SH_VERSION"; exit 0;;
      -h|--help)    usage; exit 0;;
      *) echo "Unknown option: $1" >&2; usage; exit 1;;
    esac
  done
}

###############################################################################
# 3. Config loading (YAML subset or JSON via jq). Never fails if absent.
###############################################################################
load_config() {
  [[ -f "$CONFIG_FILE" ]] || { log INFO "No config file ($CONFIG_FILE); using defaults/CLI"; return 0; }
  local ext="${CONFIG_FILE##*.}"
  if [[ "$ext" == "json" ]] && have jq; then
    _cfg() { jq -r "$1 // empty" "$CONFIG_FILE" 2>/dev/null; }
    NOTIFY_TELEGRAM_TOKEN="$(_cfg '.notifications.telegram.token')"
    NOTIFY_TELEGRAM_CHAT="$(_cfg '.notifications.telegram.chat_id')"
    NOTIFY_DISCORD_WEBHOOK="$(_cfg '.notifications.discord.webhook')"
    NOTIFY_SLACK_WEBHOOK="$(_cfg '.notifications.slack.webhook')"
    NOTIFY_EMAIL_TO="$(_cfg '.notifications.email.to')"
    NOTIFY_WA_TOKEN="$(_cfg '.notifications.whatsapp.token')"
    NOTIFY_WA_PHONE_ID="$(_cfg '.notifications.whatsapp.phone_id')"
    NOTIFY_WA_TO="$(_cfg '.notifications.whatsapp.to')"
    NOTIFY_WEBHOOK_URL="$(_cfg '.notifications.webhook.url')"
    TH_CPU="$(_cfg '.thresholds.cpu')"; TH_CPU="${TH_CPU:-90}"
    TH_MEM="$(_cfg '.thresholds.memory')"; TH_MEM="${TH_MEM:-90}"
    TH_DISK="$(_cfg '.thresholds.disk')"; TH_DISK="${TH_DISK:-90}"
    while IFS= read -r w; do [[ -n "$w" ]] && WEBSITES+=("$w"); done < <(jq -r '.websites[]? // empty' "$CONFIG_FILE" 2>/dev/null)
  else
    # Minimal flat-YAML parser: "key: value" and "  - item" under websites:
    local in_sites=0 key val line
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%%#*}"                       # strip comments
      [[ -z "${line//[[:space:]]/}" ]] && continue
      if [[ "$line" =~ ^websites: ]]; then in_sites=1; continue; fi
      if [[ $in_sites -eq 1 && "$line" =~ ^[[:space:]]+-[[:space:]]* ]]; then
        val="${line#*- }"; val="$(echo "$val" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^["'\'']//; s/["'\'']$//')"
        [[ -n "$val" ]] && WEBSITES+=("$val"); continue
      fi
      [[ "$line" =~ ^[^[:space:]] ]] && in_sites=0
      key="$(echo "${line%%:*}" | sed 's/[[:space:]]//g')"
      val="$(echo "${line#*:}" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^["'\'']//; s/["'\'']$//')"
      case "$key" in
        telegram_token) NOTIFY_TELEGRAM_TOKEN="$val";;
        telegram_chat_id) NOTIFY_TELEGRAM_CHAT="$val";;
        discord_webhook) NOTIFY_DISCORD_WEBHOOK="$val";;
        slack_webhook) NOTIFY_SLACK_WEBHOOK="$val";;
        email_to) NOTIFY_EMAIL_TO="$val";;
        whatsapp_token) NOTIFY_WA_TOKEN="$val";;
        whatsapp_phone_id) NOTIFY_WA_PHONE_ID="$val";;
        whatsapp_to) NOTIFY_WA_TO="$val";;
        webhook_url) NOTIFY_WEBHOOK_URL="$val";;
        threshold_cpu) TH_CPU="$val";; threshold_memory) TH_MEM="$val";;
        threshold_disk) TH_DISK="$val";; threshold_ssl_days) TH_SSL_DAYS="$val";;
        log_file) LOG_FILE="$val";;
      esac
    done < "$CONFIG_FILE"
  fi
  log INFO "Loaded config from $CONFIG_FILE"
}

###############################################################################
# 4. Detection: environment / virtualization / cloud / control panel
###############################################################################
detect_environment() {
  local virt="unknown" env="Dedicated/Unknown"
  if have systemd-detect-virt; then
    virt="$(run systemd-detect-virt)"; [[ -z "$virt" || "$virt" == "none" ]] && virt="none"
  fi
  # container hints
  if [[ -f /.dockerenv ]] || grep -qa 'docker\|containerd' /proc/1/cgroup 2>/dev/null; then virt="docker"; fi
  if grep -qa 'lxc' /proc/1/environ 2>/dev/null || [[ "$(run cat /proc/1/cgroup)" == *lxc* ]]; then virt="lxc"; fi
  [[ "$virt" == "podman" || -f /run/.containerenv ]] && virt="podman"
  # DMI-based virt refinement
  local dmi; dmi="$(run cat /sys/class/dmi/id/product_name)$(run cat /sys/class/dmi/id/sys_vendor)"
  case "$dmi" in
    *VMware*) virt="vmware";; *VirtualBox*) virt="virtualbox";;
    *KVM*|*QEMU*) [[ "$virt" == none || "$virt" == unknown ]] && virt="kvm";;
    *Xen*) virt="xen";; *Microsoft*) [[ "$dmi" == *Virtual* ]] && virt="hyper-v";;
  esac
  [[ "$(run cat /proc/user_beancounters 2>/dev/null | wc -l)" -gt 1 ]] && virt="openvz"
  # env class
  case "$virt" in
    docker|lxc|podman) env="Container ($virt)";;
    none) env="Dedicated / Bare-metal";;
    kvm|vmware|xen|hyper-v|openvz|virtualbox|qemu) env="VPS / Virtual ($virt)";;
    *) env="Unknown";;
  esac
  set_m env.type "$env"; set_m env.virtualization "$virt"

  # Cloud provider detection (files/DMI first, metadata only if --no-net off)
  local cloud="none"
  local vend; vend="$(run cat /sys/class/dmi/id/sys_vendor) $(run cat /sys/class/dmi/id/product_name) $(run cat /sys/class/dmi/id/chassis_asset_tag)"
  case "$vend" in
    *Amazon*|*EC2*) cloud="AWS";; *Google*) cloud="Google Cloud";;
    *Microsoft*Azure*|*7783-7084-3265-9085-8269-3286-77*) cloud="Azure";;
    *DigitalOcean*) cloud="DigitalOcean";; *Alibaba*) cloud="Alibaba Cloud";;
    *OracleCloud*|*Oracle*) cloud="Oracle Cloud";;
  esac
  if [[ "$cloud" == none ]]; then
    have dmidecode && case "$(run dmidecode -s system-manufacturer)$(run dmidecode -s system-product-name)" in
      *Vultr*) cloud="Vultr";; *Linode*|*Akamai*) cloud="Linode";; *Hetzner*) cloud="Hetzner";;
    esac
  fi
  if [[ "$cloud" == none && $USE_NET -eq 1 ]] && have curl; then
    # very short timeouts; metadata endpoints are link-local & safe
    if curl -s -m 1 -H 'Metadata-Flavor: Google' http://169.254.169.254/computeMetadata/v1/ >/dev/null 2>&1; then cloud="Google Cloud"
    elif curl -s -m 1 http://169.254.169.254/latest/meta-data/ >/dev/null 2>&1; then cloud="AWS"
    elif curl -s -m 1 -H 'Metadata:true' "http://169.254.169.254/metadata/instance?api-version=2021-02-01" >/dev/null 2>&1; then cloud="Azure"; fi
  fi
  set_m env.cloud "$cloud"

  # Control panel detection (path-based, read-only)
  local panels=()
  [[ -d /usr/local/cpanel ]] && panels+=("cPanel")
  [[ -d /usr/local/psa || -d /opt/psa ]] && panels+=("Plesk")
  [[ -d /usr/local/directadmin ]] && panels+=("DirectAdmin")
  [[ -d /usr/local/CyberCP || -d /usr/local/lscp ]] && panels+=("CyberPanel")
  [[ -d /www/server/panel ]] && panels+=("aaPanel")
  [[ -d /usr/local/hestia || -d /usr/local/vesta ]] && panels+=("HestiaCP")
  [[ -d /usr/local/ispconfig ]] && panels+=("ISPConfig")
  [[ -d /usr/share/webmin || -d /usr/libexec/webmin ]] && panels+=("Webmin")
  [[ -d /home/cloudpanel || -d /etc/cloudpanel ]] && panels+=("CloudPanel")
  if [[ ${#panels[@]} -eq 0 ]]; then set_m env.panel "none"; else set_m env.panel "$(IFS=,; echo "${panels[*]}")"; fi
  # hosting class heuristic: cPanel/Plesk on a VPS often == shared hosting node
  [[ "$(M_get env.panel)" != none && "$(M_get env.type)" == VPS* ]] && set_m env.hosting "Shared/Reseller likely" || set_m env.hosting "$(M_get env.type)"
}
M_get() { printf '%s' "${M[$1]:-n/a}"; }

###############################################################################
# 5. Server information
###############################################################################
collect_system() {
  set_m sys.hostname "$(run hostname -f || run hostname)"
  local osname="unknown" distro="unknown"
  if [[ -r /etc/os-release ]]; then . /etc/os-release 2>/dev/null; osname="${NAME:-Linux}"; distro="${PRETTY_NAME:-$NAME}"; fi
  set_m sys.os "$osname"; set_m sys.distro "$distro"
  set_m sys.kernel "$(run uname -r)"
  set_m sys.arch "$(run uname -m)"
  set_m sys.timezone "$(run timedatectl show -p Timezone --value || cat /etc/timezone 2>/dev/null || date +%Z)"
  set_m sys.time "$(date '+%Y-%m-%d %H:%M:%S %Z')"
  if have uptime; then set_m sys.uptime "$(run uptime -p || run uptime)"; fi
  set_m sys.boot "$(run uptime -s || who -b 2>/dev/null | awk '{print $3,$4}')"
  set_m sys.users "$(run who | wc -l | tr -d ' ')"
}

###############################################################################
# 6. CPU
###############################################################################
_cpu_usage() { # returns integer % busy over ~0.3s sample
  [[ -r /proc/stat ]] || { echo "n/a"; return; }
  read -r _ a b c d e f g _ < <(grep '^cpu ' /proc/stat)
  local idle1=$((d+e)) tot1=$((a+b+c+d+e+f+g))
  sleep 0.3
  read -r _ a b c d e f g _ < <(grep '^cpu ' /proc/stat)
  local idle2=$((d+e)) tot2=$((a+b+c+d+e+f+g))
  local dt=$((tot2-tot1)) di=$((idle2-idle1))
  [[ $dt -le 0 ]] && { echo 0; return; }
  awk -v dt="$dt" -v di="$di" 'BEGIN{printf "%.0f", (dt-di)*100/dt}'
}
collect_cpu() {
  local model vendor
  model="$(run grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//')"
  [[ -z "$model" ]] && model="$(run lscpu | grep -m1 'Model name' | cut -d: -f2 | sed 's/^ *//')"
  vendor="$(run grep -m1 'vendor_id' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//')"
  set_m cpu.model "${model:-n/a}"; set_m cpu.vendor "${vendor:-n/a}"
  set_m cpu.sockets "$(run lscpu | awk -F: '/Socket\(s\)/{gsub(/ /,"",$2);print $2}')"
  set_m cpu.cores "$(run nproc --all || grep -c ^processor /proc/cpuinfo)"
  set_m cpu.threads "$(run grep -c ^processor /proc/cpuinfo)"
  local freq; freq="$(run grep -m1 'cpu MHz' /proc/cpuinfo | awk -F: '{printf "%.0f MHz",$2}')"
  [[ -z "$freq" ]] && freq="$(run lscpu | awk -F: '/max MHz/{printf "%.0f MHz",$2}')"
  set_m cpu.freq "${freq:-n/a}"
  local u; u="$(_cpu_usage)"; set_m cpu.usage "$u"
  read -r l1 l5 l15 _ < /proc/loadavg 2>/dev/null || { l1=n/a; l5=n/a; l15=n/a; }
  set_m cpu.load "$l1 / $l5 / $l15"; set_m cpu.load1 "$l1"
  # temperature
  local temp="n/a"
  if have sensors; then temp="$(run sensors | awk -F'[+°]' '/Core 0|Package id 0|Tctl/{print $2"C"; exit}')"; fi
  if [[ "$temp" == n/a ]]; then
    local z=/sys/class/thermal/thermal_zone0/temp
    [[ -r $z ]] && temp="$(awk -v t="$(cat $z)" 'BEGIN{printf "%.1fC", t/1000}')"
  fi
  set_m cpu.temp "$temp"
  set_m cpu.top "$(run ps -eo pcpu,pid,comm --sort=-pcpu | head -n 6 | tail -n +2 | awk '{printf "%s%%(%s) ",$1,$3}')"

  # scoring vs load per core
  local cores="${M[cpu.cores]:-1}"; [[ "$cores" =~ ^[0-9]+$ ]] || cores=1
  if [[ "$u" =~ ^[0-9]+$ ]]; then
    if gt "$u" "$TH_CPU"; then add_crit "CPU usage ${u}% > ${TH_CPU}%"; SCORES[cpu]=30
    elif gt "$u" 75; then add_warn "CPU usage high (${u}%)"; SCORES[cpu]=70
    else add_pass "CPU usage ${u}%"; SCORES[cpu]=100; fi
  else SCORES[cpu]=90; fi
  if [[ "$l1" != n/a ]] && gt "$l1" "$((cores*TH_LOAD_PER_CORE))"; then add_warn "High load avg $l1 for $cores cores"; fi
}

###############################################################################
# 7. Memory
###############################################################################
collect_memory() {
  [[ -r /proc/meminfo ]] || { SCORES[memory]=90; return; }
  local total avail free buffers cached stotal sfree
  total=$(awk '/MemTotal/{print $2}' /proc/meminfo)
  free=$(awk '/MemFree/{print $2}' /proc/meminfo)
  avail=$(awk '/MemAvailable/{print $2}' /proc/meminfo); [[ -z "$avail" ]] && avail=$free
  buffers=$(awk '/^Buffers/{print $2}' /proc/meminfo)
  cached=$(awk '/^Cached/{print $2}' /proc/meminfo)
  stotal=$(awk '/SwapTotal/{print $2}' /proc/meminfo)
  sfree=$(awk '/SwapFree/{print $2}' /proc/meminfo)
  local used=$((total-avail))
  local pct; pct=$(awk -v u="$used" -v t="$total" 'BEGIN{printf "%.0f", (t>0)?u*100/t:0}')
  set_m mem.total "$(human_kb "$total")"; set_m mem.used "$(human_kb "$used")"
  set_m mem.free "$(human_kb "$free")"; set_m mem.available "$(human_kb "$avail")"
  set_m mem.buffers "$(human_kb "$buffers")"; set_m mem.cached "$(human_kb "$cached")"
  set_m mem.usage "$pct"
  set_m mem.swap_total "$(human_kb "$stotal")"; set_m mem.swap_free "$(human_kb "$sfree")"
  set_m mem.swap_used "$(human_kb "$((stotal-sfree))")"
  if gt "$pct" "$TH_MEM"; then add_crit "Memory usage ${pct}% > ${TH_MEM}%"; SCORES[memory]=30
  elif gt "$pct" 80; then add_warn "Memory usage high (${pct}%)"; SCORES[memory]=70
  else add_pass "Memory usage ${pct}%"; SCORES[memory]=100; fi
  if [[ "$stotal" -gt 0 ]]; then
    local spct; spct=$(awk -v u="$((stotal-sfree))" -v t="$stotal" 'BEGIN{printf "%.0f",u*100/t}')
    gt "$spct" 60 && add_warn "Swap usage high (${spct}%) - possible memory pressure"
  fi
}

###############################################################################
# 8. Storage
###############################################################################
collect_storage() {
  local worst=0 mounts=""
  if have df; then
    while read -r fs size used avail pcent mnt; do
      [[ "$fs" == "Filesystem" ]] && continue
      local p="${pcent%\%}"; [[ "$p" =~ ^[0-9]+$ ]] || continue
      mounts+="$mnt ${pcent} (${used}/${size}); "
      [[ $p -gt $worst ]] && worst=$p
    done < <(run df -hP -x tmpfs -x devtmpfs -x overlay 2>/dev/null)
  fi
  set_m disk.mounts "${mounts:-n/a}"; set_m disk.worst_pct "$worst"
  # root fs summary
  read -r _ dtot dused dfree dpc _ < <(run df -hP / | tail -1) 2>/dev/null || true
  set_m disk.total "${dtot:-n/a}"; set_m disk.used "${dused:-n/a}"; set_m disk.free "${dfree:-n/a}"; set_m disk.usage "${dpc:-n/a}"
  # inodes
  local ino; ino="$(run df -iPh / | tail -1 | awk '{print $5" used ("$3"/"$2")"}')"; set_m disk.inodes "${ino:-n/a}"
  # SSD/NVMe
  local disktype="unknown"
  if ls /dev/nvme* >/dev/null 2>&1; then disktype="NVMe"; 
  elif [[ -d /sys/block ]]; then
    local rot; rot="$(cat /sys/block/sda/queue/rotational 2>/dev/null)"
    [[ "$rot" == 0 ]] && disktype="SSD"; [[ "$rot" == 1 ]] && disktype="HDD"
  fi
  set_m disk.type "$disktype"
  # SMART
  if have smartctl; then
    local sm="OK" dev
    for dev in $(run lsblk -dn -o NAME,TYPE | awk '$2=="disk"{print $1}'); do
      local h; h="$(run smartctl -H "/dev/$dev" | grep -i 'overall-health' | awk -F: '{print $2}' | xargs)"
      [[ -n "$h" && "$h" != PASSED ]] && sm="FAIL($dev:$h)"
    done
    set_m disk.smart "$sm"; [[ "$sm" == FAIL* ]] && add_crit "SMART health failing: $sm"
  else set_m disk.smart "n/a (smartctl not installed)"; fi
  # RAID
  if [[ -r /proc/mdstat ]] && grep -q '^md' /proc/mdstat 2>/dev/null; then
    if grep -q '\[.*_.*\]' /proc/mdstat; then set_m disk.raid "DEGRADED"; add_crit "RAID array degraded (see /proc/mdstat)"
    else set_m disk.raid "OK"; fi
  else set_m disk.raid "n/a (no mdraid)"; fi
  # I/O
  if have iostat; then set_m disk.io "$(run iostat -dx 1 1 | awk 'NR>6 && $1!=""{printf "%s r/s=%s w/s=%s ",$1,$2,$3}' | head -c 200)"
  else set_m disk.io "n/a (sysstat/iostat not installed)"; fi

  if [[ $worst -gt $TH_DISK ]]; then add_crit "Disk usage ${worst}% > ${TH_DISK}%"; SCORES[disk]=25
  elif [[ $worst -gt 80 ]]; then add_warn "Disk usage high (${worst}%)"; SCORES[disk]=65
  else add_pass "Disk usage ${worst}%"; SCORES[disk]=100; fi
}

###############################################################################
# 9. Network
###############################################################################
collect_network() {
  set_m net.private_ip "$(run hostname -I | awk '{print $1}')"
  set_m net.gateway "$(run ip route | awk '/default/{print $3; exit}')"
  set_m net.dns "$(run grep -h '^nameserver' /etc/resolv.conf | awk '{print $2}' | paste -sd, -)"
  set_m net.connections "$(run ss -tun | tail -n +2 | wc -l | tr -d ' ')"
  set_m net.listen "$(run ss -tulnH | awk '{print $5}' | sed 's/.*://' | sort -un | paste -sd, - | head -c 200)"
  local pub isp="n/a"
  if [[ $USE_NET -eq 1 ]] && have curl; then
    pub="$(run curl -s -m 3 https://ifconfig.me || run curl -s -m 3 https://api.ipify.org)"
    if [[ -n "$pub" ]]; then
      isp="$(run curl -s -m 3 "http://ip-api.com/line/$pub?fields=isp,org" | paste -sd' / ' -)"
    fi
    # latency + packet loss
    if have ping; then
      local p; p="$(run ping -c 3 -w 4 1.1.1.1)"
      set_m net.ping "$(echo "$p" | awk -F'/' '/rtt|round-trip/{print $5" ms avg"}')"
      set_m net.loss "$(echo "$p" | awk -F',' '/packet loss/{gsub(/^ /,"",$3);print $3}' | awk '{print $1}')"
    fi
    # optional speedtest
    if have speedtest-cli; then
      set_m net.speed "$(run speedtest-cli --simple | awk '/Download|Upload/{printf "%s %s %s ",$1,$2,$3}')"
    elif have speedtest; then
      set_m net.speed "$(run speedtest --simple 2>/dev/null | tr '\n' ' ' | head -c 120)"
    else set_m net.speed "n/a (speedtest not installed)"; fi
  else
    set_m net.speed "skipped (--no-net)"
  fi
  set_m net.public_ip "${pub:-n/a}"; set_m net.isp "${isp:-n/a}"
  local loss="${M[net.loss]:-}"; loss="${loss%\%}"
  [[ "$loss" =~ ^[0-9]+$ ]] && gt "$loss" 5 && add_warn "Packet loss ${loss}%"
  SCORES[network]=100
  [[ "${M[net.private_ip]:-n/a}" == n/a ]] && { add_warn "No private IP detected"; SCORES[network]=70; }
}

###############################################################################
# 10. Security
###############################################################################
collect_security() {
  # firewall
  local fw="none/disabled"
  if have ufw && run ufw status | grep -qi 'Status: active'; then fw="ufw active"
  elif have firewall-cmd && run firewall-cmd --state | grep -qi running; then fw="firewalld active"
  elif have nft && [[ -n "$(run nft list ruleset)" ]]; then fw="nftables rules present"
  elif have iptables && [[ "$(run iptables -S | wc -l)" -gt 3 ]]; then fw="iptables rules present"; fi
  set_m sec.firewall "$fw"
  [[ "$fw" == none/disabled ]] && { add_warn "No active firewall detected"; }
  # fail2ban
  if have fail2ban-client && run fail2ban-client ping >/dev/null 2>&1; then
    set_m sec.fail2ban "active ($(run fail2ban-client status | awk -F: '/Jail list/{print $2}' | xargs))"
  else set_m sec.fail2ban "not running"; fi
  # SELinux / AppArmor
  if have getenforce; then set_m sec.mac "SELinux: $(run getenforce)"
  elif have aa-status && run aa-status --enabled 2>/dev/null; then set_m sec.mac "AppArmor: enabled"
  else set_m sec.mac "none"; fi
  # SSH config
  local sshd=/etc/ssh/sshd_config port rootlogin
  port="$(run grep -Ei '^[[:space:]]*Port ' $sshd | awk '{print $2}' | paste -sd, -)"; [[ -z "$port" ]] && port="22 (default)"
  rootlogin="$(run grep -Ei '^[[:space:]]*PermitRootLogin' $sshd | awk '{print $2}' | tail -1)"; [[ -z "$rootlogin" ]] && rootlogin="default(prohibit-password)"
  set_m sec.ssh_port "$port"; set_m sec.root_login "$rootlogin"
  [[ "$rootlogin" == yes ]] && add_warn "SSH PermitRootLogin=yes (consider disabling)"
  # failed logins
  local failed="n/a"
  if have journalctl; then failed="$(run journalctl -u ssh -u sshd --since '24 hours ago' 2>/dev/null | grep -c 'Failed password')"
  elif [[ -r /var/log/auth.log ]]; then failed="$(run grep -c 'Failed password' /var/log/auth.log)"
  elif [[ -r /var/log/secure ]]; then failed="$(run grep -c 'Failed password' /var/log/secure)"; fi
  set_m sec.failed_logins "$failed"
  [[ "$failed" =~ ^[0-9]+$ ]] && [[ "$failed" -gt 50 ]] && add_warn "$failed failed SSH logins in 24h (possible brute force)"
  # world-writable files (bounded scan to stay light)
  local ww; ww="$(run find /etc /usr/local -xdev -type f -perm -0002 2>/dev/null | head -5 | paste -sd, -)"
  set_m sec.world_writable "${ww:-none found (in /etc,/usr/local)}"
  [[ -n "$ww" ]] && add_warn "World-writable files found: $ww"

  # score
  local s=100
  [[ "$fw" == none/disabled ]] && s=$((s-25))
  [[ "$rootlogin" == yes ]] && s=$((s-15))
  [[ "${M[sec.fail2ban]}" == "not running" ]] && s=$((s-10))
  [[ -n "$ww" ]] && s=$((s-10))
  SCORES[security]=$s
  [[ $s -ge 85 ]] && add_pass "Security posture OK (score $s)"
}

###############################################################################
# 11. Services
###############################################################################
_svc_active() { # $1 unit name(s) space-sep alternatives
  local u
  for u in $1; do
    if have systemctl; then run timeout 5 systemctl is-active --quiet "$u" && { echo active; return; }
    fi
  done
  for u in $1; do pgrep -x "${u%%.*}" >/dev/null 2>&1 && { echo active; return; }; done
  echo "inactive"
}
collect_services() {
  # map: label -> candidate unit/proc names ; only report ones that are installed
  local -A svc=(
    [SSH]="sshd ssh" [Nginx]="nginx" [Apache]="apache2 httpd" [LiteSpeed]="litespeed openlitespeed lshttpd lsws"
    [MySQL]="mysql mysqld" [MariaDB]="mariadb" [PostgreSQL]="postgresql postgres"
    [MongoDB]="mongod" [Redis]="redis redis-server" [Memcached]="memcached"
    [Docker]="docker" [PHP-FPM]="php-fpm php7.4-fpm php8.1-fpm php8.2-fpm php8.3-fpm"
    [Cron]="cron crond" [Fail2Ban]="fail2ban"
  )
  local down=0 report="" installed=0
  # Snapshot all installed service units ONCE (--no-pager + timeout so this can
  # never hang when spawned non-interactively).
  local units=""
  have systemctl && units="$(run timeout 8 systemctl list-unit-files --no-pager --no-legend --type=service 2>/dev/null)"
  local label
  for label in SSH Nginx Apache LiteSpeed MySQL MariaDB PostgreSQL MongoDB Redis Memcached Docker PHP-FPM Cron Fail2Ban; do
    local cands="${svc[$label]}" present=0 u
    for u in $cands; do
      if [[ -n "$units" ]] && grep -q "^${u%.*}\(\.service\)\? " <<<"$units"; then present=1; break; fi
      have "${u%%.*}" && present=1 && break
      pgrep -x "${u%%.*}" >/dev/null 2>&1 && present=1 && break
    done
    [[ $present -eq 0 ]] && continue
    installed=$((installed+1))
    local st; st="$(_svc_active "$cands")"
    report+="$label:$st; "
    if [[ "$st" == inactive ]]; then down=$((down+1)); add_warn "Service $label is not running"; fi
  done
  set_m svc.report "${report:-none detected}"; set_m svc.installed "$installed"; set_m svc.down "$down"
  # Node.js present?
  have node && set_m svc.node "$(run node -v)" || set_m svc.node "n/a"
  if [[ $installed -eq 0 ]]; then SCORES[services]=90
  elif [[ $down -eq 0 ]]; then SCORES[services]=100; add_pass "All $installed detected services running"
  else SCORES[services]=$(( 100 - down*25 )); [[ ${SCORES[services]} -lt 0 ]] && SCORES[services]=0; fi
}

###############################################################################
# 12. Software versions
###############################################################################
collect_software() {
  set_m sw.php "$(have php && run php -r 'echo PHP_VERSION;' || echo n/a)"
  set_m sw.python "$(have python3 && run python3 --version 2>&1 | awk '{print $2}' || (have python && run python --version 2>&1 | awk '{print $2}') || echo n/a)"
  set_m sw.node "$(have node && run node -v || echo n/a)"
  set_m sw.npm "$(have npm && run npm -v || echo n/a)"
  set_m sw.java "$(have java && run java -version 2>&1 | head -1 | awk -F'"' '{print $2}' || echo n/a)"
  set_m sw.docker "$(have docker && run docker --version | awk '{print $3}' | tr -d , || echo n/a)"
  set_m sw.git "$(have git && run git --version | awk '{print $3}' || echo n/a)"
  set_m sw.composer "$(have composer && run composer --version 2>/dev/null | awk '{print $3}' || echo n/a)"
}

###############################################################################
# 13. Databases (best-effort, local socket, no creds stored)
###############################################################################
collect_database() {
  local found=0 report=""
  if have mysql || have mysqladmin; then
    found=1
    if run timeout 6 mysqladmin ping >/dev/null 2>&1; then
      local up conn; up="$(run timeout 6 mysqladmin status | grep -o 'Uptime: [0-9]*' | awk '{print $2"s"}')"
      conn="$(run timeout 6 mysqladmin status | grep -o 'Threads: [0-9]*' | awk '{print $2}')"
      report+="MySQL/MariaDB: up (uptime=${up:-?}, threads=${conn:-?}); "
      add_pass "MySQL/MariaDB responding"
    else report+="MySQL/MariaDB: installed but not reachable via local socket (creds?); "; fi
  fi
  if have psql && (run timeout 6 pg_isready >/dev/null 2>&1); then
    found=1; report+="PostgreSQL: $(run timeout 6 pg_isready | awk -F- '{print $2}' | xargs); "; add_pass "PostgreSQL accepting connections"
  fi
  if have redis-cli; then
    found=1
    if [[ "$(run timeout 6 redis-cli ping)" == PONG ]]; then
      report+="Redis: up ($(run timeout 6 redis-cli info server | awk -F: '/uptime_in_seconds/{print $2}' | tr -d '\r')s); "
    else report+="Redis: not responding; "; add_warn "Redis installed but not responding"; fi
  fi
  # MongoDB: probe the TCP port directly. The mongosh/mongo CLIs are Node
  # wrappers that can fork children and hang a piped command-substitution even
  # under `timeout`, so we avoid them and just test connectivity.
  if have mongosh || have mongo || have mongod || { have ss && run ss -ltnH | grep -q ':27017'; }; then
    found=1
    if run timeout 3 bash -c ': </dev/tcp/127.0.0.1/27017' 2>/dev/null; then report+="MongoDB: up; "
    else report+="MongoDB: not responding; "; fi
  fi
  set_m db.report "${report:-no database engines detected}"
  if [[ $found -eq 0 ]]; then SCORES[database]=100; else
    [[ "$report" == *"not "* ]] && SCORES[database]=60 || SCORES[database]=100
  fi
}

###############################################################################
# 14. Docker / Kubernetes
###############################################################################
collect_containers() {
  if have docker && run timeout 6 docker info >/dev/null 2>&1; then
    set_m docker.running "$(run timeout 6 docker ps -q | wc -l | tr -d ' ')"
    set_m docker.stopped "$(run timeout 6 docker ps -aq -f status=exited | wc -l | tr -d ' ')"
    set_m docker.images "$(run timeout 6 docker images -q | wc -l | tr -d ' ')"
    set_m docker.volumes "$(run timeout 6 docker volume ls -q | wc -l | tr -d ' ')"
    local unhealthy; unhealthy="$(run timeout 6 docker ps --filter health=unhealthy -q | wc -l | tr -d ' ')"
    set_m docker.unhealthy "$unhealthy"
    [[ "$unhealthy" -gt 0 ]] && add_warn "$unhealthy unhealthy Docker container(s)"
  else set_m docker.running "n/a (docker not active)"; fi
  if have kubectl; then
    set_m k8s.nodes "$(run timeout 6 kubectl get nodes --no-headers 2>/dev/null | awk '{print $1"="$2}' | paste -sd, - | head -c 160)"
    set_m k8s.pods "$(run timeout 6 kubectl get pods -A --no-headers 2>/dev/null | wc -l | tr -d ' ') pods"
  else set_m k8s.nodes "n/a"; fi
}

###############################################################################
# 15. Logs (recent errors only; capped)
###############################################################################
collect_logs() {
  local errs=""
  if have journalctl; then
    # cap with -n: an uncapped `-p err -b` scan can take ~1 min on a busy host
    errs="$(run timeout 8 journalctl -p err -b -n 200 --no-pager 2>/dev/null | tail -8)"
  fi
  [[ -z "$errs" && -r /var/log/syslog ]] && errs="$(run grep -iE 'error|fail' /var/log/syslog | tail -8)"
  set_m log.system "$(echo "$errs" | head -c 800)"
  set_m log.kernel "$(run timeout 6 dmesg -l err,crit,alert,emerg 2>/dev/null | tail -5 | head -c 500)"
  local diskerr; diskerr="$(run timeout 6 dmesg 2>/dev/null | grep -iE 'I/O error|ata.*error|EXT4-fs error|reset SATA' | tail -3)"
  set_m log.disk "${diskerr:-none}"
  [[ -n "$diskerr" ]] && add_warn "Disk/IO errors in kernel log"
  local nginxerr; [[ -r /var/log/nginx/error.log ]] && nginxerr="$(run tail -3 /var/log/nginx/error.log | head -c 400)"
  set_m log.nginx "${nginxerr:-n/a}"
  local apacheerr
  for f in /var/log/apache2/error.log /var/log/httpd/error_log; do [[ -r $f ]] && apacheerr="$(run tail -3 "$f" | head -c 400)"; done
  set_m log.apache "${apacheerr:-n/a}"
}

###############################################################################
# 16. Website monitoring
###############################################################################
declare -a WEB_ROWS=()
collect_websites() {
  [[ ${#WEBSITES[@]} -eq 0 ]] && { SCORES[website]=100; return; }
  have curl || { add_warn "curl missing - cannot monitor websites"; SCORES[website]=90; return; }
  local down=0 total=0 host proto url
  for url in "${WEBSITES[@]}"; do
    [[ -z "$url" ]] && continue
    total=$((total+1))
    [[ "$url" != http*://* ]] && url="https://$url"
    host="$(echo "$url" | sed -E 's#https?://##; s#/.*##; s#:.*##')"
    local code rt redirect ssl_exp ssl_iss dns cdn
    # single request captures status, response time and redirect target
    local _w; _w="$(run curl -s -o /dev/null -m 6 -w '%{http_code}|%{time_total}|%{redirect_url}' "$url")"
    code="${_w%%|*}"; local _rest="${_w#*|}"; rt="${_rest%%|*}"; redirect="${_rest#*|}"
    [[ -z "$code" ]] && code=000
    dns="$( (have dig && run dig +short "$host" | paste -sd, -) || (have host && run host "$host" | awk '{print $NF}' | paste -sd, -) )"
    # SSL info
    if [[ "$url" == https://* ]] && have openssl; then
      local cert; cert="$(echo | run timeout 5 openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | run openssl x509 -noout -enddate -issuer 2>/dev/null)"
      ssl_exp="$(echo "$cert" | awk -F= '/notAfter/{print $2}')"
      ssl_iss="$(echo "$cert" | sed -n 's/.*issuer=.*O = \([^,]*\).*/\1/p; s/.*issuer=.*O=\([^,]*\).*/\1/p' | head -1)"
    fi
    # CDN detection via headers
    local hdr; hdr="$(run curl -s -I -m 5 "$url")"
    cdn="$(echo "$hdr" | grep -iE 'cf-ray|server: cloudflare' >/dev/null && echo Cloudflare)"
    [[ -z "$cdn" ]] && cdn="$(echo "$hdr" | grep -iE 'x-amz-cf-id|x-cache.*cloudfront' >/dev/null && echo CloudFront)"
    [[ -z "$cdn" ]] && cdn="$(echo "$hdr" | grep -iE 'x-fastly|fastly' >/dev/null && echo Fastly)"
    [[ -z "$cdn" ]] && cdn="none"
    # SSL days left
    local days="n/a"
    if [[ -n "${ssl_exp:-}" ]]; then
      local exp_epoch now_epoch; exp_epoch="$(date -d "$ssl_exp" +%s 2>/dev/null)"; now_epoch="$(date +%s)"
      [[ -n "$exp_epoch" ]] && days=$(( (exp_epoch-now_epoch)/86400 ))
    fi
    # status classification
    local ok=1
    if [[ ! "$code" =~ ^(2|3)[0-9][0-9]$ ]]; then ok=0; down=$((down+1)); add_crit "Website DOWN: $url (HTTP ${code:-000})"; fi
    [[ "$days" =~ ^-?[0-9]+$ && "$days" -lt "$TH_SSL_DAYS" ]] && add_warn "SSL for $host expires in ${days}d"
    [[ "$ok" == 1 ]] && add_pass "Website up: $url (HTTP $code, ${rt}s)"
    WEB_ROWS+=("$url|$code|${rt}s|${redirect:-none}|${ssl_exp:-n/a}|${ssl_iss:-n/a}|${days}|${dns:-n/a}|$cdn")
    set_m "web.row.$total" "$url|${code:-000}|${rt}s|${days}|${ssl_iss:-n/a}|$cdn"
  done
  set_m web.total "$total"; set_m web.down "$down"
  if [[ $total -eq 0 ]]; then SCORES[website]=100
  elif [[ $down -eq 0 ]]; then SCORES[website]=100
  else SCORES[website]=$(( 100 - down*100/total )); fi
}

###############################################################################
# 17. Health score
###############################################################################
compute_score() {
  local cats=(cpu memory disk network security services website database)
  local sum=0 n=0 c
  for c in "${cats[@]}"; do
    [[ -n "${SCORES[$c]:-}" ]] || SCORES[$c]=100
    sum=$((sum+SCORES[$c])); n=$((n+1))
  done
  M[score.overall]=$(( n>0 ? sum/n : 100 ))
}

###############################################################################
# 18. AI recommendations (local heuristic engine - no data leaves the box)
###############################################################################
ai_recommendations() {
  local u="${M[cpu.usage]:-}"; [[ "$u" =~ ^[0-9]+$ ]] && gt "$u" "$TH_CPU" && \
    add_reco "CPU saturated (${u}%). Cause: runaway/high-traffic process. Fix: inspect 'top'/'ps' (top consumers: ${M[cpu.top]:-?}); scale CPU or optimize the busiest service; enable caching (opcache/redis)."
  local mp="${M[mem.usage]:-}"; [[ "$mp" =~ ^[0-9]+$ ]] && gt "$mp" "$TH_MEM" && \
    add_reco "Memory pressure (${mp}%). Cause: undersized RAM or leak. Fix: add swap as a buffer, tune service memory (php-fpm pm.max_children, mysql innodb_buffer_pool_size), or upgrade RAM."
  local dw="${M[disk.worst_pct]:-0}"; [[ "$dw" -gt "$TH_DISK" ]] && \
    add_reco "Disk nearly full (${dw}%). Cause: logs/backups/uploads growth. Fix: clean /var/log & old backups, enable logrotate, move large data to a mounted volume. Predicted: outages/DB corruption if it hits 100%."
  [[ "${M[sec.firewall]:-}" == none/disabled ]] && \
    add_reco "No firewall active. Security fix: enable ufw/firewalld, allow only 22,80,443, deny the rest."
  [[ "${M[sec.root_login]:-}" == yes ]] && \
    add_reco "SSH root login enabled. Security fix: set 'PermitRootLogin no', use a sudo user + key auth, install fail2ban."
  [[ "${M[sec.fail2ban]:-}" == "not running" ]] && \
    add_reco "fail2ban not running. Security fix: install & enable fail2ban to block SSH brute-force (saw ${M[sec.failed_logins]:-0} failed logins/24h)."
  [[ "${M[disk.smart]:-}" == FAIL* ]] && add_reco "SMART failing. Fix: back up NOW and replace the failing disk; open a ticket with the host."
  [[ "${M[disk.raid]:-}" == DEGRADED ]] && add_reco "RAID degraded. Fix: identify failed member (mdadm --detail), replace disk, resync array."
  local sd="${M[svc.down]:-0}"; [[ "$sd" -gt 0 ]] && add_reco "$sd service(s) down. Fix: 'systemctl status <svc>' then start/enable; check logs for the crash reason."
  [[ "${M[web.down]:-0}" -gt 0 ]] && add_reco "Website(s) down. Fix: check web server + app logs, DNS, and upstream/DB connectivity."
  # capacity prediction (simple)
  if [[ "$dw" -ge 75 && "$dw" -le "$TH_DISK" ]]; then add_reco "Capacity: disk at ${dw}% and climbing - plan cleanup/expansion within days, not weeks."; fi
  [[ ${#RECO[@]} -eq 0 ]] && add_reco "No issues detected. Maintain: keep packages patched, verify backups restore, review logs weekly."
}

###############################################################################
# 19. Reports
###############################################################################
sev_color() { local n="$1"; if [[ $n -ge 85 ]]; then printf '%s' "$C_GRN"; elif [[ $n -ge 60 ]]; then printf '%s' "$C_YEL"; else printf '%s' "$C_RED"; fi; }
bar() { local n="$1" w=20 f; f=$(( n*w/100 )); printf '['; printf '%0.s#' $(seq 1 $f) 2>/dev/null; printf '%0.s-' $(seq 1 $((w-f))) 2>/dev/null; printf ']'; }

report_terminal() {
  [[ $QUIET -eq 1 ]] && return
  local ov="${M[score.overall]}"
  echo
  echo "${C_BOLD}${C_CYN}==================== SERVER HEALTH REPORT ====================${C_RST}"
  echo "${C_DIM}Generated: ${M[sys.time]}  |  Host: ${M[sys.hostname]}  |  v$SH_VERSION${C_RST}"
  echo
  echo "${C_BOLD}1) EXECUTIVE SUMMARY${C_RST}"
  echo "   Environment : ${M[env.type]} | Virt: ${M[env.virtualization]} | Cloud: ${M[env.cloud]} | Panel: ${M[env.panel]}"
  echo "   OS          : ${M[sys.distro]} (${M[sys.kernel]}, ${M[sys.arch]})"
  echo "   Uptime      : ${M[sys.uptime]}"
  echo "   Verdict     : $(sev_color "$ov")${C_BOLD}$([[ $ov -ge 85 ]] && echo HEALTHY || { [[ $ov -ge 60 ]] && echo 'NEEDS ATTENTION' || echo CRITICAL; })${C_RST} | Issues: ${#CRIT[@]} crit, ${#WARN[@]} warn"
  echo
  echo "${C_BOLD}2) HEALTH SCORE${C_RST}   Overall: $(sev_color "$ov")${C_BOLD}${ov}/100${C_RST} $(sev_color "$ov")$(bar "$ov")${C_RST}"
  local c; for c in cpu memory disk network security services website database; do
    printf "   %-9s $(sev_color "${SCORES[$c]}")%3s/100${C_RST} $(sev_color "${SCORES[$c]}")%s${C_RST}\n" "${c^}" "${SCORES[$c]}" "$(bar "${SCORES[$c]}")"
  done
  echo
  echo "${C_BOLD}${C_RED}3) CRITICAL ISSUES${C_RST}"
  if [[ ${#CRIT[@]} -eq 0 ]]; then echo "   ${C_GRN}none${C_RST}"; else printf "   ${C_RED}✗ %s${C_RST}\n" "${CRIT[@]}"; fi
  echo "${C_BOLD}${C_YEL}4) WARNINGS${C_RST}"
  if [[ ${#WARN[@]} -eq 0 ]]; then echo "   ${C_GRN}none${C_RST}"; else printf "   ${C_YEL}! %s${C_RST}\n" "${WARN[@]}"; fi
  echo "${C_BOLD}${C_GRN}5) PASSED CHECKS${C_RST} (${#PASS[@]})"
  printf "   ${C_GRN}✓ %s${C_RST}\n" "${PASS[@]:0:12}"
  echo
  echo "${C_BOLD}6) DETAILED METRICS${C_RST}"
  echo "   ${C_CYN}CPU${C_RST}    : ${M[cpu.model]} | ${M[cpu.cores]} cores/${M[cpu.threads]} thr | usage ${M[cpu.usage]}% | load ${M[cpu.load]} | ${M[cpu.freq]} | temp ${M[cpu.temp]}"
  echo "   ${C_CYN}MEMORY${C_RST} : ${M[mem.used]}/${M[mem.total]} (${M[mem.usage]}%) | avail ${M[mem.available]} | swap ${M[mem.swap_used]}/${M[mem.swap_total]}"
  echo "   ${C_CYN}DISK${C_RST}   : / ${M[disk.used]}/${M[disk.total]} (${M[disk.usage]}) | worst ${M[disk.worst_pct]}% | ${M[disk.type]} | SMART ${M[disk.smart]} | RAID ${M[disk.raid]}"
  echo "            inodes ${M[disk.inodes]}"
  echo "   ${C_CYN}NET${C_RST}    : pub ${M[net.public_ip]} (${M[net.isp]}) | priv ${M[net.private_ip]} | gw ${M[net.gateway]} | dns ${M[net.dns]}"
  echo "            conns ${M[net.connections]} | ping ${M[net.ping]:-n/a} | loss ${M[net.loss]:-n/a} | speed ${M[net.speed]}"
  echo "   ${C_CYN}SEC${C_RST}    : fw ${M[sec.firewall]} | f2b ${M[sec.fail2ban]} | ${M[sec.mac]} | ssh ${M[sec.ssh_port]} root=${M[sec.root_login]} | failed ${M[sec.failed_logins]}"
  echo "   ${C_CYN}SVC${C_RST}    : ${M[svc.report]}"
  echo "   ${C_CYN}DB${C_RST}     : ${M[db.report]}"
  echo "   ${C_CYN}DOCKER${C_RST} : running ${M[docker.running]} | stopped ${M[docker.stopped]:-n/a} | images ${M[docker.images]:-n/a} | unhealthy ${M[docker.unhealthy]:-n/a}"
  echo "   ${C_CYN}SW${C_RST}     : php ${M[sw.php]} | python ${M[sw.python]} | node ${M[sw.node]} | docker ${M[sw.docker]} | git ${M[sw.git]}"
  if [[ ${#WEB_ROWS[@]} -gt 0 ]]; then
    echo "   ${C_CYN}WEBSITES${C_RST}:"
    local r; for r in "${WEB_ROWS[@]}"; do IFS='|' read -r u code rt rd exp iss days dns cdn <<<"$r"
      echo "            $u -> HTTP $code (${rt}) SSL ${days}d [$iss] CDN:$cdn"
    done
  fi
  echo
  echo "${C_BOLD}${C_MAG}7) AI RECOMMENDATIONS${C_RST}"
  printf "   ${C_MAG}→ %s${C_RST}\n" "${RECO[@]}"
  echo
  echo "${C_BOLD}8) RECOMMENDED ACTIONS${C_RST}"
  if [[ ${#CRIT[@]} -gt 0 ]]; then echo "   ${C_RED}Act now:${C_RST} resolve critical issues above (data-loss / outage risk)."; fi
  if [[ ${#WARN[@]} -gt 0 ]]; then echo "   ${C_YEL}Soon:${C_RST} address warnings to prevent escalation."; fi
  [[ ${#CRIT[@]} -eq 0 && ${#WARN[@]} -eq 0 ]] && echo "   ${C_GRN}Maintain current posture; keep patched & backed up.${C_RST}"
  echo "${C_BOLD}${C_CYN}==============================================================${C_RST}"
}

report_json() {
  local f="$OUTPUT_DIR/health-$TS.json" k first
  { echo "{"
    echo "  \"generated\": \"$(json_escape "${M[sys.time]}")\", \"version\": \"$SH_VERSION\","
    echo "  \"overall_score\": ${M[score.overall]},"
    echo -n "  \"scores\": {"; first=1; for k in cpu memory disk network security services website database; do [[ $first -eq 0 ]] && echo -n ","; echo -n "\"$k\":${SCORES[$k]}"; first=0; done; echo "},"
    echo -n "  \"metrics\": {"; first=1
    for k in "${!M[@]}"; do [[ $first -eq 0 ]] && echo -n ","; echo -n "\"$(json_escape "$k")\":\"$(json_escape "${M[$k]}")\""; first=0; done; echo "},"
    _arr() { local name="$1"; shift; echo -n "  \"$name\": ["; local i=0 x; for x in "$@"; do [[ $i -gt 0 ]] && echo -n ","; echo -n "\"$(json_escape "$x")\""; i=1; done; echo "]"; }
    _arr critical "${CRIT[@]}"; echo ","
    _arr warnings "${WARN[@]}"; echo ","
    _arr recommendations "${RECO[@]}"
    echo "}"
  } > "$f"
  set_m report.json "$f"; log INFO "JSON report: $f"
}

report_csv() {
  local f="$OUTPUT_DIR/health-$TS.csv" k
  { echo "metric,value"; for k in "${!M[@]}"; do echo "\"$k\",\"$(echo "${M[$k]}" | tr '"' "'")\""; done
    for k in cpu memory disk network security services website database; do echo "\"score.$k\",\"${SCORES[$k]}\""; done
  } | sort > "$f"
  set_m report.csv "$f"; log INFO "CSV report: $f"
}

report_html() {
  local f="$OUTPUT_DIR/health-$TS.html" ov="${M[score.overall]}" c color
  color=$([[ $ov -ge 85 ]] && echo '#16a34a' || { [[ $ov -ge 60 ]] && echo '#d97706' || echo '#dc2626'; })
  { cat <<HTML
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Server Health - $(html_escape "${M[sys.hostname]}")</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:0;background:#0f172a;color:#e2e8f0}
.wrap{max-width:1000px;margin:0 auto;padding:24px}
h1{font-size:20px;margin:0 0 4px} .sub{color:#94a3b8;font-size:13px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.card{background:#1e293b;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.big{font-size:42px;font-weight:700;color:$color}
.bar{height:8px;border-radius:6px;background:#334155;overflow:hidden;margin-top:6px}
.bar>i{display:block;height:100%}
.lbl{color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
table{width:100%;border-collapse:collapse;font-size:13px} td,th{padding:6px 8px;border-bottom:1px solid #334155;text-align:left}
.crit{color:#f87171}.warn{color:#fbbf24}.ok{color:#4ade80}
.sec{margin-top:24px} ul{margin:6px 0;padding-left:18px}
</style></head><body><div class="wrap">
<h1>Server Health Report — $(html_escape "${M[sys.hostname]}")</h1>
<div class="sub">Generated $(html_escape "${M[sys.time]}") · v$SH_VERSION · ${M[env.type]} / ${M[env.cloud]} / panel:${M[env.panel]}</div>
<div class="grid">
<div class="card"><div class="lbl">Overall</div><div class="big">$ov<span style="font-size:16px;color:#64748b">/100</span></div></div>
HTML
    for c in cpu memory disk network security services website database; do
      local s="${SCORES[$c]}" col; col=$([[ $s -ge 85 ]] && echo '#16a34a' || { [[ $s -ge 60 ]] && echo '#d97706' || echo '#dc2626'; })
      echo "<div class=\"card\"><div class=\"lbl\">$c</div><div style=\"font-size:24px;font-weight:600\">$s</div><div class=\"bar\"><i style=\"width:${s}%;background:$col\"></i></div></div>"
    done
    echo '</div>'
    echo '<div class="sec card"><h3>Critical</h3><ul>'
    if [[ ${#CRIT[@]} -eq 0 ]]; then echo '<li class="ok">none</li>'; else for c in "${CRIT[@]}"; do echo "<li class=\"crit\">$(html_escape "$c")</li>"; done; fi
    echo '</ul><h3>Warnings</h3><ul>'
    if [[ ${#WARN[@]} -eq 0 ]]; then echo '<li class="ok">none</li>'; else for c in "${WARN[@]}"; do echo "<li class=\"warn\">$(html_escape "$c")</li>"; done; fi
    echo '</ul><h3>AI Recommendations</h3><ul>'
    for c in "${RECO[@]}"; do echo "<li>$(html_escape "$c")</li>"; done
    echo '</ul></div>'
    echo '<div class="sec card"><h3>Detailed Metrics</h3><table><tr><th>Metric</th><th>Value</th></tr>'
    for c in $(printf '%s\n' "${!M[@]}" | sort); do echo "<tr><td>$(html_escape "$c")</td><td>$(html_escape "${M[$c]}")</td></tr>"; done
    echo '</table></div>'
    echo '</div></body></html>'
  } > "$f"
  set_m report.html "$f"; log INFO "HTML report: $f"
}

report_pdf() {
  local h="${M[report.html]:-}"; [[ -z "$h" ]] && report_html && h="${M[report.html]}"
  local f="$OUTPUT_DIR/health-$TS.pdf"
  if have wkhtmltopdf; then run wkhtmltopdf -q "$h" "$f" && set_m report.pdf "$f"
  elif have chromium-browser; then run chromium-browser --headless --disable-gpu --print-to-pdf="$f" "$h" && set_m report.pdf "$f"
  elif have google-chrome; then run google-chrome --headless --disable-gpu --print-to-pdf="$f" "$h" && set_m report.pdf "$f"
  else set_m report.pdf "n/a (install wkhtmltopdf or chromium for PDF)"; log WARN "PDF skipped: no renderer"; fi
}

###############################################################################
# 20. Notifications
###############################################################################
notify_summary() {
  local ov="${M[score.overall]}"
  printf 'Server Health: %s\nHost: %s\nScore: %s/100 (%s crit, %s warn)\nEnv: %s / %s\n%s' \
    "$([[ $ov -ge 85 ]] && echo HEALTHY || { [[ $ov -ge 60 ]] && echo 'NEEDS ATTENTION' || echo CRITICAL; })" \
    "${M[sys.hostname]}" "$ov" "${#CRIT[@]}" "${#WARN[@]}" "${M[env.type]}" "${M[env.cloud]}" \
    "$([[ ${#CRIT[@]} -gt 0 ]] && printf 'Critical:\n- %s\n' "${CRIT[@]}")"
}
send_notifications() {
  [[ $DO_NOTIFY -eq 1 ]] || return 0
  have curl || { log WARN "curl missing; cannot notify"; return 0; }
  local msg; msg="$(notify_summary)"
  if [[ -n "$NOTIFY_TELEGRAM_TOKEN" && -n "$NOTIFY_TELEGRAM_CHAT" ]]; then
    run curl -s -m 10 "https://api.telegram.org/bot${NOTIFY_TELEGRAM_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${NOTIFY_TELEGRAM_CHAT}" --data-urlencode "text=$msg" >/dev/null \
      && NOTIFY_STATUS[Telegram]=sent || NOTIFY_STATUS[Telegram]=failed
  fi
  if [[ -n "$NOTIFY_DISCORD_WEBHOOK" ]]; then
    run curl -s -m 10 -H 'Content-Type: application/json' -d "{\"content\":\"$(json_escape "$msg")\"}" "$NOTIFY_DISCORD_WEBHOOK" >/dev/null \
      && NOTIFY_STATUS[Discord]=sent || NOTIFY_STATUS[Discord]=failed
  fi
  if [[ -n "$NOTIFY_SLACK_WEBHOOK" ]]; then
    run curl -s -m 10 -H 'Content-Type: application/json' -d "{\"text\":\"$(json_escape "$msg")\"}" "$NOTIFY_SLACK_WEBHOOK" >/dev/null \
      && NOTIFY_STATUS[Slack]=sent || NOTIFY_STATUS[Slack]=failed
  fi
  if [[ -n "$NOTIFY_WEBHOOK_URL" ]]; then
    run curl -s -m 10 -H 'Content-Type: application/json' -d "{\"host\":\"${M[sys.hostname]}\",\"score\":${M[score.overall]},\"critical\":${#CRIT[@]},\"warnings\":${#WARN[@]}}" "$NOTIFY_WEBHOOK_URL" >/dev/null \
      && NOTIFY_STATUS[Webhook]=sent || NOTIFY_STATUS[Webhook]=failed
  fi
  if [[ -n "$NOTIFY_EMAIL_TO" ]] && have mail; then
    echo "$msg" | run mail -s "[Server Health] ${M[sys.hostname]} score ${M[score.overall]}" "$NOTIFY_EMAIL_TO" \
      && NOTIFY_STATUS[Email]=sent || NOTIFY_STATUS[Email]=failed
  fi
  if [[ -n "$NOTIFY_WA_TOKEN" && -n "$NOTIFY_WA_PHONE_ID" && -n "$NOTIFY_WA_TO" ]]; then
    run curl -s -m 10 "https://graph.facebook.com/v21.0/${NOTIFY_WA_PHONE_ID}/messages" \
      -H "Authorization: Bearer ${NOTIFY_WA_TOKEN}" -H 'Content-Type: application/json' \
      -d "{\"messaging_product\":\"whatsapp\",\"to\":\"${NOTIFY_WA_TO}\",\"type\":\"text\",\"text\":{\"body\":\"$(json_escape "$msg")\"}}" >/dev/null \
      && NOTIFY_STATUS[WhatsApp]=sent || NOTIFY_STATUS[WhatsApp]=failed
  fi
  # 10) Notification status
  if [[ ${#NOTIFY_STATUS[@]} -gt 0 ]]; then
    echo "${C_BOLD}10) NOTIFICATION STATUS${C_RST}"
    local ch; for ch in "${!NOTIFY_STATUS[@]}"; do
      local st="${NOTIFY_STATUS[$ch]}"; local col=$([[ "$st" == sent ]] && echo "$C_GRN" || echo "$C_RED")
      echo "   $ch: ${col}${st}${C_RST}"
    done
  fi
}

###############################################################################
# 21. Main
###############################################################################
main() {
  parse_args "$@"
  init_colors
  load_config
  mkdir -p "$OUTPUT_DIR" 2>/dev/null || OUTPUT_DIR="."
  log INFO "=== server-health v$SH_VERSION run start ==="

  # collect (each module is independent & failure-isolated)
  detect_environment; collect_system; collect_cpu; collect_memory; collect_storage
  collect_network; collect_security; collect_services; collect_software
  collect_database; collect_containers; collect_logs; collect_websites
  compute_score; ai_recommendations

  # 9) report export (write files per requested formats)
  local fmt
  IFS=',' read -ra _fmts <<<"$FORMATS"
  for fmt in "${_fmts[@]}"; do
    case "$fmt" in
      terminal) : ;;                # printed below
      json) report_json;;
      csv)  report_csv;;
      html) report_html;;
      pdf)  report_pdf;;
      *) log WARN "Unknown format: $fmt";;
    esac
  done

  report_terminal
  [[ $QUIET -eq 0 ]] && {
    echo "${C_BOLD}9) REPORT EXPORT${C_RST}"
    [[ -n "${M[report.json]:-}" ]] && echo "   JSON: ${M[report.json]}"
    [[ -n "${M[report.csv]:-}"  ]] && echo "   CSV : ${M[report.csv]}"
    [[ -n "${M[report.html]:-}" ]] && echo "   HTML: ${M[report.html]}"
    [[ -n "${M[report.pdf]:-}"  ]] && echo "   PDF : ${M[report.pdf]}"
  }

  send_notifications
  log INFO "=== run complete: score ${M[score.overall]}, ${#CRIT[@]} crit, ${#WARN[@]} warn ==="

  # exit code reflects health for cron/monitoring integration
  [[ ${#CRIT[@]} -gt 0 ]] && exit 2 || exit 0
}
main "$@"
