//! LABYRINTHE — backend Tauri.
//!
//! Le Rust ne fait PAS le jeu : fenêtre, persistance SQLite, packs de contenu.
//! RÈGLE INTOUCHABLE (Game Bible §10.2) : aucune commande tapée dans le
//! terminal du jeu n'est exécutée ici. Tout reste simulé dans la webview.

mod db;

use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

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

// Les chemins viennent uniquement du sélecteur natif : le terminal simulé ne
// reçoit pas une primitive de lecture ou d'écriture arbitraire sur le disque.
// Les dialogues bloquants sont lancés depuis des commandes asynchrones, pas
// depuis le thread principal de l'interface (cf. documentation Tauri).
#[tauri::command]
async fn export_save(app: tauri::AppHandle, contents: String) -> Result<Option<String>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("Exporter la partie")
        .set_file_name("labyrinthe-sauvegarde.json")
        .add_filter("Sauvegarde LABYRINTHE", &["json"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| format!("écriture impossible : {e}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn import_save(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("Importer une partie")
        .add_filter("Sauvegarde LABYRINTHE", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|e| e.to_string())?;
    let contents = std::fs::read_to_string(&path).map_err(|e| format!("lecture impossible : {e}"))?;
    Ok(Some(contents))
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
    // En développement, ne pas dépendre du répertoire depuis lequel la CLI
    // a lancé le processus : le manifeste Rust est toujours dans src-tauri/.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("content")
}

#[tauri::command]
fn content_load(app: tauri::AppHandle, pack: String) -> Result<String, String> {
    // Pas de chemin absolu, de préfixe Windows ou de sortie de content/.
    let rel = Path::new(&pack);
    if pack.is_empty()
        || pack.contains('\\')
        || rel.components().any(|c| !matches!(c, Component::Normal(_)))
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
        .plugin(tauri_plugin_dialog::init())
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
            export_save,
            import_save,
            content_load,
            app_version
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de LABYRINTHE");
}
