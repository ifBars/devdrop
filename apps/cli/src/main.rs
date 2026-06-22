use std::{
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand};
use ignore::WalkBuilder;
use keyring::Entry as KeyringEntry;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const DEFAULT_RELAY: &str = "https://devdrop-relay.ifbars.workers.dev";
const DEFAULT_MAX_BLOB_BYTES: u64 = 1_048_576;
const KEYRING_SERVICE: &str = "devdrop";

#[derive(Parser)]
#[command(name = "devdrop")]
#[command(about = "Devdrop code-root sync prototype CLI", version)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Init {
        #[arg(long, default_value = ".")]
        root: PathBuf,
        #[arg(long)]
        name: Option<String>,
    },
    Scan {
        #[arg(long, default_value = ".")]
        root: PathBuf,
        #[arg(long)]
        pretty: bool,
    },
    Push {
        #[arg(long, default_value = ".")]
        root: PathBuf,
        #[arg(long, default_value = DEFAULT_RELAY)]
        relay: String,
        #[arg(long, env = "DEVDROP_TOKEN")]
        token: Option<String>,
        #[arg(long, default_value_t = DEFAULT_MAX_BLOB_BYTES)]
        max_blob_bytes: u64,
        #[arg(long)]
        no_blobs: bool,
    },
    Hydrate {
        #[arg(long, default_value = ".")]
        root: PathBuf,
        #[arg(long)]
        workspace_id: Option<String>,
        #[arg(long)]
        relay: Option<String>,
        #[arg(long, env = "DEVDROP_TOKEN")]
        token: Option<String>,
        #[arg(long)]
        force: bool,
        #[arg(long)]
        directories_only: bool,
    },
    Login {
        #[arg(long, default_value = DEFAULT_RELAY)]
        relay: String,
        #[arg(long, env = "DEVDROP_TOKEN")]
        token: Option<String>,
    },
    Logout {
        #[arg(long, default_value = DEFAULT_RELAY)]
        relay: String,
    },
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
    },
    Status {
        #[arg(long, default_value = ".")]
        root: PathBuf,
    },
}

