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

echo "adgate-skip.user.js  v$VERSION  ($(wc -l < adgate-skip.user.js | tr -d ' ') lignes)"
