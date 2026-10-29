#!/usr/bin/env bash
# Canonical Environment Initialization & Setup Script for Linux / macOS
# Provided by @francogp/auditor - Zero Hardcoding, Multi-Project Isolation, and Plugin Support

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PKG_PATH="$SCRIPT_DIR/package.json"
NODE_VERSION_PATH="$SCRIPT_DIR/.node-version"
NVMRC_PATH="$SCRIPT_DIR/.nvmrc"

if [ ! -f "$PKG_PATH" ]; then
    echo "[ERROR] package.json not found in $PKG_PATH"
    exit 1
fi

# Proactive cleanup of legacy .nvmrc file
if [ -f "$NVMRC_PATH" ]; then
    rm -f "$NVMRC_PATH"
fi

# Dynamically detect project name from package.json
PROJECT_NAME=$(grep -o '"name": *"[^"]*"' "$PKG_PATH" | head -n 1 | cut -d'"' -f4 || basename "$SCRIPT_DIR")

# Default: fixed reproducible installation as declared in commit (.node-version / package.json)
# --update-version / -u / update / update-linux.sh: updates to latest stable version (Node.js Current + npm@latest)
UPDATE_TO_LATEST=false
PRUNE_VERSIONS=false
SET_DEFAULT=false

for arg in "$@"; do
    case "$arg" in
        --declared-versions|--locked|--pinned)
            UPDATE_TO_LATEST=false
            ;;
        --update-version|-u|--latest|update)
            UPDATE_TO_LATEST=true
            ;;
        --prune-other-versions)
            PRUNE_VERSIONS=true
            ;;
        --set-default)
            SET_DEFAULT=true
            ;;
    esac
done

TARGET_NODE_VER=""

