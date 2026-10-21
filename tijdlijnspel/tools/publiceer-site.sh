#!/usr/bin/env bash
# Zet de inhoud van tijdlijnspel/ (zonder dit bouwgereedschap) in de branch "tijdlijn-site",
# die Netlify publiceert. Draait in GitHub Actions; gebruik: publiceer-site.sh <token>
set -euo pipefail
# Alleen vanaf main: anders overschrijven runs op andere branches elkaars versie van de site.
if [ "${GITHUB_REF_NAME:-main}" != "main" ]; then
  echo "Site-branch niet bijgewerkt: dit is ${GITHUB_REF_NAME}, de site volgt alleen main."
  exit 0
fi
repo_root="$(git rev-parse --show-toplevel)"
site="$(mktemp -d)"
cp -r "$repo_root/tijdlijnspel/." "$site/"
rm -rf "$site/tools"
cd "$site"
git init -q -b tijdlijn-site
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -q -m "Tijdlijn-site uit ${GITHUB_REF_NAME:-lokaal}@${GITHUB_SHA:0:7}"
git push -q -f "https://x-access-token:$1@github.com/${GITHUB_REPOSITORY}.git" HEAD:tijdlijn-site
echo "Branch tijdlijn-site bijgewerkt"
