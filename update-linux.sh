#!/usr/bin/env bash
# Dedicated Environment Updater for Linux / macOS (@francogp/auditor)
# Updates Node.js to latest Current, updates npm, and synchronizes .nvmrc & package.json.

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
exec "$SCRIPT_DIR/setup-linux.sh" --update-version "$@"
