#!/usr/bin/env bash
set -euo pipefail

SESSION_PREFIX="question-constellation-dev"
MAIN_DEFAULT_PORT=5173
WORKTREE_PORT_MIN=5174
WORKTREE_PORT_MAX=5179

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WORKTREE_BASE_DIR="${HOME}/.codex/worktrees"
SCRIPT_NAME="$(basename "$0")"
APP_SUBDIR="${3:-}"

if [[ -n "${APP_SUBDIR}" ]]; then
  if [[ "${APP_SUBDIR}" == /* || "${APP_SUBDIR}" == *".."* ]]; then
    echo "app directory must be a relative workspace path: ${APP_SUBDIR}" >&2
    exit 2
  fi
  RUN_DIR="$(cd "${ROOT_DIR}/${APP_SUBDIR}" 2>/dev/null && pwd -P || true)"
  if [[ -z "${RUN_DIR}" || ! -f "${RUN_DIR}/package.json" ]]; then
    echo "app directory does not contain a package.json: ${APP_SUBDIR}" >&2
    exit 2
  fi
else
  RUN_DIR="${ROOT_DIR}"
fi

usage() {
  cat <<EOF >&2
Usage:
  ${SCRIPT_NAME} <start|stop|restart|logs> [port] [app-directory]

Examples:
  ${SCRIPT_NAME} start
  ${SCRIPT_NAME} restart 5173
  ${SCRIPT_NAME} start 4174 marketing
  ${SCRIPT_NAME} stop
  ${SCRIPT_NAME} logs

Notes:
  - Main checkout defaults to http://localhost:${MAIN_DEFAULT_PORT}/.
  - Worktree checkouts auto-select a free port in ${WORKTREE_PORT_MIN}-${WORKTREE_PORT_MAX}.
  - Each port gets its own tmux session and log file.
  - Pass a workspace app directory such as 'marketing' to serve a sibling SvelteKit app.
EOF
}

require_tmux() {
  if ! command -v tmux >/dev/null 2>&1; then
    echo "tmux is required but was not found in PATH." >&2
    exit 1
  fi
}

is_worktree_repo() {
  local worktree_base
  worktree_base="$(cd "${WORKTREE_BASE_DIR}" 2>/dev/null && pwd -P || true)"
  if [[ -z "${worktree_base}" ]]; then
    return 1
  fi
  [[ "${ROOT_DIR}" == "${worktree_base}"/* ]]
}

validate_port_number() {
  local port="${1}"
  if [[ -z "${port}" ]]; then
    echo "port is required" >&2
    exit 2
  fi
  if [[ ! "${port}" =~ ^[0-9]+$ ]]; then
    echo "invalid port: ${port}" >&2
    exit 2
  fi
  if ((port < 1 || port > 65535)); then
    echo "invalid port: ${port}" >&2
    exit 2
  fi
}

validate_port_for_context() {
  local port="${1}"
  validate_port_number "${port}"
  if is_worktree_repo; then
    if ((port == MAIN_DEFAULT_PORT)); then
      echo "Port ${MAIN_DEFAULT_PORT} is reserved for the main checkout. Worktrees must use ${WORKTREE_PORT_MIN}-${WORKTREE_PORT_MAX}." >&2
      exit 2
    fi
    if ((port < WORKTREE_PORT_MIN || port > WORKTREE_PORT_MAX)); then
      echo "Worktree ports must be between ${WORKTREE_PORT_MIN} and ${WORKTREE_PORT_MAX}." >&2
      exit 2
    fi
  fi
}

session_name_for_port() {
  local port="${1}"
  echo "${SESSION_PREFIX}-${port}"
}

log_file_for_port() {
  local port="${1}"
  echo "/tmp/${SESSION_PREFIX}-${port}.log"
}

package_runner() {
  if command -v pnpm >/dev/null 2>&1; then
    echo "pnpm"
    return 0
  fi
  echo "npm"
}

list_managed_sessions() {
  tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^${SESSION_PREFIX}-[0-9]+$" || true
}

normalize_path() {
  local path="${1}"
  if [[ -z "${path}" ]]; then
    echo ""
    return 0
  fi
  if [[ -d "${path}" ]]; then
    (
      cd "${path}"
      pwd -P
    )
    return 0
  fi
  echo "${path}"
}

session_path() {
  local session_name="${1}"
  tmux display-message -p -t "${session_name}" '#{pane_current_path}' 2>/dev/null || true
}

session_pid() {
  local session_name="${1}"
  tmux display-message -p -t "${session_name}" '#{pane_pid}' 2>/dev/null || true
}

session_command() {
  local session_name="${1}"
  local pane_pid
  pane_pid="$(session_pid "${session_name}")"
  if [[ -z "${pane_pid}" ]]; then
    echo ""
    return 0
  fi
  ps -o command= -p "${pane_pid}" 2>/dev/null || true
}

session_port() {
  local session_name="${1}"
  local command
  if [[ "${session_name}" =~ -([0-9]+)$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi
  command="$(session_command "${session_name}")"
  if [[ "${command}" =~ --port[[:space:]]+([0-9]+) ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi
  echo ""
}

session_belongs_to_current_checkout() {
  local session_name="${1}"
  local target_path
  local current_checkout_path
  target_path="$(normalize_path "$(session_path "${session_name}")")"
  current_checkout_path="$(normalize_path "${RUN_DIR}")"
  [[ -n "${target_path}" && "${target_path}" == "${current_checkout_path}" ]]
}

find_same_checkout_session() {
  local session_name
  while IFS= read -r session_name; do
    if [[ -z "${session_name}" ]]; then
      continue
    fi
    if session_belongs_to_current_checkout "${session_name}"; then
      echo "${session_name}"
      return 0
    fi
  done < <(list_managed_sessions)
  return 1
}

find_session_for_port() {
  local port="${1}"
  local session_name
  while IFS= read -r session_name; do
    if [[ -z "${session_name}" ]]; then
      continue
    fi
    if [[ "$(session_port "${session_name}")" == "${port}" ]]; then
      echo "${session_name}"
      return 0
    fi
  done < <(list_managed_sessions)
  return 1
}

port_has_listener() {
  local port="${1}"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

listener_pids_for_port() {
  local port="${1}"
  lsof -t -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | awk '!seen[$0]++'
}

describe_session() {
  local session_name="${1}"
  local port
  local checkout_path
  port="$(session_port "${session_name}")"
  checkout_path="$(session_path "${session_name}")"
  echo "session=${session_name} port=${port:-unknown} path=${checkout_path:-unknown}"
}

print_session_info() {
  local session_name="${1}"
  local port="${2}"
  echo "URL: http://localhost:${port}/"
  echo "Attach: tmux attach -t ${session_name}"
  echo "Logs: $(log_file_for_port "${port}")"
}

ensure_port_available_for_start() {
  local port="${1}"
  local occupying_session
  occupying_session="$(find_session_for_port "${port}" || true)"
  if [[ -n "${occupying_session}" ]]; then
    if session_belongs_to_current_checkout "${occupying_session}"; then
      return 0
    fi
    echo "Port ${port} is already managed by $(describe_session "${occupying_session}")." >&2
    return 1
  fi
  if port_has_listener "${port}"; then
    echo "Port ${port} already has a listener." >&2
    return 1
  fi
}

auto_select_worktree_port() {
  local session_name
  local port
  local occupying_session
  session_name="$(find_same_checkout_session || true)"
  if [[ -n "${session_name}" ]]; then
    port="$(session_port "${session_name}")"
    if [[ -z "${port}" ]]; then
      echo "Could not determine the port for $(describe_session "${session_name}")." >&2
      exit 1
    fi
    echo "${port}"
    return 0
  fi
  for ((port = WORKTREE_PORT_MIN; port <= WORKTREE_PORT_MAX; port++)); do
    occupying_session="$(find_session_for_port "${port}" || true)"
    if [[ -n "${occupying_session}" ]]; then
      echo "Port ${port} is already used by $(describe_session "${occupying_session}"); trying the next port." >&2
      continue
    fi
    if port_has_listener "${port}"; then
      echo "Port ${port} already has a non-managed listener; trying the next port." >&2
      continue
    fi
    echo "${port}"
    return 0
  done
  echo "No available worktree dev-server ports were found for ${ROOT_DIR}." >&2
  echo "Tried ports ${WORKTREE_PORT_MIN}-${WORKTREE_PORT_MAX}." >&2
  exit 1
}

default_port_for_start() {
  local session_name
  local port
  if is_worktree_repo; then
    auto_select_worktree_port
    return 0
  fi
  session_name="$(find_same_checkout_session || true)"
  if [[ -n "${session_name}" ]]; then
    port="$(session_port "${session_name}")"
    if [[ -n "${port}" ]]; then
      echo "${port}"
      return 0
    fi
  fi
  echo "${MAIN_DEFAULT_PORT}"
}

kill_listeners_on_port() {
  local port="${1}"
  local pid
  local had_pid=0
  while IFS= read -r pid; do
    if [[ -z "${pid}" ]]; then
      continue
    fi
    had_pid=1
    kill "${pid}" >/dev/null 2>&1 || true
  done < <(listener_pids_for_port "${port}")
  if ((had_pid == 0)); then
    return 0
  fi
  for _ in {1..20}; do
    if ! port_has_listener "${port}"; then
      return 0
    fi
    sleep 0.2
  done
  echo "Port ${port} is still busy after requesting shutdown." >&2
  exit 1
}

reclaim_reserved_main_port() {
  local port_session
  port_session="$(find_session_for_port "${MAIN_DEFAULT_PORT}" || true)"
  if [[ -n "${port_session}" ]]; then
    tmux kill-session -t "${port_session}" >/dev/null 2>&1 || true
  fi
  kill_listeners_on_port "${MAIN_DEFAULT_PORT}"
}

start_session() {
  local port="${1}"
  local existing_session
  local existing_port
  local session_name
  local log_file
  local command
  local runner

  existing_session="$(find_same_checkout_session || true)"
  if [[ -n "${existing_session}" ]]; then
    existing_port="$(session_port "${existing_session}")"
    if [[ "${existing_port}" == "${port}" ]]; then
      echo "Dev server for this checkout is already running."
      print_session_info "${existing_session}" "${existing_port}"
      return 0
    fi
    echo "This checkout already has a dev server on port ${existing_port}." >&2
    echo "Use '${SCRIPT_NAME} restart ${port}' to move it." >&2
    return 1
  fi

  ensure_port_available_for_start "${port}"

  session_name="$(session_name_for_port "${port}")"
  log_file="$(log_file_for_port "${port}")"
  runner="$(package_runner)"
  if [[ "${runner}" == "pnpm" ]]; then
    # pnpm forwards arguments after the script name directly. Supplying npm's
    # extra `--` makes Vite treat every following option as positional input.
    command="$(printf 'cd %q && %q run dev --host 127.0.0.1 --port %q 2>&1 | tee %q' "${RUN_DIR}" "${runner}" "${port}" "${log_file}")"
  else
    command="$(printf 'cd %q && %q run dev -- --host 127.0.0.1 --port %q 2>&1 | tee %q' "${RUN_DIR}" "${runner}" "${port}" "${log_file}")"
  fi
  tmux new-session -d -s "${session_name}" "${command}"

  echo "Started ${session_name}"
  print_session_info "${session_name}" "${port}"
}

stop_session() {
  local requested_port="${1:-}"
  local target_session
  local target_port

  if [[ -n "${requested_port}" ]]; then
    validate_port_for_context "${requested_port}"
    target_port="${requested_port}"
    target_session="$(find_session_for_port "${target_port}" || true)"
    if [[ -z "${target_session}" ]]; then
      echo "No managed dev-server session found on port ${target_port}."
      return 0
    fi
    if ! session_belongs_to_current_checkout "${target_session}" && (is_worktree_repo || ((target_port != MAIN_DEFAULT_PORT))); then
      echo "Refusing to stop another checkout's dev server: $(describe_session "${target_session}")." >&2
      return 1
    fi
  else
    target_session="$(find_same_checkout_session || true)"
    if [[ -z "${target_session}" && ! is_worktree_repo ]]; then
      target_session="$(find_session_for_port "${MAIN_DEFAULT_PORT}" || true)"
    fi
    if [[ -z "${target_session}" ]]; then
      echo "No managed dev-server session is running for this checkout."
      return 0
    fi
  fi

  tmux kill-session -t "${target_session}"
  echo "Stopped ${target_session}"
}

restart_session() {
  local requested_port="${1:-}"
  local existing_session
  local existing_port
  local target_port

  existing_session="$(find_same_checkout_session || true)"
  existing_port=""
  if [[ -n "${existing_session}" ]]; then
    existing_port="$(session_port "${existing_session}")"
  fi

  if [[ -n "${requested_port}" ]]; then
    validate_port_for_context "${requested_port}"
    target_port="${requested_port}"
  elif [[ -n "${existing_port}" ]]; then
    target_port="${existing_port}"
  else
    target_port="$(default_port_for_start)"
  fi

  if [[ -n "${existing_session}" ]]; then
    tmux kill-session -t "${existing_session}"
  fi

  if ! is_worktree_repo && ((target_port == MAIN_DEFAULT_PORT)); then
    reclaim_reserved_main_port
  fi

  ensure_port_available_for_start "${target_port}"
  start_session "${target_port}"
}

tail_logs() {
  local requested_port="${1:-}"
  local target_port
  local target_session
  local log_file

  if [[ -n "${requested_port}" ]]; then
    validate_port_for_context "${requested_port}"
    target_port="${requested_port}"
  else
    target_session="$(find_same_checkout_session || true)"
    if [[ -n "${target_session}" ]]; then
      target_port="$(session_port "${target_session}")"
    elif is_worktree_repo; then
      echo "No dev-server session is running for this worktree. Start one first." >&2
      exit 1
    else
      target_port="${MAIN_DEFAULT_PORT}"
    fi
  fi

  log_file="$(log_file_for_port "${target_port}")"
  if [[ ! -f "${log_file}" ]]; then
    echo "Log file not found: ${log_file}" >&2
    echo "Start the server first: ${SCRIPT_NAME} start${requested_port:+ ${requested_port}}" >&2
    exit 1
  fi
  echo "Tailing ${log_file} (Ctrl+C to stop)"
  tail -n 50 -f "${log_file}"
}

ACTION="${1:-}"
REQUESTED_PORT="${2:-}"

if [[ -z "${ACTION}" ]]; then
  usage
  exit 2
fi

case "${ACTION}" in
  start)
    require_tmux
    if [[ -n "${REQUESTED_PORT}" ]]; then
      validate_port_for_context "${REQUESTED_PORT}"
      start_session "${REQUESTED_PORT}"
    else
      start_session "$(default_port_for_start)"
    fi
    ;;
  stop)
    require_tmux
    stop_session "${REQUESTED_PORT}"
    ;;
  restart)
    require_tmux
    restart_session "${REQUESTED_PORT}"
    ;;
  logs)
    tail_logs "${REQUESTED_PORT}"
    ;;
  *)
    usage
    exit 2
    ;;
esac
