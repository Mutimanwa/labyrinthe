//! LABYRINTHE — backend Tauri.
//!
//! Le Rust ne fait PAS le jeu : fenêtre, persistance SQLite, packs de contenu.
//! RÈGLE INTOUCHABLE (Game Bible §10.2) : aucune commande tapée dans le
//! terminal du jeu n'est exécutée ici. Tout reste simulé dans la webview.

mod db;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

struct AppState {
    db: Mutex<Option<rusqlite::Connection>>,
}

fn with_db<T>(
    state: &tauri::State<'_, AppState>,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    let guard = state.db.lock().map_err(|e| format!("verrou DB : {e}"))?;
    let conn = guard.as_ref().ok_or_else(|| "DB non initialisée".to_string())?;
    f(conn)
}

// ---------------------------------------------------------------- SAUVEGARDES
// 3 slots + auto-save ; chaque slot = un snapshot JSON complet du monde (ECHO inclus).
// La normalisation fine (tables world/echo/contracts/npc) vient au M3/M5,
// le blob garantit qu'on ne perd jamais rien entre-temps.

#[tauri::command]
fn save_list(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    with_db(&state, db::save_list)
}

#[tauri::command]
fn save_read(state: tauri::State<'_, AppState>, slot: String) -> Result<Option<String>, String> {
    with_db(&state, |c| db::save_read(c, &slot))
}

#[tauri::command]
fn save_write(state: tauri::State<'_, AppState>, slot: String, data: String) -> Result<(), String> {
    with_db(&state, |c| db::save_write(c, &slot, &data))
}

#[tauri::command]
fn save_delete(state: tauri::State<'_, AppState>, slot: String) -> Result<(), String> {
    with_db(&state, |c| db::save_delete(c, &slot))
}

// ---------------------------------------------------------------- CONTENU
// Packs data-driven (missions, sites, threads, puits) : fichiers lus depuis
// `content/` (dossier projet en dev, ressources de l'app une fois packagée).

fn content_root(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("content");
        if candidate.exists() {
            return candidate;
        }
    }
    // dev : racine du projet (…/labyrinthe/content)
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("..")
        .join("content")
}

#[tauri::command]
fn content_load(app: tauri::AppHandle, pack: String) -> Result<String, String> {
    // hygiene : pas de sortie du dossier content/
    let rel = Path::new(&pack);
    if pack.starts_with('/')
        || pack.starts_with('\\')
        || rel.components().any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("chemin de pack invalide".into());
    }
    let root = content_root(&app);
    let path = root.join(rel);
    std::fs::read_to_string(&path).map_err(|e| format!("{} : {e}", path.display()))
}

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// ---------------------------------------------------------------- DÉMARRAGE
fn main() {
    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(None),
        })
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("app_data_dir : {e}"))?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let conn = db::open(dir.join("labyrinthe.db")).map_err(|e| {
                format!("ouverture DB : {e}")
            })?;
            let state = app.state::<AppState>();
            *state.db.lock().map_err(|e| e.to_string())? = Some(conn);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_list,
            save_read,
            save_write,
            save_delete,
            content_load,
            app_version
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de LABYRINTHE");
}
