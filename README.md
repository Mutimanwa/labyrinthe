# LABYRINTHE

Simulation pédagogique de hacking en français, dans un monde fictif : terminal,
Python, réseau, cybersécurité et développement web. La campagne comprend
16 missions initiales et 6 missions web ; des contrats indépendants et des sites
fictifs complètent le jeu. Voir `GAME_BIBLE.md` pour la conception.

Le terminal et les machines du jeu sont simulés : les commandes du joueur ne
sont pas exécutées sur l'ordinateur réel. Le JavaScript des exercices web est
exécuté dans un moteur QuickJS/WASM isolé, avec accès uniquement à l'API fictive.

## Lancer l'édition web

Depuis la racine du projet, avec Python 3 :

```bash
python3 serve.py
# Ouvrir http://localhost:8000
```

Ou, avec Node.js installé : `npm run dev:web`. Le serveur dessert à la fois
`src/` et les packs `content/` ; `cd src && python3 -m http.server` ne suffit
pas pour charger les sites, contrats et forums. Les options `--bind` et
`--port` permettent de changer l'adresse et le port.

Avant toute chose, **la station exige une configuration** : au premier
lancement, un écran d'enregistrement (inspiré des écrans de session
rétro, adapté au jeu) demande un nom d'utilisateur et un mot de passe
fictifs, puis affiche un bref journal de démarrage. Les lancements
suivants demandent le mot de passe pour rouvrir la session. Le mot de
passe n'est jamais enregistré en clair : seule une empreinte salée
PBKDF2-SHA-256 est conservée dans la sauvegarde, qui **n'est pas
chiffrée** — ce verrou est un décor local, pas une protection réelle.
Un mot de passe oublié ne peut pas être récupéré : l'écran de
verrouillage propose uniquement d'effacer la sauvegarde et de repartir
de zéro. Les anciennes parties sans profil passent une seule fois par
cette création, puis gardent leur progression intacte. Pour la revoir :
remise à zéro via `reset oui`.

La première mission (« Premier contact », avec le guide initial) fait
poursuivre cette mise en route : découvrir le réseau, se connecter à
ACADEMIE et lire la note de cours.

Au début d'une nouvelle partie, une **introduction narrative** transmet un
message du Cartographe, présente le terminal, la carte et les contrats, puis
propose les premières étapes sur ACADEMIE. On peut la passer (ou utiliser Échap),
ou la parcourir puis choisir le guide ou l'exploration libre. L'horloge et les
événements du jeu restent en pause pendant la lecture. Une première introduction
interrompue reprend à la dernière page sauvegardée ; les anciennes parties ne
sont pas interrompues.
Pour la revoir : icône ⓘ dans la barre haute ou commande `intro`.

Le **guide initial** accompagne ensuite la première mission. Il est facultatif :
le bouton PASSER le masque et l'icône ◎ dans la barre haute permet de le rouvrir.
Sa progression est sauvegardée avec la partie.

À partir de 3 000 XP, `relais` permet d'atteindre le Puits en trois sauts
simulés. `marché` (ou `marche`) présente les articles ; leurs effets, les
incidents, le GARDIEN et la Tâche-Noire restent entièrement fictifs. Les fins
`fin`, disponibles après les 22 missions, sont narratives. Détails et économie
du jeu : sections 6.2 et 6.6–6.8 de `GAME_BIBLE.md`.

## Construire le monofichier hors ligne

```bash
python3 build-single.py
# → dist/labyrinthe-single.html
```

Le fichier généré peut être ouvert directement dans un navigateur. Il embarque
les scripts, le moteur WASM et les packs de contenu. Pour une utilisation sans
serveur, ouvrir ce fichier plutôt que `src/index.html`.

## Lancer l'application de bureau (Tauri)

Pré-requis : [Rust à jour](https://rustup.rs) (au moins 1.90 pour le plugin
de dialogue actuel), Node.js et les [dépendances système de Tauri 2](https://v2.tauri.app/start/prerequisites/)
(sous Windows : Visual Studio Build Tools et WebView2).

```bash
npm ci
npm run dev       # fenêtre de développement
npm run build     # installateurs adaptés à l'OS courant
```

L'application stocke sa sauvegarde dans `labyrinthe.db` (SQLite), dans son
dossier de données. La première ouverture peut migrer l'ancienne sauvegarde
`localStorage` vers SQLite. Les commandes `exporter` et `importer` ouvrent
un sélecteur de fichiers natif. Les icônes desktop dans `src-tauri/icons/`
sont générées depuis `src-tauri/icon.svg`.

## Tests

```bash
npm ci
npm test                         # moteur, parcours initial, sauvegarde, API et missions web
npx playwright install chromium  # une seule fois, pour les tests navigateur
npm run test:browser             # station, introduction, interface, reset, rapport, CSP et monofichier
```

On peut utiliser un Chromium déjà installé en définissant `CHROMIUM_PATH` avant
`npm run test:browser`. Les tests navigateur reproduisent aussi la CSP et le
pont Tauri, mais **ne remplacent pas une compilation et un test natifs Tauri**.

## Structure

```text
src/index.html       interface du jeu
src/css/theme.css    thème multi-panneaux
src/js/engine.js     système de fichiers, shell et monde simulés
src/js/campaign.js   monde et 16 missions initiales
src/js/webdev.js     machine et 6 missions web
src/js/jsrun.js      adaptation TypeScript et lancement du moteur isolé
src/js/quickjs-runtime.js  moteur QuickJS/WASM embarqué pour l'utilisation hors ligne
src/js/intro.js      introduction narrative et pause pendant la lecture
src/js/setup.js      écran de configuration / verrouillage de la station
src/js/credentials.js  empreinte PBKDF2 du profil (reconstruit depuis tools/)
src/js/tutorial.js   guide facultatif des premiers pas
src/js/bridge.js     contenu et sauvegarde web/Tauri
content/             packs de sites, contrats et forum
src-tauri/           fenêtre Tauri, ressources et persistance SQLite
serve.py             serveur de développement web
build-single.py      génération du monofichier dans dist/
tests/               tests du moteur, de la campagne et du navigateur
tools/               sources, compilation et licences du moteur isolé
```

Le bundle QuickJS est versionné pour que l'édition web fonctionne hors ligne.
Après modification de `tools/sandbox-entry.js`, le reconstruire avec
`npm ci && npm run build:sandbox`. Les licences correspondantes sont dans
`tools/QUICKJS-LICENSE.txt`.

Le bundle d'empreintes du profil suit le même principe : après modification
de `tools/credentials-entry.js`, le reconstruire avec `node tools/build-credentials.cjs`
(le paquet `@noble/hashes`, MIT, est une dépendance de développement uniquement —
le bundle livré est autonome).
