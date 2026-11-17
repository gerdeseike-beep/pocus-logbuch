# POCUS Logbuch

Web-App zum Führen der beiden SGUM-Logbücher für den Fähigkeitsausweis POCUS, Komponente 1 Basis-Notfall-Sonographie.

**Funktionen**

- Erfassen eigenständiger und supervidierter Untersuchungen (parallel, Ziel je 100).
- Übersicht mit Fortschritt je Logbuch und Anzahl pro Untersuchungstyp.
- Import von Einträgen aus JSON (Backup oder Importdatei), Duplikate werden übersprungen.
- Supervisoren werden gespeichert und als Auswahl angeboten.
- Export als PDF oder DOCX im Layout der SGUM-Vorlagen. Supervidierte Exporte immer pro Supervisor, zur Unterschrift.
- Daten in Firebase (Firestore), Login mit Google, Hosting auf Vercel.


## Einrichtung (einmalig, ca. 15 Minuten)

### 1. Firebase-Projekt anlegen

1. https://console.firebase.google.com öffnen und **Projekt hinzufügen** wählen. Name z.B. `pocus-logbuch`. Google Analytics kann deaktiviert werden.
2. Links **Build > Authentication > Jetzt starten**. Unter **Sign-in method** den Anbieter **Google** aktivieren und speichern.
3. Links **Build > Firestore Database > Datenbank erstellen**. Standort **eur3 (europe-west)** oder **europe-west6 (Zürich)** wählen, Modus **Produktion**.
4. In Firestore den Reiter **Regeln** öffnen, den Inhalt durch die Datei [`firestore.rules`](firestore.rules) aus diesem Repo ersetzen und **Veröffentlichen**.
5. Zahnrad **Projekteinstellungen > Allgemein**, unten bei **Meine Apps** auf das Web-Symbol `</>` klicken. App-Name `pocus-logbuch`, Hosting **nicht** ankreuzen, **App registrieren**.
6. Die angezeigten Werte (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) notieren. Sie werden in Schritt 2 gebraucht.

### 2. Vercel verbinden

1. https://vercel.com öffnen und mit GitHub anmelden.
2. **Add New > Project**, das Repository `pocus-logbuch` importieren. Framework wird als **Vite** erkannt.
3. Vor dem Deploy unter **Environment Variables** sechs Einträge anlegen:

   | Name | Wert aus Firebase |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | apiKey |
   | `VITE_FIREBASE_AUTH_DOMAIN` | authDomain |
   | `VITE_FIREBASE_PROJECT_ID` | projectId |
   | `VITE_FIREBASE_STORAGE_BUCKET` | storageBucket |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
   | `VITE_FIREBASE_APP_ID` | appId |

4. **Deploy** klicken. Danach die Adresse notieren, z.B. `pocus-logbuch.vercel.app`.

### 3. Vercel-Adresse in Firebase freigeben

1. Firebase **Authentication > Einstellungen > Autorisierte Domains > Domain hinzufügen**.
2. Die Vercel-Adresse ohne `https://` eintragen, z.B. `pocus-logbuch.vercel.app`.

Fertig. Seite öffnen, mit Google anmelden, unter **Einstellungen** Name und Vorname eintragen.

Tipp: Auf dem Handy die Seite im Browser über **Teilen > Zum Home-Bildschirm** als App ablegen.


## Bedienung

- **Erfassen:** Logbuch wählen, Untersuchungstyp(en) antippen, Befund eintragen, bei supervidierten Untersuchungen den Supervisor wählen oder neu anlegen. Logbuch und Supervisor bleiben für den nächsten Eintrag vorausgewählt.
- **Übersicht:** Stand je Logbuch und pro Untersuchungstyp. Eine Untersuchung kann mehrere Typen abdecken (z.B. eFAST) und zählt dann bei jedem Typ.
- **Export:** Eigenständiges Logbuch gesamt als PDF oder DOCX. Supervidiertes Logbuch pro Supervisor als PDF oder DOCX. Die Nummer (Nr.) entspricht der chronologischen Reihenfolge im Gesamtlogbuch.
- **Unterschriften:** Sammelbestätigung (ein Kreuz im PDF setzt das Kreuz in allen Zeilen), Signaturfelder für Adobe Acrobat (digitale ID) oder Unterschrift direkt in der App (Finger/Stift).
- **Einstellungen:** Name, Komponente, Ziele, Supervisoren umbenennen, JSON-Backup und Import.

Hinweis: Das SIWF (Anhang 2, Kap. 1.2.1) fordert 200 Sonographien, wovon die ersten 100 unter Supervision.


## Lokale Entwicklung

```bash
cp .env.example .env.local   # Firebase-Werte eintragen
npm install
npm run dev
```

Test mit Firebase-Emulatoren: `firebase emulators:start --only auth,firestore` und App mit `VITE_USE_EMULATOR=1` starten (zeigt einen Test-Login).

Die Exportvorlagen in `public/templates/` sind die originalen SGUM-Vorlagen mit Platzhaltern. Sie werden mit `tools/prepare_templates.py` aus den Original-DOCX erzeugt.
