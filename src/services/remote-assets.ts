import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

export const ASSET_MANIFEST_URL =
  "https://github.com/BitterChoco/storage-release/raw/refs/heads/main/wild-paw/data/manifest.json";
export const REMOTE_ASSET_BASE_URL =
  "https://github.com/BitterChoco/storage-release/raw/refs/heads/main/wild-paw/data/assets";

const DOWNLOAD_CONCURRENCY = 3;

type ManifestFile = {
  path: string;
  size: number;
  sha256?: string;
};

type AssetManifest = {
  schemaVersion: number;
  version: string;
  files: ManifestFile[];
};

export type AssetLoadingState = {
  progress: number;
  detail: string;
  completedFiles: number;
  totalFiles: number;
  error: string | null;
  isComplete: boolean;
};

type ProgressCallback = (state: AssetLoadingState) => void;
let availableAssetPaths = new Set<string>();
let hasLoadedAssetManifest = false;

export function hasRemoteAsset(path: string) {
  return !hasLoadedAssetManifest || availableAssetPaths.has(path);
}

export function createInitialAssetLoadingState(): AssetLoadingState {
  return {
    progress: 0,
    detail: "Connecting to the asset release…",
    completedFiles: 0,
    totalFiles: 0,
    error: null,
    isComplete: false,
  };
}

function getDataDirectory() {
  return new Directory(Paths.document, "wild-paw", "data");
}

function getAssetDirectory() {
  return new Directory(Paths.document, "wild-paw", "data", "assets");
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function validateManifest(value: unknown): AssetManifest {
  if (!value || typeof value !== "object") {
    throw new Error("The asset manifest is not a JSON object.");
  }

  const manifest = value as Partial<AssetManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.version !== "string" ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error("The asset manifest has an unsupported format.");
  }

  const files = manifest.files.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("The asset manifest contains an invalid file entry.");
    }

    const item = entry as ManifestFile;
    if (
      typeof item.path !== "string" ||
      item.path.startsWith("/") ||
      item.path.includes("\\") ||
      item.path
        .split("/")
        .some((part) => !part || part === "." || part === "..") ||
      typeof item.size !== "number" ||
      !Number.isFinite(item.size) ||
      item.size < 0 ||
      (item.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(item.sha256))
    ) {
      throw new Error(
        `The asset manifest contains an invalid path or checksum: ${item.path ?? "unknown"}`,
      );
    }

    return item;
  });

  if (new Set(files.map((entry) => entry.path)).size !== files.length) {
    throw new Error("The asset manifest contains duplicate file paths.");
  }

  return {
    schemaVersion: 1,
    version: manifest.version,
    files,
  };
}

