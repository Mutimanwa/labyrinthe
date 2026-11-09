# LABYRINTHE — Game Bible
**Version 1.0 — document de conception central**
*Un Hacknet-like pédagogique : du premier `ping` à la certification white hat.*

---

## 0. Résumé exécutif

LABYRINTHE est un jeu de simulation de hacking en solo, présenté comme un **vrai système d'exploitation fictif** dans lequel le joueur vit. Il commence sans rien savoir faire, dans le réseau d'une académie, et progresse jusqu'à devenir un professionnel de la sécurité offensive **éthique** — pentesteur certifié capable de reconnaissance, d'exploitation, de post-exploitation, de rédaction de rapport et de défense.

Trois choses distinguent LABYRINTHE de Hacknet ou Bitburner :

1. **Le savoir est la progression.** Le jeu ne débloque pas des « sorts », il débloque des *accès* : le joueur qui ne comprend pas n'avance pas, et aucune réponse n'est jamais livrée avant qu'il l'ait trouvée.
2. **Le monde riposte.** Des hackers PNJ (IA du jeu) scannent, attaquent et punissent l'imprudence. Laisser des traces partout = se faire hacker. La défense s'apprend par l'expérience.
3. **Un internet interne complet.** Forums, messagerie, ressources communautaires, et un darknet verrouillé par rang — comme la vraie vie d'un apprenant qui traîne sur Discord et finit par avoir ses entrées dans des cercles fermés.

**Plateforme cible :** application de bureau via **Tauri** (Rust + webview), export `.exe` Windows en priorité, Linux/macOS ensuite. Frontend actuel conservé tel quel.

---

## 1. Piliers de design

Chaque décision du jeu doit pouvoir se justifier par l'un de ces cinq piliers. Si une feature n'en sert aucun, elle sort.

### P1 — Pas de réponse avant que tu l'aies trouvée
- La progression est validée par **l'état du monde**, jamais par un dialogue ni un QCM. *(Déjà en place dans le prototype : `done: (w,sh,ev) => ev.some(...)`.)*
- Le guide donne des **méthodes**, pas des solutions. Le forum du jeu répond comme une vraie communauté : « t'as regardé les en-têtes ? », jamais « tape ça ».
- Système d'indices à 3 niveaux, payants en crédibilité, qui débloque avec le temps passé bloqué. Le niveau 3 pointe la *technique*, jamais la *victime précise*.

### P2 — Le kill chain réel, sans sauter d'étapes
- Reconnaissance → scan → exploitation → post-exploitation → traces → rapport/défense. Un contrat qui exige l'étape 4 suppose que 1-3 ont été apprises.
- Les contrats « race to root » qui court-circuiteraient la méthode sont interdits par le design : chaque mission liste ses **prérequis de phase**.

### P3 — Le monde est dangereux pour toi aussi
- Toute action génère du **bruit**. Le bruit laisse des **traces**. Les traces attirent les **chasseurs**.
- Être hacké n'est pas un game over : c'est un cours accéléré en hygiène défensive.

### P4 — Immersion totale
- Pas de menus d'apprentissage : on apprend en *utilisant*. Le terminal, le navigateur interne, la messagerie, l'IDE sont les seuls « menus ».
- Détails crédibles : heure du monde, bannières de services versionnées, vraie syntaxe des vrais outils (nmap, hydra, ssh dans leur usage réel).

### P5 — Un parcours, pas un bac à sable
- Le joueur a un **rang**, une **réputation double** (surface / darknet), des outils qui se débloquent par le mérite, et un arc narratif de maturité : de script kiddie qui fait du bruit à professionnel qui signe ses rapports.

---

## 2. Audit du prototype existant (v2, `index.html`, 8 565 lignes)

