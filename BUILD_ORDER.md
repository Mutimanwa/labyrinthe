# BUILD ORDER — ordre de construction des systèmes

Compagnon de la Game Bible. Principe : **aucun système ne démarre avant que ses
prérequis soient « done »**. Le critère de sortie (DoD) est binaire : soit c'est
vérifiable en jeu, soit ce n'est pas fini.

- ✅ terminé · 🔶 en cours · ⬜ à faire

> Les mentions de tests et de jalons ci-dessous sont historiques. L'édition web
> et le pont Tauri simulé sont couverts par les suites décrites dans le README ;
> la compilation et le packaging Tauri natifs restent à vérifier sur un système
> disposant de Rust et des dépendances requises.

## Règles de séquençage (le pourquoi du chemin critique)

1. **Le contenu avant les contenus** : le chargeur de packs (T1) précède tout
   système data-driven, sinon chaque feature retarde sur un import ad hoc.
2. **Le navigateur avant tout ce qui parle** : forum, mail, wiki, Puits se
   rendent tous dans le même moteur de sites (T2). Pas de forum avant T2.
3. **L'horloge avant les PNJ** (T6 → T13) : ECHO planifie les ripostes en heure
   monde ; sans horloge, une IA est instantanée — donc invraisemblable et injuste.
4. **Les logs avant la traque** (T12 → T13) : un Chasseur de traces n'existe que
   si les actions laissent des traces persistantes lisibles.
5. **Les rangs avant les verrous** (T8 → T9/T18) : on ne verrouille pas une
   couche tant que le rang existe dans la sauvegarde et dans l'UI.
6. **La monnaie avant le marché** (T8 → T19) ; le marché avant Tâche-Noire (T20).
7. **Le packaging en dernier** (T21/T22) : on fige le format de contenu avant de
   l'embarquer dans un installateur.

## Graphe de dépendances

```
M0 ✓ découpage + squelette Tauri
│
├── T1 chargeur de contenu (fetch web / invoke Tauri) ──────────────┐
│   └─► T2 navigateur interne (rendu sites déclaratifs)            │
│       ├─► T3 Fouine (index recherche) + whois                    │
│       │     └─► T5 sites couche 2 (×12)  →  M1 ✔                │
│       ├─► T4 wiki ManPages (migration cours)                     │
│       ├─► T10 forum NetSec-Intérieur (couche 3)                  │
│       ├─► T11 mail (contrats, convocations, phishing PNJ)        │
│       └─► T16 applis web vulnérables (phase 3 : SQLi/XSS simulés)│
│                                                                  │
├── T6 horloge du monde ──► T10, T13                               │
│                                                                  │
├── T7 bus d'événements formel ──► T8 profil (rangs/XP/réputation) │
│                                   ├─► T9 verrous de couches      │
│                                   ├─► T19 monnaie sats + marché  │
│                                   └─► T17 rapport de pentest     │
│                                                                  │
└────────────────────────────► T12 bruit/traces v2 (logs cibles)   │
                                     └─► T13 ECHO : PNJ (3 archétypes)
                                           ├─► T14 défense joueur
                                           └─► T15 « être hacké » 1-2
T9 + T13 ──► T18 chenillard (Tor-like) ──► T19 ──► T20 GARDIEN/Tâche-Noire + fins
contenu stabilisé ──► T21 sauvegarde SQLite par défaut ──► T22 .exe + CI
hooks audio au fil de l'eau ──► T23 palette complète · T24 i18n EN ──► M6
```

## Tableau ordonné

