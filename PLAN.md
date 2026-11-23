# RPI-Plan: alle Dateien im Reviewer kommentieren

Status: Entwurf zum Review vor der Implementierung.

## Research

Reviewer berechnet die Änderungen bereits für den aktiven Git-Vergleich.
In `mods/reviewer/main.js` begrenzt `refresh()` die Änderungsliste auf 1.000 Einträge. `load()` kann nur Dateien aus dieser Liste öffnen.
Kommentare speichern bereits Pfad, Zeilenbereich und Codeauszug. Entwürfe gehören zum jeweiligen Vergleich. Ein Review kann Kommentare aus mehreren Dateien bündeln.

## Geplantes Verhalten

- `Changes` und `All files` folgen dem fokussierten Herdr-Terminal auch bei geöffnetem Panel. Sein Arbeitsverzeichnis bestimmt den Worktree. Auch aus einem Unterordner zeigt der Baum den gesamten Worktree.
- Beim ersten Öffnen eines Worktrees startet Reviewer in `Changes` mit `Uncommitted`. Eine ausdrücklich gewählte Vergleichseinstellung gilt pro Maschine und Worktree, gespeicherte Kommentarentwürfe zusätzlich pro Vergleich.
- `All files` öffnet den aufklappbaren Dateibaum für den aktiven Vergleich. Das Umschalten der Ansicht behält den Vergleich und seine Kommentarentwürfe bei.
- Bei Vergleichen mit dem Arbeitsverzeichnis bietet `All files` den Schalter `.gitignored-files` (standardmäßig aus). Ist er aus, blendet der Baum die von Git ignorierten, unversionierten Dateien aus. Ist er an, sind auch diese Dateien sichtbar und kommentierbar. Die Wahl gilt pro Maschine und Worktree. Ein historischer Commit zeigt ausschließlich seinen gespeicherten Dateibaum.
- Geänderte Dateien erhalten Farbe und Statuskürzel. Eine Änderung markiert auch alle übergeordneten Ordner, sichtbar bis hinauf zum eingeklappten Ordner auf der obersten Ebene.
- Geänderte Dateien öffnen ihren Diff. Unveränderte Textdateien öffnen ihren Inhalt mit Syntaxfarben und Zeilennummern.
- Textdateien lassen sich zeilenweise, als Bereich oder als ganze Datei kommentieren. Bei Binärdateien ist ein Dateikommentar möglich.
- Kommentare aus beiden Ansichten werden gemeinsam über den vorhandenen Sendedialog an den Agenten geschickt.

## Umsetzung

1. In `refresh()` den Standardvergleich auf `Uncommitted` setzen. Gespeicherte Auswahlen und explizite Commit-Anfragen weiterhin berücksichtigen.
2. Beim Öffnen von `All files` die Repository-Pfade ermitteln. Für Vergleiche mit dem Arbeitsverzeichnis liefert `git ls-files --cached --others --exclude-standard -z` die versionierten und neuen, nicht ignorierten Dateien. Für einen einzelnen Commit liefert `git ls-tree -r --name-only -z <sha>` dessen Dateipfade.
   Bei aktivem Schalter zusätzlich ignorierte, unversionierte Pfade mit `git ls-files --others --ignored --exclude-standard -z` ermitteln. Git selbst wertet Muster, Verzeichnisregeln, verschachtelte `.gitignore`-Dateien und Ausnahmen mit `!` aus. Durch `--exclude-standard` berücksichtigt Git auch lokale und globale Git-Ausschlüsse. Nur der Git-Vergleich liefert Änderungsmarkierungen und Zähler.
3. Die Pfade mit der vollständigen Änderungsmenge des gewählten Vergleichs zusammenführen. So bleiben auch gelöschte Pfade zugänglich. Ordnerstatus vor der Begrenzung der bisherigen Änderungsliste ableiten.
4. Den Baum aus diesen Pfaden aufbauen. Dateiinhalt erst beim Öffnen lesen. Bei einem Vergleich mit dem Arbeitsverzeichnis die lokale oder entfernte Arbeitskopie lesen, bei einem einzelnen Commit den Blob dieses Commits. Beim schnellen Wechsel von Datei, Repository oder Vergleich veraltete Ladeergebnisse verwerfen.
5. Normale Textzeilen mit ihren tatsächlichen Zeilennummern an die vorhandene Kommentaransicht übergeben. Gespeicherte Auszüge für den Versand verwenden und bei einem historischen Review die vollständige Commit-ID in die Nachricht aufnehmen.

## Akzeptanzfälle

