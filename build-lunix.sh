#!/usr/bin/env bash
# =============================================================================
# build-linux.sh — Build des paquets Linux (.deb + .AppImage) pour LABYRINTHE
# =============================================================================
# Prérequis sur la machine de build :
#   - Rust toolchain stable (rustup)
#   - Tauri CLI v2 : cargo install tauri-cli --version ^2
#   - Dépendances système : libgtk-3-dev, libssl-dev, etc. (voir ci-dessous)
#   - appimagetool pour le .AppImage (optionnel si cible appimage)
#
# Usage : ./build-linux.sh [deb|appimage|all]
# =============================================================================
set -euo pipefail

TARGET="${1:-all}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_TAURI="$PROJECT_DIR/src-tauri"

echo "============================================================"
echo "  BUILD LABYRINTHE — Paquets Linux"
echo "============================================================"
echo "Projet : $PROJECT_DIR"
echo "Cible  : $TARGET"
echo

# --- Vérification des prérequis ---------------------------------------------
echo "[1/5] Vérification des prérequis..."
if ! command -v cargo >/dev/null 2>&1; then
  echo "ERREUR : cargo introuvable. Installez Rust : https://rustup.rs/"
  exit 1
fi
if ! command -v tauri >/dev/null 2>&1 && ! cargo tauri --version >/dev/null 2>&1; then
  echo "ERREUR : tauri CLI introuvable. Installez : cargo install tauri-cli --version ^2"
  exit 1
fi
echo "  cargo    : $(cargo --version)"
echo "  tauri    : $(cargo tauri --version 2>/dev/null || tauri --version)"
echo "  Rust OK."

# --- Dépendances système ----------------------------------------------------
echo "[2/5] Vérification des dépendances système..."
MISSING=0
for pkg in libgtk-3-dev libssl-dev libwebp-dev; do
  if ! dpkg -s "$pkg" >/dev/null 2>&1; then
    echo "  ⚠ $pkg manquant (nécessaire pour Tauri sur Linux)"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  echo "  Installez avec : sudo apt-get install build-essential curl wget libssl-dev"
  echo "                   libgtk-3-dev libwebp-dev libappindicator3-dev patchelf rsync"
fi

# --- Build frontend ----------------------------------------------------------
echo "[3/5] Frontend statique..."
echo "  Le frontend est déjà statique dans src/ (HTML/JS pur). Aucun build npm requis."

# --- Vérification config Tauri ----------------------------------------------
echo "[4/5] Vérification de src-tauri/tauri.conf.json..."
if ! python3 -c "import json; json.load(open('$SRC_TAURI/tauri.conf.json'))" 2>/dev/null; then
  echo "ERREUR : tauri.conf.json invalide."
  exit 1
fi
echo "  tauri.conf.json valide."
echo "  Cibles Linux : deb, appimage."

# --- Build Rust/Tauri --------------------------------------------------------
echo "[5/5] Compilation Rust + bundling Tauri..."
cd "$SRC_TAURI"

if [ "$TARGET" = "deb" ] || [ "$TARGET" = "all" ]; then
  echo "  → Build .deb…"
  cargo tauri build --target deb 2>/dev/null || cargo tauri build
fi

if [ "$TARGET" = "appimage" ] || [ "$TARGET" = "all" ]; then
  echo "  → Build .AppImage…"
  cargo tauri build --target appimage 2>/dev/null || cargo tauri build
fi

# --- Vérification des artefacts ----------------------------------------------
echo
echo "============================================================"
echo "  ARTEFACTS LINUX"
echo "============================================================"
ARTIFACT_DIR="$SRC_TAURI/target/release/bundle"
if [ -d "$ARTIFACT_DIR" ]; then
  find "$ARTIFACT_DIR" -type f \( -name "*.deb" -o -name "*.AppImage" \) 2>/dev/null | while read -r f; do
    size=$(du -h "$f" 2>/dev/null | cut -f1)
    echo "  ✓ $(basename "$f") ($size)"
  done
else
  echo "  ⚠ Aucun artefact trouvé dans $ARTIFACT_DIR"
fi
echo
echo "Installation : sudo dpkg -i labyrinthe-0.1.0-amd64.deb"
echo "               ou : ./labyrinthe-0.1.0.AppImage"
echo "============================================================"
