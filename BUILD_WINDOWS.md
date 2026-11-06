# Build Windows — LABYRINTHE

## Prérequis (machine de build)

| Outil | Version | Commentaire |
|---|---|---|
| Rust toolchain | stable | `https://rustup.rs/` |
| Tauri CLI | v2 | `cargo install tauri-cli --version ^2` |
| NSIS | 3.x | Pour l'installeur `.exe` (Windows) |
| MSI | WiX | Pour l'installeur `.msi` (optionnel) |
| Code signing | — | Certificat optionnel pour éviter SmartScreen |

## Étapes

```bash
# 1. Cloner le dépôt
git clone <repo> labyrinthe
cd labyrinthe

# 2. Installer les prérequis Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
cargo install tauri-cli --version ^2

# 3. Construire l'installeur Windows
./build-windows.sh nsis        # NSIS (.exe) uniquement
./build-windows.sh msi         # MSI uniquement
./build-windows.sh all         # Les deux
```

## Artefacts

```
src-tauri/target/release/bundle/
├── nsis/
│   └── LABYRINTHE-0.1.0-setup.exe   ← installeur Windows autonome
└── msi/
    └── LABYRINTHE-0.1.0.msi         ← installeur Windows MSI
```

## Taille cible

< 30 Mo (Tauri utilise WebView2 du système hôte, pas Chromium embarqué — contrairement à Electron).

## CI (GitHub Actions)

Matrice : windows-latest, ubuntu-latest, macos-latest.
Artefacts : `.msi/.exe (NSIS)` sur Windows, `.deb + .AppImage` sur Linux, `.dmg` sur macOS.

## Sécurité

- Aucun shell réel n'est exposé (Règle intouchable §10.2).
- Le jeu est 100 % hors-ligne (pas de réseau sortant).
- Fiche store : « simulation close, aucune interaction avec votre système ».