- **Sauberes Repository:** Beim ersten Öffnen ist `Changes · Uncommitted` leer. Über `All files` lässt sich eine unveränderte Datei öffnen und ein Bereich kommentieren.
- **Gemischtes Review:** Nur `src/a.js` ist geändert. Der geschlossene Ordner `src` ist markiert. Ein Diff-Kommentar zu `a.js` und ein Kommentar zu zwei Zeilen der unveränderten `src/b.js` erscheinen mit den richtigen Pfaden, Zeilen und Auszügen in einer Agentennachricht.
- **Wechsel des Vergleichs:** Eine bereits auf dem Feature-Branch commitete Änderung ist bei sauberem Arbeitsverzeichnis unter `Uncommitted` unmarkiert. Unter `vs main` sind Datei und Ordner markiert. Beim Zurückwechseln sind die Entwürfe des ursprünglichen Vergleichs wieder sichtbar.
- **Historischer Stand:** Eine inzwischen verschobene oder geänderte Datei erscheint beim ausgewählten Commit mit damaligem Pfad, Inhalt und Zeilennummern. Die Agentennachricht enthält die vollständige Commit-ID.
- **Dateiauswahl:** Eine neue, nicht ignorierte Datei ist sichtbar. Ein im Vergleich gelöschter Pfad öffnet seinen Lösch-Diff. Eine Binärdatei lässt sich als ganze Datei kommentieren.
- **Ignore-Regeln:** Die oberste `.gitignore` enthält `*.log`. In `tests/.gitignore` steht `!expected.log`. Von den beiden unversionierten Dateien ist `tests/expected.log` sofort sichtbar, `tests/debug.log` erst mit aktivem Schalter `.gitignored-files`. Ich kann eine Zeile in `debug.log` kommentieren und den Entwurf auch nach dem Ausblenden versenden. Das Einblenden allein erzeugt keine Änderungsmarkierung an Datei oder Ordner. Eine bereits versionierte Logdatei bleibt mit beiden Einstellungen sichtbar.
- **Großes Repository:** Auch eine Änderung außerhalb der ersten 1.000 geänderten Pfade ist im Baum erreichbar und markiert ihre übergeordneten Ordner.
- **Worktree-Wechsel:** In `All files` kommentiere ich eine Datei im Worktree A. Fokussiere ich ein Terminal im Worktree B, zeigt das offene Panel dessen Dateien und Änderungsmarkierungen. Beim Zurückwechseln zu A sehe ich wieder den dort gewählten Vergleich und meinen gespeicherten Kommentarentwurf.
- **Rückkehr in einen Space:** Ich öffne Reviewer in Space A, wechsle nach B und zurück nach A. Reviewer ist in A wieder sichtbar. Wiederhole ich den Wechsel mit einem von mir in A geschlossenen Panel, bleibt es bei der Rückkehr geschlossen.

## Offener Befund zum Space-Wechsel

Beobachtet wurde, dass ein in A geöffnetes Panel nach dem Wechsel A → B → A geschlossen ist. Der Fokuswechsel aktualisiert im Reviewer die Dateiansicht. Ein expliziter Aufruf von `layout.hide` findet sich im Toggle. Zur Eingrenzung denselben Wechsel mit dem eingebauten Changes-Panel und mit Reviewer prüfen und vergleichen, ob Herdr den Panel-Container ausblendet oder einen anderen Block auswählt.

## Ordner außerhalb von Git

Ein Unterordner eines Worktrees verwendet wie bisher dessen Wurzel. Liegt das fokussierte Arbeitsverzeichnis außerhalb jedes Worktrees, öffnet Reviewer direkt `All files` mit diesem Verzeichnis als Wurzel. Unterverzeichnisse werden beim Aufklappen auf der Maschine des fokussierten Terminals gelesen.

Zeilen-, Bereichs- und Dateikommentare verwenden den gleichen Sendedialog. Entwürfe gehören zur Maschine und zum geöffneten Ordner. Vergleichsauswahl, Änderungsmarkierungen, Commit-Aktion und der Git-Ignore-Schalter sind auf Worktrees beschränkt. Technische Fehler beim Git-Aufruf sollen als Fehler erkennbar bleiben.

Akzeptanzfall: Einen Ordner ohne Repository fokussieren, eine Textdatei öffnen und zwei Zeilen kommentieren. In einen Git-Worktree wechseln und wieder zurück. Der Ordner zeigt den Entwurf, und die Review-Nachricht enthält Pfad, Zeilennummern und Auszug.

## Datei selbst im Editor bearbeiten

Für eine vorhandene Textdatei im Arbeitsverzeichnis bietet Reviewer in beiden Ansichten `Open in editor` an. Die Aktion öffnet die Originaldatei. Das gilt auch für Ordner ohne Git. Nach dem Speichern aktualisiert Reviewer Inhalt und gegebenenfalls Diff. Bereits gespeicherte Kommentarentwürfe behalten ihren zitierten Auszug.

Der Editor wird über die Umgebung des Editorstarts auf der Maschine der Datei gewählt. Reviewer verwendet zuerst `VISUAL`, dann `EDITOR`. Beispiel für eine POSIX-Shell: `export EDITOR=vi`. Die Variable muss für den startenden Prozess sichtbar sein. Die Auswahl wird ausschließlich in der Umgebung gepflegt.

Sind beide Variablen ungesetzt, verwendet Reviewer unter Windows `edit.exe`, unter macOS und Linux das erste verfügbare Programm aus `nano` und `vi`. Der Aufruf erfolgt in einem interaktiven Herdr-Terminal. Der Dateipfad wird als einzelnes Argument übergeben. Scheitert der Start, bleibt die Fehlermeldung im Terminal sichtbar. Eine ausdrücklich gesetzte Auswahl gilt auch bei einem Startfehler.

Bei einem historischen Commit oder einer gelöschten Datei bleibt die Ansicht zum Lesen und Kommentieren verfügbar. Die Bearbeitungsaktion erscheint nur für die angezeigte Arbeitskopie.

Akzeptanzfall: Eine Datei mit Leerzeichen im Namen aus einem Git-Worktree und anschließend aus einem gewöhnlichen Ordner öffnen, im konfigurierten Editor ändern und speichern. Reviewer zeigt jeweils den neuen Inhalt und im Worktree den aktualisierten Diff. Ohne eigene Einstellung öffnet sich der für das Betriebssystem vorgesehene Editor.

## Nächste Feature-Idee

Einen Pull Request als Ganzes öffnen und alle Änderungen zwischen seiner Basis und seinem Head gemeinsam reviewen.