| Système | État | Verdict pour la bible |
|---|---|---|
| UI multi-panneaux façon Hacknet (RAM, processus, trace, netmap, terminal) | ✅ solide | Conserver tel quel, c'est l'identité du jeu |
| Interpréteur Python maison en JS | ✅ rare et précieux | **Atout unique** : base du futur système de scripting/outillage joueur |
| Transpileur TS→JS pour scripts débutants | ✅ | Idem, sert l'IDE |
| Monde réseau (`LE MONDE`, machines, ports `P(service, version)`) | ✅ | Étendre vers l'internet en couches (§4) |
| Commandes réalistes (`nmap -sV/-sS/-sU/--reason`, `ssh`, `sshpass`, `hydra -t`, `ping`, `traceroute`, `arp-scan`, `nikto`, `curl`, `ip`, `ss`) | ✅ excellent | Le grain de réalisme est bon ; continuer dans ce style |
| Campagne 16 contrats, validation par événements | ✅ conforme à P1/P2 | Réorganiser en 7 phases de curriculum (§5) |
| Lecteur de cours intégré | ✅ | Devient le « manuel » ; plus les wiki/forum (§9) |
| Compteur TRACE + mode serein (`trace off`) | ✅ | Évolue en système bruit/traces/chasseurs (§7) |
| Thèmes par machine (variables CSS injectées) | ✅ | Garder — signal fort d'immersion |
| Moteur audio WebAudio (`Audio2`) | ✅ | Charte sonore §11 |
| Sauvegarde `localStorage` (`labyrinthe.save.v2`) | ⚠️ limite | Migrer vers **SQLite via Tauri** (§10) |
| Monde statique (les PNJ n'agissent pas) | ❌ absent | **Chantier majeur** : IA offensives (§7) |
| Pas de navigateur interne / forums / darknet | ❌ absent | **Chantier majeur** : internet en couches (§4) |
| Pas de gestion de compte joueur (rang/xp/réputation) | ❌ absent | **Chantier majeur** : progression (§6) |
| Architecture monofichier de 366 Ko | ⚠️ | Découpage en modules pour Tauri (§10) |

---

## 3. Cadre narratif

### 3.1 Le pitch
Tu es un étudiant accepté à l'**Académie** (réseau `10.10.0.0/24`, déjà existant). Un mentor anonyme, **« Cartographe »**, t'ouvre une porte : « Internet est un labyrinthe. La plupart des gens vivent dans l'entrée. Je vais te montrer les couloirs. »

Chaque rang franchi ouvre une **couche plus profonde** du net du jeu : forums fermés, messagerie communautaire, marché gris, et enfin **le Puits** — le darknet du jeu. En parallèle, un crew black hat, **les Silencieux**, recrute aussi, et te fait des offres de plus en plus tentantes. La tension centrale du jeu n'est pas « réussir les missions » mais **choisir qui tu deviens**.

### 3.2 Ton et identité
- L'univers garde la saveur locale du prototype (domaines `.bi`, prénoms burundais, références au lac, aux collines) tout en restant **fictionnel** : pays réel, entreprises inventées.
- Pas de jargon chauvin : le jeu traite le hacking comme un **métier et une culture**, pas comme du vandalisme cool. Les Silencieux sont séduisants, pas ridicules — sinon le choix moral n'a aucun poids.

### 3.3 Personnages clés
| PNJ | Rôle | Arc |
|---|---|---|
| **Cartographe** | Mentor | Guide les 3 premiers rangs, disparaît à mi-parcours (« à toi de cartographier ») |
| **MURMURE** | Admin du forum *NetSec-Intérieur* | Donne les quêtes communautaires, juge sévèrement le bruit |
| **nyx_256** | Recruteuse des Silencieux | Contrats gris → noirs ; fin alternative |
| **GARDIEN** | Équipe sécurité de l'État (fictive) | Le « boss » de l'axe légal : te traque si tu choisis mal, t'embauche si tu choisis bien |
| **Tâche-Noire** | Ransomware-as-a-service du Puits | Antagoniste pur : peut te chiffrer ta machine (§7.4) |

---

## 4. Le monde en couches — l'internet interne

Tout se passe **dans** le jeu. Le joueur ne visite jamais le vrai web : le navigateur interne ne rend que des sites déclaratifs du jeu (JSON → rendu). C'est ce qui permet de simuler forums, discord et darknet sans jamais quitter la fiction — et sans aucun risque réel.

### Couche 0 — La machine locale
Le lab OS du prototype : fs, Python, IDE, outils de base. Accessible dès le boot. C'est **aussi la cible des PNJ** (§7).

### Couche 1 — L'Académie (`10.10.0.0/24` et segments voisins)
Le contenu actuel des 16 contrats. Sandbox encadrée, contrats légaux, bruit toléré (les profs te pardonnent, MURMURE non).

### Couche 2 — Le web clair du jeu
Un mini-web de ~40 sites statiques déclaratifs :
- **Moteur de recherche interne** (« Fouine ») — indexe les sites, et parfois des trucs qu'il ne devrait pas (leçon d'OSINT et de dorks).
- **Wiki « ManPages »** — les cours actuels du lecteur, remis en forme.
- **Pastebin-like**, **registrar whois fictif**, **réseaux sociaux fictifs** des PNJ (mine d'OSINT : dates de naissance = mots de passe).
- Sites d'entreprises cibles des contrats bug bounty.

### Couche 3 — La communauté (verrou rang **APPRENTI**)
- **Forum « NetSec-Intérieur »** : fils de questions/réponses. Le joueur peut poser une question (formulaire guidé, jamais champ libre interprété) et reçoit des réponses de PNJ **évasives mais justes** — c'est le système d'indices déguisé en culture hacker (P1).
- **Messagerie « IRC »** : salons en direct avec PNJ scénarisés, quêtes données en conversation, annonces d'événements du monde (faille 0-day fictive publiée → rush des PNJ → toi aussi tu peux la tenter si tu as compris le bulletin).

### Couche 4 — Le Puits (darknet, verrou rang **OPÉRATEUR** + invitation)
- Accès : obtenir une invitation (quête) **et** passer par un **chenillard de relais** (mini-jeu de routage type Tor : chaîne de 3 machines compromises louées, chaque saut coûte des crédits et ajoute du délai — la lenteur est simulée, lenteur = réalisme).
- Contenu : marché d'outils (exploits fictifs packagés, wordlists rares), contrats gris et noirs, tableaux de fuites, et **la vitrine des Silencieux**.
- Règle d'or du design : le Puits **paie mieux et pardonne moins**. Les chasseurs y sont plus nombreux, GARDIEN y patrouille, et la réputation darknet gagnée ici **verrouille** certaines fins blanches.

### 4.1 Verrous d'accès (répond à : « un débutant n'a pas accès aux ressources des pro »)
| Couche | Rang minimum | Condition additionnelle |
|---|---|---|
| 0-1 | VISITEUR | — |
| 2 | SCRIPT-KIDDIE | tutoriel fouine/OSINT terminé |
| 3 | APPRENTI | 3 contrats académiques + réponse acceptée sur le forum |
| 4 | OPÉRATEUR | invitation + chenillard opérationnel + opsec minimale (machine durcie, §7.5) |

---

## 5. Le curriculum — le kill chain en 7 phases

Cœur pédagogique du jeu. Chaque contrat appartient à une phase ; chaque phase suppose les précédentes. Le contenu des 16 contrats actuels se redistribue en phases 0-2 et sert de socle.

### Phase 0 — Survivre dans son terminal *(existant, à formaliser)*
Notions réelles : arborescence, droits, pipes, processus, `ip/ss/ping`, premiers scripts Python (avec **ton interpréteur maison** — personne d'autre ne peut offrir ça).
Contrats : retrouver un fichier, récupérer un backup, automatiser un inventaire.

### Phase 1 — Reconnaissance passive (OSINT)
Notions : whois, DNS, métadonnées, réseaux sociaux, fuites publiques, Google-dorks (version « Fouine-dorks »).
Gameplay : tout se fait dans le navigateur interne. Zéro paquet envoyé → zéro bruit (leçon : la meilleure attaque est celle qu'on ne voit pas).
Contrats types : profiler un PNJ et deviner son mot de passe « politique de mot de passe d'entreprise », identifier l'infra d'une cible sans la toucher.

### Phase 2 — Reconnaissance active *(existant : nmap et sa grammaire)*
Notions : découverte d'hôtes (`-sn`, arp-scan), ports (`-F/-p-/-p`), versions (`-sV`), furtivité (`-sS`), UDP, `--reason`, et **le coût en bruit de chaque option** (§7.1).
Contrats actuels conservés : cartographier un segment, pivot A→B→C par re-scan interne.

### Phase 3 — Exploitation
Notions : dictionnaire (`hydra -l ... -P rockyou.txt`, parallélisme vs bruit — déjà dicté par le `-t`), failles web (apps vulnérables simulées sur `codeLab` : login SQLi avec indice dans le HTML, livre d'or XSS stocké avec cookie de session admin exposé), et **framework « msf-lite »** : un outil `msf` du jeu avec `search/use/set/run` sur des modules fictifs (bannières réelles → module conseillé ; le joueur *compose* l'exploit au lieu d'appuyer sur « hack »).
Garde-fou design : chaque module `msf` est une donnée JSON déclarative (cible un couple service+version) — aucune logique d'exploit générique, aucun vrai payload.

**Flux pédagogique type (T16) :** `curl http://10.10.2.10/login.php` révèle l'indice développeur → `sqlmap -u "http://10.10.2.10/login.php?id=1" --dbs --batch` détecte l'injection et cracke le hash → identifiants `admin / P@ssw0rd!` → `ssh admin@10.10.2.10` pour accéder à la machine et extraire la preuve (FLAG).

### Phase 4 — Post-exploitation
Notions : qui suis-je (`id`), élévation de privilèges (SUID, sudo mal configuré, kernel vieux → indice dans `uname`), pillage ciblé (/etc/shadow → john-like interne), **pivot** (déjà esquissé par re-scan depuis une machine compromise — le généraliser via `route add` simulé).
Contrats : « drapeau » caché en root, exfiltrer un dossier précis (le client du contrat veut une preuve, pas un saccage).

### Phase 5 — Traces & opsec
Notions : où sont les logs (`/var/log/...`, journald-like), ce qu'on y laisse (`wtmp`, historique bash), nettoyage sélectif vs tout-effacer (tout-effacer = signal en soi !), timestomp basique, relais/ Proxys (réutilise le chenillard du Puits).
Gameplay : le terminal montre parfois **son propre historique relu par un chasseur** — moment d'horreur douce très formateur.

### Phase 6 — Rapport & défense (la signature white hat)
**C'est la phase qui fait du joueur un white hat et pas un cambrioleur.**
- Chaque contrat légal ≥ phase 3 exige un **rapport** écrit dans l'éditeur : vulnérabilité, preuve, impact, **correctif**. Validé par mots-clés + structure (pas d'IA magique : gabarit à remplir).
- Contrats purement défensifs : durcir un serveur (fermer les ports, config d'un `iptables` simulé, politique de mots de passe), analyser les logs pour trouver **l'intrusion d'un PNJ** (table rase : tu utilises contre les PNJ exactement ce qu'ils utilisent contre toi).
- Le rapport bien noté rapporte autant que l'exploit : c'est économique, donc c'est culturel.

### 5.1 Carte phases → outils débloqués
| Phase | Outils ajoutés |
|---|---|
| 0 | `ls cd cat grep chmod ps kill`, Python |
| 1 | `whois dig fouine` (recherche), navigateur |
| 2 | `nmap arp-scan traceroute` |
| 3 | `hydra nikto curl msf` |
| 4 | `id sudo su john route pivot` |
| 5 | relais, `wipe-log`, `timestomp` |
| 6 | `iptables ufw logview rapport` |

---

## 6. Progression — rangs, XP, réputation, matériel

### 6.1 Les rangs (maturité visible)
1. **VISITEUR** — tu lances le jeu
2. **SCRIPT-KIDDIE** — tu sais recopier (fin phase 1)
3. **APPRENTI** — tu sais chercher seul (fin phase 2, accès couche 3)
4. **OPÉRATEUR** — tu entres proprement (fin phase 4, accès Puits possible)
5. **PENTESTEUR** — tu signes des rapports que GARDIEN lit (phase 6 entamée)
6. **MAÎTRE DU LABYRINTHE** — fin de campagne ; toi aussi tu peux filer un contrat à un débutant PNJ (boucle bouclée)

Dans la version actuelle, le rang est basé sur l'XP : 0, 400, 1 200, 3 000, 6 000 et 8 000 XP respectivement ; le dernier exige aussi la campagne terminée. Certaines ambitions narratives de cette section restent à construire.

### 6.2 XP et anti-grind
- Chaque mission rapporte en XP ses points de score (100 plus un éventuel bonus de rapidité) et la moitié de sa prime en crédits. Le score et les crédits restent distincts de l'XP.
- Les contrats data donnent leur propre XP ; 16 techniques donnent de l'XP à leur première réussite seulement. Les anciennes sauvegardes reçoivent une fois le complément lié aux missions déjà terminées.
- Sans bonus de rapidité, la campagne rapporte 7 750 XP ; les contrats et techniques apportent jusqu'à 570 et 535 XP supplémentaires. Le rang final et le nettoyage de Tâche-Noire sont ainsi accessibles.

### 6.3 Réputation double — l'axe moral mécanique
- **Respect** (surface) : obtenu notamment par les contrats data ; certains incidents et choix le réduisent.
- **Créd** (Puits) : +1 pour le premier achat de chaque article et +2 la première fois qu'on résiste à GARDIEN. Ces bonus ne se répètent pas à l'infini.
- Les jauges et les incidents déterminent une fin **narrative**. Contrats d'État ou noirs supplémentaires, certifications et blocage de donneurs sont des pistes de conception, pas des déblocages implémentés.

### 6.4 Matériel (idées futures, déjà suggérées par le panneau RAM)
- Upgrades RAM/CPU/disque : plus de processus simultanés, hydra plus rapide, wordlists locales plus grosses, machines relais plus nombreuses.
- Achat en crédits **surface** (légal, traçable) ou **sats** (Puits, moins cher, certains articles « tapés » peuvent contenir une surprise — un cheval de Troie … leçon : ne jamais faire confiance à un binaire).
- GPU = fin de jeu : brute-force hors ligne de shadow (john plus rapide).

### 6.5 Rapport de pentest (T17)
Les contrats de bug bounty (phase 3+) exigent un **rapport de pentest** pour être payés. La commande `rapport <id>` ouvre un gabarit dans l'éditeur avec cinq sections : vulnérabilité, preuve, impact, correctif, signature. `rapport soumettre <id>` valide le rapport par présence de contenu dans chaque section (note 0-100, 100/100 = validé). Un contrat avec `report_required` reste bloqué tant que le rapport n'est pas validé : pas de rapport, pas de récompense. Le rapport est persisté avec la sauvegarde (v4).

### 6.6 Chenillard de relais — accès au Puits (T18)
Le Puits (couche 4, darknet) n'est pas directement joignable. Pour l'atteindre, le joueur doit emprunter un **chenillard de relais** : une chaîne de 3 machines relais (relais1 → relais2 → relais3) avant d'arriver au Puits (10.10.0.99).

**Commandes :**
- `relais` — affiche le statut du chenillard (position, crédits dépensés, latence, verrou OPÉRATEUR)
- `relais sauter` — lance le saut suivant (3 secondes, 50 crédits débités à l'arrivée)
- `relais arreter` — annule gratuitement un saut en cours
- `relais recommencer` — remet la chaîne au départ, sans rembourser les sauts déjà effectués

**Contraintes :**
- Rang OPÉRATEUR (3000 xp) requis pour commencer
- 3 sauts obligatoires avant d'atteindre le Puits
- Chaque saut terminé déduit 50 crédits après 3 s ; le relais privé réduit les prochains sauts à 1 s
- À l'arrivée : le Puits est découvert, lié au poste du joueur, et accessible via `ssh joueur@10.10.0.99` (mot de passe fictif `puits`)
- Persisté avec la sauvegarde (v4, champ `game.relais`)

### 6.7 Marché du Puits — sats et articles piégés (T19)
Une fois le Puits atteint (chenillard de relais complété), le joueur peut accéder au **Marché du Puits** via la commande `marché`.

**Commandes :**
- `marché` (ou `marche`) — liste les articles en vente (prix en sats) et le solde du joueur
- `marché acheter <id>` — achète un article (déduit des sats, ajoute à l'inventaire, crée un fichier dans `/home/joueur/achats/`)
- `marché changer <montant crédits>` — échange un nombre entier de crédits en sats au taux fluctuant (40–60 crédits par sat, sinusoïde sur 30 min) ; les crédits insuffisants pour former un sat restent sur le compte
- `marché inventaire` — affiche les articles achetés, marque les piégés
- `run <fichier>` — exécute un fichier acheté ; détecte et déclenche les pièges

**Articles :**
| Article | Prix | Type | Effet |
|---|---|---|---|
| Wordlist Premium | 50 sats | sûr | `/usr/share/wordlists/rockyou_premium.txt`, utilisable par hydra |
| Relais Privé | 100 sats | sûr | Latence des prochains sauts 3 s → 1 s, après `relais recommencer` |
| Exploit 0-day | 200 sats | sûr | Module msf fictif limité au laboratoire CODE |
| Nettoyeur Magique | 30 sats | **PIÉGÉ** | Porte dérobée simulée (jusqu'à −5 sats et −5 respect), risque de Tâche-Noire |

**Leçon pédagogique :** ne jamais exécuter un binaire du marché noir sans l’avoir audité. Les articles piégés créent un fichier suspect dans `/home/joueur/achats/` et, s’ils sont exécutés via `run`, déclenchent une pénalité et un événement `piege-declenche`.

Inventaire, achats et sats sont persistés avec la sauvegarde (v4). La campagne offre 11 100 crédits et les trois contrats data 1 700 crédits ; après les 150 crédits du premier chenillard, le taux retenu laisse accessibles les articles, y compris celui à 200 sats. Les anciennes wordlists achetées mais non livrées sont migrées sans écraser un fichier existant.

### 6.8 GARDIEN, Tâche-Noire et fins doubles (T20)
Le monde réagit à votre conduite dans le Puits. Deux sous-systèmes mécanisent cette réaction : le **GARDIEN** (enquête defensive) et la **Tâche-Noire** (rançongiciel offensif).

**Incidents noirs** : chaque achat d'article piégé sur le Marché du Puits, ou chaque exécution d'un binaire provenant du Puits (`run` sur un fichier dans `/home/joueur/achats/`), enregistre un incident noir (`type`, horodatage, détail).

**GARDIEN** : après deux incidents noirs non traités, une enquête s'ouvre.
- `gardien` — affiche le statut et les conséquences
- `gardien cooperer` — clôt l'enquête, jusqu'à −100 crédits et −2 respect
- `gardien resister` — clôt l'enquête, jusqu'à −5 respect et 60 % de risque de saisie de l'inventaire ; les fichiers existants restent intacts

**Tâche-Noire** : 40 % de risque lors de l'exécution du Nettoyeur Magique. Cette simulation masque uniquement `/home/joueur/bloc_notes.txt` dans le système de fichiers du jeu ; une copie est conservée dans la sauvegarde fictive.
- `tache-noire` — statut et options
- `tache-noire payer` — 20 sats pour restaurer la copie simulée
- `tache-noire nettoyer` — restaurer gratuitement à partir de 5 000 XP
- `tache-noire refuser` — refuser pour l'instant sans supprimer la note ; une modification manuelle n'est jamais écrasée lors de la restauration

Dans la réalité, payer une rançon ne garantit pas la récupération des données.

**Fins doubles** : après les 22 missions, `fin` détermine une issue narrative :
- **Fin blanche** : Respect ≥ Créd et moins de 3 incidents noirs
- **Fin noire** : Créd > Respect ou au moins 3 incidents noirs

Ces fins ne débloquent ni véritable certification ni nouveaux contrats.

États persistés en v4 : `incidentsNoirs`, `gardienEnquete`, `tacheNoire`, `fin`.

---

## 7. Le monde vivant — IA, traces et contre-attaques

**Le chantier qui rend le jeu unique.** Sous-système nommé **ECHO** (tout ce que tu fais a un écho).

### 7.1 Bruit (score par action)
Chaque commande distante porte un bruit de base, modulé :

| Action | Bruit indicatif |
|---|---|
| OSINT navigateur interne | 0 |
| `nmap -sn` | 1 |
| `nmap -sS` | 2 · `-sT` 4 · `-sV` 5 · `-p-` ×2 |
| `hydra -t 4` | 6 · `-t 16` 15 (alarme quasi sûre) |
| `ssh` login OK / KO | 1 / 3 par échec |
| Pivot par relais | ÷2 sur chaque trace |

Le bruit s'écrit dans les logs **de la cible** (visibles si tu y entres) et alimente ECHO.

### 7.2 Trace (le compteur actuel, généralisé)
- Aujourd'hui : un timer TRACE binaire par mission.
- Cible : **capital trace persistant** par machine et **trace globalement corrélée** : rester scanné/attaqué pendant une session monte un pourcentage ; à 100 % la machine te **bannit** et transmet ta signature (handle + heure + méthode) à ECHO.
- `trace off` devient une **difficulté** (serein/exploration) : le monde vivant complet est la difficulté nominale.

### 7.3 Les archétypes de PNJ offensifs
| Archétype | Comportement | Leçon qu'il inflige |
|---|---|---|
| **Le Balayeur** (script kiddie) | Scanne tout le monde, attaque les mots de passe faibles de ta machine exposée | Ferme tes ports, change tes mots de passe |
| **Le Rancunier** | Tu touches sa machine (contrat) → il te cherche pendant des jours de jeu | Minimise le bruit, nettoie, ne te vante pas sur le forum |
| **Le Chasseur de traces** | Lit les logs des machines que tu as visitées ; suit ta signature | Le nettoyage (phase 5) n'est pas optionnel |
| **GARDIEN** | Patrouille surface + Puits ; si 2 incidents noirs corrélés → convocation, saisie d'outils, ou pire | L'opsec est une hygiène permanente |
| **Tâche-Noire** | Si tu traînes dans le Puits mal protégé : **il te chiffre des fichiers** | Backups, segmentation, ne jamais exécuter un binaire du Puits à nu |

### 7.4 Être hacké — le jeu ne pardonne pas, il enseigne
Échelle de conséquences (jamais d'insta-kill) :
1. **Avertissement (niveau 1)** : un fichier `LISEZ-MOI.txt` apparaît dans ton home (« Je suis passé. — un ami »). Déclenché par le Balayeur après une intrusion réussie sur ton poste.
2. **Vol d'outils (niveau 2)** : après une intrusion réussie, 40 % de chance qu'un outil soit copié (rockyou.txt, bloc-notes, guide de démarrage). Un fichier d'avis `/home/joueur/VOL-<id>.txt` te prévient avec le prix de rachat. Tu as deux issues :
   - `vols racheter <id>` : paie en crédits (perte sèche, honte incluse).
   - `vols recupere <id>` : déclare une récupération forensique (tu as effacé la copie chez le voleur) → +1 respect.
   Si rien n'est fait sous 6 h monde, l'objet est mis en vente publique sur le forum par un « recéleur anonyme » (−3 respect).
3. **Rançon (niveau 3, T20)** : un sous-arbre de fichiers chiffré. Deux issues : payer en sats (perte sèche), ou **mini-jeu forensique** : retrouver la clé dans une mémoire/backup/log → les meilleurs joueurs transforment la punition en contrat.
4. **Exposition (niveau 4)** : ton handle publié sur le tableau des « débutants bruyants » → Créd −, et le forum se marre (humiliation pédagogique, très efficace).

Jamais d'insta-kill : se faire hacker est un cours accéléré en hygiène défensive, pas un game over.

### 7.5 Se défendre (la moitié défensive du curriculum)
- **Durcissement de ton poste** :
  - `/etc/ssh/sshd_config` — fichier véritable, éditable avec `sed -i`, l'éditeur ou `cat >`. Deux directives fonctionnent : `PermitRootLogin no` (interdit le root par mot de passe) et `PasswordAuthentication no` (refuse toute authentification par mot de passe). `sshd -t` teste la syntaxe, `sshd -T` affiche la configuration effective.
  - `iptables` — `iptables -P INPUT DROP` (politique par défaut), `iptables -A INPUT -p tcp --dport 22 -j ACCEPT` (ouvre un port), `iptables -D <n>` (supprime une règle), `iptables -F` (vide tout, root requis), `iptables -L -n -v` (liste + ports effectivement ouverts).
  - `ufw` — `ufw enable`, `ufw disable`, `ufw allow 22/tcp`, `ufw deny 22/tcp`, `ufw status verbose`.
  - Politique de mots de passe : ne laisse jamais `joueur:joueur` / `root:toor` sur un port exposé — le Balayeur en profite.
- **Détection** : `logview` (alias de `logs`, lit tes `/var/log/*.log` dans le panneau DISPLAY), pot de miel (`honeypot start` lance un processus persistant `Honeypot` sur le port 2222 décoy ; chaque tentative est écrite dans `/var/log/honeypot.log` — `honeypot voir` pour le consulter).
- **Récupération** : sauvegardes restorables (`sauver`/`charger`, export JSON), réinstallation partielle.
- L'interface de défense est **les mêmes panneaux que l'attaque** renversés : RAM qui monte pendant une intrusion, processus inconnu à `kill`, panneau TRACE inversé (« qui me sonde ? »).
- Chaque manipulation de pare-feu ou de honeypot génère un événement `firewall` (bruit 5, ECHO) et rapporte de l'XP « pare-feu manipulé » (anti-grind, une fois).

### 7.6 Horloge du monde
Temps de jeu compressé (1 s réelle ≈ 1 min monde). Les PNJ agissent sur cet horodatage : un Rancunier qui revient « 3 jours plus tard » donne au joueur le temps d'oublier — c'est voulu. Sauvegarde = snapshot complet d'ECHO (§10.3).

---

## 8. Économie & contrats

### 8.1 Typologie des contrats
| Type | Légal | Lieu | Exigence | Récompense |
|---|---|---|---|---|
| **Académique** | oui | Couche 1 | méthode | crédits, XP |
| **Bug bounty** | oui | Couche 2 | **rapport obligatoire** | gros crédits, Respect |
| **Communauté** | oui | Forum/IRC | entraide, CTF interne | Respect, accès |
| **Gris** | toléré | Puits | discrétion | sats, Créd |
| **Noir** | non | Puits/Silencieux | opsec | beaucoup de sats, GARDIEN t'attend |
| **Défense** | oui | toutes | analyse + durcissement | crédits, Respect (fin carrière) |

### 8.2 Monnaie
- **Crédits** (surface, traçables) / **sats** (Puits, mélangeur factice compris dans le mini-jeu du chenillard).
- Taux de change fluctuant affiché sur un site du Puits — simple sinus à bruit, juste pour la vie.

### 8.3 Contrats générés
Après la campagne écrite (≈60 contrats), un générateur procédural de « missions de fond » : cible générée (service+version+faiblesse tirés d'une table), objectif tiré (drapeau/donnée/défense), bruit toléré, récompense. Les contrats écrits font l'histoire ; les générés font la carrière infinie.

---

## 9. Interface & immersion

### 9.1 Applications du bureau (l'OS fictif)
| App | État | Notes |
|---|---|---|
| Terminal | ✅ | cœur ; ajouter auto-complétion contextuelle par rang |
| Netmap | ✅ | devenir cliquable (clic nœud → recon rapide, coût en bruit) |
| Éditeur/IDE | ✅ | + exécution Python (déjà !), coloration, onglets |
| Lecteur de cours | ✅ | devient « ManPages » synchronisé au curriculum |
| **Navigateur interne** | ❌ à construire | rend sites déclaratifs ; onglets ; historique consultable… par toi comme par les PNJ |
| **Messagerie IRC** | ❌ à construire | salons + MP ; les PNJ y répondent en différé (horloge du monde) |
| **Mail** | ❌ à construire | contrats, factures, convocations GARDIEN, phishing PNJ (tu peux te faire phisher — la leçon parfaite) |
| **Logview / moniteur** | ❌ à construire | pilier de la défense |
| Notes | ❌ | le carnet du hacker, sauvegardé dans la DB |

### 9.2 La règle « pas de réponse » en UX
- Le bouton « indice » n'existe pas. Ce qui existe : **le temps passé bloqué** débloque des fils de forum de plus en plus explicites ; le coût, c'est ta fierté (et un peu de Respect si tu poses une question trop basique en couche 3).
- Le journal de quêtes liste **des faits découverts**, pas des instructions.

### 9.3 Détails qui vendent la fiction
- Prompt exact façon Kali (déjà : `┌──(user㉿ip)-[~]`), thème par machine (déjà), heure du monde dans la topbar, ventilateur qui souffle quand la RAM > 85 %, grain CRT (déjà), pauses « réseau » réalistes sur le Puits.

### 9.4 La session fictive — profil local et démarrage (v5) ✅
Avant toute chose, la station exige une **configuration** : écran d'enregistrement rétro (adaptation originale, pas de copie servile) avec nom d'utilisateur et mot de passe fictifs, confirmation, puis journal de démarrage simulé. Les relancements demandent le mot de passe. Propriétés assumées et documentées :

- **Le mot de passe n'est jamais stocké en clair.** Seule une empreinte PBKDF2-SHA-256 salée (210 000 itérations) est conservée dans la sauvegarde, via `tools/credentials-entry.js` (bundle autonome `src/js/credentials.js`, `@noble/hashes` en dépendance de développement, licence MIT).
- **La sauvegarde n'est PAS chiffrée.** Le verrou est un décor de session local — le fichier reste lisible. L'écran le dit explicitement, et il faut choisir un mot de passe fictif, jamais un vrai.
- **Aucun secours :** un mot de passe oublié offre uniquement « effacer la sauvegarde et repartir de zéro » (confirmation tapée « EFFACER »). Aucune récupération n'est possible ou promise.
- **Identité de session :** le prompt, `whoami`, `id`, les journaux et l'introduction reprennent le nom choisi. L'arborescence héritée reste `/home/joueur` (compatibilité des anciennes sauvegardes et des cours) ; le chemin physique n'est pas renommé. Sur les machines distantes, la session redevient l'utilisateur choisi à la connexion puis le nom local au retour (`exit`, fin de traçage).
- **Anciennes sauvegardes :** sans profil, elles passent une seule fois par l'écran de création (nom `joueur` proposé), puis gardent leur progression. Les sauvegardes sont validées structurellement à l'import ; un profil trafiqué est rejeté avant toute mutation.
- Les missions, dont « Premier contact » (découverte du terrain : `nmap`, `ssh joueur@10.10.0.1`, lecture de la note), et le guide initial sont inchangés.

---

## 10. Architecture technique & Tauri

### 10.1 Découpage du monofichier ✅ (M0 — fait)
Découpage réalisé selon les bannières du fichier source (11 blocs IIFE, tous
validés `node --check`) :

```
/src
  index.html        régénéré (link css + scripts externes, ordre préservé)
  css/theme.css     langage visuel Hacknet
  js/bridge.js      pont Tauri/localStorage (chargé en premier, inerte en web)
  js/py.js          interpréteur Python           → window.PyInterp
  js/engine.js      FS + moteur shell             → window.GameEngine
  js/campaign.js    LE MONDE + contrats           → window.Campaign
  js/apiserver.js   serveur/API (USERS .bi)       → window.ApiServerMod
  js/jsrun.js       transpileur TS→JS             → window.JsRun
  js/webdev.js      machine web + missions web    → window.WebDev
  js/game.js        cœur de jeu                   → window.GameCore
  js/programs.js    thèmes + programmes           → window.GamePrograms
  js/audio.js       moteur WebAudio               → window.GameAudio
  js/realcmd.js     commandes réalistes           → window.RealCommands
  js/ui.js          boot + panneaux + terminal    (window.LABYRINTHE)
/content             ← tout le data-driven (§10.4)
  missions/*.json   (bb-01.json = exemple conforme)
  web/sites/*.json · web/fouine/ · forum/ · puits/ · npc/   (M1 → M4)
/src-tauri           (Rust : tauri.conf.json, Cargo.toml, main.rs, db.rs)
build-single.py      reconstruit l'édition web monofichier → dist/
```

« Vérifier » avant chaque commit : `node --check` vert sur chaque `js/*.js`.

### 10.2 Tauri
- **Rust ne fait pas le jeu.** Il fait : fenêtre, persistance SQLite, lecture des packs de contenu, chemins utilisateur. Toute la logique reste dans la webview.
- `tauri.conf.json` : fenêtre 1440×900 min, titre LABYRINTHE, plein écran optionnel, CSP stricte (aucun réseau sortant : le jeu est 100 % hors-ligne par design).
- Commandes Rust exposées : `save_list / save_read / save_write / save_delete`, `content_load(pack)`, `app_version`.
- ⚠️ **Règle intouchable : le terminal ne débouche sur aucun shell réel.** Même en Rust, aucune commande du joueur n'est exécutée. Le jeu simule. (À mentionner dans la fiche store : « simulation close, aucune interaction avec votre système ».)

### 10.3 Persistance — de `localStorage` à SQLite
Moteur : `rusqlite`, fichier `labyrinthe.db` dans le dossier données de l'app. Schéma minimal :

```sql
CREATE TABLE profile(handle TEXT PRIMARY KEY, rank INT, xp INT,
                     respect INT, cred INT, credits INT, sats INT,
                     playtime INT, created_at TEXT);
CREATE TABLE world(machine TEXT PRIMARY KEY, state JSON);      -- ports, fichiers, logs, patchs
CREATE TABLE echo(id INTEGER PRIMARY KEY, ts TEXT, actor TEXT, -- bruit/traces/signatures
                  kind TEXT, target TEXT, payload JSON);
CREATE TABLE contracts(id TEXT PRIMARY KEY, state INT,         -- 0 inconnu,1 dispo,2 actif,3 fait
                       evidence JSON);
CREATE TABLE npc(id TEXT PRIMARY KEY, mood INT, state JSON,
                 next_move_at TEXT);                            -- IA : agenda !
CREATE TABLE files(machine TEXT, path TEXT, content TEXT,
                   PRIMARY KEY(machine, path));
CREATE TABLE settings(key TEXT PRIMARY KEY, value JSON);
```

- Migration : au premier lancement, si `localStorage['labyrinthe.save.v2']` existe (édition web) ou un vieux JSON → import en transaction → version `saves.schema = 3`.
- Plusieurs **slots** (3 parties) + auto-save toutes les 30 s + save au « repos » (le jeu a une vraie notion de fin de journée via l'horloge).

**Implémentation T21 (faite) :** `SaveStore` dans `ui.js` unifie l'accès : `LabyBridge.saveWrite/saveRead/saveList` (SQLite via Tauri) quand l'application de bureau est active, `localStorage` (`labyrinthe.save.v2`) en fallback édition web. Migration v2→v3 automatique : au premier boot Tauri, si aucun slot SQLite n'existe, l'ancienne sauvegarde localStorage est importée dans SQLite. Commandes `sauver`/`charger`/`reset` opèrent sur le stockage actif. Snapshot v4 complet (tous les champs T0–T20 persistés).

### 10.4 Contenu data-driven (modable)
Missions/threads/sites/contrats en JSON/Markdown hors code : écrire un contrat = écrire un fichier, avec schéma :

```json
{ "id":"bb-04", "phase":3, "giver":"MURMURE", "layers":[2],
  "brief":"…", "requires":["nmap","sqlmap-lite"],
  "win":{"events":[{"type":"http","target":"banque.bi","q":"sql"}]},
  "report_template":["vuln","poc","impact","correctif"],
  "reward":{"credits":900,"respect":6} }
```

### 10.5 Packaging
- `npm i -D @tauri-apps/cli && cargo tauri dev` pour la boucle locale.
- CI GitHub Actions : matrice windows/linux/mac → artefacts `.msi/.exe (NSIS)`, `.deb + .AppImage`, `.dmg`. Versionnage `0.1.0` en MVP, tag sémantique.
- Taille cible < 30 Mo (webview OS, pas Chromium embarqué — c'est tout l'intérêt de Tauri vs Electron).

---

## 11. Audio design

`Audio2` (WebAudio) suffit : tout est synthétisé à la volée, zéro asset lourd.

| Moment | Son |
|---|---|
| Ambiance base | Nappe sombre (2 oscillateurs détunés + LFO), ventilateur filtré |
| Frappe clavier | Clics courts bruit filtré, vélocité liée à la vitesse de frappe |
| Commande juste / fausse | Bip grave bref / rebuffade aiguë discrète |
| Scan en cours | Chuintement qui monte avec le nombre de ports |
| TRACE > 70 % | Battement de cœur + low-pass sur l'ambiance (le monde « se bouche ») |
| Intrusion subie | **L'ambiance ne change pas.** Juste un disque dur qui gratte une fois. Le joueur entraîné l'entend. Leçon : les intrusions ne sonnent pas l'alarme. |
| Couche 3 | BBIP radio lointain, voix mangées |
| Puits | Drone plus grave, ralenti ; silence complet pendant le chenillard |

---

## 12. Équilibrage & anti-frustration

- **Blocage mou** : jamais un seul mini-boss bloquant ; toujours ≥ 2 contrats disponibles à ton rang (un offensif, un défensif ou OSINT).
- **Le blocage dur** déclenche le système de forum (indices graduels, §9.2) — mesuré en temps de jeu, pas en échecs, pour ne pas punir la prudence.
- La difficulté nominale suppose ECHO actif ; `trace off` (déjà présent) reste le mode découverte, affiché honnêtement comme « visite guidée », sans récompenses de rang.
- Permadeath optionnelle (mode « Zéro trace ») : end-game pour joueurs confirmés, leaderboards internes via export JSON — pas de serveur, pas de triche externe rentable.

---

## 13. Roadmap (jalons)

| Jalon | Contenu | Critère de sortie |
|---|---|---|
| **M0 — Consolidation** | Découpage modules, script single-file, schéma DB figé | le jeu marche à l'identique en fichiers séparés |
| **M1 — Internet interne v1** | Navigateur + Fouine + wiki + 12 sites + forums (lecture/réponse scriptée) | un contrat OSINT jouable 100 % navigateur |
| **M2 — Progression v1** | Rangs 1-4, XP anti-grind, verrous de couches | recommencer une partie change l'accès réellement |
| **M3 — ECHO v1** | Bruit/traces persistants, Balayeur + Chasseur + Rancunier, défense (iptables simulé, logview), être hacké niveaux 1-2 | un joueur imprudent se fait pirater en 2 sessions |
| **M4 — Puits & morale** | Invitation, chenillard, marché, contrats gris/noirs, GARDIEN, Tâche-Noire (niveau 3-4) | double fin jouable (blanche / noire) |
| **M5 — Tauri** | SQLite, slots, packaging `.exe` Windows + CI | installateur Windows autonome < 30 Mo |
| **M6 — Polish** | Audio complet, horloge avancée, FR/EN, 60 contrats écrits | bêta publique |

**MVP = M0+M1+M2+M3 allégés** : 20 contrats, rangs 1-4, forum lectorat, Balayeur et Chasseur seulement, sauvegarde SQLite, `.exe`. Tout le reste est peaufinable sans toucher aux fondations.

---

## 14. Décisions ✅ (tranchées ensemble)

1. **Langue** — tranché : UI et contenu **en français**, les **commandes restent en anglais** (réalisme : nmap, hydra, ssh…). Traduction EN renvoyée au M6.
2. **Multijoueur** — tranché : **pour le futur**. ECHO simule déjà « les autres » ; les structs restent réseau-neutrales (agendas datés, acteurs identifiés par handle) pour ne pas bloquer un mode en ligne plus tard.
3. **Réalisme terminal** — tranché : interpréteur maison uniquement, **aucune commande réelle jamais exécutée** (règle intouchable, §10.2).
4. **Rating des contrats noirs** — tranché : on garde la proposition initiale — fiction assumée **16+**, avertissement au lancement, rien d'instructif au-delà de la fiction simulée.
5. **Rythme de dev** — tranché : on avance ensemble, jalons M0→M6 à notre rythme, sans deadline imposée. **M0 livré** (découpage + squelette Tauri).

---

## Annexe A — Exemples de contrats par phase

- **P1** « La colline d'Iteka » : retrouver, uniquement par fouille Fouine + whois + réseaux sociaux, le vrai nom et l'email pro de « colline_14 », admin d'un CMS. (Zéro paquet.)
- **P2** « Tiroirs » : un segment `10.10.4.0/24` annonce « rien d'intéressant » ; prouver le contraire (`-p-`, `-sU`, `--reason`), rendre la carte.
- **P3** « Le comptable » : port 8080 Tomcat + panneau web vulnérable ; msf-lite `search tomcat` → `use …` → flag. Bruit toléré : 12.
- **P5** « Éponge » : reprendre une ancienne cible déjà compromise et faire disparaître ta signature **sans vider les logs** (le client compare avant/après).
- **P6** « Après l'orage » : les Silencieux ont rançongné une clinique du jeu. Tu analyses leurs logs (forensique), trouves leur point d'entrée, durcis la machine, rédiges le rapport. GARDIEN le lit. *(Le contrat qui transforme le joueur.)*

## Annexe B — Glossaire diégétique

Fouine = moteur de recherche · Le Repaire = l'IRC · Le Puits = le darknet · Chenillard = chaîne de relais · ECHO = la mémoire du monde · Les Silencieux = crew black hat · GARDIEN = cybercellule d'État · Maître du Labyrinthe = rang final.

---

*Fin de la game bible v1.0 — toute feature future se branche sur ces sections, et toute section peut passer en fiche technique dédiée.*
