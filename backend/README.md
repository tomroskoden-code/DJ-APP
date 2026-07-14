# BeatSpot-Backend

Lokales Node.js/Express-Backend mit SQLite für den BeatSpot-Prototyp
(`dj-app-prototype.html` im Projektstammverzeichnis). Die Datenbank ist
dateibasiert (`data/beatspot.db`) – es wird kein externer Datenbankserver
benötigt.

## Schnellstart

```bash
cd backend
npm install        # Abhängigkeiten installieren
npm run seed       # Mock-Daten aus dj-app-prototype.html in die DB übernehmen
npm start          # Server starten (http://localhost:3000)
```

Für die Entwicklung mit automatischem Neustart: `npm run dev`

Konfiguration über Umgebungsvariablen:

| Variable  | Standard              | Bedeutung                          |
| --------- | --------------------- | ---------------------------------- |
| `PORT`    | `3000`                | Port des HTTP-Servers              |
| `DB_FILE` | `data/beatspot.db`    | Pfad der SQLite-Datei (`:memory:` möglich) |

## Seed-Script

`npm run seed` liest die **aktuellen** Mock-Daten direkt aus dem
`<script>`-Block von `dj-app-prototype.html` (Abschnitt „MOCK-DATEN") und
befüllt damit die Datenbank. Die Daten sind also nirgendwo doppelt gepflegt –
ändert sich der Prototyp, genügt ein erneuter Seed-Lauf.

**Achtung:** Der Seed setzt die Datenbank vollständig zurück.

Da der Prototyp keine eigene Nutzerliste hat, wird die Tabelle `users` aus
den Personennamen der Mock-Daten aufgebaut: die Demo-Persona „Du", die
Anfragesteller der Buchungen und die Verfasser der Bewertungen.

## Datenmodell

| Tabelle        | Quelle im Prototyp        | Inhalt                                            |
| -------------- | ------------------------- | ------------------------------------------------- |
| `djs`          | `const djs`               | DJ-Profile; `genres`, `blockedDates`, `mixes` als JSON-Spalten |
| `users`        | Personennamen der Mocks   | Nutzer:innen (Partygänger / Veranstalter)         |
| `bookings`     | `let bookingRequests`     | Buchungsanfragen; Status `offen`/`bestaetigt`/`abgelehnt` |
| `messages`     | `let chatMessages`        | Chat-Nachrichten je Buchung (Rolle `user`/`dj`)   |
| `ratings`      | `djs[].reviews`           | Bewertungen; Durchschnitt wird in `djs.rating` gecacht |
| `events`       | `let events`              | Events der Party-Karte (inkl. `description`/`spontaneous`) |
| `event_lineup` | `events[].lineup`         | Verknüpfungstabelle Event ↔ DJ                    |
| `posts`        | `let feedPosts`           | Feed-Beiträge der DJs (inkl. Like-Zustand der Demo-Persona) |

**Hinweis:** Nach einem Update des Schemas (z.B. neue Tabelle `posts`,
neue Event-Spalten) einmal `npm run seed` ausführen – das Script setzt die
Datenbank komplett neu auf.

Das vollständige Schema liegt in [`src/db/schema.sql`](src/db/schema.sql).

## API-Endpunkte

Alle Antworten sind JSON; Feldnamen entsprechen den Mock-Strukturen des
Prototyps (camelCase: `djId`, `eventType`, `blockedDates`, …), damit die
spätere Anbindung des Frontends möglichst reibungslos ist.

### DJs

| Methode & Pfad          | Beschreibung |
| ----------------------- | ------------ |
| `GET /api/djs`          | DJs suchen. Filter: `q` (Name), `city`, `genre` (mehrfach möglich), `maxPrice`, `minRating`, `available` |
| `GET /api/djs/:id`      | DJ-Detail inkl. Bewertungen (`reviews`) |
| `POST /api/djs`         | DJ anlegen (`name`, `genre`, `city`, `price` erforderlich) |
| `PATCH /api/djs/:id`    | DJ teilweise aktualisieren |
| `DELETE /api/djs/:id`   | DJ löschen (Buchungen/Bewertungen/Lineups fallen mit) |

```bash
curl "http://localhost:3000/api/djs?city=Berlin&genre=Techno&maxPrice=130&available=true"
```

### Buchungen

| Methode & Pfad              | Beschreibung |
| --------------------------- | ------------ |
| `GET /api/bookings`         | Buchungen abrufen. Filter: `djId`, `userId`, `status` |
| `GET /api/bookings/:id`     | Einzelne Buchung |
| `POST /api/bookings`        | Buchungsanfrage erstellen |
| `PATCH /api/bookings/:id`   | Status ändern (`{"status": "bestaetigt"}`) |
| `DELETE /api/bookings/:id`  | Buchung löschen |

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"djId": 1, "date": "2026-08-15", "time": "20:00", "duration": 4,
       "eventType": "Geburtstag", "genre": "House",
       "location": "Privatwohnung, Berlin", "message": "Bitte viel House!",
       "requesterName": "Du"}'
