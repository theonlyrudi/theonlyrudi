# GAEB-X83-Viewer

Ein Leistungsverzeichnis im GAEB-Format im Browser lesen – ohne Installation,
ohne Server, ohne dass die Datei den eigenen Rechner verlässt.

![Positionsliste mit Langtext-Spalte](beispiel/ansicht.png)

## Starten

`index.html` mit einem Doppelklick im Browser öffnen. Das war alles – die Seite
läuft vollständig lokal (`file://`), es wird nichts hochgeladen.

Eine GAEB-Datei lädt man über **Datei öffnen** oder indem man sie irgendwo auf
das Fenster zieht. Beim Start ist ein Beispiel-Leistungsverzeichnis geladen,
damit sofort sichtbar ist, was das Programm kann.

## Was gelesen wird

* **GAEB DA XML 3.x** in allen Austauschphasen – X81 bis X89. Der Schwerpunkt
  liegt auf **X83 (Angebotsaufforderung)**; X84/X86 werden mit Einheits- und
  Gesamtpreisen samt Angebotssumme angezeigt.
* Dateien mit UTF-8 oder ISO-8859-1, mit und ohne Namensraum-Präfixe.
* GAEB-Dateien, die in einem ZIP-Archiv stecken, werden direkt entpackt.
* **Nicht** unterstützt: die alten Formate GAEB 90 (`.d83`) und GAEB 2000
  (`.p83`) – das sind keine XML-Dateien und bräuchten einen eigenen Parser.

## Was angezeigt wird

* Projekt-, Vergabe- und Auftraggeberdaten als Deckblatt
* die vollständige LV-Hierarchie (Lose, Titel, Untertitel) zum Auf- und Zuklappen
* Ordnungszahl, Kurztext, Menge, Einheit und – falls vorhanden – Preise
* der Langtext jeder Position mit Fett-/Kursiv-Auszeichnung und hervorgehobenen
  **Bietertextergänzungen**
* Positionsarten als Kennzeichnung: Bedarfsposition, Grund- und
  Alternativposition, Pauschalposition, Stundenlohnarbeit, Wiederholungsposition
* Hinweis- und Vorbemerkungstexte an ihrer Stelle im LV

## Bedienung

| Aktion | Weg |
| --- | --- |
| Suchen | Suchfeld oder Taste `/` – durchsucht OZ, Kurz- und Langtext |
| Position öffnen | Zeile anklicken oder mit `↑`/`↓` und `Enter` ansteuern |
| Gliederung auf/zu | Pfeil-Symbol anklicken oder `→`/`←` |
| Detailansicht schließen | `Esc` |
| Nach Excel | **CSV** – Semikolon-getrennt, zusätzlich in der Zwischenablage |
| Papierfassung | **Drucken** – druckt die sichtbare Gliederung ohne Bedienelemente |

## Dateien

| Datei | Inhalt |
| --- | --- |
| `index.html` | Oberfläche, Gestaltung und Bedienlogik |
| `gaeb.js` | Parser für GAEB DA XML, ZIP-Entpackung, Encoding-Erkennung |
| `beispiel/Musterprojekt.x83` | Beispiel-LV (Straßenbau), auch in `index.html` eingebettet |
| `tools/embed-beispiel.sh` | überträgt die Beispieldatei in den eingebetteten Startdatensatz |

Das Beispiel steckt zusätzlich direkt in `index.html`, weil ein Browser unter
`file://` keine Nachbardatei nachladen darf. Nach einer Änderung an
`beispiel/Musterprojekt.x83` gleicht `tools/embed-beispiel.sh` beides wieder an.

## Grenzen

Der Viewer zeigt an, er rechnet nicht: Mengenermittlungen (REB-Ansätze),
Zuschlagskalkulationen und Preisanteile (`UPComps`) bleiben unberücksichtigt.
Preise werden nur dargestellt, wenn sie in der Datei stehen.