#[derive(Subcommand)]
enum AuthCommand {
    Status {
        #[arg(long, default_value = DEFAULT_RELAY)]
        relay: String,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    name: String,
    root_path: String,
    ignore: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct State {
    workspace_id: String,
    relay: String,
    last_manifest_hash: Option<String>,
    last_pushed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_version: u32,
    name: String,
    root_path: String,
    generated_at: String,
    ignores: Vec<String>,
    entries: Vec<Entry>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    path: String,
    kind: EntryKind,
    size: Option<u64>,
    sha256: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum EntryKind {
    File,
    Directory,
    Symlink,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWorkspaceResponse {
    id: String,
}

#[derive(Debug, Deserialize)]
struct ManifestResponse {
    hash: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurrentManifestResponse {
    hash: String,
    manifest: Manifest,
}

#[derive(Debug)]
struct BlobUploadSummary {
    uploaded: usize,
    skipped: usize,
}

#[derive(Debug)]
struct HydrateSummary {
    directories: usize,
    files_written: usize,
    files_skipped: usize,
    files_conflicted: usize,
    unavailable_blobs: usize,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Command::Init { root, name } => init(&root, name)?,
        Command::Scan { root, pretty } => scan_command(&root, pretty)?,
        Command::Push {
            root,
            relay,
            token,
            max_blob_bytes,
            no_blobs,
        } => push(&root, &relay, &token, max_blob_bytes, no_blobs).await?,
        Command::Hydrate {
            root,
            workspace_id,
            relay,
            token,
            force,
            directories_only,
        } => hydrate(&root, workspace_id, relay, &token, force, directories_only).await?,
        Command::Login { relay, token } => login(&relay, token).await?,
        Command::Logout { relay } => logout(&relay)?,
        Command::Auth { command } => match command {
            AuthCommand::Status { relay } => auth_status(&relay)?,
        },
        Command::Status { root } => status(&root)?,
    }

    Ok(())
}

fn init(root: &Path, name: Option<String>) -> Result<()> {
    let root = normalize_root(root)?;
    let devdrop = root.join(".devdrop");
    fs::create_dir_all(&devdrop).with_context(|| format!("creating {}", devdrop.display()))?;

    let config = Config {
        name: name.unwrap_or_else(|| {
            root.file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("code-root")
                .to_string()
        }),
        root_path: root.display().to_string(),
        ignore: default_ignores(),
    };

    write_json(&devdrop.join("config.json"), &config)?;
    write_ignore(&root.join(".devdropignore"), &config.ignore)?;
    println!("initialized {}", devdrop.display());
    Ok(())
}

fn scan_command(root: &Path, pretty: bool) -> Result<()> {
    let manifest = build_manifest(root)?;
    if pretty {
        println!("{}", serde_json::to_string_pretty(&manifest)?);
    } else {
        println!("{}", serde_json::to_string(&manifest)?);
    }
    Ok(())
}

async fn push(
    root: &Path,
    relay: &str,
    token: &Option<String>,
    max_blob_bytes: u64,
    no_blobs: bool,
) -> Result<()> {
    let root = normalize_root(root)?;
    let config = read_or_create_config(&root)?;
    let mut state = read_state(&root)?;
    let token = resolve_auth_token(relay, token.as_deref())?;
    let client = reqwest::Client::new();

    let workspace_id = match state.as_ref() {
        Some(existing) => existing.workspace_id.clone(),
        None => {
            let response = client
                .post(format!("{}/v1/workspaces", relay.trim_end_matches('/')))
                .header(AUTHORIZATION, bearer(&token))
                .header(CONTENT_TYPE, "application/json")
                .json(&serde_json::json!({
                    "name": config.name,
                    "rootPath": config.root_path,
                    "device": {
                        "label": current_device_label()
                    }
                }))
                .send()
                .await
                .context("creating remote workspace")?;

            if !response.status().is_success() {
                bail!(
                    "workspace create failed: {} {}",
                    response.status(),
                    response.text().await?
                );
            }

            let created = response.json::<CreateWorkspaceResponse>().await?;
            let created_state = State {
                workspace_id: created.id.clone(),
                relay: relay.to_string(),
                last_manifest_hash: None,
                last_pushed_at: None,
            };
            write_json(&state_path(&root), &created_state)?;
            state = Some(created_state);
            created.id
        }
    };

    let manifest = build_manifest(&root)?;
    let blob_summary = if no_blobs {
        BlobUploadSummary {
            uploaded: 0,
            skipped: manifest
                .entries
                .iter()
                .filter(|entry| matches!(entry.kind, EntryKind::File))
                .count(),
        }
    } else {
        upload_blobs(&client, relay, &token, &root, &manifest, max_blob_bytes).await?
    };

    let response = client
        .put(format!(
            "{}/v1/workspaces/{}/manifest",
            relay.trim_end_matches('/'),
            workspace_id
        ))
        .header(AUTHORIZATION, bearer(&token))
        .header(CONTENT_TYPE, "application/json")
        .json(&manifest)
        .send()
        .await
        .context("pushing manifest")?;

    if !response.status().is_success() {
        bail!(
            "manifest push failed: {} {}",
            response.status(),
            response.text().await?
        );
    }

    let pushed = response.json::<ManifestResponse>().await?;
    let mut updated = state.context("state should exist after workspace creation")?;
    updated.last_manifest_hash = Some(pushed.hash.clone());
    updated.last_pushed_at = Some(now_isoish());
    write_json(&state_path(&root), &updated)?;

    println!(
        "pushed manifest {} for workspace {} to {} ({} blobs uploaded, {} skipped)",
        pushed.hash, workspace_id, relay, blob_summary.uploaded, blob_summary.skipped
    );
    Ok(())
}

async fn hydrate(
    root: &Path,
    workspace_id: Option<String>,
    relay: Option<String>,
    token: &Option<String>,
    force: bool,
    directories_only: bool,
) -> Result<()> {
    let root = ensure_root(root)?;
    let state = read_state(&root)?;
    let workspace_id = workspace_id
        .or_else(|| state.as_ref().map(|existing| existing.workspace_id.clone()))
        .context(
            "workspace id required; pass --workspace-id or run from an initialized Devdrop root",
        )?;
    let relay = relay
        .or_else(|| state.as_ref().map(|existing| existing.relay.clone()))
        .unwrap_or_else(|| DEFAULT_RELAY.to_string());
    let token = resolve_auth_token(&relay, token.as_deref())?;
    let client = reqwest::Client::new();

    let response = client
        .get(format!(
            "{}/v1/workspaces/{}/manifest",
            relay.trim_end_matches('/'),
            workspace_id
        ))
        .header(AUTHORIZATION, bearer(&token))
        .send()
        .await
        .context("fetching manifest")?;

    if !response.status().is_success() {
        bail!(
            "manifest fetch failed: {} {}",
            response.status(),
            response.text().await?
        );
    }

    let current = response.json::<CurrentManifestResponse>().await?;
    let summary = hydrate_manifest(
        &client,
        &relay,
        &token,
        &root,
        &current.manifest,
        force,
        directories_only,
    )
    .await?;

    let state = State {
        workspace_id,
        relay,
        last_manifest_hash: Some(current.hash.clone()),
        last_pushed_at: None,
    };
    write_json(&state_path(&root), &state)?;
    write_json(
        &root.join(".devdrop").join("last-manifest.json"),
        &current.manifest,
    )?;

    println!(
        "hydrated manifest {} into {} ({} directories, {} files written, {} skipped, {} conflicts, {} missing blobs)",
        current.hash,
        root.display(),
        summary.directories,
        summary.files_written,
        summary.files_skipped,
        summary.files_conflicted,
        summary.unavailable_blobs
    );
    Ok(())
}

async fn login(relay: &str, token: Option<String>) -> Result<()> {
    let relay = normalize_relay(relay);
    let token = match token {
        Some(token) if !token.trim().is_empty() => token,
        _ => rpassword::prompt_password("Relay token: ").context("reading relay token")?,
    };

    if token.trim().is_empty() {
        bail!("relay token cannot be empty");
    }

    validate_token(&relay, &token).await?;
    keyring_entry(&relay)?
        .set_password(token.trim())
        .with_context(|| format!("storing token for {relay}"))?;
    println!("stored relay token for {relay}");
    Ok(())
}

fn logout(relay: &str) -> Result<()> {
    let relay = normalize_relay(relay);
    match keyring_entry(&relay)?.delete_credential() {
        Ok(()) => println!("removed relay token for {relay}"),
        Err(_) => println!("no stored relay token for {relay}"),
    }
    Ok(())
}

fn auth_status(relay: &str) -> Result<()> {
    let relay = normalize_relay(relay);
    println!("relay: {relay}");
    println!(
        "env token: {}",
        if std::env::var("DEVDROP_TOKEN").is_ok() {
            "present"
        } else {
            "missing"
        }
    );
    match stored_token(&relay) {
        Ok(Some(_)) => println!("stored token: present"),
        Ok(None) => println!("stored token: missing"),
        Err(error) => println!("stored token: unavailable ({error})"),
    }
    Ok(())
}

async fn validate_token(relay: &str, token: &str) -> Result<()> {
    let response = reqwest::Client::new()
        .get(format!("{}/v1/auth/check", relay.trim_end_matches('/')))
        .header(AUTHORIZATION, bearer(token))
        .send()
        .await
        .context("checking relay token")?;

    if !response.status().is_success() {
        bail!(
            "relay token check failed: {} {}",
            response.status(),
            response.text().await?
        );
    }
    Ok(())
}

fn status(root: &Path) -> Result<()> {
    let root = normalize_root(root)?;
    let config = read_or_create_config(&root)?;
    let state = read_state(&root)?;
    println!("root: {}", root.display());
    println!("name: {}", config.name);
    match state {
        Some(state) => {
            println!("workspace: {}", state.workspace_id);
            println!("relay: {}", state.relay);
            println!(
                "last manifest: {}",
                state
                    .last_manifest_hash
                    .unwrap_or_else(|| "never pushed".to_string())
            );
        }
        None => println!("workspace: not pushed yet"),
    }
    Ok(())
}

fn resolve_auth_token(relay: &str, explicit: Option<&str>) -> Result<String> {
    if let Some(token) = explicit.filter(|token| !token.trim().is_empty()) {
        return Ok(token.trim().to_string());
    }
    if let Ok(token) = std::env::var("DEVDROP_TOKEN")
        && !token.trim().is_empty()
    {
        return Ok(token.trim().to_string());
    }
    if let Some(token) = stored_token(relay)? {
        return Ok(token);
    }

    bail!(
        "no relay token found; pass --token, set DEVDROP_TOKEN, or run `devdrop login --relay {}`",
        normalize_relay(relay)
    )
}

fn stored_token(relay: &str) -> Result<Option<String>> {
    match keyring_entry(&normalize_relay(relay))?.get_password() {
        Ok(token) if !token.trim().is_empty() => Ok(Some(token)),
        Ok(_) => Ok(None),
        Err(_) => Ok(None),
    }
}

fn keyring_entry(relay: &str) -> Result<KeyringEntry> {
    KeyringEntry::new(KEYRING_SERVICE, &normalize_relay(relay))
        .context("opening OS credential store")
}

fn normalize_relay(relay: &str) -> String {
    relay.trim().trim_end_matches('/').to_string()
}

fn bearer(token: &str) -> String {
    format!("Bearer {}", token.trim())
}

async fn upload_blobs(
    client: &reqwest::Client,
    relay: &str,
    token: &str,
    root: &Path,
    manifest: &Manifest,
    max_blob_bytes: u64,
) -> Result<BlobUploadSummary> {
    let mut summary = BlobUploadSummary {
        uploaded: 0,
        skipped: 0,
    };

    for entry in &manifest.entries {
        if !matches!(entry.kind, EntryKind::File) {
            continue;
        }

        let Some(hash) = &entry.sha256 else {
            summary.skipped += 1;
            continue;
        };

        if entry.size.unwrap_or(u64::MAX) > max_blob_bytes {
            summary.skipped += 1;
            continue;
        }

        let path = root.join(entry.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let bytes = fs::read(&path).with_context(|| format!("reading {}", path.display()))?;
        let response = client
            .put(format!("{}/v1/blobs/{}", relay.trim_end_matches('/'), hash))
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(CONTENT_TYPE, "application/octet-stream")
            .body(bytes)
            .send()
            .await
            .with_context(|| format!("uploading blob for {}", entry.path))?;

        if !response.status().is_success() {
            bail!(
                "blob upload failed for {}: {} {}",
                entry.path,
                response.status(),
                response.text().await?
            );
        }

        summary.uploaded += 1;
    }

    Ok(summary)
}

async fn hydrate_manifest(
    client: &reqwest::Client,
    relay: &str,
    token: &str,
    root: &Path,
    manifest: &Manifest,
    force: bool,
    directories_only: bool,
) -> Result<HydrateSummary> {
    let mut summary = HydrateSummary {
        directories: 0,
        files_written: 0,
        files_skipped: 0,
        files_conflicted: 0,
        unavailable_blobs: 0,
    };

    for entry in &manifest.entries {
        let path = root.join(entry.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        if matches!(entry.kind, EntryKind::Directory) {
            fs::create_dir_all(&path).with_context(|| format!("creating {}", path.display()))?;
            summary.directories += 1;
        }
    }

    if directories_only {
        return Ok(summary);
    }

    for entry in &manifest.entries {
        if !matches!(entry.kind, EntryKind::File) {
            continue;
        }

        let path = root.join(entry.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
        }

        let Some(hash) = &entry.sha256 else {
            summary.unavailable_blobs += 1;
            continue;
        };

        if path.exists() && !force {
            if path.is_file() && hash_file(&path).ok().as_deref() == Some(hash.as_str()) {
                summary.files_skipped += 1;
            } else {
                summary.files_conflicted += 1;
            }
            continue;
        }

        let response = client
            .get(format!("{}/v1/blobs/{}", relay.trim_end_matches('/'), hash))
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .send()
            .await
            .with_context(|| format!("downloading blob for {}", entry.path))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            summary.unavailable_blobs += 1;
            continue;
        }

        if !response.status().is_success() {
            bail!(
                "blob download failed for {}: {} {}",
                entry.path,
                response.status(),
                response.text().await?
            );
        }

        let bytes = response.bytes().await?;
        if hash_bytes(&bytes) != *hash {
            bail!("downloaded blob hash mismatch for {}", entry.path);
        }
        fs::write(&path, &bytes).with_context(|| format!("writing {}", path.display()))?;
        summary.files_written += 1;
    }

    Ok(summary)
}

fn build_manifest(root: &Path) -> Result<Manifest> {
    let root = normalize_root(root)?;
    let config = read_or_create_config(&root)?;
    let mut entries = Vec::new();

    let mut builder = WalkBuilder::new(&root);
    builder
        .standard_filters(true)
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .parents(true)
        .add_custom_ignore_filename(".devdropignore");

    for result in builder.build() {
        let item = result?;
        let path = item.path();
        if path == root {
            continue;
        }

        let relative = path
            .strip_prefix(&root)
            .with_context(|| format!("stripping root from {}", path.display()))?
            .to_string_lossy()
            .replace('\\', "/");

        if should_skip_path(&relative, &config.ignore) {
            continue;
        }

        let metadata = fs::symlink_metadata(path)?;
        let file_type = metadata.file_type();
        let (kind, size, sha256) = if file_type.is_symlink() {
            (EntryKind::Symlink, None, None)
        } else if metadata.is_dir() {
            (EntryKind::Directory, None, None)
        } else {
            let size = metadata.len();
            let hash = if size <= 1_048_576 {
                Some(hash_file(path)?)
            } else {
                None
            };
            (EntryKind::File, Some(size), hash)
        };

        entries.push(Entry {
            path: relative,
            kind,
            size,
            sha256,
        });
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(Manifest {
        schema_version: 1,
        name: config.name,
        root_path: root.display().to_string(),
        generated_at: now_isoish(),
        ignores: config.ignore,
        entries,
    })
}

fn read_or_create_config(root: &Path) -> Result<Config> {
    let path = root.join(".devdrop").join("config.json");
    if path.exists() {
        let data =
            fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
        return Ok(serde_json::from_str(&data)?);
    }

    init(root, None)?;
    let data = fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
    Ok(serde_json::from_str(&data)?)
}

fn read_state(root: &Path) -> Result<Option<State>> {
    let path = state_path(root);
    if !path.exists() {
        return Ok(None);
    }

    let data = fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
    Ok(Some(serde_json::from_str(&data)?))
}

fn state_path(root: &Path) -> PathBuf {
    root.join(".devdrop").join("state.json")
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(value)? + "\n")
        .with_context(|| format!("writing {}", path.display()))
}

fn write_ignore(path: &Path, ignores: &[String]) -> Result<()> {
    if path.exists() {
        return Ok(());
    }
    fs::write(path, ignores.join("\n") + "\n")
        .with_context(|| format!("writing {}", path.display()))
}

fn normalize_root(root: &Path) -> Result<PathBuf> {
    let root = if root.exists() {
        root.canonicalize()?
    } else {
        bail!("root does not exist: {}", root.display());
    };
    Ok(root)
}

fn ensure_root(root: &Path) -> Result<PathBuf> {
    if !root.exists() {
        fs::create_dir_all(root).with_context(|| format!("creating {}", root.display()))?;
    }
    normalize_root(root)
}

fn default_ignores() -> Vec<String> {
    [
        ".git/",
        ".devdrop/",
        "node_modules/",
        "target/",
        "dist/",
        ".next/",
        ".wrangler/",
        "internal/",
        "infra/live-test-token.txt",
        "bin/",
        "obj/",
        "Library/",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

fn should_skip_path(relative: &str, ignores: &[String]) -> bool {
    ignores.iter().any(|pattern| {
        let pattern = pattern.trim();
        if pattern.is_empty() {
            return false;
        }
        let folder = pattern.trim_end_matches('/');
        relative == folder || relative.starts_with(&format!("{folder}/"))
    })
}

fn hash_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path)?;
    hash_reader(&mut file)
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut cursor = Cursor::new(bytes);
    hash_reader(&mut cursor).expect("hashing in-memory bytes cannot fail")
}

fn hash_reader(reader: &mut impl Read) -> Result<String> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 16 * 1024];
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn now_isoish() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{seconds}")
}

fn current_device_label() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-device".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_ignores_skip_nested_generated_dirs() {
        let ignores = default_ignores();
        assert!(should_skip_path("node_modules/react/index.js", &ignores));
        assert!(should_skip_path("target/debug/app.exe", &ignores));
        assert!(should_skip_path(".devdrop/state.json", &ignores));
        assert!(should_skip_path("internal/context/source.md", &ignores));
        assert!(should_skip_path("infra/live-test-token.txt", &ignores));
        assert!(!should_skip_path("src/main.rs", &ignores));
    }

    #[test]
    fn hash_bytes_matches_sha256_hex() {
        assert_eq!(
            hash_bytes(b"devdrop"),
            "83ef5a1b124e07cf450d87a6f2fe2884adfda5730a9a5deae893b1d349606e87"
        );
    }

    #[test]
    fn normalize_relay_trims_trailing_slash() {
        assert_eq!(
            normalize_relay(" https://devdrop-relay.ifbars.workers.dev/ "),
            "https://devdrop-relay.ifbars.workers.dev"
        );
    }
}
