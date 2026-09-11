#!/usr/bin/env bash
# Erzeugt unter dist/ die verteilbaren Fassungen des Viewers:
#
#   dist/gaeb/               Webserver, zwei Dateien (index.html + gaeb.js)
#   dist/gaeb-eine-datei/    Webserver, alles in einer index.html
#   dist/GAEB-Viewer.html    Einzeldatei zum Weitergeben (gleicher Inhalt,
#                            sprechender Name für den Versand)
#
# Alle Fassungen starten mit leerer Ablagefläche; das Beispiel-LV bleibt über
# einen Knopf erreichbar. Den Webserver-Fassungen liegt eine .htaccess bei, die
# UTF-8 festlegt.
set -euo pipefail
cd "$(dirname "$0")/.."

ziel="dist"
rm -rf "$ziel"
mkdir -p "$ziel/gaeb" "$ziel/gaeb-eine-datei"

# Bindet gaeb.js an der Stelle des <script src="..."> direkt in die Seite ein.
einbetten() {
  awk '
    /<script src="gaeb\.js"><\/script>/ { print "<script>"; system("cat gaeb.js"); print "</script>"; next }
    { print }
  ' "$1"
}

htaccess() {
  cat > "$1/.htaccess" <<'HTACCESS'
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
}

# 1) Webserver, zwei Dateien
sed 's|<div class="app" data-start="beispiel">|<div class="app" data-start="leer">|' index.html > "$ziel/gaeb/index.html"
cp gaeb.js "$ziel/gaeb/gaeb.js"
htaccess "$ziel/gaeb"

# 2) Webserver, alles in einer Datei
einbetten "$ziel/gaeb/index.html" > "$ziel/gaeb-eine-datei/index.html"
htaccess "$ziel/gaeb-eine-datei"

# 3) Dieselbe Einzeldatei unter sprechendem Namen zum Weitergeben
cp "$ziel/gaeb-eine-datei/index.html" "$ziel/GAEB-Viewer.html"

# Ergebnis prüfen, damit keine halbe Datei ausgeliefert wird
for datei in "$ziel/gaeb/index.html" "$ziel/gaeb-eine-datei/index.html" "$ziel/GAEB-Viewer.html"; do
  grep -q 'data-start="leer"' "$datei" || { echo "FEHLER: Startattribut fehlt in $datei" >&2; exit 1; }
done
for datei in "$ziel/gaeb-eine-datei/index.html" "$ziel/GAEB-Viewer.html"; do
  grep -q '<script src=' "$datei" && { echo "FEHLER: $datei lädt noch eine externe Datei" >&2; exit 1; }
  grep -q 'GAEB.readFile' "$datei" || { echo "FEHLER: Parser fehlt in $datei" >&2; exit 1; }
done

echo "Fertig:"
find "$ziel" -type f -exec du -h {} + | sort -k2
