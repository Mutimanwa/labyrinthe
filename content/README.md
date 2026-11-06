# content/ — contenu data-driven

Tout ce qui est **histoire, monde et textes** vit ici, hors du code :
écrire un contrat = écrire un fichier. Schémas dans la Game Bible §10.4.

```
missions/    contrats et missions de la campagne (JSON, cf. bb-01.json)
web/sites/   sites du web clair interne (couche 2) — M1
web/fouine/  index du moteur de recherche interne — M1
forum/       fils de NetSec-Intérieur (couche 3) — M1/M2
puits/       marché, contrats gris/noirs, vitrines (couche 4) — M4
npc/         archétypes ECHO : comportements, agendas, répliques — M3
```

Chargement côté jeu : `window.LabyBridge.contentLoad('missions/bb-01.json')`
(Tauri) ou `fetch('content/missions/bb-01.json')` en édition web.