```

Der Anfragesteller wird per `userId` referenziert **oder** per
`requesterName` (Nutzer:in wird bei Bedarf automatisch angelegt).

### Nachrichten (Chat je Buchung)

| Methode & Pfad                            | Beschreibung |
| ----------------------------------------- | ------------ |
| `GET /api/bookings/:bookingId/messages`   | Chatverlauf abrufen |
| `POST /api/bookings/:bookingId/messages`  | Nachricht senden (`{"sender": "user", "text": "…"}`) |
| `DELETE /api/messages/:id`                | Nachricht löschen |

### Bewertungen

| Methode & Pfad                  | Beschreibung |
| ------------------------------- | ------------ |
| `GET /api/djs/:djId/ratings`    | Bewertungen eines DJs |
| `POST /api/djs/:djId/ratings`   | Bewertung abgeben (`stars` 1–5, optional `comment`; Verfasser per `userId` oder `authorName`) |
| `GET /api/ratings/:id`          | Einzelne Bewertung |
| `DELETE /api/ratings/:id`       | Bewertung löschen |

Nach jedem Anlegen/Löschen wird `djs.rating` neu berechnet (auf eine
Nachkommastelle gerundet – wie `recalcDjRating()` im Prototyp).

### Events

| Methode & Pfad            | Beschreibung |
| ------------------------- | ------------ |
| `GET /api/events`         | Events abrufen. Filter: `city` |
| `GET /api/events/:id`     | Einzelnes Event |
| `POST /api/events`        | Event anlegen; `lineup` als Array aus DJ-Namen oder DJ-IDs. Optional: `description`, `spontaneous`; `city` darf entfallen (spontane Events tragen die Stadt im Freitext-Ort) |
| `PATCH /api/events/:id`   | Event aktualisieren; `lineup` ersetzt das bisherige Lineup |
| `DELETE /api/events/:id`  | Event löschen |

### Feed-Beiträge

| Methode & Pfad           | Beschreibung |
| ------------------------ | ------------ |
| `GET /api/posts`         | Feed-Beiträge abrufen (neueste zuerst). Filter: `djId` |
| `GET /api/posts/:id`     | Einzelner Beitrag |
| `POST /api/posts`        | Beitrag veröffentlichen (`djId`, `text`) |
| `PATCH /api/posts/:id`   | Beitrag aktualisieren; `{"liked": true}` passt die Like-Anzahl automatisch an |
| `DELETE /api/posts/:id`  | Beitrag löschen |

### Nutzer:innen

| Methode & Pfad           | Beschreibung |
| ------------------------ | ------------ |
| `GET /api/users`         | Alle Nutzer:innen |
| `GET /api/users/:id`     | Einzelne:r Nutzer:in |
| `POST /api/users`        | Nutzer:in anlegen (`name` erforderlich, muss eindeutig sein) |
| `PATCH /api/users/:id`   | Nutzer:in aktualisieren |
| `DELETE /api/users/:id`  | Nutzer:in löschen |

### Sonstiges

| Methode & Pfad      | Beschreibung |
| ------------------- | ------------ |
| `GET /api/health`   | Health-Check (`{"status": "ok"}`) |

## Architektur & PostgreSQL-Migration

```
backend/
├── server.js                  # Server-Start (Port, Schema-Initialisierung)
├── src/
│   ├── app.js                 # Express-App: Middleware, Routen, Fehlerbehandlung
│   ├── db/
│   │   ├── index.js           # Datenbank-Adapter – EINZIGE Stelle mit better-sqlite3
│   │   └── schema.sql         # Tabellendefinitionen
│   ├── repositories/          # Gekapselter DB-Zugriff je Tabelle (nur SQL hier)
│   └── routes/                # HTTP-Routen (Validierung, Statuscodes)
└── scripts/
    └── seed.js                # Mock-Daten aus dj-app-prototype.html importieren
```

Der Zugriff ist bewusst geschichtet: **Routen → Repositories → Adapter**.
Für einen späteren Wechsel zu PostgreSQL muss nur `src/db/index.js`
ausgetauscht werden (z.B. gegen einen `pg.Pool`), denn:

- Alle Adapter-Funktionen sind bereits `async`, obwohl SQLite synchron
  arbeitet – die aufrufenden Schichten ändern sich beim Wechsel nicht.
- Transaktionen (inkl. verschachtelter SAVEPOINTs) funktionieren in
  PostgreSQL identisch.
- SQL-Platzhalter (`?`) kann ein PostgreSQL-Adapter mechanisch in
  `$1, $2, …` übersetzen.
- Nötige Schema-Anpassungen (z.B. `AUTOINCREMENT` → `BIGSERIAL`,
  JSON-Text → `JSONB`) sind als Kommentar in `schema.sql` dokumentiert.
