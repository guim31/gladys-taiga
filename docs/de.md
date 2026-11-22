# Taiga

Hol deine [Taiga](https://taiga.io)-Projekte in Gladys: die offenen User
Stories, Aufgaben und Tickets, die überfälligen Elemente und den Stand des
laufenden Sprints (Fortschritt und verbleibende Tage). Eine Szene reagiert,
wenn ein Element überfällig wird oder ein neues Ticket eröffnet wird, eine
andere eröffnet ein Ticket oder fügt dem Backlog eine User Story hinzu, und
ein Widget zeigt alles auf dem Dashboard.

> **Feedback willkommen.** Diese Integration wurde gegen einen echten
> Taiga-Server getestet (Docker-Image `taigaio/taiga-back` vom 22. November
> 2026, mit PostgreSQL 16 und RabbitMQ 4), noch nicht im Alltag und nicht
> gegen taiga.io. Wenn etwas nicht wie beschrieben funktioniert, sag es im
> [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-taiga/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Ein **selbst gehostetes Taiga**, von Gladys aus erreichbar, oder ein Konto
  bei **taiga.io** (das Cloud-Angebot nutzt dieselbe API; nicht getestet).
- **Benutzername** (oder E-Mail) und **Passwort** eines Taiga-Benutzers, der
  Mitglied der zu verfolgenden Projekte ist. Es muss ein **Passwortkonto**
  sein: Ein Benutzer, der sich über GitHub, GitLab oder LDAP anmeldet, kann
  sich nicht aus Gladys anmelden. Ein eigener Benutzer, als Mitglied der
  Projekte hinzugefügt, ist eine gute Idee.

Die Integration sieht die Projekte, in denen dieser Benutzer Mitglied ist, und
handelt **als dieser Benutzer**: Aus Gladys erstellte Tickets und User Stories
zeigen ihn als Autor. Ein Mitglied, dessen Rolle keine Tickets oder User
Stories hinzufügen darf, kann ein Projekt verfolgen, aber nichts darin
erstellen.

## Einrichtung

1. In Gladys: **Integrationen** → **Taiga** installieren.
2. Im Bildschirm **Konfiguration** ausfüllen:
   - **Adresse**: die Adresse von Taiga wie im Browser, zum Beispiel
     `http://192.168.1.20:9000`, oder `https://taiga.example.org` hinter einem
     Reverse Proxy (ein Pfadpräfix wie `/taiga` bleibt erhalten). Für
     taiga.io `https://tree.taiga.io`;
   - **Benutzername oder E-Mail** und **Passwort**.
3. Optionen:
   - **Verfolgte Projekte**: Namen oder Slugs (der Name in der Adresse des
     Projekts) durch Kommas getrennt. Leer: alle Projekte des Benutzers,
     höchstens 20;
   - **Selbstsignierte Zertifikate akzeptieren**: für eine `https://`-Adresse
     mit selbstsigniertem Zertifikat, nur für deinen eigenen Server;
   - **Aktualisierungsintervall**: 1 bis 10 Minuten (standardmäßig 5).
     Mitternacht, wenn Elemente überfällig werden, wird immer pünktlich
     verfolgt;
   - **Sprache der Funktionsnamen**: die Namen der Funktionen beim
     Hinzufügen eines Geräts (standardmäßig Französisch).
4. Speichern, dann **Verbindung testen**: Das liest Taiga und nennt die Zahl
   der offenen und überfälligen Elemente und der verfolgten Projekte.
5. Im Tab **Entdecken** die gewünschten Geräte hinzufügen.

## Geräte

**Taiga _Adresse_**, die Instanz, mit einer Funktion: `Erreichbar` (1, wenn
Taiga antwortet, sonst 0).

**Taiga _Projekt_** für jedes verfolgte Projekt:

| Funktion                   | Was sie angibt                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `Offene User Stories`      | die User Stories, deren Status nicht geschlossen ist                                |
| `Offene Aufgaben`          | die Aufgaben, deren Status nicht geschlossen ist                                    |
| `Offene Tickets`           | die Tickets, deren Status nicht geschlossen ist (0, wenn das Modul Tickets aus ist) |
| `Überfällige Elemente`     | offene User Stories, Aufgaben und Tickets mit überschrittener Fälligkeit            |
| `Sprint-Fortschritt`       | % des laufenden Sprints: geschlossene Punkte, sonst geschlossene User Stories       |
| `Verbleibende Sprint-Tage` | Tage bis zum Enddatum des Sprints (0 an seinem letzten Tag)                         |
| `Aktueller Sprint`         | der Name des laufenden Sprints; `Keiner`, wenn es keinen gibt                       |

Ein Element ist **überfällig**, sobald sein Fälligkeitstag in der Zeitzone von
Gladys zu Ende ist und sein Status nicht geschlossen ist. Der **laufende
Sprint** ist der offene Sprint mit dem spätesten bereits erreichten
Startdatum. Antwortet Taiga nicht, behalten die Zähler ihren letzten Wert und
`Erreichbar` geht auf 0.

## Dashboard

Das Widget **Taiga-Projekte** zeigt drei Kacheln (überfällig, heute fällig,
offene Tickets) und eine Liste von höchstens 8 Zeilen: die laufenden Sprints
mit Fortschritt und verbleibenden Tagen, dann die überfälligen oder heute
fälligen Elemente mit Art, Nummer und Projekt. Wähle in den
Widget-Einstellungen ein Projektgerät, um nur dieses Projekt zu sehen; leer
für alle verfolgten Projekte. Wähle **Liste der überfälligen Elemente
anzeigen** ab, um nur die Zahlen und die Sprints zu behalten. Die Projekte
heißen wie in Gladys, sobald ihr Gerät hinzugefügt ist.

Die Zähler können auch wie jede Gerätefunktion aufs Dashboard.

## Szenen

### Auslöser

- **Taiga-Element überfällig**: Um Mitternacht ist eine an diesem Tag
  fällige offene User Story, Aufgabe oder ein Ticket nicht geschlossen.
  Einmal pro Element und Fälligkeit. Filter: das Projekt (ein Projektgerät),
  die Art (User Story, Aufgabe, Ticket).
- **Neues Taiga-Ticket**: In einem verfolgten Projekt wurde ein Ticket
  erstellt. Filter: das Projekt.

An die Aktionen weitergegebene Informationen: Titel, Nummer (`#`), Art,
Projekt, Status, Fälligkeit und der Link zum Element in Taiga.

Ein neues Ticket wird beim nächsten Lesen gesehen: innerhalb des
Aktualisierungsintervalls. Ein gerade zu den verfolgten hinzugefügtes Projekt
bringt kein „neues Ticket“, und ein zwischen zwei Lesevorgängen erstelltes und
geschlossenes Ticket wird nicht gesehen, und ein wieder geöffnetes Ticket, das älter als eine Stunde ist, ist nicht neu. War die Integration länger als eine Stunde gestoppt, werden nur die Tickets der letzten Stunde gemeldet. Eine Fälligkeit auf einen schon
vergangenen Tag löst nichts aus. Ein Neustart löst nichts doppelt aus; ein
Element, das weniger als eine Stunde vor dem Neustart überfällig wurde, löst
dann aus.

### Aktionen

- **Taiga-Ticket erstellen**: ein Titel, das Projekt per Name oder Slug
  (leer: das erste verfolgte Projekt), eine optionale Beschreibung. Das
  Ticket erhält Standardtyp, -priorität und -schweregrad des Projekts.
- **Taiga-User-Story erstellen**: dieselben Felder; die User Story landet im
  Backlog des Projekts.

Ergebnisse beider: Nummer (`#`), ID, Titel, Projekt und Link. Ein Fehlschlag
(Projekt nicht gefunden, Modul Tickets aus, fehlende Berechtigung, Taiga
antwortet nicht) wird als Fehler angezeigt. Die Felder akzeptieren
Szenenvariablen: `{{triggerEvent.data.item}}`.

### Szenenideen

- **Taiga-Element überfällig**: Titel und Link per Telegram schicken.
- **Neues Taiga-Ticket** im Projekt `Website`: eine Lampe im Büro blinken
  lassen.
- Meldet die Waschmaschine einen Fehler: **Taiga-Ticket erstellen**
  `Waschmaschine: Fehler` im Projekt `Haushalt`.
- Ein Knopf an der Tür startet **Taiga-User-Story erstellen** `Tor reparieren`.

## Fehlerbehebung

- **„Taiga antwortet nicht“**: Prüfe Adresse und Port vom Gladys-Rechner aus
  (die Adresse öffnet Taiga im Browser).
- **„Benutzername oder Passwort abgelehnt“**: Das Passwort hat sich geändert,
  oder der Benutzer meldet sich über GitHub, GitLab oder LDAP an: Nimm einen
  Benutzer mit Passwortkonto.
- **„Keine Taiga-API unter dieser Adresse“**: Die Adresse antwortet, aber
  nicht mit der Taiga-API (`/api/v1`): Prüfe Port und Pfadpräfix.
- **„Die Adresse leitet um“**: Gib die `https://`-Adresse ein.
- **„Dieser Benutzer darf das im Projekt nicht“**: Die Rolle des Benutzers im
  Projekt darf keine Tickets oder User Stories hinzufügen.
- **Ein Projekt fehlt**: Der Benutzer muss Mitglied sein; ein in **Verfolgte
  Projekte** eingegebener Name ohne passendes Projekt wird ignoriert, und
  **Verbindung testen** nennt ihn. Über 20 Projekte: Liste die zu
  verfolgenden auf.
- Nach einem abgelehnten Passwort wird Taiga höchstens alle 15 Minuten erneut versucht, um das Konto nicht zu sperren: Korrigiere die Konfiguration, um sofort neu zu versuchen.
- Protokolle: `LOG_LEVEL=debug` am Container zeigt jeden Lesevorgang.

## Grenzen

- Taiga wird alle 1 bis 10 Minuten gelesen (und um Mitternacht): Eine
  Änderung in Taiga kommt innerhalb dieser Zeit in Gladys an. Die Webhooks
  von Taiga werden nicht genutzt.
- Bei jedem Lesen: die Projektliste, dann für jedes verfolgte Projekt seine
  offenen User Stories, Aufgaben, Tickets und Sprints (vier Anfragen, plus die Projektliste). Bei
  taiga.io ein langes Intervall wählen: Der Dienst begrenzt die Zahl der
  Anfragen.
- Die Anmeldung bleibt im Speicher und wird beim Ablauf (nach 24 Stunden auf
  einem Standardserver) mit dem Refresh-Token von Taiga erneuert; das
  Passwort wird nur erneut gesendet, wenn Taiga beides ablehnt.
- Die Integration erstellt Tickets und User Stories; sie bearbeitet,
  schließt, weist zu oder löscht nichts und liest weder Epics noch
  Wiki-Seiten noch Kommentare.
- Gladys speichert keine Taiga-Daten außer `/data/taiga-state.json` (Zeit
  des letzten Lesens und letzte gesehene Ticketnummer pro Projekt, damit kein
  Ereignis doppelt ausgelöst wird).
- Nicht mit Taiga oder Kaleidos verbunden.