async function getManifest(onProgress: ProgressCallback) {
  const dataDirectory = getDataDirectory();
  dataDirectory.create({ idempotent: true, intermediates: true });
  const cachedManifestFile = new File(dataDirectory, "manifest.json");

  onProgress({
    ...createInitialAssetLoadingState(),
    detail: "Checking the latest asset manifest…",
  });

  try {
    const response = await fetch(ASSET_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Manifest request failed with HTTP ${response.status}.`);
    }

    const manifest = validateManifest(await response.json());
    await cachedManifestFile.write(JSON.stringify(manifest));
    return manifest;
  } catch (networkError) {
    if (cachedManifestFile.exists) {
      try {
        return validateManifest(await cachedManifestFile.json());
      } catch {
        // Report the network error below if the cached manifest is also invalid.
      }
    }

    const reason =
      networkError instanceof Error
        ? networkError.message
        : "Network request failed.";
    throw new Error(`Unable to retrieve the asset manifest: ${reason}`);
  }
}

export function getRemoteAssetSource(path: string) {
  const safePath = path.replace(/^\/+/, "");
  const uri =
    Platform.OS === "web"
      ? `${REMOTE_ASSET_BASE_URL}/${encodePath(safePath)}`
      : new File(getAssetDirectory(), ...safePath.split("/")).uri;

  return { uri };
}

export async function readRemoteAssetJson<T>(path: string): Promise<T> {
  if (!hasLoadedAssetManifest || !availableAssetPaths.has(path)) {
    throw new Error(`The asset release does not include ${path}.`);
  }

  if (Platform.OS === "web") {
    const response = await fetch(
      `${REMOTE_ASSET_BASE_URL}/${encodePath(path)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Unable to load ${path} (HTTP ${response.status}).`);
    }
    return (await response.json()) as T;
  }

  const file = new File(getAssetDirectory(), ...path.split("/"));
  if (!file.exists) {
    throw new Error(`Downloaded catalog file is missing: ${path}`);
  }
  return (await file.json()) as T;
}

export async function loadRemoteAssets(onProgress: ProgressCallback) {
  if (Platform.OS === "web") {
    onProgress({
      ...createInitialAssetLoadingState(),
      detail: "Loading the asset release manifest…",
    });
    const response = await fetch(ASSET_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Manifest request failed with HTTP ${response.status}.`);
    }
    const manifest = validateManifest(await response.json());
    availableAssetPaths = new Set(manifest.files.map((entry) => entry.path));
    hasLoadedAssetManifest = true;
    onProgress({
      progress: 100,
      detail: `Release ${manifest.version} is ready; web images load on demand.`,
      completedFiles: 0,
      totalFiles: manifest.files.length,
      error: null,
      isComplete: true,
    });
    return;
  }

  const manifest = await getManifest(onProgress);
  availableAssetPaths = new Set(manifest.files.map((entry) => entry.path));
  hasLoadedAssetManifest = true;
  const dataDirectory = getDataDirectory();
  const assetDirectory = getAssetDirectory();
  assetDirectory.create({ idempotent: true, intermediates: true });
  const installedVersionFile = new File(dataDirectory, "installed-version.txt");
  const installedVersion = installedVersionFile.exists
    ? await installedVersionFile.text().catch(() => "")
    : "";
  const totalBytes = manifest.files.reduce(
    (sum, entry) => sum + Math.max(entry.size, 1),
    0,
  );
  const activeBytes = new Map<string, number>();
  let completedBytes = 0;
  let completedFiles = 0;
  let nextFileIndex = 0;
  let lastPublishedAt = 0;
  let downloadError: Error | null = null;

  const publish = (detail: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastPublishedAt < 100) return;
    lastPublishedAt = now;
    const inProgressBytes = Array.from(activeBytes.values()).reduce(
      (sum, bytes) => sum + bytes,
      0,
    );
    onProgress({
      progress:
        totalBytes === 0
          ? 100
          : Math.min(
              99,
              Math.floor(
                ((completedBytes + inProgressBytes) / totalBytes) * 100,
              ),
            ),
      detail,
      completedFiles,
      totalFiles: manifest.files.length,
      error: null,
      isComplete: false,
    });
  };

  publish(
    `Checking ${manifest.files.length} assets (release ${manifest.version})…`,
    true,
  );

  const worker = async () => {
    while (nextFileIndex < manifest.files.length && !downloadError) {
      const entry = manifest.files[nextFileIndex];
      nextFileIndex += 1;
      const weight = Math.max(entry.size, 1);
      const destination = new File(assetDirectory, ...entry.path.split("/"));
      const parentDirectory = new Directory(
        assetDirectory,
        ...entry.path.split("/").slice(0, -1),
      );

      try {
        parentDirectory.create({ idempotent: true, intermediates: true });
        publish(`Checking ${entry.path}`, true);

        let alreadyCurrent =
          destination.exists && destination.size === entry.size;
        if (alreadyCurrent && installedVersion !== manifest.version) {
          if (entry.sha256) {
            alreadyCurrent =
              (await destination.digest("SHA-256")).toLowerCase() ===
              entry.sha256.toLowerCase();
          } else {
            alreadyCurrent = false;
          }
        }

        if (!alreadyCurrent) {
          if (destination.exists) destination.delete();
          activeBytes.set(entry.path, 0);
          publish(`Downloading ${entry.path}`, true);
          const task = File.createDownloadTask(
            `${REMOTE_ASSET_BASE_URL}/${encodePath(entry.path)}`,
            destination,
            {
              onProgress: ({ bytesWritten, totalBytes: fileTotalBytes }) => {
                activeBytes.set(
                  entry.path,
                  Math.min(
                    weight,
                    fileTotalBytes > 0
                      ? bytesWritten
                      : Math.min(bytesWritten, weight),
                  ),
                );
                publish(`Downloading ${entry.path}`);
              },
            },
          );
          const downloadedFile = await task.downloadAsync();
          if (!downloadedFile || !downloadedFile.exists) {
            throw new Error(`Download did not complete: ${entry.path}`);
          }
          if (entry.size > 0 && downloadedFile.size !== entry.size) {
            downloadedFile.delete();
            throw new Error(
              `Downloaded file size does not match the manifest: ${entry.path}`,
            );
          }
          if (
            entry.sha256 &&
            (await downloadedFile.digest("SHA-256")).toLowerCase() !==
              entry.sha256.toLowerCase()
          ) {
            downloadedFile.delete();
            throw new Error(
              `Downloaded file checksum does not match: ${entry.path}`,
            );
          }
          activeBytes.delete(entry.path);
        }

        completedBytes += weight;
        completedFiles += 1;
        publish(`Ready: ${entry.path}`, true);
      } catch (error) {
        activeBytes.delete(entry.path);
        downloadError =
          error instanceof Error
            ? error
            : new Error(`Failed to download ${entry.path}.`);
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(DOWNLOAD_CONCURRENCY, manifest.files.length) },
      () => worker(),
    ),
  );

  if (downloadError) throw downloadError;

  await installedVersionFile.write(manifest.version);
  onProgress({
    progress: 100,
    detail: `All ${manifest.files.length} assets are ready.`,
    completedFiles: manifest.files.length,
    totalFiles: manifest.files.length,
    error: null,
    isComplete: true,
  });
}
