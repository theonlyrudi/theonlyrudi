#!/usr/bin/env bash
# Kopiert beispiel/Musterprojekt.x83 in den eingebetteten Startdatensatz von
# index.html. Nötig, weil index.html ohne Webserver (Doppelklick, file://)
# funktionieren soll und deshalb keine Datei nachladen kann.
set -euo pipefail
cd "$(dirname "$0")/.."

awk '
  /<script type="text\/plain" id="beispiel-lv">/ { print; system("cat beispiel/Musterprojekt.x83"); skip = 1; next }
  skip && /^<\/script>$/                         { skip = 0 }
  !skip                                          { print }
' index.html > index.html.neu

mv index.html.neu index.html
echo "Beispiel-LV in index.html aktualisiert."
