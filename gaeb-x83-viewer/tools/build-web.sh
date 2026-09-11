#!/usr/bin/env bash
# Erzeugt unter dist/gaeb/ die Fassung für einen Webserver: gleiche Anwendung,
# aber ohne das Beispiel-LV beim Start. Inhalt anschließend per FTP in das
# Zielverzeichnis hochladen (z. B. htdocs/gaeb/).
set -euo pipefail
cd "$(dirname "$0")/.."

ziel="dist/gaeb"
rm -rf "$ziel"
mkdir -p "$ziel"

sed 's|<div class="app" data-start="beispiel">|<div class="app" data-start="leer">|' index.html > "$ziel/index.html"
grep -q 'data-start="leer"' "$ziel/index.html" || { echo "Startattribut nicht ersetzt" >&2; exit 1; }
cp gaeb.js "$ziel/gaeb.js"

cat > "$ziel/.htaccess" <<'HTACCESS'
# Umlaute korrekt ausliefern, auch wenn der Server etwas anderes voreinstellt
AddDefaultCharset utf-8

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 0 seconds"
  ExpiresByType application/javascript "access plus 7 days"
</IfModule>
HTACCESS

echo "Fertig: $ziel"
ls -la "$ziel"
