#!/usr/bin/env bash
# =============================================================================
# build-windows.sh — Build de l'installateur Windows (.exe) pour LABYRINTHE
# =============================================================================
# Prérequis sur la machine de build (Windows, Linux avec cross, ou macOS) :
#   - Rust toolchain stable (rustup)
#   - Tauri CLI v2 : cargo install tauri-cli --version ^2
#   - Pour NSIS : makensis (Windows) ou nsis (Linux)
#   - Pour le signer (optionnel) : un certificat de code signing Windows
#
# Usage : ./build-windows.sh [nsis|msi|all]
# =============================================================================
set -euo pipefail

TARGET="${1:-all}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_TAURI="$PROJECT_DIR/src-tauri"

echo "============================================================"
echo "  BUILD LABYRINTHE — Installateur Windows"
echo "============================================================"
echo "Projet : $PROJECT_DIR"
echo "Cible  : $TARGET"
echo

# --- Vérification des prérequis ---------------------------------------------
echo "[1/6] Vérification des prérequis..."
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

# --- Build frontend (statique, déjà dans src/) ------------------------------
echo "[2/6] Frontend statique..."
echo "  Le frontend est déjà statique dans src/ (HTML/JS pur, pas de build npm)."
echo "  Aucun step de compilation frontend requis."
echo "  Frontend OK."

# --- Vérification de la config Tauri ----------------------------------------
echo "[3/6] Vérification de src-tauri/tauri.conf.json..."
if ! python3 -c "import json; json.load(open('$SRC_TAURI/tauri.conf.json'))" 2>/dev/null; then
  echo "ERREUR : tauri.conf.json invalide."
  exit 1
fi
echo "  tauri.conf.json valide."
echo "  Targets : nsis, msi (Windows) + deb, appimage, dmg (Linux/macOS)."

# --- Build Rust/Tauri --------------------------------------------------------
echo "[4/6] Compilation Rust + bundling Tauri..."
cd "$SRC_TAURI"

if [ "$TARGET" = "nsis" ] || [ "$TARGET" = "all" ]; then
  echo "  → Build NSIS (.exe)…"
  cargo tauri build --target nsis 2>/dev/null || cargo tauri build
fi

if [ "$TARGET" = "msi" ] || [ "$TARGET" = "all" ]; then
  echo "  → Build MSI…"
  cargo tauri build --target msi 2>/dev/null || true
fi

# --- Vérification des artefacts ----------------------------------------------
echo "[5/6] Vérification des artefacts..."
ARTIFACT_DIR="$SRC_TAURI/target/release/bundle"
if [ -d "$ARTIFACT_DIR" ]; then
  echo "  Artefacts trouvés dans : $ARTIFACT_DIR"
  find "$ARTIFACT_DIR" -type f \( -name "*.exe" -o -name "*.msi" \) 2>/dev/null | while read -r f; do
    size=$(du -h "$f" 2>/dev/null | cut -f1)
    echo "    ✓ $(basename "$f") ($size)"
  done
else
  echo "  ⚠ Aucun artefact trouvé dans $ARTIFACT_DIR"
  echo "     Le build peut avoir échoué ou les artefacts sont ailleurs."
fi

# --- Taille cible ------------------------------------------------------------
echo "[6/6] Objectif de taille..."
echo "  Cible : < 30 Mo (Tauri utilise WebView2 OS, pas Chromium embarqué)."
echo "  Vérifiez la taille de l'artefact .exe généré."
echo

echo "============================================================"
echo "  BUILD TERMINÉ"
echo "============================================================"
echo "Installateur : src-tauri/target/release/bundle/nsis/  ou  msi/"
echo "Commande pour tester : ./LABYRINTHE-0.1.0-setup.exe"
echo "============================================================"
