-- =======================================================================
-- BeatSpot – Datenbankschema (SQLite)
--
-- Die Tabellen orientieren sich an den Mock-Datenstrukturen aus
-- dj-app-prototype.html:
--   djs      -> const djs            (inkl. genres/mixes/blockedDates als JSON)
--   users    -> Personen aus den Mock-Daten (Demo-Persona "Du",
--               Anfragesteller der Buchungen, Verfasser der Bewertungen)
--   bookings -> let bookingRequests
--   messages -> let chatMessages     (Chatverlauf je Buchung)
--   ratings  -> djs[].reviews        (herausgelöst in eigene Tabelle)
--   events   -> const events         (Lineup als Verknüpfungstabelle)
--
-- Hinweis zur PostgreSQL-Portierung:
--   * INTEGER PRIMARY KEY AUTOINCREMENT  ->  BIGSERIAL PRIMARY KEY
--   * TEXT-Spalten mit JSON-Inhalt       ->  JSONB
--   * Boolean-Spalten (0/1)              ->  BOOLEAN
--   * datetime('now')                    ->  now()
--   Alle übrigen Konstrukte (FKs, CHECK, Indizes) sind direkt kompatibel.
-- =======================================================================

-- Nutzer:innen der App (Partygänger / Veranstalter).
-- Der Prototyp kennt keine eigene Nutzerliste – die Tabelle wird beim
-- Seeden aus den Personennamen der Mock-Daten befüllt.
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,          -- Anzeigename, eindeutig (ermöglicht "find or create")
  bio          TEXT NOT NULL DEFAULT '',
  avatar_color TEXT,                          -- CSS-Farbverlauf des Avatars
  avatar_emoji TEXT,                          -- Emoji im Avatar (optional)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- DJs mit Profil-, Preis- und Verfügbarkeitsdaten.
-- genres, blocked_dates und mixes sind Wertlisten, die ausschließlich zum DJ
-- gehören – sie werden als JSON-Text gespeichert (in PostgreSQL: JSONB).
CREATE TABLE IF NOT EXISTS djs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  genre         TEXT NOT NULL,                -- Hauptgenre (Anzeige in Listen)
  genres        TEXT NOT NULL DEFAULT '[]',   -- JSON-Array aller Genres
  price         REAL NOT NULL,                -- Preis pro Stunde in Euro
  rating        REAL NOT NULL DEFAULT 0,      -- Durchschnittsbewertung (Cache, s. ratings)
  city          TEXT NOT NULL,
  color         TEXT,                         -- CSS-Farbverlauf des Avatars
  available     INTEGER NOT NULL DEFAULT 1,   -- 0/1: aktuell buchbar?
  is_pro        INTEGER NOT NULL DEFAULT 0,   -- 0/1: BeatSpot-Pro-Abo aktiv?
  sponsored     INTEGER NOT NULL DEFAULT 0,   -- 0/1: erscheint als "Gesponsert" in der Suche
  blocked_dates TEXT NOT NULL DEFAULT '[]',   -- JSON-Array blockierter Tage (ISO-Datum)
  avatar_emoji  TEXT,
  bio           TEXT NOT NULL DEFAULT '',
  followers     INTEGER NOT NULL DEFAULT 0,
  mixes         TEXT NOT NULL DEFAULT '[]',   -- JSON-Array: [{ "title": ..., "duration": ... }]
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Buchungsanfragen von Nutzer:innen an DJs (entspricht bookingRequests).
-- Statuswerte wie im Prototyp: 'offen' | 'bestaetigt' | 'abgelehnt'.
CREATE TABLE IF NOT EXISTS bookings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  dj_id      INTEGER NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- Anfragesteller
  event_type TEXT NOT NULL DEFAULT 'Sonstiges',                -- z.B. Hochzeit, Geburtstag
  date       TEXT NOT NULL,                                    -- ISO-Datum (YYYY-MM-DD)
  time       TEXT NOT NULL,                                    -- Uhrzeit (HH:MM)
  duration   INTEGER NOT NULL DEFAULT 4,                       -- Dauer in Stunden
  genre      TEXT,                                             -- Musikwunsch
  location   TEXT,                                             -- Veranstaltungsort (Freitext)
  message    TEXT,                                             -- Nachricht/Sonderwünsche
  status     TEXT NOT NULL DEFAULT 'offen'
             CHECK (status IN ('offen', 'bestaetigt', 'abgelehnt')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_dj     ON bookings(dj_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user   ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- Chat-Nachrichten je Buchung (entspricht chatMessages).
-- sender ist wie im Prototyp eine Rolle: 'user' (Anfragesteller) oder 'dj'.
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender     TEXT NOT NULL CHECK (sender IN ('user', 'dj')),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id);

-- Bewertungen für DJs (entspricht djs[].reviews, herausgelöst als Tabelle).
-- Der Verfasser wird als users-Datensatz referenziert; die Mock-Bewertenden
-- werden beim Seeden als Nutzer angelegt.
CREATE TABLE IF NOT EXISTS ratings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  dj_id      INTEGER NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL,                   -- ISO-Datum der Bewertung
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ratings_dj ON ratings(dj_id);

-- Events für die Party-Karte (entspricht events).
-- x/y sind die Kartenpositionen des Prototyps in Prozent.
-- Bei spontanen Events steckt die Stadt bereits im Freitext-Ort,
-- daher darf city leer ('') sein.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  location    TEXT NOT NULL,                   -- Name der Venue
  city        TEXT NOT NULL DEFAULT '',
  date        TEXT,                            -- ISO-Datum (im Mock nicht vorhanden, daher optional)
  day_label   TEXT,                            -- Tages-Label des Prototyps ("Heute", "Morgen", "Sa")
  time        TEXT NOT NULL,                   -- Startzeit (HH:MM)
  entry       REAL NOT NULL DEFAULT 0,         -- Eintritt in Euro
  x           REAL,                            -- Kartenposition X in Prozent
  y           REAL,                            -- Kartenposition Y in Prozent
  description TEXT NOT NULL DEFAULT '',        -- Freitext-Beschreibung (v.a. spontane Events)
  spontaneous INTEGER NOT NULL DEFAULT 0,      -- 0/1: kurzfristig angekündigtes Event?
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lineup eines Events: verweist auf DJs, daher als echte Verknüpfungstabelle
-- statt JSON (sauberer für Abfragen und die spätere PostgreSQL-Migration).
CREATE TABLE IF NOT EXISTS event_lineup (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  dj_id    INTEGER NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,        -- Reihenfolge im Lineup
  PRIMARY KEY (event_id, dj_id)
);

-- Feed-Beiträge der DJs (entspricht feedPosts).
-- Der Prototyp kennt genau eine Demo-Persona, daher genügt für den
-- Like-Zustand eine einfache 0/1-Spalte statt einer Likes-Tabelle.
CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  dj_id      INTEGER NOT NULL REFERENCES djs(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  likes      INTEGER NOT NULL DEFAULT 0,      -- Anzahl der Likes (Anzeige)
  liked      INTEGER NOT NULL DEFAULT 0,      -- 0/1: von der Demo-Persona geliked?
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_dj ON posts(dj_id);