if [ "$UPDATE_TO_LATEST" = true ]; then
    echo "[NODE] Querying latest stable Node.js Current version from nodejs.org..."
    if command -v curl >/dev/null 2>&1; then
        TARGET_NODE_VER=$(curl -s --max-time 10 https://nodejs.org/dist/index.json | grep -o '"version": *"v[0-9.]*"' | head -n 1 | grep -o '[0-9.]*' || true)
    fi
    if [ -n "$TARGET_NODE_VER" ]; then
        if grep -q '"node":' "$PKG_PATH"; then
            sed -i -E "s/(\"node\": *\">=)[^\"]*(\")/\1$TARGET_NODE_VER\2/" "$PKG_PATH"
        fi
        echo "$TARGET_NODE_VER" > "$NODE_VERSION_PATH"
        echo "[OK] Node.js version synchronized to v$TARGET_NODE_VER in .node-version and package.json"
    fi
else
    echo "[NODE] Declared versions mode active (--declared-versions). Preserving exact version from .node-version without network query..."
fi

# If no remote query or query failed: read canonical version from .node-version
if [ -z "$TARGET_NODE_VER" ]; then
    if [ -f "$NODE_VERSION_PATH" ]; then
        TARGET_NODE_VER=$(tr -d ' \n\r' < "$NODE_VERSION_PATH" | sed 's/^v//')
    fi
fi

# Fallback to package.json if .node-version does not exist
if [ -z "$TARGET_NODE_VER" ]; then
    TARGET_NODE_VER=$(grep -o '"node": *"[^"]*"' "$PKG_PATH" | grep -o '[0-9.]*' | head -n 1)
    if [ -n "$TARGET_NODE_VER" ]; then
        echo "$TARGET_NODE_VER" > "$NODE_VERSION_PATH"
    fi
fi

if [ -z "$TARGET_NODE_VER" ]; then
    echo "[ERROR] Could not determine required Node.js version in $PKG_PATH"
    exit 1
fi

# Dynamic Invariant: If host project uses @francogp/auditor, validate TARGET_NODE_VER >= Auditor Requirement
AUDITOR_PKG="$SCRIPT_DIR/node_modules/@francogp/auditor/package.json"
if [ -f "$AUDITOR_PKG" ]; then
    AUDITOR_NODE_MIN=$(grep -o '"node": *"[^"]*"' "$AUDITOR_PKG" | grep -o '[0-9.]*' | head -n 1)
    if [ -n "$AUDITOR_NODE_MIN" ]; then
        # Basic semver comparison via sort -V
        LOWER_VER=$(printf '%s\n%s\n' "$TARGET_NODE_VER" "$AUDITOR_NODE_MIN" | sort -V | head -n 1)
        if [ "$TARGET_NODE_VER" != "$AUDITOR_NODE_MIN" ] && [ "$LOWER_VER" = "$TARGET_NODE_VER" ]; then
            echo "[ERROR] Target version v$TARGET_NODE_VER is LOWER than minimum required by @francogp/auditor (v$AUDITOR_NODE_MIN)."
            exit 1
        fi
    fi
fi

echo "======================================================"
echo " [SETUP] NODE ENVIRONMENT PREPARATION (v$TARGET_NODE_VER) [$PROJECT_NAME]"
echo "======================================================"

# 1. Check / Load NVM
export NVM_DIR="$HOME/.nvm"

if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh" --no-use 2>/dev/null || . "$NVM_DIR/nvm.sh" 2>/dev/null || true
else
    echo "[NVM] NVM not detected. Installing NVM (v0.40.1)..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && { \. "$NVM_DIR/nvm.sh" --no-use 2>/dev/null || \. "$NVM_DIR/nvm.sh" 2>/dev/null || true; }
fi

# 2. Install and activate Node.js in NVM
echo -e "\n[NODE] Verifying / Installing Node.js v$TARGET_NODE_VER in NVM..."
nvm install "$TARGET_NODE_VER" || echo "  [WARN] Warning while installing Node v$TARGET_NODE_VER via NVM."

echo -e "\n[NODE] Activating Node.js v$TARGET_NODE_VER..."
nvm use "$TARGET_NODE_VER" || echo "  [WARN] Warning while activating Node v$TARGET_NODE_VER."

# Preserve existing default alias for multi-project coexistence
DEFAULT_ALIAS_INFO=$(nvm alias default 2>/dev/null || true)
CURRENT_DEFAULT=$(echo "$DEFAULT_ALIAS_INFO" | awk '{print $3}' || true)
if [ -n "$CURRENT_DEFAULT" ] && [ "$CURRENT_DEFAULT" != "N/A" ] && ! echo "$DEFAULT_ALIAS_INFO" | grep -q -e "-> N/A" && [ "$SET_DEFAULT" = false ]; then
    echo "[INFO] Preserving existing default alias ($CURRENT_DEFAULT). $PROJECT_NAME is activated locally via .node-version ('vp env use')."
else
    echo "[NVM] Configuring NVM default alias to v$TARGET_NODE_VER..."
    nvm alias default "$TARGET_NODE_VER" 2>/dev/null || true
fi

# 3. Obsolete versions cleanup (STRICTLY OPT-IN with --prune-other-versions)
if [ "$PRUNE_VERSIONS" = true ]; then
    echo -e "\n[CLEANUP] Cleaning Node.js versions in NVM (--prune-other-versions enabled)..."
    if [ -d "$NVM_DIR/versions/node" ]; then
        for old_dir in "$NVM_DIR/versions/node"/v*; do
            if [ -d "$old_dir" ] && [ "$(basename "$old_dir")" != "v$TARGET_NODE_VER" ]; then
                old_ver=$(basename "$old_dir" | sed 's/^v//')
                echo "  [-] Removing version: $old_ver..."
                nvm uninstall "$old_ver" 2>/dev/null || rm -rf "$old_dir"
            fi
        done
    fi
else
    echo -e "\n[INFO] Preserving all other Node.js versions installed in NVM for multi-project coexistence."
fi

# 4. Detect binary directory and ensure symlinks in ~/.local/bin
NODE_BIN_DIR="$NVM_DIR/versions/node/v$TARGET_NODE_VER/bin"
if [ ! -d "$NODE_BIN_DIR" ]; then
    NODE_BIN_DIR="$(dirname "$(nvm which "$TARGET_NODE_VER" 2>/dev/null || which node)")"
fi

# Force precedence of target version in current session
export PATH="$NODE_BIN_DIR:$PATH"

LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"

echo -e "\n[LINKS] Synchronizing symlinks in $LOCAL_BIN..."
for bin_name in node npm npx corepack; do
    if [ -e "$NODE_BIN_DIR/$bin_name" ]; then
        ln -sf "$NODE_BIN_DIR/$bin_name" "$LOCAL_BIN/$bin_name"
    fi
done

# 5. Update npm to appropriate version
if [ "$UPDATE_TO_LATEST" = true ]; then
    echo -e "\n[NPM] Updating npm to latest global version in this Node (npm@latest)..."
    npm install -g npm@latest || echo "  [WARN] Warning: Could not update npm globally. Continuing with active version..."

    NEW_NPM_VER=$(npm -v 2>/dev/null || true)
    if [ -n "$NEW_NPM_VER" ]; then
        if grep -q '"npm":' "$PKG_PATH"; then
            sed -i -E "s/(\"npm\": *\">=)[^\"]*(\")/\1$NEW_NPM_VER\2/" "$PKG_PATH"
            echo "  [OK] npm version synchronized to >=$NEW_NPM_VER in package.json"
        fi
        if grep -q '"packageManager":' "$PKG_PATH"; then
            sed -i -E "s/(\"packageManager\": *\")[^\"]*(\")/\1npm@$NEW_NPM_VER\2/" "$PKG_PATH"
            echo "  [OK] packageManager synchronized to npm@$NEW_NPM_VER in package.json"
        elif grep -E -q '^  "name": *"[^"]*", *(\r)?$' "$PKG_PATH"; then
            sed -i -E "s/^(  \"name\": *\"[^\"]*\",)(\r)?$/\1\n  \"packageManager\": \"npm@$NEW_NPM_VER\",\2/" "$PKG_PATH"
            echo "  [OK] packageManager injected as npm@$NEW_NPM_VER in package.json"
        elif grep -E -q '^  "name":' "$PKG_PATH"; then
            sed -i -E "s/^(  \"name\": *\"[^\"]*\")(\r)?$/\1,\n  \"packageManager\": \"npm@$NEW_NPM_VER\"\2/" "$PKG_PATH"
            echo "  [OK] packageManager injected as npm@$NEW_NPM_VER in package.json"
        fi
    fi

    for bin_name in npm npx; do
        if [ -e "$NODE_BIN_DIR/$bin_name" ]; then
            ln -sf "$NODE_BIN_DIR/$bin_name" "$LOCAL_BIN/$bin_name"
        fi
    done
else
    TARGET_NPM_VER=$(grep -o '"npm": *"[^"]*"' "$PKG_PATH" | grep -o '[0-9.]*' | head -n 1)
    if [ -z "$TARGET_NPM_VER" ]; then
        TARGET_NPM_VER=$(grep -o '"packageManager": *"npm@[^"]*"' "$PKG_PATH" | grep -o '[0-9.]*' | head -n 1)
    fi
    CURRENT_NPM_VER=$($NODE_BIN_DIR/npm -v 2>/dev/null || npm -v)
    if [ -n "$TARGET_NPM_VER" ] && [ "$CURRENT_NPM_VER" != "$TARGET_NPM_VER" ]; then
        echo -e "\n[NPM] Synchronizing npm to version declared in commit (npm@$TARGET_NPM_VER)..."
        npm install -g "npm@$TARGET_NPM_VER" || echo "  [WARN] Warning: Could not install npm@$TARGET_NPM_VER."
        for bin_name in npm npx; do
            if [ -e "$NODE_BIN_DIR/$bin_name" ]; then
                ln -sf "$NODE_BIN_DIR/$bin_name" "$LOCAL_BIN/$bin_name"
            fi
        done
    else
        echo -e "\n[NPM] Preserving active npm version ($CURRENT_NPM_VER)."
    fi
fi

# 6. Project-isolated NPM Security Configuration (without affecting global environment)
echo -e "\n[CONFIG] Verifying local npm configuration (project .npmrc)..."
if [ ! -f "$SCRIPT_DIR/.npmrc" ]; then
    cat << EOF > "$SCRIPT_DIR/.npmrc"
# $PROJECT_NAME - Local Project NPM Configuration
ignore-scripts=true
registry=https://registry.npmjs.org/
audit-level=high
EOF
    echo "  [+] Created local .npmrc with isolated policies (ignore-scripts, registry, audit-level)."
else
    echo "  [OK] Local .npmrc detected and active."
fi

# 7. Clean installation of project dependencies
echo -e "\n[DEPS] Installing project dependencies..."
cd "$SCRIPT_DIR"

INSTALL_SUCCESS=false

if command -v vp >/dev/null 2>&1; then
    echo "[DEPS] Using Vite+ (vp install)..."
    if vp install; then
        INSTALL_SUCCESS=true
    else
        echo "  [WARN] 'vp install' failed. Retrying with npm ci..."
    fi
fi

if [ "$INSTALL_SUCCESS" = false ]; then
    echo "[DEPS] Installing clean dependencies with npm ci..."
    if npm ci; then
        INSTALL_SUCCESS=true
    else
        echo "  [WARN] 'npm ci' failed (possible lockfile desynchronization or remote dependencies)."
        echo "  [RECOVERY] Attempting recovery with 'npm install' to synchronize dependencies..."
        if npm install; then
            INSTALL_SUCCESS=true
            echo "  [OK] Dependencies installed and synchronized successfully via npm install."
            echo "  [WARN] NOTICE: package-lock.json was desynchronized with package.json and was updated by npm install. Review and commit alongside package.json."
        fi
    fi
fi

if [ "$INSTALL_SUCCESS" = false ]; then
    echo -e "\n======================================================"
    echo "[ERROR] Dependency installation failed in $PROJECT_NAME."
    echo "Check npm errors above. It is unsafe to proceed."
    echo "======================================================"
    exit 1
fi

if command -v vp >/dev/null 2>&1; then
    echo -e "\n[CONFIG] Synchronizing configuration with Vite+ (vp config)..."
    vp config || true
fi

# 8. Initialize Auditor & Project Base Directories
echo -e "\n[DIRECTORIES] Initializing auditor and project base directories..."
REQUIRED_DIRS=(
    "scratch"
    "scratch/audits"
    "scratch/audits/architecture"
    "scratch/audits/documentation"
    "scratch/audits/domain_data"
    "scratch/audits/persistence"
    ".agents"
    ".agents/skills"
    "dist"
    "scripts/setup/plugins"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    target_path="$SCRIPT_DIR/$dir"
    if [ ! -d "$target_path" ]; then
        mkdir -p "$target_path"
        echo "  [+] Created directory: $dir"
    else
        echo "  [OK] Directory detected: $dir"
    fi
done

# Initialize persistent cache directory for Fallow similar-code if missing
FALLOW_USER_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/fallow/similar-code"
if [ ! -d "$FALLOW_USER_CACHE" ]; then
    mkdir -p "$FALLOW_USER_CACHE/models" "$FALLOW_USER_CACHE/vectors"
    echo "  [+] Created Fallow cache directory: $FALLOW_USER_CACHE"
fi

# Initialize and verify similar-code AI model
FALLOW_BIN="$SCRIPT_DIR/node_modules/fallow/bin/fallow"
if [ -f "$FALLOW_BIN" ]; then
    echo "  [+] Verifying similar-code vector model status..."
    STATUS_JSON=$(node "$FALLOW_BIN" similar-code status --format json 2>/dev/null || echo "{}")
    if echo "$STATUS_JSON" | grep -q '"model_ready":true'; then
        echo "  [OK] Similar-code AI embedding model verified and ready."
    else
        echo "  [+] Downloading and initializing AI embedding model (jina-embeddings-v2-base-code)..."
        node "$FALLOW_BIN" similar-code setup --local --yes || echo "  [WARN] Could not initialize similar-code automatically."
    fi
fi

# Verify scratch/ exclusion in .gitignore
GITIGNORE_FILE="$SCRIPT_DIR/.gitignore"
if [ -f "$GITIGNORE_FILE" ]; then
    if ! grep -qE '^scratch/?\s*$' "$GITIGNORE_FILE"; then
        echo -e "\n  [+] Ensuring scratch/ exclusion in .gitignore..."
        printf "\n# Scratch & Temporary Audits\nscratch/\n" >> "$GITIGNORE_FILE"
        echo "  [OK] scratch/ added to .gitignore"
    else
        echo "  [OK] scratch/ is already excluded in .gitignore"
    fi
else
    echo -e "\n  [+] Creating basic .gitignore excluding scratch/..."
    printf "# Dependencies\nnode_modules/\n\n# Scratch & Temporary Audits\nscratch/\n*.log\n" > "$GITIGNORE_FILE"
    echo "  [OK] .gitignore created with scratch/"
fi

# Local Git standards configuration in project
if [ -d "$SCRIPT_DIR/.git" ]; then
    echo -e "\n  [+] Ensuring local Git standards (core.filemode, core.autocrlf, core.eol)..."
    git -C "$SCRIPT_DIR" config core.filemode false
    git -C "$SCRIPT_DIR" config core.autocrlf input
    git -C "$SCRIPT_DIR" config core.eol lf
    echo "  [OK] Local Git standards configured successfully in project"
fi

# 9. Execute Project-Specific Plugins (scripts/setup/plugins/*.sh)
PLUGINS_DIR="$SCRIPT_DIR/scripts/setup/plugins"
if [ -d "$PLUGINS_DIR" ]; then
    for plugin_script in "$PLUGINS_DIR"/*.sh; do
        if [ -f "$plugin_script" ] && [ ! "$plugin_script" = "$PLUGINS_DIR/*.sh" ]; then
            plugin_name=$(basename "$plugin_script")
            echo -e "\n[PLUGIN] Executing setup plugin: $plugin_name..."
            bash "$plugin_script"
        fi
    done
fi

# 10. Optional npm hook: env:post-setup
if grep -q '"env:post-setup"' "$PKG_PATH"; then
    echo -e "\n[HOOK] Executing post-setup hook (npm run env:post-setup)..."
    npm run env:post-setup
fi

echo "======================================================"
echo " [SUCCESS] ENVIRONMENT AND DEPENDENCIES PREPARED SUCCESSFULLY!"
echo " Project: $PROJECT_NAME"
echo "======================================================"
echo "Active versions:"
node -v
npm -v
echo -e "\n[NOTE] If you have open IDE terminal sessions, reload them to inherit the updated PATH."
echo -e "Ready to work.\n"
