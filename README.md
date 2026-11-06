# LABYRINTHE

Simulation de hacking **pédagogique** en français : du premier `ping` au white hat
certifié, dans un monde fictif entièrement simulé (Game Bible : `GAME_BIBLE.md`).

> Règle intouchable : le terminal du jeu est **100 % simulé**. Aucune commande
> n'est jamais exécutée sur la machine réelle du joueur — ni en JS, ni en Rust.

## Structure

```
GAME_BIBLE.md        document de conception central (v1.0)
src/                 frontend (édition web, tourne tel quel dans un navigateur)
  index.html
  css/theme.css      langage visuel Hacknet (thème injecté par machine)
  js/bridge.js       pont Tauri / localStorage (chargé en premier)
  js/py.js           interpréteur Python pédagogique (maison)
  js/engine.js       système de fichiers + moteur shell (window.GameEngine)
  js/campaign.js     LE MONDE : réseau, machines, 16 contrats (window.Campaign)
  js/apiserver.js    serveur/API simulé (window.ApiServerMod)
  js/jsrun.js        transpileur TS→JS (window.JsRun)
  js/webdev.js       machine web + missions web (window.WebDev)
  js/game.js         cœur de jeu (window.GameCore)
  js/programs.js     thèmes + programmes (window.GamePrograms)
  js/audio.js        moteur WebAudio (window.GameAudio)
  js/realcmd.js      commandes réalistes supplémentaires (window.RealCommands)
  js/ui.js           boot, panneaux, terminal, sauvegarde localStorage
content/             contenu data-driven (missions, sites, threads, puits) — M1+
src-tauri/           backend Rust (fenêtre + SQLite + packs de contenu)
dist/                builds monofichier générés (build-single.py)
```

## Lancer en édition web (zéro installation)

```bash
cd src && python3 -m http.server 8000
# → http://localhost:8000
```
(Ou ouvrir `src/index.html` directement dans un navigateur.)

## Reconstruire le monofichier (démos/partage)

```bash
python3 build-single.py   # → dist/labyrinthe-single.html
```

## Lancer l'app de bureau (Tauri) — M5

Pré-requis : [Rust](https://rustup.rs), Node.js, les outils de build de ton OS
(sous Windows : Visual Studio Build Tools + WebView2).

```bash
npm install                 # installe @tauri-apps/cli (voir package.json)
npx tauri dev               # fenêtre de dev
npx tauri build             # .msi / NSIS sous Windows, .deb/.AppImage, .dmg
```

La base `labyrinthe.db` (SQLite, schéma §10.3 de la bible) se crée au premier
lancement dans le dossier de données de l'app. Migration des anciennes
sauvegardes `localStorage` (`labyrinthe.save.v2`) prévue au M5 via `bridge.js`.

## Boucle de dev

- `npx tauri dev` recharge le frontend à chaud (fichiers statiques).
- Toute nouvelle mission se écrit dans `content/` (JSON/Markdown), sans toucher au code.
- Garder `node --check` vert sur chaque fichier de `src/js/` avant de commit.
