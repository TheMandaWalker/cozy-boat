# Cozy Boat

Une petite croisière au crépuscule : un bateau en bois sur une mer animée, entièrement en 3D temps réel (Three.js + shaders GLSL écrits à la main). Aucune étape de build, aucun fichier binaire : tout est procédural.

## Ce qu'on peut faire

- **Tourner, zoomer** la caméra (glisser, molette, pincement sur mobile).
- **Cliquer sur l'eau** pour créer une ondulation qui se propage et fait tanguer le bateau.
- **Caresser le chat** (cliquer dessus) : il saute, miaule et des cœurs apparaissent.
- **Cliquer sur une lanterne flottante** pour la faire vibrer.
- **Curseur d'heure** : du matin au cœur de la nuit, avec ciel, soleil/lune, lumière et brouillard qui suivent.
- **Pluie** : gouttes, ronds dans l'eau et ciel plus gris.
- **Lanternes** : allume ou éteint la lanterne du mât et les lanternes flottantes.
- **Son** : ambiance de vagues et de vent, carillons et miaulement, le tout synthétisé avec WebAudio.
- **Rotation automatique** et bouton **Recentrer**.

Raccourcis : `P` pluie, `L` lanternes, `S` son, `R` recentrer.

## Ce qu'il y a dans la scène

- Mer : vagues de Gerstner-like sommées dans le vertex shader, ondulations interactives, reflets de Fresnel, scintillement et mousse dans le fragment shader.
- Ciel : dégradé selon l'heure, soleil, lune, étoiles et aurore boréale procédurale.
- Bateau : coque lofted, voile qui gonfle au vent, fanions, cheminée qui fume, canne à pêche avec flotteur, chat.
- Monde : îles à l'horizon, phare clignotant, village illuminé, île volante avec cascade, nuages, lucioles.
- Post-traitement : bloom léger pour les lumières.

## Structure

```
index.html          page, import map et interface
css/style.css       style de l'interface
js/main.js          boucle, caméra, interactions, interface
js/water.js         mer : shader + équivalent JS pour le flottement du bateau
js/environment.js   ciel, soleil, lune et palettes par heure
js/boat.js          bateau et son animation
js/world.js         îles, nuages, lucioles, lanternes, pluie
js/audio.js         sons synthétisés
js/util.js          textures procédurales et petites fonctions
```

## Lancer en local

Le site est statique. N'importe quel serveur convient :

```sh
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Three.js est chargé depuis jsDelivr (version épinglée dans `index.html`).

## Déploiement

Le workflow `.github/workflows/pages.yml` publie le dépôt sur GitHub Pages à chaque push sur la branche de travail. Tous les chemins sont relatifs : le site fonctionne à la racine d'un domaine comme sous un sous-chemin (`/cozy-boat`).
