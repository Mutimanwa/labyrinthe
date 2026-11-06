/* =====================================================================
   campaign.js — Le monde et les 16 missions du LABYRINTHE
   Chaque mission a un validateur qui inspecte l'état réel du monde.
   ===================================================================== */
(function (global) {
  'use strict';

  const P = (service, version) => ({ service, version, state: 'open' });

  // ------------------------------------------------------------ LE MONDE
  const WORLD_SPEC = {
    playerId: 'joueur',
    nodes: [
      {
        id: 'joueur', theme: 'cyan', name: 'Ton poste', ip: '10.10.0.5', os: 'Linux',
        desc: 'Ta machine. Tout ce que tu récoltes arrive ici.',
        links: ['academie'],
        files: {
          '/home/joueur/LISEZ_MOI.txt': `LABYRINTHE — terminal d'entraînement

Tu es dans un réseau simulé. Rien de ce que tu tapes ici
ne sort de ton navigateur. Aucun risque, aucune loi enfreinte.

POUR COMMENCER
  missions              voir les contrats disponibles
  objectif              relire la mission en cours
  scan                  découvrir les machines voisines
  connect 10.10.0.1     rejoindre le serveur ACADEMIE
  help                  toutes les commandes

PROGRESSION
  4 modules, 16 missions. Chaque module se débloque en
  réussissant le précédent.

  MODULE 1  SHELL LINUX      missions 1-4
  MODULE 2  PROGRAMMATION    missions 5-8
  MODULE 3  RESEAU           missions 9-12
  MODULE 4  CYBERSECURITE    missions 13-16

Les notes de cours sont sur ACADEMIE, dans /home/cours.
Lisez-les. Elles contiennent tout ce dont vous avez besoin.`,
          '/home/joueur/bloc_notes.txt': `Mes notes :

`,
          '/usr/share/wordlists/rockyou.txt': `123456
password
12345678
qwerty
123456789
12345
1234
111111
1234567
dragon
123123
baseball
abc123
football
monkey
letmein
shadow
master
666666
qwertyuiop
123321
mustang
1234567890
michael
654321
superman
1qaz2wsx
7777777
121212
000000
qazwsx
123qwe
killer
trustno1
jordan
jennifer
zxcvbnm
asdfgh
hunter
buster
soccer
harley
batman
andrew
tigger
sunshine
iloveyou
2000
charlie
robert
thomas
hockey
ranger
daniel
starwars
klaster
112233
george
computer
michelle
jessica
pepper
1111
zxcvbn
555555
11111111
131313
freedom
777777
pass
maggie
159753
aaaaaa
ginger
princess
joshua
cheese
amanda
summer
love
ashley
nicole
chelsea
biteme
matthew
access
yankees
987654321
dallas
austin
thunder
taylor
matrix
admin
admin123
root
toor
joueur
test
guest`
        }
      },

      // ------------------------------------------------ HUB
      {
        id: 'academie', users: { joueur: 'joueur' }, sudoNoPasswd: true, theme: 'teal', name: 'ACADEMIE — Formation', ip: '10.10.0.1', os: 'Linux',
        desc: 'Serveur de formation. Notes de cours et contrats.',
        links: ['shellLab', 'codeLab', 'netLab', 'secLab', 'depot'],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1'), 80: P('http', 'nginx 1.24.0') },
        portsNeeded: 0,
        files: {
          '/home/cours/01_navigation.txt': `MODULE 1 — NAVIGUER DANS UN SHELL

Un système de fichiers est un arbre. Tu es toujours quelque part
dans cet arbre : c'est le dossier courant.

  pwd                 où suis-je ?
  ls                  que contient ce dossier ?
  ls -l               avec les détails (permissions, taille)
  cd cours            entrer dans un dossier
  cd ..               remonter d'un niveau
  cd /                aller à la racine
  cd ~                revenir à ton dossier personnel
  cat fichier.txt     lire un fichier

CHEMINS
  absolu    /home/cours/note.txt     part de la racine
  relatif   cours/note.txt           part d'ici

DOSSIERS UNIX CLASSIQUES
  /home     les documents des utilisateurs
  /etc      la configuration
  /var/log  les journaux
  /bin      les programmes
  /tmp      le temporaire

ACCÉDER À UNE AUTRE MACHINE (vraies commandes)
  nmap -sn 10.10.0.0/24     qui est vivant sur ce segment ?
  ssh joueur@10.10.0.1      ouvrir une session distante
  exit                      fermer la session

  ssh demande un mot de passe. Sur ce labo, le compte joueur
  a pour mot de passe « joueur ».

EXERCICE MENTAL
  Tu es dans /home et tu tapes cd ../etc — où es-tu ?
  Réponse : /etc`,

          '/home/cours/02_fichiers.txt': `MODULE 1 — MANIPULER DES FICHIERS

  cat <fichier>                    lire
  touch <fichier>                  créer un fichier vide
  mkdir <dossier>                  créer un dossier
  cp <source> <destination>        copier
  mv <source> <destination>        déplacer ou renommer
  rm <fichier>                     supprimer
  rm -r <dossier>                  supprimer un dossier
  rm *                             tout supprimer ici

MODIFIER DU TEXTE — sed
  sed -i 's/ANCIEN/NOUVEAU/g' <fichier>

  Exemple :
    sed -i 's/HORS SERVICE/OPERATIONNEL/g' statut.txt

  -i        modifie le fichier sur place (in-place)
  s/A/B/    substitution
  g         toutes les occurrences de la ligne, pas seulement la première

  Sans -i, sed affiche le résultat sans rien modifier : pratique
  pour vérifier avant d'écrire.

  Le motif est une expression régulière POSIX de base :
    ( ) + ? { }   y sont littéraux
    . * [ ] ^ $   y sont spéciaux
    \[ \]        pour chercher un crochet littéral

ÉCRIRE
  echo "bonjour" > note.txt        écraser
  echo "suite" >> note.txt         ajouter à la fin

ATTENTION
  rm est définitif. Pas de corbeille, pas d'annulation.
  C'est pour cela qu'un auditeur copie toujours avant de modifier.`,

          '/home/cours/03_filtres.txt': `MODULE 1 — FILTRER ET COMBINER

La force du shell Unix : composer de petits outils.

  grep MOTIF fichier        garder les lignes qui contiennent MOTIF
  grep -c MOTIF fichier     COMPTER les lignes correspondantes
  grep -i MOTIF fichier     ignorer majuscules/minuscules
  grep -n MOTIF fichier     afficher les numéros de ligne
  grep -v MOTIF fichier     garder les lignes SANS le motif
  grep -r MOTIF dossier     chercher récursivement
  wc -l fichier             compter les lignes
  head -n 5 fichier         les 5 premières lignes
  tail -n 5 fichier         les 5 dernières
  find / -name *.log        chercher des fichiers
  tree                      voir l'arborescence

LE PIPE : |
  Il envoie la sortie d'une commande dans l'entrée de la suivante.

  cat journal.log | grep ECHEC
      → lit le journal, puis ne garde que les échecs

  cat journal.log | grep ECHEC | wc -l
      → compte combien d'échecs
  grep -c ECHEC journal.log
      → même résultat, en une seule commande

  C'est une idée fondamentale : chaque outil fait une chose,
  et on les chaîne. C'est la philosophie Unix.

EXEMPLE RÉEL D'ANALYSE
  cat /var/log/auth.log | grep "Failed password" | wc -l`,

          '/home/cours/04_permissions.txt': `MODULE 1 — PERMISSIONS ET JOURNAUX

PERMISSIONS
  ls -l affiche : -rw-r--r--

  Décomposition :
    -        type (- fichier, d dossier)
    rw-      droits du propriétaire  (lire, écrire)
    r--      droits du groupe        (lire)
    r--      droits des autres       (lire)

  r = read (4)   w = write (2)   x = execute (1)

  chmod 755 script.sh
    7 = 4+2+1 = rwx  pour le propriétaire
    5 = 4+0+1 = r-x  pour le groupe
    5 = 4+0+1 = r-x  pour les autres

  Un script doit avoir le bit x pour être exécutable.

UTILISATEURS
  whoami      qui suis-je sur cette machine ?
  su <mdp>    devenir root si tu as le mot de passe

JOURNAUX
  Chaque action laisse une trace dans /var/log.
  Un auditeur les lit pour reconstituer ce qui s'est passé.

  cat /var/log/actions.log
  cat /var/log/actions.log | grep intrusion

LES TROIS QUESTIONS DE L'ANALYSTE
  Qui est entré ?    l'adresse IP source
  Quand ?            l'horodatage
  Qu'a-t-il fait ?   les actions enregistrées`,

          '/home/cours/05_variables.txt': `MODULE 2 — VARIABLES ET TYPES

Une variable est une boîte nommée qui contient une valeur.

  age = 25            int     entier
  nom = "Aline"       str     chaîne
  actif = True        bool    booléen
  prix = 19.99        float   décimal

OPÉRATEURS
  +   addition, ou concaténation de chaînes
  -   soustraction
  *   multiplication
  /   division (donne toujours un float)
  //  division entière
  %   modulo : le RESTE de la division entière
  **  puissance

LE MODULO, TRÈS UTILE
  7 % 2  = 1     impair
  8 % 2  = 0     pair
  17 % 5 = 2
  C'est ainsi qu'on teste la parité ou qu'on fait des cycles.

PIÈGE CLASSIQUE
  "3" + "4"   donne  "34"    ce sont des chaînes
  3 + 4       donne  7       ce sont des entiers

CONVERSION
  int("42")   → 42
  str(42)     → "42"
  float("2.5") → 2.5

POUR TESTER TOUT DE SUITE
  py print(7 % 3)
  py print("3" + "4")`,

          '/home/cours/06_boucles.txt': `MODULE 2 — CONDITIONS ET BOUCLES

CONDITION
  if score >= 50:
      print("reçu")
  else:
      print("ajourné")

  L'indentation est OBLIGATOIRE en Python : elle délimite les blocs.
  4 espaces est la convention.

BOUCLE FOR
  for i in range(5):
      print(i)              affiche 0 1 2 3 4

  range(5)       → 0,1,2,3,4     la borne haute est EXCLUE
  range(2, 6)    → 2,3,4,5
  range(0,10,2)  → 0,2,4,6,8

BOUCLE WHILE
  n = 0
  while n < 3:
      n = n + 1

PARCOURIR UNE LISTE
  ports = [21, 22, 80]
  for p in ports:
      print(p)

BOUCLES IMBRIQUÉES
  for i in range(3):
      for j in range(4):
          ...                 le corps s'exécute 3 × 4 = 12 fois

LIEN AVEC LE RÉSEAU
  Balayer une plage de ports, c'est exactement une boucle :
    for port in range(1, 1025):
        tester(port)`,

          '/home/cours/07_structures.txt': `MODULE 2 — LISTES, DICTS ET FONCTIONS

LISTE : une séquence ordonnée
  ports = [21, 22, 80, 443]
  ports[0]          21        le premier
  ports[-1]         443       le dernier
  ports[1:3]        [22, 80]  une tranche
  len(ports)        4
  ports.append(8080)
  ports.sort()

DICT : des paires clé → valeur
  services = {"ssh": 22, "http": 80}
  services["ssh"]           22
  services["dns"] = 53      ajouter
  services.keys()
  services.get("ftp", 21)   valeur par défaut si absent

FONCTION
  def est_chiffre(port):
      return port in (22, 443)

  est_chiffre(443)    True
  est_chiffre(80)     False

  'return' renvoie une valeur et arrête la fonction.
  Sans return, la fonction renvoie None.

COMPRÉHENSION DE LISTE — élégant et fréquent
  [p for p in ports if p > 100]
      → garde les ports supérieurs à 100

  [p * 2 for p in ports]
      → transforme chaque élément

F-STRING — formater du texte
  port = 22
  print(f"port {port} ouvert")`,

          '/home/cours/08_debogage.txt': `MODULE 2 — DÉBOGUER

Un bug n'est pas une fatalité : c'est une information.

LES TROIS FAMILLES
  1. SyntaxError     le code ne démarre pas (oubli de ':', parenthèse)
  2. Erreur d'exécution   le code plante en route
  3. Erreur de logique    le code tourne mais le résultat est faux

LIRE LE MESSAGE
  IndexError: list index out of range
      → tu accèdes à une case qui n'existe pas

  NameError: name 'x' is not defined
      → variable jamais créée, ou faute de frappe

  TypeError: can only concatenate str (not "int") to str
      → tu mélanges texte et nombre

  KeyError: 'ftp'
      → cette clé n'existe pas dans le dict

  ZeroDivisionError: division by zero
      → tu divises par zéro

LE BUG LE PLUS FRÉQUENT : OFF-BY-ONE
  ports = [21, 22, 80]
  for i in range(len(ports) + 1):    FAUX : i va jusqu'à 3
      print(ports[i])                ports[3] n'existe pas

  for i in range(len(ports)):        CORRECT : i va de 0 à 2
      print(ports[i])

MÉTHODE
  1. Lis le message EN ENTIER, et le numéro de ligne
  2. Réduis au cas le plus petit qui reproduit
  3. Affiche les valeurs intermédiaires avec print()
  4. Corrige UNE chose, reteste

Ce jeu exécute du vrai Python : les messages d'erreur
sont les vrais. Lis-les, ils te disent quoi faire.`,

          '/home/cours/09_ports.txt': `MODULE 3 — PORTS ET SERVICES

Une machine a une adresse IP. Chaque service écoute sur un PORT.
Il existe 65535 ports TCP.

À CONNAÎTRE PAR CŒUR
  21    FTP      transfert de fichiers
  22    SSH      shell distant chiffré
  23    Telnet   shell distant NON chiffré (à éviter)
  25    SMTP     envoi de courrier
  53    DNS      résolution de noms
  80    HTTP     web non chiffré
  443   HTTPS    web chiffré
  3306  MySQL    base de données
  5432  PostgreSQL
  3389  RDP      bureau à distance Windows

LES VRAIES COMMANDES
  nmap -sn 10.10.0.0/24   découverte d'hôtes (pas de scan de ports)
  nmap 10.10.3.10         1000 ports les plus courants
  nmap -F 10.10.3.10      100 ports seulement, rapide
  nmap -p- 10.10.3.10     les 65535 ports
  nmap -sV 10.10.3.10     versions réelles des services
  nmap -sS 10.10.3.10     scan SYN furtif
  nmap -sU 10.10.3.10     scan UDP
  nmap -O 10.10.3.10      deviner le système
  nmap -A 10.10.3.10      tout : versions, OS, scripts
  nmap --reason           expliquer chaque verdict
  nc 10.10.3.10 8899      lire la bannière brute d'un port

LE PIÈGE FONDAMENTAL
  Sans -sV, la colonne SERVICE est une DEVINETTE basée sur
  le numéro de port. Un serveur Python sur le port 8899
  sera étiqueté "ospf-lite" — c'est faux.
  Seul -sV interroge réellement le service.

LES ÉTATS
  open       un service répond
  closed     la machine répond "rien ici"
  filtered   AUCUNE réponse : un pare-feu bloque

  closed ≠ filtered. Le premier dit "pas de service",
  le second dit "il y a un contrôle".`,

          '/home/cours/10_parefeu.txt': `MODULE 3 — PARE-FEU

Un pare-feu filtre le trafic selon des règles.

DEUX GRANDES FAMILLES
  stateless   examine chaque paquet isolément
  stateful    suit l'état des connexions (le standard actuel)

RÈGLE TYPIQUE
  autoriser 22 depuis 10.10.0.0/24
  tout refuser sinon

IL N'Y A PAS DE MOT MAGIQUE
  On ne « désactive » pas un pare-feu avec un mot de passe.
  On obtient un compte sur la machine, on devient root,
  puis on modifie les règles. C'est la vraie chaîne.

LES VRAIES COMMANDES
  iptables -L -n -v       lire les règles en place
  iptables -F             vider toutes les règles (root requis)
  ufw status verbose      même chose, interface simplifiée
  cat /etc/firewall.conf  la configuration sauvegardée

MÉTHODE D'AUDIT RÉELLE
  1. nmap -sV <ip>        quels ports répondent, lesquels sont filtrés ?
  2. repérer un service d'administration exposé (souvent SSH)
  3. hydra -l admin -P /usr/share/wordlists/rockyou.txt ssh://<ip>
     → un mot de passe faible tombe en quelques secondes
  4. ssh admin@<ip>
  5. sudo -l              quels sont mes droits ?
  6. sudo -i              devenir root
  7. iptables -F          le filtrage tombe

POURQUOI ÇA MARCHE SI SOUVENT
  Le SSH d'administration est laissé ouvert « pour se dépanner »,
  avec un mot de passe par défaut jamais changé. C'est l'une des
  failles les plus répandues au monde.

POURQUOI ÇA COMPTE
  Un pare-feu mal configuré est la faille la plus courante.
  Un port "filtered" t'apprend qu'il y a un contrôle ;
  comprendre ce contrôle, c'est déjà la moitié de l'audit.`,

          '/home/cours/11_routage.txt': `MODULE 3 — ROUTAGE, PROXY, PIVOTING

Le réseau n'est pas plat. Il y a des segments, des passerelles,
des intermédiaires.

NOTIONS
  passerelle   la machine qui relie deux segments
  NAT          traduction d'adresses privé ↔ public
  proxy        intermédiaire qui relaie tes connexions
  VPN          tunnel chiffré d'un réseau à un autre
  pivoting     depuis une machine compromise, atteindre
               les machines de son réseau interne

PENSER EN GRAPHE
  Chaque machine voit son propre segment. Pour cartographier,
  on avance de proche en proche :

    ssh root@A  →  nmap -sn 10.10.1.0/24  →  découvre B
    ssh root@B  →  nmap -sn 10.10.2.0/24  →  découvre C
    ...

  Une machine ne peut pas voir un segment auquel elle n'est pas
  reliée. C'est pour cela qu'il faut se déplacer.

  C'est exactement ce que fait un auditeur. Chaque machine
  atteinte devient un nouveau point de vue sur le réseau.

POURQUOI LE PIVOTING EST PUISSANT
  Une machine peu protégée au bord du réseau peut donner
  accès à tout un segment interne jamais exposé à Internet.
  C'est le scénario d'incident le plus fréquent.

LES COMMANDES
  nmap -sn <plage>    depuis la machine courante
  arp-scan -l         découverte par ARP, sur le segment local
  ip r                la table de routage
  traceroute <ip>     le chemin parcouru
  La carte en bas de l'écran montre tout ce que tu as découvert.`,

          '/home/cours/12_methodologie.txt': `MODULE 3 — MÉTHODOLOGIE

Un audit n'est pas une improvisation.

LES SIX PHASES
  1. CADRAGE          périmètre écrit, autorisation signée
  2. RECONNAISSANCE   cartographier sans rien modifier
  3. ÉNUMÉRATION      services, versions, comptes
  4. ANALYSE          chercher les faiblesses
  5. PREUVE           documenter, pas détruire
  6. RAPPORT          risques, impacts, remédiations

L'ORDRE COMPTE
  On observe avant d'agir. On copie avant de modifier.
  Chaque action irréversible doit être justifiée et autorisée.

SURFACE D'ATTAQUE
  Chaque port ouvert est une porte. Réduire la surface,
  c'est fermer les portes inutiles. C'est la recommandation
  la plus fréquente de tout rapport d'audit.

DANS CE JEU
  Tu vas documenter une cible : ses ports, ses versions,
  son pare-feu. Puis produire un rapport. C'est le contrat 12.`,

          '/home/cours/13_chiffrement.txt': `MODULE 4 — CHIFFREMENT, HACHAGE, ENCODAGE

Trois choses à ne JAMAIS confondre.

CHIFFREMENT  (réversible avec la clé)
  But : confidentialité. Personne ne lit sans la clé.
  Symétrique   une seule clé         AES
  Asymétrique  publique + privée     RSA

HACHAGE  (irréversible)
  But : intégrité, et stockage des mots de passe.
  sha256("bonjour") donne toujours la même empreinte.
  On ne "déchiffre" pas un hash : on compare des empreintes.
  Un site ne doit JAMAIS stocker ton mot de passe en clair.

ENCODAGE  (réversible SANS clé)
  But : représenter des données, pas les protéger.
  Base64, hexadécimal, URL-encoding.
  Tout le monde peut décoder du Base64. Ce n'est PAS de la sécurité.

LES VRAIES COMMANDES
  base64 fichier          encoder
  base64 -d fichier       décoder
  echo "texte" | base64   encoder depuis un tube
  sha256sum fichier       empreinte SHA-256
  xxd fichier             voir les octets en hexadécimal
  strings fichier         extraire le texte lisible d'un binaire
  openssl rand -hex 16    générer un secret aléatoire
  john --wordlist=... fichier_de_hashes   casser des empreintes

LEÇON À RETENIR
  Si tu trouves un secret en Base64 dans une config,
  ce n'est pas une protection. C'est une fausse impression
  de sécurité — et une vraie vulnérabilité.`,

          '/home/cours/14_traces.txt': `MODULE 4 — TRACES ET ATTRIBUTION

Toute action laisse une trace. Un bon auditeur les documente.

OÙ CHERCHER
  /var/log/actions.log     ce jeu y journalise tes actions
  /var/log/auth.log        connexions, sous Linux réel
  /var/log/syslog          système

LIRE UNE LIGNE DE LOG
  [2026-04-17 02:14] intrusion port 22 src=10.10.9.99 user=root
   └ horodatage      └ action        └ IP source  └ compte

LES TROIS QUESTIONS
  Qui ?     l'IP source et le compte
  Quand ?   l'horodatage
  Quoi ?    l'action et la cible

COMPOSER LES OUTILS
  cat /var/log/actions.log | grep intrusion
  cat /var/log/actions.log | grep src=10.10.9.99 | wc -l

NETTOYER — LES VRAIES COMMANDES
  rm /var/log/*.log       supprimer les journaux
  shred -u fichier        écraser plusieurs fois puis supprimer
  history -c              vider l'historique du shell

  rm est définitif. shred est plus difficile à récupérer sur un
  disque magnétique, mais inefficace sur un SSD à cause du
  wear leveling — la vraie réponse est le chiffrement du disque.

  Dans ce jeu, un contrat te demande de nettoyer.

  EN MISSION RÉELLE : effacer les logs détruit les preuves
  du client. Ce n'est autorisé que si le contrat le prévoit
  EXPLICITEMENT. Sinon c'est une faute professionnelle.

RÉFLEXE
  scp d'abord. rm ensuite. Et seulement si autorisé.`,

          '/home/cours/15_secrets.txt': `MODULE 4 — CHASSE AUX SECRETS

La faille la plus répandue n'est pas technique : c'est un
secret laissé quelque part.

OÙ LES GENS LES LAISSENT
  un fichier de configuration
  un commentaire dans du code
  une note d'administration
  un fichier de sauvegarde oublié
  l'historique du shell
  un dépôt de code versionné

MÉTHODE DE RECHERCHE — DEPUIS L'EXTÉRIEUR
  nmap -sV <ip>                 quel serveur web ?
  nikto -h <ip>                 audit web automatique
  curl http://<ip>/robots.txt   ce que le site veut cacher
  curl http://<ip>/backups/     l'indexation de répertoires fuit
  searchsploit <service>        une faille connue pour cette version ?

MÉTHODE DE RECHERCHE — UNE FOIS CONNECTÉ
  ls -la /etc
  find / -name "*.bak"
  find / -name "*config*"
  grep -ri password /var/www/
  grep -ri secret /home/
  cat ~/.bash_history
  find / -perm -4000 2>/dev/null    les binaires SUID

CE QUE TU CHERCHES
  password, passwd, pwd, secret, token, key, api_key,
  credential, admin, private

DANS CE JEU
  Le contrat 14 te demande de retrouver un mot de passe root.
  Il est trop fort pour tomber par dictionnaire : hydra échoue.
  Mais il traîne dans une sauvegarde exposée par le serveur web.
  nikto → robots.txt → curl la sauvegarde → ssh.

  C'est exactement le scénario d'un vrai incident.

LA REMÉDIATION
  Ne jamais écrire un secret en clair. Utiliser un coffre
  de secrets, des variables d'environnement, ou un gestionnaire.
  Et faire tourner les secrets régulièrement.`,

          '/home/cours/16_ethique.txt': `MODULE 4 — LE CADRE LÉGAL

Ceci est la note la plus importante du cursus.

LE PRINCIPE UNIVERSEL
  Scanner ou attaquer un système sans l'autorisation ÉCRITE
  de son propriétaire est illégal dans la plupart des pays.
  Même sans "rentrer". Même "juste pour voir".

AU BURUNDI
  Code pénal (loi n°1/05 du 22 avril 2009), articles 467 à 470 :
  accès non autorisé à un système informatique, fraude
  informatique, atteintes aux données.

  Loi n°1/10 du 16 mars 2022 portant prévention et répression
  de la cybercriminalité : complète ce dispositif.

OÙ TU PEUX T'ENTRAÎNER LÉGALEMENT
  ce jeu                     tout est simulé, aucun risque
  ta propre machine          à toi
  ton réseau domestique      à toi
  scanme.nmap.org            autorisé explicitement par le projet Nmap
  TryHackMe, HackTheBox      plateformes conçues pour ça
  OverTheWire Bandit         wargames gratuits

EN MISSION PROFESSIONNELLE
  Il faut un document signé : le périmètre (rules of engagement).
  Il précise QUELLES adresses IP, QUELLE fenêtre de temps,
  QUELLES techniques sont permises.

  Hors périmètre = hors la loi, même avec un contrat.

LA PHILOSOPHIE DU PROJET NMAP
  "Fixing a hole is far more effective than trying to hide it."
  Réparer un trou est plus efficace que le cacher.

  Ces outils existent pour que les administrateurs voient
  leur réseau comme un attaquant le voit — et corrigent avant.

TU SAIS MAINTENANT
  naviguer un système, filtrer des données, écrire et déboguer
  du Python, cartographier un réseau, comprendre un pare-feu,
  distinguer chiffrement et encodage, documenter des traces,
  et connaître le cadre légal.

  C'est une base solide. La suite est de la pratique.`
        }
      },

      // ------------------------------------------------ MODULE 1
      {
        id: 'shellLab', users: { joueur: 'joueur', root: 'toor' }, sudoNoPasswd: true, theme: 'green', name: 'Laboratoire SHELL', ip: '10.10.1.10', os: 'Linux',
        desc: 'Machine d\'exercice pour le module shell.',
        links: ['shellCoffre'],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1'), 80: P('http', 'Apache 2.4.58') },
        portsNeeded: 1,
        files: {
          '/home/joueur/bienvenue.txt': `Laboratoire SHELL.

Ton premier objectif est dans le dossier archives.
Explore avec ls, déplace-toi avec cd, lis avec cat.`,
          '/home/joueur/archives/rapport_confidentiel.txt': `RAPPORT INTERNE — NE PAS DIFFUSER

Le service informatique rappelle que les mots de passe ne
doivent jamais transiter par courrier électronique.

Trois incidents ont été signalés ce trimestre.

Ce fichier est la preuve à collecter pour la mission 1.
Utilise : scp rapport_confidentiel.txt`,
          '/home/joueur/archives/inventaire.txt': `Postes : 42
Serveurs : 6
Imprimantes : 9
Caméras IP : 4

Note : les caméras ne figurent pas à l'inventaire officiel.`,
          '/home/joueur/statut.txt': `STATUT DU SERVEUR : HORS SERVICE

Maintenance planifiée.
Dernière vérification : 2026-02-11`,
          '/home/joueur/brouillon.txt': `Notes de configuration abandonnées.
Ce fichier n'aurait pas dû rester ici.`,
          '/var/log/auth.log': `[2026-03-01 08:12] connexion user=admin src=10.10.9.99
[2026-03-01 08:13] ECHEC user=root src=10.10.9.99
[2026-03-01 08:14] ECHEC user=root src=10.10.9.99
[2026-03-01 08:15] ECHEC user=admin src=10.10.9.99
[2026-03-01 08:20] connexion user=admin src=10.10.0.5
[2026-03-01 09:02] ECHEC user=test src=10.10.9.99
[2026-03-01 09:44] connexion user=deploy src=10.10.0.8`
        }
      },
      {
        id: 'shellCoffre', users: { joueur: 'joueur', root: 'toor' }, sudoNoPasswd: true, theme: 'green', name: 'Coffre à journaux', ip: '10.10.1.11', os: 'Linux',
        desc: 'Accumule les journaux de connexion.',
        links: [],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1') },
        portsNeeded: 1,
        files: {
          '/home/joueur/procedure.txt': `Ce serveur accumule les journaux.
La mission 4 demande de vider /var/log.

Rappel : copie la preuve AVANT d'effacer.`,
          '/home/joueur/preuve_incident.txt': `INCIDENT 2026-04-17

Connexions non autorisées depuis 10.10.9.99.
Trois fichiers consultés, aucun modifié.

Collecte ce document avant tout nettoyage.`,
          '/var/log/auth_001.log': `[2026-04-17 02:14] ECHEC user=root src=10.10.9.99`,
          '/var/log/auth_002.log': `[2026-04-17 02:14] connexion user=admin src=10.10.9.99`,
          '/var/log/access_003.log': `[2026-04-17 02:19] lecture preuve_incident.txt src=10.10.9.99`
        }
      },

      // ------------------------------------------------ MODULE 2
      {
        id: 'codeLab', users: { joueur: 'joueur', root: 'toor', admin: 'P@ssw0rd!' }, sudoNoPasswd: true, theme: 'purple', name: 'Laboratoire CODE', ip: '10.10.2.10', os: 'Linux',
        desc: 'Exercices de programmation. Python réel.',
        links: ['codeBuild'],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1'), 80: P('http', 'nginx 1.24.0') },
        portsNeeded: 1,
        files: {
          '/home/joueur/exercice_01.py': `# Mission 5 : calcule le résultat puis réponds.
a = 7
b = 3
resultat = (a * b) + (a % b)
print(resultat)

# Exécute-moi :  python3 exercice_01.py
# Ou calcule de tête et utilise 'valider <nombre>'`,
          '/home/joueur/exercice_02.py': `# Mission 6 : combien de fois le corps s'exécute-t-il ?
total = 0
for i in range(3):
    for j in range(4):
        total = total + 1
print(total)`,
          '/home/joueur/exercice_03.py': `# Mission 7 : ce programme plante. Corrige-le.
ports = [21, 22, 80, 443]
for i in range(len(ports) + 1):
    print(ports[i])

# Indice : range(n) va de 0 à n-1.
# Utilise : replace exercice_03.py "len(ports) + 1" "len(ports)"`,
          '/home/joueur/exercice_04.py': `# Mission 8 : complète la fonction.
# Elle doit dire si un port est chiffré (22 = SSH, 443 = HTTPS).

def est_chiffre(port):
    return False

# Tests attendus :
#   est_chiffre(22)  -> True
#   est_chiffre(443) -> True
#   est_chiffre(80)  -> False
#   est_chiffre(21)  -> False

for p in [22, 443, 80, 21]:
    print(p, est_chiffre(p))`,
          '/home/joueur/aide.txt': `Pour exécuter : python3 exercice_01.py
Pour tester une expression : py print(7 % 3)
Pour corriger : replace <fichier> "ancien" "nouveau"

Les messages d'erreur sont de vrais messages Python.
Lis-les : ils indiquent la ligne et la cause.`,          '/var/www/html/login.php': `<!DOCTYPE html>
<html>
<head><title>Connexion — Laboratoire CODE</title></head>
<body>
  <h1>Connexion administrateur</h1>
  <form action="/login.php" method="POST">
    <label>Identifiant :</label><input type="text" name="user"><br>
    <label>Mot de passe :</label><input type="password" name="pass"><br>
    <input type="submit" value="Connexion">
  </form>
  <!-- NOTE DÉVELOPPEUR : requête SQL construite par concaténation de l'identifiant —
       requête préparée à corriger (ticket #3312). Cible : sqlmap -u "http://10.10.2.10/login.php?id=1" --dbs --batch -->
</body>
</html>`,
          '/var/www/html/commentaires.php': `<!DOCTYPE html>
<html>
<head><title>Livre d'or — Laboratoire CODE</title></head>
<body>
  <h1>Livre d'or</h1>
  <div class="commentaire">
    <strong>admin</strong> : Super outil de dev.
    <span class="meta">[cookie session admin : sess=9f2a7c4e — volable par XSS stocké]</span>
  </div>
  <div class="commentaire">
    <strong>joueur</strong> : Merci pour les exercices.
  </div>
  <!-- Saisie non échappée — un script malveillant s'exécute pour chaque visiteur -->
</body>
</html>`,
          '/var/www/html/admin.php': `<!DOCTYPE html>
<html>
<head><title>Administration — Laboratoire CODE</title></head>
<body>
  <h1>Panneau d'administration</h1>
  <p>Accès réservé aux administrateurs authentifiés.</p>
  <div class="flag">FLAG{sql_injection_reussie} — preuve d'exploitation à joindre au rapport.</div>
</body>
</html>`
        }
      },
      {
        id: 'codeBuild', users: { joueur: 'joueur', root: 'toor' }, sudoNoPasswd: true, theme: 'purple', name: 'Serveur de build', ip: '10.10.2.11', os: 'Linux',
        desc: 'Compile et teste le code.',
        links: [],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1') },
        portsNeeded: 1,
        files: {
          '/home/joueur/mission8.py': `# Mission 8, partie 2 : écris une fonction qui filtre.
# Elle doit renvoyer la liste des ports > 1024.

def ports_hauts(liste):
    return []

# Test :
print(ports_hauts([22, 80, 3306, 8080, 443]))
# Attendu : [3306, 8080]

# Deux solutions possibles :
#   une boucle for avec un if
#   une compréhension de liste`,
          '/home/joueur/rappel.txt': `Compréhension de liste :
  [p for p in liste if p > 1024]

Boucle classique :
  resultat = []
  for p in liste:
      if p > 1024:
          resultat.append(p)
  return resultat`
        }
      },

      // ------------------------------------------------ MODULE 3
      {
        id: 'netLab', users: { joueur: 'joueur', root: 'admin123' }, sudoNoPasswd: true, theme: 'amber', name: 'Laboratoire RESEAU', ip: '10.10.3.10', os: 'Linux',
        desc: 'Six services exposés. Surface d\'attaque large.',
        links: ['netFw'],
        ports: {
          21: P('ftp', 'vsftpd 3.0.5'), 22: P('ssh', 'OpenSSH 9.6p1'),
          25: P('smtp', 'Postfix smtpd'), 80: P('http', 'Apache 2.4.58'),
          3306: P('mysql', 'MySQL 8.0.36'), 8899: P('http', 'SimpleHTTPServer 0.6 (Python 3.13)')
        },
        portsNeeded: 3,
        files: {
          '/home/joueur/consigne.txt': `Mission 9 : identifie la vraie nature du service sur le port 8899.

  nmap 10.10.3.10              scan par défaut : que dit-il ?
  nmap -sV -p 8899 10.10.3.10  interroge réellement le service
  nc 10.10.3.10 8899           lis la bannière brute

Sans -sV, nmap devine le service d'après le numéro de port.
Avec -sV, il parle au service et lit ce qu'il répond.`,
          '/home/joueur/table_ports.txt': `21   FTP    transfert de fichiers
22   SSH    shell distant chiffré
25   SMTP   envoi de courrier
80   HTTP   web non chiffré
3306 MySQL  base de données
8899 ???    à toi de le découvrir avec nmap -sV`
        }
      },
      {
        id: 'netFw', users: { admin: 'letmein', root: 'letmein' }, sudoNoPasswd: false, theme: 'red', name: 'Passerelle filtrée', ip: '10.10.3.11', os: 'Linux',
        desc: 'Protégée par un pare-feu.',
        links: ['netProxy'],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1'), 80: P('http', 'nginx 1.24.0'), 443: P('https', 'nginx 1.24.0') },
        portsNeeded: 2,
        firewall: { solution: 'FILTER', level: 6, allow: [22] },
        files: {
          '/etc/firewall.conf': `# iptables-save — généré le 2026-02-11
*filter
:INPUT DROP [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]
-A INPUT -i lo -j ACCEPT
-A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
# SSH d'administration laissé ouvert depuis l'extérieur
-A INPUT -p tcp --dport 22 -j ACCEPT
-A INPUT -p tcp --dport 80 -j DROP
-A INPUT -p tcp --dport 443 -j DROP
COMMIT

# Compte d'administration : admin
# TODO : changer le mot de passe par défaut avant la mise en production
`,
          '/home/joueur/note_admin.txt': `Rappel pour l'auditeur :

un port filtered n'est pas un port closed.
  filtered = le pare-feu ne répond pas
  closed   = la machine répond qu'il n'y a pas de service

La configuration est dans /etc.`,
          '/home/joueur/politique.txt': `POLITIQUE DE SÉCURITÉ

Tout trafic entrant est refusé par défaut, sauf SSH (22).

C'est une configuration courante… et un point faible : le SSH
d'administration est exposé. Si son mot de passe est faible,
une attaque par dictionnaire suffit.

Une fois connecté en tant qu'admin, on peut lire puis vider
le filtrage :
    iptables -L -n -v
    sudo -i
    iptables -F
`
        }
      },
      {
        id: 'netProxy', users: { joueur: 'joueur', root: 'qwerty' }, sudoNoPasswd: true, theme: 'amber', name: 'Proxy de sortie', ip: '10.10.3.12', os: 'Linux',
        desc: 'Point de sortie unique du segment.',
        links: ['netInterne'],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1'), 8080: P('http-proxy', 'Apache Tomcat 10.1'), 3306: P('mysql', 'MySQL 8.0.36') },
        portsNeeded: 2,
        files: {
          '/home/joueur/architecture.txt': `Ce proxy est le seul point de sortie du segment.

C'est un point de contrôle, mais aussi un point unique
de défaillance. Toute la journalisation s'y concentre.

Une machine voisine n'est pas encore sur ta carte.
Utilise scan depuis ici.`
        }
      },
      {
        id: 'netInterne', users: { joueur: 'joueur', root: 'password' }, sudoNoPasswd: true, theme: 'red', name: 'Serveur interne', ip: '10.10.3.20', os: 'Linux',
        desc: 'Jamais exposé à Internet. Atteignable seulement par rebond.',
        links: [],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1'), 5432: P('postgresql', 'PostgreSQL 16.2') },
        portsNeeded: 2,
        files: {
          '/home/joueur/decouverte.txt': `Tu as atteint un segment interne.

Cette machine n'est pas exposée à Internet. Tu n'as pu
l'atteindre qu'en passant par le proxy : c'est le PIVOTING.

C'est le scénario d'incident le plus fréquent : une machine
peu protégée en bordure donne accès à tout un segment interne.`,
          '/home/joueur/secret_segment.txt': `Données du segment interne.
Base clients : 12 480 enregistrements.
Aucun chiffrement au repos.

Recommandation d'audit : chiffrer le volume.`
        }
      },

      // ------------------------------------------------ MODULE 4
      {
        id: 'secLab', users: { joueur: 'joueur', root: '123456' }, sudoNoPasswd: true, theme: 'teal', name: 'Laboratoire SECURITE', ip: '10.10.4.10', os: 'Linux',
        desc: 'Secrets, encodage et chiffrement.',
        links: ['secCible'],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1'), 443: P('https', 'nginx 1.24.0') },
        portsNeeded: 2,
        files: {
          '/home/joueur/consigne.txt': `Mission 13 : un secret est encodé en Base64 dans config.b64.

Décode-le avec : base64 -d config.b64
Puis réponds avec 'valider <le secret décodé>'.

Leçon : Base64 n'est PAS du chiffrement.`,
          '/home/joueur/config.b64': `U0VDUkVUe2I0c2U2NF9uM3N0X3Bhc19jaDFmZnIzfQ==`,
          '/home/joueur/note_crypto.txt': `Trois choses différentes :

  chiffrement   réversible AVEC une clé      → confidentialité
  hachage       irréversible                 → intégrité
  encodage      réversible SANS clé          → représentation

Base64 est de l'encodage. Tout le monde peut le décoder.
Un secret en Base64 n'est pas protégé.`,
          '/home/joueur/message_rot13.txt': `Frgg r krepvpr rfg qr yn pynffvpr : EBG13`
        }
      },
      {
        id: 'secCible', users: { root: 'S3nt1n3ll3!' }, sudoNoPasswd: false, theme: 'red', name: 'Cible d\'audit final', ip: '10.10.4.20', os: 'Linux',
        desc: 'Pare-feu, six ports, secrets cachés. La synthèse.',
        links: [],
        ports: {
          21: P('ftp', 'vsftpd 3.0.5'), 22: P('ssh', 'OpenSSH 9.6p1'),
          80: P('http', 'Apache 2.4.58'), 443: P('https', 'nginx 1.24.0'),
          3306: P('mysql', 'MySQL 8.0.36'), 47391: P('inconnu', 'Service maison 1.0')
        },
        portsNeeded: 4,
        firewall: { solution: 'AUDIT', level: 5, allow: [22, 80] },
        adminPass: 'S3nt1n3ll3!',
        files: {
          '/etc/audit_policy.conf': `# Politique d'audit — iptables
:INPUT DROP
-A INPUT -p tcp --dport 22 -j ACCEPT
-A INPUT -p tcp --dport 80 -j ACCEPT
-A INPUT -p tcp --dport 443 -j DROP
# Serveur web : indexation de répertoires ACTIVÉE sur /backups/
# (à désactiver — voir ticket #4471)`,
          '/home/joueur/contrat_final.txt': `AUDIT FINAL — PÉRIMÈTRE

Cible unique : 10.10.4.20
Techniques autorisées : ouverture de ports, pare-feu, lecture
Hors périmètre : toute autre machine

Objectifs :
  1. désactiver le pare-feu
  2. obtenir les droits administrateur
  3. retrouver le mot de passe admin caché quelque part
  4. rédiger le rapport`,
          '/home/joueur/.bash_history': `ls -l
cd /var/backups
cat config.bak
mysql -u root -p
exit`,
          '/var/www/html/backups/config.bak': `# Sauvegarde de configuration — 2026-01-08
db_host=localhost
db_user=root
# NE PAS LAISSER CE MOT DE PASSE ICI
db_password=S3nt1n3ll3!
db_port=3306`,
          '/var/www/html/robots.txt': `User-agent: *
Disallow: /backups/`,
          '/var/backups/config.bak': `# Sauvegarde de configuration — 2026-01-08
db_host=localhost
db_user=admin
# NE PAS LAISSER CE MOT DE PASSE ICI
db_password=S3nt1n3ll3!
db_port=3306`,
          '/home/joueur/rapport_audit.txt': `RAPPORT D'AUDIT — 10.10.4.20

Statut : BROUILLON

Ports TCP ouverts : A_REMPLIR
Pare-feu : present
Service inconnu sur port eleve : A_REMPLIR

Recommandations :
  - reduire la surface exposee
  - deplacer les secrets hors des fichiers de configuration
  - journaliser les tentatives echouees`
        }
      },

      // ------------------------------------------------ DEPOT
      {
        id: 'depot', users: { joueur: 'joueur' }, sudoNoPasswd: true, theme: 'white', name: 'Dépôt de preuves', ip: '10.10.0.9', os: 'Linux',
        desc: 'Dépose ici tes preuves. Écriture sans authentification.',
        links: [],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1') },
        portsNeeded: 0,
        files: {
          '/depot/LISEZ_MOI.txt': `DÉPÔT DE PREUVES

Ce dossier reçoit les livrables des auditeurs.
Il est vide au départ. Tout ce qui y est déposé est conservé.`,
          '/home/joueur/mode_emploi.txt': `Dépose tes preuves dans /depot.

  upload <fichier_local> /depot

Le fichier doit venir de ta machine (dossier telecharges).`
        }
      },

      // ------------------------------------------------ CHENILLARD DE RELAIS (T18)
      // 3 sauts vers le Puits. Chaque relais est un saut coûteux et lent.
      // Déverrouillé par le rang OPÉRATEUR (3000 xp).
      {
        id: 'relais1', users: {}, theme: 'amber', name: 'Relais n°1', ip: '10.10.0.20', os: 'Linux',
        desc: 'Relais du chenillard. Aucun compte utilisable — point de passage seulement.',
        links: ['relais2'],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1') },
        portsNeeded: 0,
        files: {
          '/etc/motd': `RELAIS 1 — CHENILLARD DU PUITS

Aucun shell disponible. Ce relais ne fait que transmettre.
Prochain saut : relais2 (10.10.0.21)

        `
        }
      },
      {
        id: 'relais2', users: {}, theme: 'amber', name: 'Relais n°2', ip: '10.10.0.21', os: 'Linux',
        desc: 'Relais du chenillard. Aucun compte utilisable — point de passage seulement.',
        links: ['relais3'],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1') },
        portsNeeded: 0,
        files: {
          '/etc/motd': `RELAIS 2 — CHENILLARD DU PUITS

Aucun shell disponible. Ce relais ne fait que transmettre.
Prochain saut : relais3 (10.10.0.22)

        `
        }
      },
      {
        id: 'relais3', users: {}, theme: 'amber', name: 'Relais n°3', ip: '10.10.0.22', os: 'Linux',
        desc: 'Relais du chenillard. Aucun compte utilisable — point de passage seulement.',
        links: ['puits'],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1') },
        portsNeeded: 0,
        files: {
          '/etc/motd': `RELAIS 3 — CHENILLARD DU PUITS

Aucun shell disponible. Ce relais ne fait que transmettre.
Destination finale : le Puits (10.10.0.99)

        `
        }
      },
      {
        id: 'puits', users: {}, theme: 'red', name: 'Le Puits', ip: '10.10.0.99', os: 'Linux',
        desc: 'Marché noir du darknet. Achats en sats. Articles parfois piégés.',
        links: [],
        ports: { 22: P('ssh', 'OpenSSH 9.6p1'), 80: P('http', 'nginx 1.24.0') },
        portsNeeded: 0,
        files: {
          '/etc/motd': `LE PUITS — MARCHÉ NOIR

Accès réservé aux opérateurs (rang OPÉRATEUR).
Marchandises : outils, wordlists, relais privés.
Attention : certains binaires sont piégés.

        `
        }
      }
    ]
  };

  // ------------------------------------------------------------ MISSIONS
  // Chaque validateur reçoit (world, shell, events, answer) et renvoie
  // {done: bool, hint: string}
  const MISSIONS = [
    // ================= MODULE 1 : SHELL =================
    {
      id: 1, module: 'SHELL LINUX', titre: 'Premier contact',
      client: "ACADEMIE · Cellule formation", reward: 150, difficulty: 1, kind: "Hub de formation",
      objectives: [
        { label: "Hôte ACADEMIE découvert", done: w=>w.node('academie').discovered },
        { label: "Session SSH ouverte sur ACADEMIE", done: (w,sh,ev)=>ev.some(e=>e.type==='ssh'&&e.target==='academie') },
        { label: "Note 01_navigation.txt lue", done: (w,sh,ev)=>ev.some(e=>e.type==='read'&&(e.paths||[]).some(p=>/01_navigation/.test(p))) }
      ],
      brief: `Bienvenue. Tu es sur ton propre poste.

OBJECTIF
  Découvre le réseau avec nmap, connecte-toi en SSH au serveur
  ACADEMIE, et lis la note de cours sur la navigation.

ÉTAPES
  nmap -sn 10.10.0.0/24        découverte d'hôtes
  ssh joueur@10.10.0.1         mot de passe : joueur
  ls /home/cours
  cat /home/cours/01_navigation.txt
  exit

Puis tape : valider

Ce sont de vraies commandes. Rien ne sort de ton navigateur.`,
      cours: '/home/cours/01_navigation.txt',
      validate(w, s, ev) {
        const ok = ev.some(e => e.type === 'read' && e.paths &&
          e.paths.some(p => p.includes('01_navigation')));
        return { done: ok, hint: ok ? '' : "Lis la note avec : cat /home/cours/01_navigation.txt (depuis ACADEMIE)" };
      },
      debrief: `Tu sais te déplacer dans un réseau et lire un fichier.

À retenir : nmap -sn révèle les hôtes du segment de la machine COURANTE.
C'est ainsi qu'on cartographie un réseau de proche en proche.`
    },
    {
      id: 2, module: 'SHELL LINUX', titre: 'Collecter une preuve',
      client: "Client anonyme · via ACADEMIE", reward: 300, difficulty: 2, kind: "Exfiltration",
      objectives: [
        { label: "Versions des services de 10.10.1.10 relevées", done: (w,sh,ev)=>ev.some(e=>e.type==='nmap'&&e.target==='shellLab'&&e.sV) },
        { label: "Mot de passe root obtenu par dictionnaire", done: (w,sh,ev,g)=>!!(g.creds['10.10.1.10']||{}).root },
        { label: "Rapport copié sur ton poste", done: w=>!!w.home.get('/home/joueur/telecharges/rapport_confidentiel.txt') }
      ],
      brief: `OBJECTIF
  Récupère le rapport confidentiel sur le Laboratoire SHELL.

ÉTAPES
  nmap -sn 10.10.0.0/16        depuis ACADEMIE, balaye large
  nmap -sV 10.10.1.10          quels services, quelles versions ?
  hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.1.10
  ssh root@10.10.1.10          (hydra a trouvé le mot de passe)
  ls /home/joueur/archives
  scp root@10.10.1.10:/home/joueur/archives/rapport_confidentiel.txt .

Le point final = ton dossier courant. Le fichier arrive dans
/home/joueur/telecharges sur TA machine.`,
      cours: '/home/cours/01_navigation.txt',
      validate(w) {
        const f = w.home.get('/home/joueur/telecharges/rapport_confidentiel.txt');
        return {
          done: !!f,
          hint: f ? '' : "Utilise 'scp rapport_confidentiel.txt' depuis le Laboratoire SHELL"
        };
      },
      debrief: `scp user@ip:/chemin/fichier . copie un fichier distant vers ta machine.
Le point final désigne ton dossier courant.

Réflexe professionnel : on COPIE la preuve avant toute
modification. Un audit qui détruit ses propres preuves
n'a aucune valeur.`
    },
    {
      id: 3, module: 'SHELL LINUX', titre: 'Modifier et supprimer',
      client: "Sysadmin · Laboratoire SHELL", reward: 250, difficulty: 1, kind: "Remise en service",
      objectives: [
        { label: "statut.txt passé à OPERATIONNEL", done: w=>/OPERATIONNEL/.test((w.node('shellLab').get('/home/joueur/statut.txt')||{}).content||'') },
        { label: "brouillon.txt supprimé", done: w=>!w.node('shellLab').get('/home/joueur/brouillon.txt') }
      ],
      brief: `OBJECTIF — deux actions sur le Laboratoire SHELL (10.10.1.10)

  1. Remplacer du texte avec sed :
     sed -i 's/HORS SERVICE/OPERATIONNEL/g' /home/joueur/statut.txt

  2. Supprimer un fichier :
     rm /home/joueur/brouillon.txt

sed -i modifie sur place. Sans -i, il affiche sans rien changer.
Le g final signifie « toutes les occurrences de la ligne ».

Puis tape : valider`,
      cours: '/home/cours/02_fichiers.txt',
      validate(w) {
        const n = w.node('shellLab');
        const f = n.get('/home/joueur/statut.txt');
        const ok1 = f && f.content.includes('OPERATIONNEL') && !f.content.includes('HORS SERVICE');
        const ok2 = !n.get('/home/joueur/brouillon.txt');
        const parts = [];
        if (!ok1) parts.push('statut.txt doit contenir OPERATIONNEL');
        if (!ok2) parts.push('brouillon.txt doit être supprimé');
        return { done: ok1 && ok2, hint: parts.join(' · ') };
      },
      debrief: `sed -i et rm sont irréversibles. Il n'y a pas de corbeille
dans un shell. C'est pour cela qu'on réfléchit avant de taper,
et qu'on copie avant de modifier.`
    },
    {
      id: 4, module: 'SHELL LINUX', titre: 'Analyser des journaux',
      client: "Cellule réponse à incident", reward: 400, difficulty: 3, kind: "Analyse de journaux",
      objectives: [
        { label: "Échecs de connexion dénombrés", done: (w,sh,ev)=>ev.some(e=>e.type==='grep'&&e.countMode) },
        { label: "preuve_incident.txt collectée AVANT effacement", done: w=>!!w.home.get('/home/joueur/telecharges/preuve_incident.txt') },
        { label: "Journaux du Coffre effacés", done: w=>!Object.keys(w.node('shellCoffre').files).some(p=>/^\/var\/log\/.*\.log$/.test(p)) }
      ],
      brief: `OBJECTIF — deux choses

  1. Sur le Laboratoire SHELL, compte les échecs de connexion :
     grep -c ECHEC /var/log/auth.log
     Réponds avec : valider <le nombre>

  2. Sur le Coffre à journaux (10.10.1.11), découvert depuis
     le Laboratoire SHELL :
     nmap -sn 10.10.1.0/24
     hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.1.11
     ssh root@10.10.1.11
     scp root@10.10.1.11:/home/joueur/preuve_incident.txt .
     rm /var/log/*.log

L'ORDRE COMPTE : copie la preuve avant d'effacer.`,
      cours: '/home/cours/03_filtres.txt',
      needsAnswer: true,
      validate(w, s, ev, answer) {
        const coffre = w.node('shellCoffre');
        const logs = Object.keys(coffre.files).filter(p => p.startsWith('/var/log/') && p.endsWith('.log'));
        const preuve = w.home.get('/home/joueur/telecharges/preuve_incident.txt');
        const okCount = String(answer).trim() === '4';
        const okPreuve = !!preuve;
        const okLogs = logs.length === 0;
        const parts = [];
        if (!okCount) parts.push('compte les ECHEC (indice : il y en a 4)');
        if (!okPreuve) parts.push('collecte preuve_incident.txt avec scp');
        if (!okLogs) parts.push('vide /var/log sur le Coffre');
        return { done: okCount && okPreuve && okLogs, hint: parts.join(' · ') };
      },
      debrief: `Tu as compté avec grep -c, l'équivalent en une commande de
cat | grep | wc -l.
C'est la philosophie Unix : chaque outil fait une chose,
et on les chaîne.

Et tu as appris l'ordre correct : preuve d'abord, nettoyage
ensuite. En mission réelle, effacer des logs n'est autorisé
que si le contrat le prévoit explicitement.`
    },

    // ================= MODULE 2 : PROGRAMMATION =================
    {
      id: 5, module: 'PROGRAMMATION', titre: 'Variables et modulo',
      client: "Laboratoire CODE", reward: 200, difficulty: 1, kind: "Python · bases",
      objectives: [
        { label: "exercice_01.py exécuté sans erreur", done: (w,sh,ev)=>ev.some(e=>e.type==='python'&&/exercice_01/.test(e.path||'')&&e.ok) }
      ],
      brief: `OBJECTIF
  Sur le Laboratoire CODE (10.10.2.10), exécute exercice_01.py.

ÉTAPES
  hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.2.10
  ssh root@10.10.2.10
  cd /home/joueur
  python3 exercice_01.py

Puis : valider <le nombre affiché>

python3 est la vraie commande. Teste aussi :  python3 -c "print(7%3)" `,
      cours: '/home/cours/05_variables.txt',
      needsAnswer: true,
      validate(w, s, ev, answer) {
        const ok = String(answer).trim() === '22';
        // Il faut une preuve d'exécution : le fichier, ou une expression py
        // équivalente. Deviner la réponse ne suffit pas.
        const ran = ev.some(e =>
          (e.type === 'python' && e.path && e.path.includes('exercice_01') && e.ok) ||
          (e.type === 'py' && e.ok && e.output && e.output.trim() === '22'));
        const parts = [];
        if (!ran) parts.push("exécute d'abord : python3 exercice_01.py");
        if (!ok) parts.push('réponds avec le nombre affiché');
        return { done: ok && ran, hint: parts.join(' · ') };
      },
      debrief: `22. Le modulo % donne le RESTE de la division entière.
7 % 3 = 1 car 7 = 2×3 + 1.

C'est l'opérateur le plus utile en pratique : tester la parité,
faire des cycles, répartir des charges.`
    },
    {
      id: 6, module: 'PROGRAMMATION', titre: 'Boucles imbriquées',
      client: "Laboratoire CODE", reward: 200, difficulty: 2, kind: "Python · modulo",
      objectives: [
        { label: "exercice_02.py exécuté sans erreur", done: (w,sh,ev)=>ev.some(e=>e.type==='python'&&/exercice_02/.test(e.path||'')&&e.ok) }
      ],
      brief: `OBJECTIF
  Exécute exercice_02.py sur le Laboratoire CODE :

  python3 exercice_02.py

Puis : valider <le nombre>

Question de réflexion : pourquoi ce nombre et pas 7 ?`,
      cours: '/home/cours/06_boucles.txt',
      needsAnswer: true,
      validate(w, s, ev, answer) {
        const ok = String(answer).trim() === '12';
        const ran = ev.some(e =>
          (e.type === 'python' && e.path && e.path.includes('exercice_02') && e.ok) ||
          (e.type === 'py' && e.ok && e.output && e.output.trim() === '12'));
        const parts = [];
        if (!ran) parts.push("exécute d'abord : python3 exercice_02.py");
        if (!ok) parts.push('réponds avec le nombre affiché');
        return { done: ok && ran, hint: parts.join(' · ') };
      },
      debrief: `12, soit 3 × 4. Une boucle imbriquée multiplie.

C'est exactement la structure d'un balayage de ports :
pour chaque machine, pour chaque port, tester.
Un scan de 254 machines × 1000 ports = 254 000 sondes.`
    },
    {
      id: 7, module: 'PROGRAMMATION', titre: 'Corriger un bug',
      client: "Laboratoire CODE", reward: 350, difficulty: 3, kind: "Débogage",
      objectives: [
        { label: "IndexError reproduite", done: (w,sh,ev)=>ev.some(e=>e.type==='python'&&/exercice_03/.test(e.path||'')&&!e.ok) },
        { label: "exercice_03.py corrigé et exécuté", done: (w,sh,ev)=>ev.some(e=>e.type==='python'&&/exercice_03/.test(e.path||'')&&e.ok) }
      ],
      brief: `OBJECTIF
  exercice_03.py plante avec une IndexError. Corrige-le.

ÉTAPES
  python3 exercice_03.py       vois l'erreur et le numéro de ligne
  cat exercice_03.py           lis le code
  sed -i 's/len(ports) + 1/len(ports)/g' exercice_03.py
  python3 exercice_03.py       vérifie

Puis : valider`,
      cours: '/home/cours/08_debogage.txt',
      validate(w, s, ev) {
        const f = w.node('codeLab').get('/home/joueur/exercice_03.py');
        const fixed = f && f.content.includes('range(len(ports))') && !f.content.includes('+ 1)');
        const ran = ev.some(e => e.type === 'python' && e.path &&
          e.path.includes('exercice_03') && e.ok && e.output.includes('443'));
        const parts = [];
        if (!fixed) parts.push('corrige la boucle (retire le + 1)');
        if (!ran) parts.push('exécute le fichier corrigé avec python');
        return { done: fixed && ran, hint: parts.join(' · ') };
      },
      debrief: `C'était un off-by-one : l'erreur la plus fréquente.

range(len(ports)) va de 0 à 3 pour une liste de 4 éléments.
Avec + 1, il allait jusqu'à 4 — et ports[4] n'existe pas.

Tu as fait la démarche complète : lire l'erreur, comprendre,
corriger, revérifier. C'est ça, déboguer.`
    },
    {
      id: 8, module: 'PROGRAMMATION', titre: 'Écrire une fonction',
      client: "Serveur de build", reward: 500, difficulty: 4, kind: "Python · fonctions",
      objectives: [
        { label: "est_sur() renvoie le bon résultat", done: (w,sh,ev)=>ev.some(e=>e.type==='python'&&/exercice_04/.test(e.path||'')&&e.ok) },
        { label: "ports_hauts() renvoie [3306, 8080]", done: (w,sh,ev)=>ev.some(e=>e.type==='python'&&/mission8/.test(e.path||'')&&e.ok) }
      ],
      brief: `OBJECTIF — deux fonctions à écrire

  1. Sur le Laboratoire CODE, exercice_04.py :
     sed -i 's/return False/return port in (22, 443)/g' exercice_04.py
     python3 exercice_04.py

  2. Sur le Serveur de build (10.10.2.11), découvert depuis le labo :
     nmap -sn 10.10.2.0/24
     hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.2.11
     ssh root@10.10.2.11
     sed -i 's/return \[\]/return [p for p in liste if p > 1024]/g' mission8.py
     python3 mission8.py

Si le sed est délicat, utilise l'éditeur : tape  editeur

Puis : valider`,
      cours: '/home/cours/07_structures.txt',
      validate(w, s, ev) {
        const f1 = w.node('codeLab').get('/home/joueur/exercice_04.py');
        const f2 = w.node('codeBuild').get('/home/joueur/mission8.py');
        let ok1 = false, ok2 = false;
        if (f1 && global.PyInterp) {
          const r = global.PyInterp.run(f1.content + '\nprint(est_chiffre(22), est_chiffre(443), est_chiffre(80), est_chiffre(21))');
          ok1 = r.ok && r.output.trim().endsWith('True True False False');
        }
        if (f2 && global.PyInterp) {
          const r = global.PyInterp.run(f2.content + '\nprint(ports_hauts([22,80,3306,8080,443]))');
          ok2 = r.ok && r.output.includes('[3306, 8080]');
        }
        const parts = [];
        if (!ok1) parts.push('est_chiffre doit donner True True False False');
        if (!ok2) parts.push('ports_hauts doit donner [3306, 8080]');
        return { done: ok1 && ok2, hint: parts.join(' · ') };
      },
      debrief: `Tu as écrit du vrai code, et le jeu l'a réellement exécuté
pour vérifier. Ce n'est pas un QCM.

Deux styles valides : l'appartenance 'port in (22, 443)',
et la compréhension de liste '[p for p in liste if p > 1024]'.
La seconde est plus idiomatique en Python.`
    },

    // ================= MODULE 3 : RESEAU =================
    {
      id: 9, module: 'RESEAU', titre: 'Cartographier les ports',
      client: "Audit réseau · cabinet tiers", reward: 350, difficulty: 2, kind: "Empreinte de service",
      objectives: [
        { label: "nmap -sV lancé sur le port 8899", done: (w,sh,ev)=>ev.some(e=>e.type==='nmap'&&e.sV&&e.target==='netLab') }
      ],
      brief: `OBJECTIF
  Sur le Laboratoire RESEAU (10.10.3.10), trouve la VRAIE nature
  du service sur le port 8899.

ÉTAPES
  nmap 10.10.3.10              que vois-tu sur 8899 ?
  nmap -sV -p 8899 10.10.3.10  interroge réellement le service
  nc 10.10.3.10 8899           la bannière brute confirme

Puis : valider <le nom du logiciel>

Le piège : sans -sV, nmap devine d'après le numéro de port.`,
      cours: '/home/cours/09_ports.txt',
      needsAnswer: true,
      validate(w, s, ev, answer) {
        const a = String(answer).toLowerCase();
        const ok = a.includes('python') || a.includes('simplehttp');
        const scanned = ev.some(e => e.type === 'nmap' && e.sV && e.ports && e.ports.includes(8899));
        return {
          done: ok && scanned,
          hint: !scanned ? "Fais d'abord : nmap -sV -p 8899" : "Regarde la colonne VERSION, pas SERVICE"
        };
      },
      debrief: `SimpleHTTPServer (Python). Sans -sV, Nmap affichait
"ospf-lite" — un protocole de routage, rien à voir.

LEÇON LA PLUS IMPORTANTE DE CE MODULE : la colonne SERVICE
sans -sV est une devinette basée sur le numéro de port.
Seul -sV interroge le service pour connaître sa version.

C'est cette version qui permet ensuite de chercher les CVE.`
    },
    {
      id: 10, module: 'RESEAU', titre: 'Franchir un pare-feu',
      client: "Client confidentiel", reward: 700, difficulty: 4, kind: "Franchissement de filtrage",
      objectives: [
        { label: "Compte admin trouvé par dictionnaire", done: (w,sh,ev,g)=>!!(g.creds['10.10.3.11']||{}).admin },
        { label: "Session root obtenue (sudo -i)", done: w=>w.node('netFw').isAdmin },
        { label: "Règles de filtrage vidées (iptables -F)", done: w=>w.node('netFw').firewallDown }
      ],
      brief: `OBJECTIF
  La Passerelle filtrée (10.10.3.11) bloque presque tout.
  Franchis-la par la vraie voie : un compte faible exposé en SSH.

ÉTAPES (depuis le Laboratoire RESEAU)
  nmap -sn 10.10.3.0/24        découvre la passerelle
  nmap -sV 10.10.3.11          ports filtered, sauf 22
  hydra -l admin -P /usr/share/wordlists/rockyou.txt ssh://10.10.3.11
  ssh admin@10.10.3.11
  cat /etc/firewall.conf       lis les règles
  iptables -L -n -v            le filtrage en direct
  sudo -l                      quels sont mes droits ?
  sudo -i                      devenir root
  iptables -F                  vider les règles
  nmap -sV 10.10.3.11          tout est ouvert

Puis : valider

Pas de mot magique : un mot de passe faible, puis root, puis iptables.`,
      cours: '/home/cours/10_parefeu.txt',
      validate(w) {
        const n = w.node('netFw');
        const parts = [];
        if (!n.firewallDown) parts.push('vide le filtrage (iptables -F, en root)');
        if (!n.isAdmin) parts.push('deviens root (sudo -l puis sudo -i)');
        return { done: n.firewallDown && n.isAdmin, hint: parts.join(' · ') };
      },
      debrief: `Tu as suivi la vraie chaîne : un compte d'administration exposé
en SSH, un mot de passe présent dans rockyou, hydra qui le trouve,
ssh, sudo -i, puis iptables -F.

Aucun mot magique. Juste un mot de passe par défaut jamais changé
et un compte trop privilégié. C'est l'une des intrusions les plus
courantes au monde.

Retiens aussi : filtered ≠ closed. Le premier révèle un contrôle,
le second une absence de service.`
    },
    {
      id: 11, module: 'RESEAU', titre: 'Pivoting vers un segment caché',
      client: "Client confidentiel", reward: 650, difficulty: 4, kind: "Pivot réseau",
      objectives: [
        { label: "Segment interne découvert", done: w=>w.node('netInterne').discovered },
        { label: "secret_segment.txt collecté", done: w=>!!w.home.get('/home/joueur/telecharges/secret_segment.txt') }
      ],
      brief: `OBJECTIF
  Une machine du segment interne n'est pas sur ta carte.
  Atteins-la par rebond (pivoting) et collecte son secret.

ÉTAPES (depuis la Passerelle filtrée)
  nmap -sn 10.10.3.0/24        découvre le proxy
  hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.3.12
  ssh root@10.10.3.12
  nmap -sn 10.10.3.0/24        révèle une machine cachée
  hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.3.20
  ssh root@10.10.3.20
  scp root@10.10.3.20:/home/joueur/secret_segment.txt .

Puis : valider`,
      cours: '/home/cours/11_routage.txt',
      validate(w) {
        const interne = w.node('netInterne');
        const f = w.home.get('/home/joueur/telecharges/secret_segment.txt');
        const parts = [];
        if (!interne.discovered) parts.push('fais scan depuis le Proxy');
        if (!interne.isAdmin) parts.push('obtiens admin sur le Serveur interne');
        if (!f) parts.push('collecte secret_segment.txt avec scp');
        return { done: interne.discovered && interne.isAdmin && !!f, hint: parts.join(' · ') };
      },
      debrief: `Tu viens de faire du PIVOTING.

Le Serveur interne n'était pas exposé à Internet. Tu ne
pouvais l'atteindre qu'en compromettant d'abord le proxy.

C'est le scénario d'incident le plus fréquent : une machine
peu protégée en bordure ouvre l'accès à tout un segment
interne que personne n'avait jugé nécessaire de sécuriser.`
    },
    {
      id: 12, module: 'RESEAU', titre: 'Produire un rapport',
      client: "Audit réseau · cabinet tiers", reward: 400, difficulty: 2, kind: "Surface d'attaque",
      objectives: [
        { label: "Balayage complet des 65535 ports", done: (w,sh,ev)=>ev.some(e=>e.type==='nmap'&&e.allPorts&&e.target==='netLab') }
      ],
      brief: `OBJECTIF
  Documente la surface d'attaque du Laboratoire RESEAU.

  nmap -p- -sV 10.10.3.10      tous les ports, avec versions

Puis réponds : valider <nombre de ports TCP ouverts>

-p- balaye les 65535 ports. Le défaut n'en teste que 1000 :
un service sur un port élevé passe inaperçu sans cette option.`,
      cours: '/home/cours/12_methodologie.txt',
      needsAnswer: true,
      validate(w, s, ev, answer) {
        const ok = String(answer).trim() === '6';
        const scanned = ev.some(e => e.type === 'nmap' && e.allPorts && e.target === 'netLab');
        return {
          done: ok && scanned,
          hint: !scanned ? "Fais un scan complet : nmap -p-" : "Compte les lignes marquées open"
        };
      },
      debrief: `6 ports ouverts. Dont un sur 8899, invisible sans -p-
ni dans le top-1000 par défaut selon les outils.

Un rapport d'audit commence par des faits vérifiables :
combien de ports, lesquels, quelles versions. Les
recommandations viennent après, appuyées sur ces faits.`
    },

    // ================= MODULE 4 : SECURITE =================
    {
      id: 13, module: 'CYBERSECURITE', titre: 'Encoder n\'est pas chiffrer',
      client: "Laboratoire SECURITE", reward: 300, difficulty: 2, kind: "Encodage ≠ chiffrement",
      objectives: [
        { label: "config.b64 décodé avec base64 -d", done: (w,sh,ev)=>ev.some(e=>e.type==='crypto'&&e.op==='base64decode') }
      ],
      brief: `OBJECTIF
  Un secret est encodé en Base64 sur le Laboratoire SECURITE
  (10.10.4.10). Décode-le avec la vraie commande.

ÉTAPES
  hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.4.10
  ssh root@10.10.4.10
  cd /home/joueur
  cat config.b64
  base64 -d config.b64

Puis : valider <le secret décodé>

base64 -d décode. Sans -d, base64 encode. Ce n'est PAS du chiffrement.`,
      cours: '/home/cours/13_chiffrement.txt',
      needsAnswer: true,
      validate(w, s, ev, answer) {
        const ok = String(answer).trim() === 'SECRET{b4se64_n3st_pas_ch1ffr3}';
        return { done: ok, hint: ok ? '' : "Décode le fichier avec : base64 -d config.b64" };
      },
      debrief: `base64 -d n'est PAS un déchiffrement : il n'y a pas de clé.
N'importe qui peut décoder. C'est de l'encodage, fait pour
représenter des données, pas pour les protéger.

Trois choses à ne jamais confondre :
  chiffrement  réversible AVEC clé      → confidentialité
  hachage      irréversible             → intégrité
  encodage     réversible SANS clé      → représentation`
    },
    {
      id: 14, module: 'CYBERSECURITE', titre: 'Chasse aux secrets',
      client: "Direction · audit final", reward: 900, difficulty: 5, kind: "Fuite de secret",
      objectives: [
        { label: "Serveur web audité (nikto)", done: (w,sh,ev)=>ev.some(e=>e.type==='nikto') },
        { label: "Sauvegarde exposée lue", done: (w,sh,ev)=>ev.some(e=>e.type==='curl'&&/config\.bak/.test(e.path||'')) },
        { label: "Session root sur la cible", done: w=>w.node('secCible').isAdmin }
      ],
      brief: `OBJECTIF
  Retrouve le mot de passe root de la Cible d'audit (10.10.4.20).
  Il est fort : hydra ne le trouvera pas. Cherche une fuite.

ÉTAPES (depuis le Laboratoire SECURITE)
  nmap -sn 10.10.4.0/24        découvre la cible
  nmap -sV 10.10.4.20
  nikto -h 10.10.4.20          audit du serveur web
  curl http://10.10.4.20/robots.txt
  curl http://10.10.4.20/backups/config.bak
  ssh root@10.10.4.20          (mot de passe trouvé dans la sauvegarde)
  sudo -i  puis  iptables -F

Puis : valider <le mot de passe trouvé>

Leçon : un mot de passe fort ne sert à rien s'il traîne en clair.`,
      cours: '/home/cours/15_secrets.txt',
      needsAnswer: true,
      validate(w, s, ev, answer) {
        const ok = String(answer).trim() === 'S3nt1n3ll3!';
        return {
          done: ok,
          hint: ok ? '' : "L'historique du shell (.bash_history) montre où l'admin est allé"
        };
      },
      debrief: `Le mot de passe était dans une SAUVEGARDE exposée par le serveur
web. nikto a signalé l'indexation de /backups/, robots.txt la
confirmait, curl l'a lue.

hydra n'avait aucune chance : ce mot de passe est fort. La faille
n'était pas sa faiblesse, c'était sa fuite.

C'est la faille la plus répandue : pas une vulnérabilité
logicielle, mais un secret laissé quelque part. Les fichiers
.bak, l'historique, les commentaires de code, les dépôts
versionnés sont les premiers endroits à fouiller.

Remédiation : coffre de secrets, variables d'environnement,
rotation régulière.`
    },
    {
      id: 15, module: 'CYBERSECURITE', titre: 'Traces et attribution',
      client: "Direction · audit final", reward: 600, difficulty: 3, kind: "Traçabilité",
      objectives: [
        { label: "Lignes d'intrusion dénombrées", done: (w,sh,ev)=>ev.some(e=>e.type==='grep'&&e.countMode) },
        { label: "Rapport déposé sur le Dépôt", done: w=>Object.keys(w.node('depot').files).some(p=>/^\/depot\/.*rapport_audit/.test(p)) }
      ],
      brief: `OBJECTIF
  Analyse tes propres traces, puis livre le rapport.

ÉTAPES (sur 10.10.4.20)
  cat /var/log/actions.log
  grep -c intrusion /var/log/actions.log

Réponds : valider <le nombre>

Puis dépose le rapport sur le Dépôt :
  scp root@10.10.4.20:/home/joueur/rapport_audit.txt .
  exit
  scp /home/joueur/telecharges/rapport_audit.txt joueur@10.10.0.9:/depot/

La dernière commande est un scp local → distant : la vraie syntaxe.`,
      cours: '/home/cours/14_traces.txt',
      needsAnswer: true,
      validate(w, s, ev, answer) {
        const cible = w.node('secCible');
        const log = cible.get('/var/log/actions.log');
        const count = log ? log.content.split('\n').filter(l => l.includes('intrusion')).length : 0;
        const okCount = String(answer).trim() === String(count) && count > 0;
        const depot = w.node('depot');
        const deposited = Object.keys(depot.files).some(p => p.startsWith('/depot/') && p.includes('rapport_audit'));
        const parts = [];
        if (!okCount) parts.push(`compte les lignes "intrusion" (il y en a ${count})`);
        if (!deposited) parts.push('dépose rapport_audit.txt sur le Dépôt (10.10.0.9)');
        return { done: okCount && deposited, hint: parts.join(' · ') };
      },
      debrief: `Tu as lu tes propres traces, puis produit et déposé une preuve.

C'est le cycle complet d'un audit : agir, documenter, livrer.
Les logs sont la mémoire du système. Un analyste qui sait les
lire peut reconstituer une intrusion des mois après.`
    },
    {
      id: 16, module: 'CYBERSECURITE', titre: 'Audit final',
      client: "Direction · audit final", reward: 1000, difficulty: 5, kind: "Synthèse et éthique",
      objectives: [
        { label: "Rapport complété (VALIDE)", done: w=>/VALIDE/.test((w.node('secCible').get('/home/joueur/rapport_audit.txt')||{}).content||'') },
        { label: "Note 16_ethique.txt lue", done: (w,sh,ev)=>ev.some(e=>e.type==='read'&&(e.paths||[]).some(p=>/16_ethique/.test(p))) }
      ],
      brief: `OBJECTIF — la synthèse

Sur la Cible d'audit (10.10.4.20) :

  sed -i 's/A_REMPLIR/6/g' /home/joueur/rapport_audit.txt
  sed -i 's/A_REMPLIR/port 47391/g' /home/joueur/rapport_audit.txt
  sed -i 's/BROUILLON/VALIDE/g' /home/joueur/rapport_audit.txt

Puis lis la dernière note, sur le cadre légal :
  ssh joueur@10.10.0.1
  cat /home/cours/16_ethique.txt

Puis : valider`,
      cours: '/home/cours/16_ethique.txt',
      validate(w, s, ev) {
        const f = w.node('secCible').get('/home/joueur/rapport_audit.txt');
        const okRapport = f && f.content.includes('VALIDE') && !f.content.includes('A_REMPLIR');
        const okEthique = ev.some(e => e.type === 'read' && e.paths &&
          e.paths.some(p => p.includes('16_ethique')));
        const parts = [];
        if (!okRapport) parts.push('rapport : VALIDE et plus de A_REMPLIR');
        if (!okEthique) parts.push('lis /home/cours/16_ethique.txt sur ACADEMIE');
        return { done: okRapport && okEthique, hint: parts.join(' · ') };
      },
      debrief: `Cursus terminé.

Tu sais naviguer un système de fichiers, composer des outils
en ligne de commande, écrire et déboguer du Python, cartographier
un réseau, comprendre un pare-feu, atteindre un segment caché
par rebond, distinguer chiffrement et encodage, retrouver un
secret, analyser des traces et produire un rapport.

Et tu connais le cadre légal. C'est la partie qui compte le plus.

La suite : Nmap Quest sur ta vraie machine, puis TryHackMe,
puis un labo à toi. Ces outils existent pour réparer, pas pour nuire.`
    }
  ];

  const API = { WORLD_SPEC, MISSIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Campaign = API;
})(typeof window !== 'undefined' ? window : globalThis);
