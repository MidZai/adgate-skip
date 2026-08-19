#!/usr/bin/env bash
# src/core.js est la source. Ce script en tire le userscript et la copie
# utilisée par l'extension.
set -euo pipefail
cd "$(dirname "$0")"

REPO=MidZai/adgate-skip
RAW="https://raw.githubusercontent.com/$REPO/main/adgate-skip.user.js"
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' extension/manifest.json)

{
  cat <<EOF
// ==UserScript==
// @name         AdGate Skip
// @namespace    https://github.com/$REPO
// @version      $VERSION
// @description  Passe le compteur de pubs du lecteur et bloque les popunders.
// @author       $REPO
// @homepageURL  https://github.com/$REPO
// @supportURL   https://github.com/$REPO/issues
// @downloadURL  $RAW
// @updateURL    $RAW
// @match        https://senpai-stream.makeup/*
// @match        https://*.senpai-stream.makeup/*
// @match        https://senpai-stream.bond/*
// @match        https://*.senpai-stream.bond/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

EOF
  cat src/core.js
} > adgate-skip.user.js

cp src/core.js extension/core.js

# Version bookmarklet, pour les navigateurs où aucun gestionnaire de scripts
# ne veut fonctionner. La page d'install pose le lien à glisser dans la barre
# de favoris.
node -e '
const fs = require("fs");
const code = fs.readFileSync("src/core.js", "utf8");
const url = "javascript:" + encodeURIComponent(code + "\nvoid 0;");
fs.writeFileSync("docs/bookmarklet.js",
  "// généré par build.sh, ne pas éditer\n" +
  "document.getElementById(\"bookmarklet\").href = " + JSON.stringify(url) + ";\n");
console.log("docs/bookmarklet.js     " + Math.round(url.length / 1024) + " Ko");
'

echo "adgate-skip.user.js  v$VERSION  ($(wc -l < adgate-skip.user.js | tr -d ' ') lignes)"
