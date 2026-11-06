//! Persistance LABYRINTHE — SQLite via rusqlite.
//! Schéma : Game Bible §10.3. Version du schéma : 3 (PRAGMA user_version).

use rusqlite::Connection;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS profile(
    handle TEXT PRIMARY KEY,
    rank INT NOT NULL DEFAULT 0,
    xp INT NOT NULL DEFAULT 0,
    respect INT NOT NULL DEFAULT 0,
    cred INT NOT NULL DEFAULT 0,
    credits INT NOT NULL DEFAULT 0,
    sats INT NOT NULL DEFAULT 0,
    playtime INT NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS world(
    machine TEXT PRIMARY KEY,
    state JSON NOT NULL
);
CREATE TABLE IF NOT EXISTS echo(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT NOT NULL,
    kind TEXT NOT NULL,
    target TEXT,
    payload JSON
);
CREATE TABLE IF NOT EXISTS contracts(
    id TEXT PRIMARY KEY,
    state INT NOT NULL DEFAULT 0,          -- 0 inconnu, 1 dispo, 2 actif, 3 fait
    evidence JSON
);
CREATE TABLE IF NOT EXISTS npc(
    id TEXT PRIMARY KEY,
    mood INT NOT NULL DEFAULT 0,
    state JSON,
    next_move_at TEXT                      -- agenda ECHO : horloge du monde
);
CREATE TABLE IF NOT EXISTS files(
    machine TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT,
    PRIMARY KEY(machine, path)
);
CREATE TABLE IF NOT EXISTS settings(
    key TEXT PRIMARY KEY,
    value JSON
);
-- Sauvegardes par slot : snapshot complet (tant que la normalisation n'est pas finie, M3/M5)
CREATE TABLE IF NOT EXISTS saves(
    slot TEXT PRIMARY KEY,
    data JSON NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
PRAGMA user_version = 3;
";

pub fn open(path: impl AsRef<std::path::Path>) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    Ok(conn)
}

// ---------------------------------------------------------------- SLOTS
pub fn save_list(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT slot FROM saves ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

pub fn save_read(conn: &Connection, slot: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT data FROM saves WHERE slot = ?1", [slot], |r| {
        r.get(0)
    })
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other.to_string()),
    })
}

pub fn save_write(conn: &Connection, slot: &str, data: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO saves(slot, data, updated_at) VALUES(?1, ?2, datetime('now'))
         ON CONFLICT(slot) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        [slot, data],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_delete(conn: &Connection, slot: &str) -> Result<(), String> {
    conn.execute("DELETE FROM saves WHERE slot = ?1", [slot])
        .map_err(|e| e.to_string())?;
    Ok(())
}
