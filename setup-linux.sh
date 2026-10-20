#!/usr/bin/env bash
# Script Canónico de Inicialización y Preparación de Entorno para Linux / macOS
# Proporcionado por @francogp/auditor - Cero Hardcoding, Aislamiento Multi-Proyecto y Soporte de Plugins

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PKG_PATH="$SCRIPT_DIR/package.json"
NODE_VERSION_PATH="$SCRIPT_DIR/.node-version"
NVMRC_PATH="$SCRIPT_DIR/.nvmrc"

if [ ! -f "$PKG_PATH" ]; then
    echo "❌ ERROR: No se encontró package.json en $PKG_PATH"
    exit 1
fi

# Limpieza proactiva de archivo legacy .nvmrc
if [ -f "$NVMRC_PATH" ]; then
    rm -f "$NVMRC_PATH"
fi

# Detectar nombre del proyecto dinámicamente desde package.json
PROJECT_NAME=$(grep -o '"name": *"[^"]*"' "$PKG_PATH" | head -n 1 | cut -d'"' -f4 || basename "$SCRIPT_DIR")

# Por defecto: instalación fija y reproducible según lo declarado en el commit (.node-version / package.json)
# --update-version / -u / update / update-linux.sh: actualiza a la última versión estable (Node.js Current + npm@latest)
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
    echo "🔍 Consultando la última versión Current estable de Node.js desde nodejs.org..."
    if command -v curl >/dev/null 2>&1; then
        TARGET_NODE_VER=$(curl -s --max-time 10 https://nodejs.org/dist/index.json | grep -o '"version": *"v[0-9.]*"' | head -n 1 | grep -o '[0-9.]*' || true)
    fi
    if [ -n "$TARGET_NODE_VER" ]; then
        if grep -q '"node":' "$PKG_PATH"; then
            sed -i -E "s/(\"node\": *\">=)[^\"]*(\")/\1$TARGET_NODE_VER\2/" "$PKG_PATH"
        fi
        echo "$TARGET_NODE_VER" > "$NODE_VERSION_PATH"
        echo "✅ Versión de Node.js sincronizada a v$TARGET_NODE_VER en .node-version y package.json"
    fi
else
    echo "🔒 Modo versiones declaradas activo (--declared-versions). Preservando versión exacta de .node-version sin consultar la red..."
fi

# Si no hubo consulta remota o falló: leer la versión canónica de .node-version
if [ -z "$TARGET_NODE_VER" ]; then
    if [ -f "$NODE_VERSION_PATH" ]; then
        TARGET_NODE_VER=$(tr -d ' \n\r' < "$NODE_VERSION_PATH" | sed 's/^v//')
    fi
fi

# Fallback a package.json si no existe .node-version
if [ -z "$TARGET_NODE_VER" ]; then
    TARGET_NODE_VER=$(grep -o '"node": *"[^"]*"' "$PKG_PATH" | grep -o '[0-9.]*' | head -n 1)
    if [ -n "$TARGET_NODE_VER" ]; then
        echo "$TARGET_NODE_VER" > "$NODE_VERSION_PATH"
    fi
fi

if [ -z "$TARGET_NODE_VER" ]; then
    echo "❌ ERROR: No se pudo determinar la versión requerida de Node.js en $PKG_PATH"
    exit 1
fi

# Invariante Dinámico: Si el proyecto host usa @francogp/auditor, validar que TARGET_NODE_VER >= Requisito Auditor
AUDITOR_PKG="$SCRIPT_DIR/node_modules/@francogp/auditor/package.json"
if [ -f "$AUDITOR_PKG" ]; then
    AUDITOR_NODE_MIN=$(grep -o '"node": *"[^"]*"' "$AUDITOR_PKG" | grep -o '[0-9.]*' | head -n 1)
    if [ -n "$AUDITOR_NODE_MIN" ]; then
        # Comparación semver básica con sort -V
        LOWER_VER=$(printf '%s\n%s\n' "$TARGET_NODE_VER" "$AUDITOR_NODE_MIN" | sort -V | head -n 1)
        if [ "$TARGET_NODE_VER" != "$AUDITOR_NODE_MIN" ] && [ "$LOWER_VER" = "$TARGET_NODE_VER" ]; then
            echo "❌ ERROR: La versión objetivo v$TARGET_NODE_VER es INFERIOR al mínimo exigido por @francogp/auditor (v$AUDITOR_NODE_MIN)."
            exit 1
        fi
    fi
fi

echo "======================================================"
echo " 🚀 PREPARACIÓN DE ENTORNO NODE (v$TARGET_NODE_VER) [$PROJECT_NAME]"
echo "======================================================"

# 1. Comprobar / Cargar NVM
export NVM_DIR="$HOME/.nvm"

if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
else
    echo "📦 NVM no detectado. Instalando NVM (v0.40.1)..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# 2. Instalar y activar Node.js en NVM
echo -e "\n🟢 Verificando / Instalando Node.js v$TARGET_NODE_VER en NVM..."
nvm install "$TARGET_NODE_VER" || echo "⚠️ Advertencia al instalar Node v$TARGET_NODE_VER via NVM."

echo -e "\n⚡ Activando Node.js v$TARGET_NODE_VER..."
nvm use "$TARGET_NODE_VER" || echo "⚠️ Advertencia al activar Node v$TARGET_NODE_VER."

# Preservar alias default existente del usuario para convivencia multi-proyecto
CURRENT_DEFAULT=$(nvm alias default 2>/dev/null | awk '{print $3}' || true)
if [ -n "$CURRENT_DEFAULT" ] && [ "$CURRENT_DEFAULT" != "N/A" ] && [ "$SET_DEFAULT" = false ]; then
    echo "ℹ️ Preservando alias default existente ($CURRENT_DEFAULT). $PROJECT_NAME se activa localmente vía .node-version ('vp env use')."
else
    echo "📌 Configurando alias default de NVM a v$TARGET_NODE_VER..."
    nvm alias default "$TARGET_NODE_VER" 2>/dev/null || true
fi

# 3. Limpieza de versiones obsoletas (ESTRICTAMENTE OPT-IN con --prune-other-versions)
if [ "$PRUNE_VERSIONS" = true ]; then
    echo -e "\n🧹 Limpiando versiones de Node.js en NVM (--prune-other-versions activado)..."
    if [ -d "$NVM_DIR/versions/node" ]; then
        for old_dir in "$NVM_DIR/versions/node"/v*; do
            if [ -d "$old_dir" ] && [ "$(basename "$old_dir")" != "v$TARGET_NODE_VER" ]; then
                old_ver=$(basename "$old_dir" | sed 's/^v//')
                echo "  [-] Eliminando versión: $old_ver..."
                nvm uninstall "$old_ver" 2>/dev/null || rm -rf "$old_dir"
            fi
        done
    fi
else
    echo -e "\nℹ️ Preservando todas las demás versiones de Node.js instaladas en NVM para convivencia multi-proyecto."
fi

# 4. Detectar ruta de binarios y asegurar enlaces simbólicos en ~/.local/bin
NODE_BIN_DIR="$NVM_DIR/versions/node/v$TARGET_NODE_VER/bin"
if [ ! -d "$NODE_BIN_DIR" ]; then
    NODE_BIN_DIR="$(dirname "$(nvm which "$TARGET_NODE_VER" 2>/dev/null || which node)")"
fi

# Forzar precedencia de la versión objetivo en la sesión actual
export PATH="$NODE_BIN_DIR:$PATH"

LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"

echo -e "\n🔗 Sincronizando enlaces simbólicos en $LOCAL_BIN..."
for bin_name in node npm npx corepack; do
    if [ -e "$NODE_BIN_DIR/$bin_name" ]; then
        ln -sf "$NODE_BIN_DIR/$bin_name" "$LOCAL_BIN/$bin_name"
    fi
done

# 5. Actualizar npm a la versión adecuada (en auto-actualización instala npm@latest y sincroniza package.json; en --declared-versions sincroniza estrictamente con el commit)
if [ "$UPDATE_TO_LATEST" = true ]; then
    echo -e "\n📦 Actualizando npm a la última versión global en este Node (npm@latest)..."
    npm install -g npm@latest || echo "⚠️ Advertencia: No se pudo actualizar npm globalmente. Continuando con versión actual..."

    NEW_NPM_VER=$(npm -v 2>/dev/null || true)
    if [ -n "$NEW_NPM_VER" ] && grep -q '"npm":' "$PKG_PATH"; then
        sed -i -E "s/(\"npm\": *\">=)[^\"]*(\")/\1$NEW_NPM_VER\2/" "$PKG_PATH"
        echo "✅ Versión de npm sincronizada a >=$NEW_NPM_VER en package.json"
    fi

    for bin_name in npm npx; do
        if [ -e "$NODE_BIN_DIR/$bin_name" ]; then
            ln -sf "$NODE_BIN_DIR/$bin_name" "$LOCAL_BIN/$bin_name"
        fi
    done
else
    TARGET_NPM_VER=$(grep -o '"npm": *"[^"]*"' "$PKG_PATH" | grep -o '[0-9.]*' | head -n 1)
    CURRENT_NPM_VER=$($NODE_BIN_DIR/npm -v 2>/dev/null || npm -v)
    if [ -n "$TARGET_NPM_VER" ] && [ "$CURRENT_NPM_VER" != "$TARGET_NPM_VER" ]; then
        echo -e "\n📦 Sincronizando npm a la versión declarada en el commit (npm@$TARGET_NPM_VER)..."
        npm install -g "npm@$TARGET_NPM_VER" || echo "⚠️ Advertencia: No se pudo instalar npm@$TARGET_NPM_VER."
        for bin_name in npm npx; do
            if [ -e "$NODE_BIN_DIR/$bin_name" ]; then
                ln -sf "$NODE_BIN_DIR/$bin_name" "$LOCAL_BIN/$bin_name"
            fi
        done
    else
        echo -e "\n🔒 Preservando versión activa de npm ($CURRENT_NPM_VER)."
    fi
fi

# 6. Configuración de Seguridad de NPM aislada al proyecto (sin afectar el entorno global)
echo -e "\n🛡️ Verificando configuración local de npm (.npmrc del proyecto)..."
if [ ! -f "$SCRIPT_DIR/.npmrc" ]; then
    cat << EOF > "$SCRIPT_DIR/.npmrc"
# $PROJECT_NAME - Local Project NPM Configuration
ignore-scripts=true
registry=https://registry.npmjs.org/
audit-level=high
EOF
    echo "  [+] Creado .npmrc local con políticas aisladas (ignore-scripts, registry, audit-level)."
else
    echo "  [✓] .npmrc local detectado y activo."
fi

# 7. Instalar dependencias limpias del proyecto
echo -e "\n📦 Instalando dependencias del proyecto..."
cd "$SCRIPT_DIR"

INSTALL_SUCCESS=false

if command -v vp >/dev/null 2>&1; then
    echo "⚡ Usando Vite+ (vp install)..."
    if vp install; then
        INSTALL_SUCCESS=true
    else
        echo "⚠️ 'vp install' falló. Reintentando con npm ci..."
    fi
fi

if [ "$INSTALL_SUCCESS" = false ]; then
    echo "📦 Instalando dependencias limpias con npm ci..."
    if npm ci; then
        INSTALL_SUCCESS=true
    else
        echo "⚠️ 'npm ci' falló (posible desincronización de lockfile o dependencias remotas)."
        echo "🔄 Intentando recuperación con 'npm install' para sincronizar dependencias..."
        if npm install; then
            INSTALL_SUCCESS=true
            echo "✅ Dependencias instaladas y sincronizadas exitosamente con npm install."
            echo "⚠️ AVISO: package-lock.json estaba desincronizado con package.json y fue modificado por npm install. Revise el cambio y commitéelo junto con package.json."
        fi
    fi
fi

if [ "$INSTALL_SUCCESS" = false ]; then
    echo -e "\n======================================================"
    echo "❌ ERROR: Falló la instalación de dependencias en $PROJECT_NAME."
    echo "Verifique los errores de npm arriba. No es seguro continuar."
    echo "======================================================"
    exit 1
fi

if command -v vp >/dev/null 2>&1; then
    echo -e "\n🔧 Sincronizando configuración con Vite+ (vp config)..."
    vp config || true
fi

# 8. Inicializar Directorios Básicos del Auditor y del Proyecto
echo -e "\n📁 Inicializando directorios básicos del auditor y del proyecto..."
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
        echo "  [+] Creado directorio: $dir"
    else
        echo "  [✓] Directorio detectado: $dir"
    fi
done

# Inicializar directorio de caché persistente de Fallow similar-code si no existe
FALLOW_USER_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/fallow/similar-code"
if [ ! -d "$FALLOW_USER_CACHE" ]; then
    mkdir -p "$FALLOW_USER_CACHE/models" "$FALLOW_USER_CACHE/vectors"
    echo "  [+] Creado directorio de caché Fallow: $FALLOW_USER_CACHE"
fi

# Inicializar y verificar modelo de IA de similar-code
FALLOW_BIN="$SCRIPT_DIR/node_modules/fallow/bin/fallow"
if [ -f "$FALLOW_BIN" ]; then
    echo "  [+] Verificando estado del modelo vectorial de similar-code..."
    STATUS_JSON=$(node "$FALLOW_BIN" similar-code status --format json 2>/dev/null || echo "{}")
    if echo "$STATUS_JSON" | grep -q '"model_ready":true'; then
        echo "  [✓] Modelo de embeddings de IA para similar-code verificado y listo."
    else
        echo "  [+] Descargando e inicializando modelo de embeddings de IA (jina-embeddings-v2-base-code)..."
        node "$FALLOW_BIN" similar-code setup --local --yes || echo "  [WARN] No se pudo inicializar similar-code automáticamente."
    fi
fi

# Verificación de exclusión de scratch/ en .gitignore
GITIGNORE_FILE="$SCRIPT_DIR/.gitignore"
if [ -f "$GITIGNORE_FILE" ]; then
    if ! grep -qE '^scratch/?\s*$' "$GITIGNORE_FILE"; then
        echo -e "\n  [+] Asegurando exclusión de scratch/ en .gitignore..."
        printf "\n# Scratch & Temporary Audits\nscratch/\n" >> "$GITIGNORE_FILE"
        echo "  [OK] scratch/ agregado a .gitignore"
    else
        echo "  [✓] scratch/ ya está excluido en .gitignore"
    fi
else
    echo -e "\n  [+] Creando .gitignore básico con exclusión de scratch/..."
    printf "# Dependencies\nnode_modules/\n\n# Scratch & Temporary Audits\nscratch/\n*.log\n" > "$GITIGNORE_FILE"
    echo "  [OK] .gitignore creado con scratch/"
fi

# Configuración de estándares locales de Git en el proyecto
if [ -d "$SCRIPT_DIR/.git" ]; then
    echo -e "\n  [+] Asegurando estándares locales de Git (core.filemode, core.autocrlf, core.eol)..."
    git -C "$SCRIPT_DIR" config core.filemode false
    git -C "$SCRIPT_DIR" config core.autocrlf input
    git -C "$SCRIPT_DIR" config core.eol lf
    echo "  [OK] Estándares de Git configurados localmente en el proyecto"
fi

# 9. Ejecutar Plugins Específicos del Proyecto (scripts/setup/plugins/*.sh)
PLUGINS_DIR="$SCRIPT_DIR/scripts/setup/plugins"
if [ -d "$PLUGINS_DIR" ]; then
    for plugin_script in "$PLUGINS_DIR"/*.sh; do
        if [ -f "$plugin_script" ] && [ ! "$plugin_script" = "$PLUGINS_DIR/*.sh" ]; then
            plugin_name=$(basename "$plugin_script")
            echo -e "\n🔌 Ejecutando plugin de setup: $plugin_name..."
            bash "$plugin_script"
        fi
    done
fi

# 10. Gancho npm opcional: env:post-setup
if grep -q '"env:post-setup"' "$PKG_PATH"; then
    echo -e "\n🪝 Ejecutando gancho post-setup (npm run env:post-setup)..."
    npm run env:post-setup
fi

echo "======================================================"
echo " 🎉 ¡ENTORNO Y DEPENDENCIAS PREPARADOS CON ÉXITO!"
echo " Proyecto: $PROJECT_NAME"
echo "======================================================"
echo "Versiones activas:"
node -v
npm -v
echo -e "\n[NOTE] Si tienes terminales del IDE previamente abiertas, recárgalas para que hereden el PATH actualizado."
echo -e "Todo listo para trabajar.\n"