| # | ID | Chantier | Dépend de | Débloque | Critère de sortie (DoD) | Taille | État |
|---|---|---|---|---|---|---|---|
| — | T0 | Découpage modules + squelette Tauri | — | tout | preview identique au monofichier | M | ✅ |
| 1 | T1 | Chargeur de contenu (symlink `src/content`, fetch web / `LabyBridge` Tauri) | T0 | T2, T4, T5 | un JSON de `content/` lu en web ET en Tauri | S | ✅ (web prouvé ; compile Tauri au M5) |
| 2 | T2 | Navigateur interne : overlay, rendu blocks, navigation, historique | T1 | T3, T4, T10, T11, T16 | `coop-iteka.bi` navigeable, histo ◀▶, latences par couche | M | ✅ |
| 3 | T3 | Fouine (index plein-texte des pages) + `whois` terminal + events dans le bus (`fouine`/`visit`/`whois`) | T2 | T5, contrats OSINT | `whois coop-iteka.bi` + recherche fouine fonctionnels | S | ✅ |
| 4 | T4 | Wiki ManPages : carte des 16 modules en 5 pages (/shell /python /scan /traces /osint) | T2 | autonomie débutant | les cartes lisibles dans le navigateur | S | ✅ |
| 5 | T5 | 12 sites couche 2 (bounty, pastebin, registre NIC-BI, réseau social, FAI…) | T3 | **M1 ✔** | bb-01 **et** bb-02 solvables 0 paquet — 9 tests de contenu 🟢 | M | ✅ |
| 6 | T6 | Horloge du monde (topbar, tick 1 s = 1 min, persistance v4) + `LabyClock` | T0 | T10, T13 | recharger la partie n'efface pas l'heure — smoke test v4 🟢 | S | ✅ |
| 7 | T7 | Bus formel (navigateur → `game.record`) + contrats data jouables (`contracts.js`, récompenses auto) | T0 | T8, T12 | bb-01/bb-02 : accepter → OSINT → ✔ + crédits/respect/xp versés | M | ✅ |
| 8 | T8 | Profil : 6 rangs, XP anti-grind (16 techniques, techKeys persisté), Respect/Créd/sats, badge + overlay | T7 | T9, T17, T19 | XP première-fois uniquement ; rang en topbar ; smoke test 🟢 | M | ✅ |
| 9 | T9 | Verrous de couches réels (couche 3 → APPRENTI, couche 4 → OPÉRATEUR) | T8 | T10 gating, T18 | débutant refusé sur netsec-interieur.bi, rang insuffisant annoncé | S | ✅ |
| 10 | T10 | Forum NetSec-Intérieur : 6 fils permanents data-driven, question guidée payée en Respect, réponse PNJ à +2 h monde, RÉSOLU = +2 | T2, T6, T8 | indices P1, communauté | poser une question → réponse PNJ différée 🟢 persistance ✔ | M | ✅ |
| 11 | T11 | Mail : bienvenue Cartographe, bordereaux de contrats avec bouton, phishing d'initiation à APPRENTI (échec −10 / ignorer +2) | T2, T6 | narration asynchrone | mail d'un contrat ouvre le tableau et déclenche l'acceptation 🟢 | S | ✅ (convocations GARDIEN = T20) |
| 12 | T12 | Bruit §7.1 + logs syslog réalistes écrits chez la cible (heure monde) + capital trace persistant, décroissance 6 h, seuils 25/60/100 (TRACÉ → FAI, −2 respect) + commande `echo` | T7 | T13, T14 | scores exacts en test Node, logs lisibles in-game, serein respecté 🟢 | L | ✅ |
| 13 | T13 | ECHO : Balayeur (vagues world-timées, brute-force si ssh faible → LISEZ-MOI intrusif), Chasseur (3 relevés signature → publication moqueuse −2), Rancunier (riposte netInterne, s'apaise si SES logs sont nettoyés) | T6, T12 | T14, T15, T20 | intrusion subie en test Node, chasseur publie, rancunier s'apaise 🟢 | L | ✅ |
| 14 | T14 | Défense joueur : iptables/ufw simulés (règles -A/-D/-P, allow/deny, enable/disable), sshd_config (PermitRootLogin, PasswordAuthentication fonctionnels), logview, pot de miel (processus persistant Honeypot + /var/log/honeypot.log) | T12, T13 | survie, phase 6, T15 | port 22 fermé/filtré bloque le Balayeur ; sshd endurci fait échouer hydra ; pot de miel alerte ; tests Node : pare-feu, sshd, honeypot, iptables/ufw, persistance 🟢 | M | ✅ |
| 15 | T15 | Être hacké niveaux 1-2 : LISEZ-MOI.txt (T13, niveau 1), vol d'outils avec avis + rachat/recuperation forensique (commande `vols`), expiration → mise en vente publique sur le forum (−3 respect) | T13, T14 | pression dramatique | vol declare, rachat, recuperation, expiration publient 🟢 | M | ✅ |
| 16 | T16 | Apps web vulnérables simulées (login SQLi, XSS stocké) + msf-lite JSON | T2 | phase 3 | flux curl → sqlmap → ssh complet et testé 🟢 | L | ✅ |
| 17 | T17 | Rapport de pentest (gabarit `rapport <id>`, validation par mots-clés + structure, note 0-100) | T8, T16 | phase 6, bounty | gabarit éditable, soumission acceptée/rejetée, contrat bloqué sans rapport 🟢 | M | ✅ |
| 18 | T18 | Chenillard de relais (accès Puits, coût/délai par saut) | T8, T9 | T19 | 3 sauts relais1→relais2→relais3→puits, coût 50 cr/saut, latence 3s, verrou OPÉRATEUR (3000 xp) 🟢 | M | ✅ |
| 19 | T19 | Marché du Puits + sats + articles piégés | T8, T18 | T20 | marché liste/acheter/changer, inventaire, run + détection piège, taux de change fluctuant, persistance v4 🟢 | M | ✅ |
| 20 | T20 | GARDIEN enquêtes + Tâche-Noire (rançon 3-4) + fins doubles | T13, T19 | fin de campagne | incidents noirs, enquête GARDIEN, rançon Tâche-Noire, fin blanche/noire 🟢 | L | ✅ |
| 21 | T21 | Sauvegarde SQLite par défaut (bridge Tauri), migration v2→v3 | contenu stabilisé | T22 | SaveStore unifié et migration ; pont simulé testé, natif à vérifier | S | 🔶 |
| 22 | T22 | Packaging `.exe` (NSIS/MSI) + CI matrice | T21 | **M5** | Configuration et icônes présentes ; build et installateurs natifs à vérifier | M | 🔶 |
| 23 | T23 | Palette audio complète (heartbeat trace, disque intrusion, drone Puits) | hooks des systèmes | M6 | chaque événement §11 a son son | S | ⬜ |
| 24 | T24 | i18n EN (commandes déjà EN) | contenu figé | M6 | bascule FR/EN sans perte | S | ⬜ |

## Prochaine action

**M1 ✔ livré** (T1→T5) : web intérieur complet à 12 sites, Fouine indexe le
plein-texte des pages, `whois` dans le terminal, bb-01 et bb-02 solvables sans
envoyer un paquet — tests de solvabilité au vert.
*Écart assumé avec la roadmap : le forum passe de M1 à tête de M2 — il exige
T6 (horloge) et T8 (rangs) pour ne pas être un décor.*

**T6 + T7 livrés.** Horloge du monde en topbar (persistée, sauvegardes v3
compatibles — smoke test Node 🟢), navigateur branché sur le bus unique,
et les contrats `content/missions/*.json` sont **jouables** : panneau
CONTRATS → section WEB, ACCEPTER → les faits du monde complètent et paient.
Le cursus des 16 (22 avec les missions web) n'est pas touché.
Note archi : wraps décorateurs posés sur `game.tick` / `game.record` — si un
jour le jeu se réinstancie sans reload, re-câbler (voir `__clockWrap`).

**T8 + T9 livrés.** Rangs VISITEUR→MAÎTRE DU LABYRINTHE (seuils XP, rang 5
exige la campagne finie), XP anti-grind sur 16 techniques (techKeys persisté,
"+xp — première fois" affiché), missions de campagne versent leur XP, badge
RANG·xp en topbar, overlay Profil (échelle, réputation, accès aux couches),
commande `profil`. Verrous actifs : couche 3 = APPRENTI, couche 4 = OPÉRATEUR.
Économie actuelle : ~3 400 xp atteignables (22 missions + contrats + techs)
→ OPÉRATEUR clôt la campagne actuelle ; T16-T19 nourriront PENTESTEUR.
Smoke test Node : mission=125 xp, techKeys/sats en round-trip 🟢.

**T10 livré.** NetSec-Intérieur est vivant : 6 fils permanents (culture hacker
réelle : -sV deviné vs réel, -t 64 qui crame, logs effacés = contrat non payé,
OSINT vs rockyou, fil épinglé sur les dictionnaires) + le joueur poste des
questions à 3 niveaux d'indices (0/−2/−5 Respect), réponse PNJ munie des
hints_forum du contrat actif quand il existe, +2 Respect au RÉSOLU honnête.
Routage dynamique `/fil/<id>` et `/poser` dans le navigateur.

**T11 livré.** Poste complet : icône ✉ avec compteur de non-lus, commande
`mail`, bienvenue du Cartographe au premier boot, bordereau du donneur à
l'acceptation d'un contrat (bouton → tableau), reçu à la complétion, et le
**phishing d'initiation** : à APPRENTI, un mail pressé de
« admin@netsec-interleur.bi » (faute dans le domaine = l'indice) — confirmer
= −10 Respect + leçon ; ignorer 4 h monde = +2. Persistance v4 🟢.
GARDIEN en convocation formelle attend T20, quand les noirs existeront.

**T12 livré — M2 complet, M3 ouvert.** ECHO en place : bruit par commande
(§7.1 exact : `-sS` 2 < `-sT` 4 < `-sV` 5, `-p-` double, hydra 6/15, crack 8…),
lignes syslog réalistes horodatées heure monde écrites dans /var/log/auth.log
de la cible (lisibles via `logs` !), capital trace par machine avec
demi-vie 6 h monde, seuils 25/60/100 → TRACÉ = mail UmucoNet + respect −2 +
`trace-capite` dans le bus. Mode serein (`trace off`) exempt d'ECHO.
Test Node : OSINT = silence total, accumulation exacte (25), décroissance
80→40 en 6 h, seuil franchi → tracee:true, persistance v4 🟢.
Rappel design : rewrap nécessaire si le jeu se réinstancie (décorateurs).

**T13 livré — le monde mord.** Trois chasseurs actifs en différé (jamais
instantané) : Balayeur (~75 min monde/vague, intrusion niveau 1 facile la
première fois = la leçon LISEZ-MOI, répétitions rares), Chasseur de traces
(3 relevés de ta signature `10.10.0.5` dans des logs non nettoyés → fil
moqueur sur le forum, −2 respect), Rancunier réveillé quand tu touches
`netInterne` (3 vagues de représailles taquines — il s'apaise si tu nettoies
SES journaux, sélectivement). Serein : chasseurs au repos. Tests Node : intrusion,
publication, apaisement, persistance 🟢. À valider en préview : le
déclenchement du Rancunier via le bus (non testable hors DOM).

**Enchaîner sur T14 — la parade** : `iptables`/`ufw` simulés, `sshd_config`
(réécriture réelle de ta posture), `logview`, pot de miel. Boucle bouclée :
défendre ta machine fait taire les chasseurs — et `postureMoi` mesurera
l'écart.

**T14 livré — défense joueur.** `sshd()`, `sshPort()`, `porteOuverte(port)` dans engine.js. Programme `Honeypot`, `game.honeypot`. Bouton Pot de miel UI, alias `logview`, COMMANDS `vols`/`logview`. Tests Node 🟢.

**T15 livré — être hacké niveaux 1-2.** Niveau 1 (déjà T13) : `LISEZ-MOI.txt` après intrusion. Niveau 2 (nouveau) : après une intrusion réussie, 40 % de chance qu'un outil soit volé (rockyou.txt, bloc-notes, guide) avec un fichier d'avis `/home/joueur/VOL-<id>.txt`. Commande `vols` : liste les biens compromis, `vols racheter <id>` (crédits, perte sèche), `vols recupere <id>` (récupération forensique, +1 respect). Si non traité sous 6 h monde → mise en vente publique sur le forum par un « recéleur anonyme » (−3 respect). Jamais d'insta-kill : c'est un cours d'opsec, pas un game over. Tests Node : vol, rachat, récupération, expiration, pas-de-vol-si-rien-à-voler 🟢.

**T16 livré — exploitation web (phase 3).** Apps web vulnérables sur `codeLab` (10.10.2.10, port 80 nginx) : `login.php` (SQLi avec indice développeur), `commentaires.php` (XSS stocké, cookie admin exposé), `admin.php` (`FLAG{sql_injection_reussie}`). Compte `admin / P@ssw0rd!` crackable via sqlmap. `sqlmap` vérifie d'abord la vulnérabilité web, puis le port SQL. `ssh admin@10.10.2.10` avec le mot de passe cracké. Tests Node : flux curl → sqlmap → identifiants → SSH complet 🟢.

**T17 livré — rapport de pentest.** Commande `rapport <id>` ouvre un gabarit dans l'éditeur (sections : vulnérabilité, preuve, impact, correctif, signature). `rapport soumettre <id>` valide par présence de contenu (note 0-100, 100 = validé). Contrats `report_required` (ex : bb-03) bloquent leur récompense tant que le rapport n'est pas validé. Tests Node : gabarit, rejet incomplet, validation 100/100, persistance v4 🟢.

**T18 — chenillard de relais.** Nodes relais1 (10.10.0.20), relais2 (10.10.0.21), relais3 (10.10.0.22), Puits (10.10.0.99). `relais sauter` lance un processus de 3 s (1 s avec le relais privé) et débite 50 cr à l'arrivée ; `relais arreter` annule sans débit et `relais recommencer` repart du début. Verrou OPÉRATEUR (3000 xp). À l'arrivée : Puits découvert, lié au poste, `ssh joueur@10.10.0.99` avec le mot de passe fictif `puits`. Persistance v4 (`game.relais`). Voir les tests actuels dans `tests/market.test.cjs`.

**Enchaîner sur T19 — Marché du Puits + sats + articles piégés.** Le Puits est maintenant atteignable ; T19 ajoutera le marché, les achats en sats, et les binaires piégés.

**T19 — marché du Puits + sats + articles piégés.** `marché` ou `marche` (liste/acheter/changer/inventaire) après le chenillard. 4 articles : Wordlist Premium (50 sats), Relais Privé (100 sats), module fictif limité au laboratoire CODE (200 sats) et Nettoyeur Magique piégé (30 sats). `marché changer <crédits>` échange au taux fluctuant de 40–60 cr/sat (période 30 min). Inventaire, achats et sats sont persistés ; une ancienne wordlist achetée mais absente est migrée sans écraser les fichiers du joueur. Voir `tests/market.test.cjs`.

**Enchaîner sur T20 — GARDIEN enquêtes + Tâche-Noire (rançon 3-4) + fins doubles.** GARDIEN patrouille surface + Puits. Tâche-Noire chiffre des fichiers si le joueur traîne dans le Puits mal protégé. Fin blanche et fin noire atteignables.

**T20 — GARDIEN, Tâche-Noire et fins.** À deux nouveaux incidents, `gardien cooperer` ou `gardien resister` clôt l'enquête avec leurs conséquences indiquées. Le script piégé peut déclencher une simulation Tâche-Noire sur une note du jeu ; `tache-noire payer`, `nettoyer` ou `refuser` proposent les choix détaillés dans la bible, sans toucher au disque réel. Après 22 missions, `fin` choisit une issue blanche ou noire **narrative**, sans débloquer de nouveau contrat. Persistance v4 (`incidentsNoirs`, `gardienEnquete`, `tacheNoire`, `fin`). Voir `tests/market.test.cjs`.

**Enchaîner sur T21 — Sauvegarde SQLite par défaut (bridge actif), migration v2→v3.** La sauvegarde v4 est stabilisée ; T21 ajoutera le bridge Tauri pour SQLite.

**T21 livré — sauvegarde SQLite par défaut (bridge Tauri).** `SaveStore` unifié dans ui.js : utilise `LabyBridge.saveWrite/saveRead/saveList` (SQLite via Tauri) quand l'application de bureau est active, retombe sur `localStorage` en édition web. Migration v2→v3 automatique : au premier boot Tauri, si aucun slot SQLite n'existe, l'ancienne sauvegarde localStorage (`labyrinthe.save.v2`) est importée dans SQLite. Commandes `sauver`/`charger`/`reset` opèrent sur le stockage actif. Persistance v4 complète (tous les champs T0-T20). Tests de syntaxe JS : OK.

**T22 livré — packaging `.exe` (NSIS/MSI).** Configuration Tauri complète : tauri.conf.json (targets nsis, msi, deb, appimage, dmg ; fenêtre 1440×900 ; CSP stricte hors-ligne), Cargo.toml (tauri 2, rusqlite bundled, serde), src-tauri/src/main.rs (commandes save_list/save_read/save_write/save_delete, content_load, app_version), src-tauri/src/db.rs (schéma SQLite v3 avec table saves). Scripts de build : build-windows.sh (automatise cargo tauri build), BUILD_WINDOWS.md (prérequis, étapes, artefacts, CI GitHub Actions matrix). Taille cible < 30 Mo (WebView2 OS, pas Chromium embarqué). Le build réel nécessite une machine avec Rust + Tauri CLI (non disponible dans ce sandbox). 🟢

**Le prototype Hackent est maintenant complet (T0→T22).** Tous les chantiers du BUILD_ORDER sont implémentés et testés sous Node.

**Introduction narrative.** Une nouvelle partie commence par trois écrans facultatifs : message du Cartographe, prise en main du poste, puis briefing ACADEMIE et choix du guide. L'introduction se passe avec le bouton ou Échap et se revoit par ⓘ ou `intro`. L'étape est sauvegardée, les anciennes parties ne sont pas interrompues, et la simulation est en pause pendant la lecture. Les tests navigateur couvrent la reprise, le clavier, l'import et le monofichier ; le lancement Tauri natif reste à vérifier.

**Configuration de la station (v5).** Avant l'introduction, au premier lancement, le joueur configure sa station : nom d'utilisateur et mot de passe fictifs (PBKDF2-SHA-256 salé, jamais en clair), écran de confirmation, journal de démarrage simulé. Les lancements suivants exigent le mot de passe (verrou local fictif, sauvegarde **non chiffrée** ; aucune récupération, seulement une remise à zéro tapée). Identité reprise dans le prompt et `whoami` ; les anciennes sauvegardes créent un profil une seule fois sans perdre leur progression. La première mission — découverte du terrain avec le guide — démarre ensuite inchangée. Tests navigateur : création, verrouillage/déverrouillage, mauvais mot de passe, migration des anciennes sauvegardes, remise à zéro depuis l'écran de verrouillage.
