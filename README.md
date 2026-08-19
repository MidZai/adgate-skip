# AdGate Skip

Le lecteur impose cinq pubs avant de démarrer une vidéo. Chaque clic sur
« Continuer » ouvre un onglet de régie et fait avancer un compteur de 20 %.
Ce script remplit le compteur tout seul, sans ouvrir la moindre pub, et
neutralise les popunders au passage.

Il s'active sur **senpai-stream.*** — n'importe quel TLD (`.makeup`, `.bond`,
`.com`, …) et n'importe quel sous-domaine. Le site changeant d'extension
régulièrement, il n'y a plus rien à modifier quand il déménage.

**[→ Page d'installation](https://midzai.github.io/adgate-skip/)**

## Installation

Il faut un gestionnaire de userscripts, [Violentmonkey](https://violentmonkey.github.io/get-it/)
ou Tampermonkey, puis un clic sur ce lien :

**[adgate-skip.user.js](https://raw.githubusercontent.com/MidZai/adgate-skip/main/adgate-skip.user.js)**

L'écran de confirmation s'ouvre, on valide, c'est fini. Les mises à jour se font
ensuite automatiquement via `@updateURL`.

Si le clic affiche du code source au lieu d'une confirmation, c'est que le
gestionnaire n'est pas installé.

### Installé mais rien ne se passe

Sur Chrome, un gestionnaire en Manifest V3 n'injecte rien tant que l'option
**Autoriser les scripts utilisateur** n'est pas activée dans `chrome://extensions`
→ Détails de Violentmonkey. Après l'avoir cochée il faut **recharger l'extension**,
ou redémarrer Chrome : Violentmonkey ne réenregistre ses scripts qu'au démarrage,
recharger la page ne suffit pas.

Pour savoir si le script tourne, le témoin est le bouton **Skip pubs** en bas à
droite : il apparaît dès l'exécution, même si la suite échoue. Pas de bouton = le
script n'est jamais injecté, et le problème est côté gestionnaire, pas côté script.

### Version bookmarklet

Si aucun gestionnaire ne veut coopérer, la [page d'installation](https://midzai.github.io/adgate-skip/)
propose un lien à glisser dans la barre de favoris. Un clic dessus sur une page
d'épisode lance le skip. Aucune extension, aucun réglage, tous navigateurs. En
contrepartie il faut cliquer à chaque épisode.

### Sans gestionnaire de userscripts

Le dossier `extension/` est une extension Manifest V3 utilisable telle quelle :

- Chrome, Edge, Brave : `chrome://extensions`, activer le mode développeur,
  « Charger l'extension non empaquetée », choisir `extension/`
- Firefox 128+ : `about:debugging#/runtime/this-firefox`, « Charger un module
  temporaire », choisir `extension/manifest.json`

Le navigateur annoncera que l'extension peut « lire et modifier vos données sur
tous les sites ». C'est la contrepartie du TLD variable : un match pattern MV3
n'accepte pas de joker sur l'extension de domaine, l'extension doit donc matcher
large et filtrer elle-même. Concrètement `core.js` sort immédiatement si le
hostname n'est pas `senpai-stream.*`, avant de toucher à quoi que ce soit. Le
userscript, lui, n'a pas ce problème : son `@include` accepte une regex.

Une extension non signée ne peut pas s'installer automatiquement, les navigateurs
le bloquent volontairement. Et Firefox décharge les extensions temporaires à chaque
redémarrage. Le userscript est plus pratique au quotidien.

## Utilisation

Ouvrir un épisode ou un film. Le compteur monte à 100 % en deux secondes et la
lecture démarre.

En cas de blocage, un bouton **Skip pubs** attend en bas à droite, ou
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>. Il change de couleur selon l'état :
orange en cours, vert réussi, rouge sombre bloqué. Rafraîchir la page remet le
compteur à zéro côté serveur.

## Comment ça marche

Le lecteur est un composant Livewire dont l'état vit côté serveur :

```json
{ "currentStep": 0, "total_steps": "5", "percentage": 0 }
```

Le bouton « Continuer » est un simple lien :

```html
<a href="https://…" target="_blank" wire:click="incrementSteps">Continuer</a>
```

Il ouvre la régie *et* appelle la méthode serveur. La pub n'est jamais une
condition, seulement un effet de bord. Sur certaines configurations le site passe
par `window.openAdTab()`, qui vérifie que l'onglet est resté ouvert au moins trois
secondes avant d'incrémenter, mais ce contrôle est lui aussi purement côté client.

Le script appelle donc directement :

```js
Livewire.find(id).call('incrementSteps')
```

cinq fois d'affilée. Le composant est retrouvé par la présence de `total_steps`
dans son snapshot, et non par son `wire:id` qui est régénéré à chaque chargement.

Deux détails qui ont coûté du temps :

- `document.body.innerText` ne permet pas de détecter le gate. L'overlay est masqué
  par Alpine (`x-show="cf_turnstile_response"`) tant que le Turnstile n'a pas
  répondu, donc absent de `innerText` dès le chargement alors que le gate est bien
  actif. Seul `innerHTML` est fiable.
- Deux séquences concurrentes (chargement initial + `livewire:navigated`) partent
  dans le même batch Livewire et incrémentent de 2 d'un coup. D'où le jeton de
  génération dans `skip()`.

- Le compteur n'est pas le dernier verrou. Une fois à 100 %, le composant se réduit
  à un widget Cloudflare Turnstile : le serveur ne livre la source vidéo qu'une fois
  ce jeton validé. En cliquant à la main on met une trentaine de secondes et le
  Turnstile a le temps de répondre, alors que le script boucle en deux secondes.
  Si on incrémente avant, le re-render Livewire détruit le widget et le player
  n'arrive jamais : le compteur disparaît, mais l'écran reste sur l'image de
  couverture. D'où l'attente explicite de `cf_turnstile_response` avant la première
  incrémentation.

Piège de test au passage : une iframe technique de 0×0 pointant vers l'URL courante
traîne en permanence sur la page. Un `querySelector('iframe[src]')` la trouve et
laisse croire que le player est monté. Il faut vérifier les dimensions.

## Développement

`src/core.js` est la seule source. Le reste est généré :

```
src/core.js              source
build.sh                 → adgate-skip.user.js + extension/core.js
                           + docs/bookmarklet.js
extension/manifest.json  MV3, world "MAIN", run_at document_start
docs/index.html          page d'installation (GitHub Pages)
```

```sh
./build.sh
```

Le ciblage du site vit à deux endroits, pour deux raisons différentes :

- `build.sh` pose un `@include` regex sur le userscript. Il ne faut **pas** y
  rajouter de `@match` : Violentmonkey ignore les `@include` dès qu'un `@match`
  est présent, ce qui restreindrait le script aux seuls domaines listés.
- `src/core.js` teste `location.hostname` (`onSite`), ce qui est le vrai filtre
  pour l'extension puisque son manifest matche `*://*/*`.

Le bookmarklet échappe au filtre : `build.sh` lui préfixe `window.__adgateForce`,
puisqu'un clic sur un favori est déjà une intention explicite.

Le script doit tourner dans le contexte de la page, pas dans le monde isolé d'un
content script, pour atteindre `window.Livewire`. D'où `world: "MAIN"` côté
extension et `@grant none` côté userscript.

Les réglages sont regroupés dans l'objet `config` en tête de `src/core.js` :
`delay` (450 ms entre deux incréments, à augmenter si le serveur se met à limiter),
`autoPlay`, `blockPopups`.

Pour bumper la version, modifier `extension/manifest.json` puis relancer `./build.sh` :
le userscript en hérite.

## Quand ça casse

Un simple changement de TLD (`.bond` → `.makeup` → …) ne casse plus rien : le nom
`senpai-stream` est le seul élément codé en dur. En revanche si le site change de
**nom**, il faut éditer deux endroits, la regex `@include` dans `build.sh` et le
`onSite` en tête de `src/core.js`, puis bumper la version du manifest et rebuild.

La console logue chaque étape sous `[adgate]`. Un « composant introuvable »
signifie que le site a changé de framework ou renommé ses propriétés.

## Licence

MIT
