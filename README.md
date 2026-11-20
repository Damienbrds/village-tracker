# Village Tracker

Suivi de progression Clash of Clans à partir de l'export de données du jeu.

## Lancer le site

```powershell
node tools/serve.js
```

Puis ouvre http://localhost:8080.

## Importer ton village

1. Dans le jeu : **Paramètres → Plus de paramètres → Exporter les données → Copier**
2. Sur le site : colle le texte puis clique sur **Analyser mon village**
3. Après chaque session de jeu, refais un export puis clique sur **Mettre à jour**

L'export reste dans ton navigateur (localStorage). Rien n'est envoyé ailleurs.

## Mettre à jour les données du jeu

Après une mise à jour de Clash of Clans (nouvel HDV, nouvelles troupes…) :

```powershell
node tools/build-data.js
```

Puis, pour récupérer les images des nouveautés (les images déjà présentes ne sont pas retéléchargées) :

```powershell
node tools/fetch-images.js
```

Le premier script régénère `data/game-data.js` à partir des données publiques de
[ClashKingAssets](https://github.com/ClashKingInc/ClashKingAssets) (niveaux, coûts, durées, noms en français).

## Fichiers

- `index.html`, `assets/style.css`, `assets/app.js` : le site
- `data/game-data.js` : données du jeu (fichier généré)
- `data/images.js` + `assets/img/` : images du jeu (générées par `tools/fetch-images.js`)
- `tools/build-data.js` : génère les données
- `tools/fetch-images.js` : télécharge les images
- `tools/serve.js` : serveur local
