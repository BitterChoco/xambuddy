import {
    DownloadTask,
    File,
    Paths,
    type DownloadPauseState,
} from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import * as Network from "expo-network";
import { AppState, Platform } from "react-native";

export const APP_UPDATE_MANIFEST_URL =
  "https://raw.githubusercontent.com/BitterChoco/storage-release/main/wild-paw/data/app_manifest.json";
const APP_UPDATE_MANIFEST_FALLBACK_URL =
  "https://github.com/BitterChoco/storage-release/raw/refs/heads/main/wild-paw/data/app_manifest.json";

export type AppUpdateProgress = {
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  detail: string;
};

type AppUpdateManifest = {
  path: string;
  version: string;
};

type SavedUpdateDownload = {
  version: string;
  path: string;
  task: DownloadPauseState;
};

function validateManifest(value: unknown): AppUpdateManifest {
  if (!value || typeof value !== "object") {
    throw new Error("The app update manifest is not a JSON object.");
  }

  const manifest = value as Partial<AppUpdateManifest>;
  if (
    typeof manifest.path !== "string" ||
    typeof manifest.version !== "string" ||
    !/^\d+(?:\.\d+){1,3}$/.test(manifest.version)
  ) {
    throw new Error("The app update manifest has an invalid path or version.");
  }

  let downloadUrl: URL;
  try {
    downloadUrl = new URL(manifest.path);
  } catch {
    throw new Error(
      "The app update manifest contains an invalid download URL.",
    );
  }
  if (
    downloadUrl.protocol !== "https:" ||
    !["expo.dev", "www.expo.dev"].includes(downloadUrl.hostname)
  ) {
    throw new Error("App updates must be downloaded from expo.dev over HTTPS.");
  }

  return { path: downloadUrl.toString(), version: manifest.version };
}

function compareVersions(first: string, second: string) {
  const firstParts = first.split(".").map(Number);
  const secondParts = second.split(".").map(Number);
  const partCount = Math.max(firstParts.length, secondParts.length);

  for (let index = 0; index < partCount; index += 1) {
    const difference = (firstParts[index] ?? 0) - (secondParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }

  return 0;
}

async function getManifest(onProgress: (progress: AppUpdateProgress) => void) {
  const cachedManifestFile = new File(Paths.document, "app_manifest.json");
  onProgress({
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    detail: "Checking for an app update…",
  });

  let lastError: Error = new Error("Unable to reach the app update manifest.");
  for (const url of [
    APP_UPDATE_MANIFEST_URL,
    APP_UPDATE_MANIFEST_FALLBACK_URL,
  ]) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        lastError = new Error(
          `App update manifest request failed with HTTP ${response.status}.`,
        );
        continue;
      }

      const manifest = validateManifest(await response.json());
      await cachedManifestFile.write(JSON.stringify(manifest));
      return manifest;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Unable to check for an app update.");
    }
  }

  if (cachedManifestFile.exists) {
    try {
      return validateManifest(await cachedManifestFile.json());
    } catch {
      // Report the network error if there is no usable cached manifest.
    }
  }

  throw lastError;
}

function isSavedUpdateDownload(
  value: unknown,
  manifest: AppUpdateManifest,
  destination: File,
): value is SavedUpdateDownload {
  if (!value || typeof value !== "object") return false;

  const saved = value as Partial<SavedUpdateDownload>;
  const task = saved.task;
  return (
    saved.version === manifest.version &&
    saved.path === manifest.path &&
    !!task &&
    typeof task === "object" &&
    task.url === manifest.path &&
    task.fileUri === destination.uri &&
    task.isDirectory === false
  );
}

async function waitForAppAndInternet() {
  while (true) {
    const networkState = await Network.getNetworkStateAsync().catch(() => ({
      isConnected: true,
      isInternetReachable: true,
    }));
    if (
      AppState.currentState === "active" &&
      networkState.isConnected !== false &&
      networkState.isInternetReachable !== false
    ) {
      return;
    }

    await new Promise<void>((resolve) => {
      let isActive = AppState.currentState === "active";
      let isOnline =
        networkState.isConnected !== false &&
        networkState.isInternetReachable !== false;
      let appStateSubscription: ReturnType<typeof AppState.addEventListener>;
      let networkSubscription: ReturnType<
        typeof Network.addNetworkStateListener
      >;

      const finishIfReady = () => {
        if (!isActive || !isOnline) return;
        appStateSubscription.remove();
        networkSubscription.remove();
        resolve();
      };

      appStateSubscription = AppState.addEventListener("change", (state) => {
        isActive = state === "active";
        finishIfReady();
      });
      networkSubscription = Network.addNetworkStateListener((state) => {
        isOnline =
          state.isConnected !== false && state.isInternetReachable !== false;
        finishIfReady();
      });
      void Network.getNetworkStateAsync().then((state) => {
        isOnline =
          state.isConnected !== false && state.isInternetReachable !== false;
        finishIfReady();
      });
      finishIfReady();
    });
  }
}

async function downloadUpdateWithPauseSupport(
  manifest: AppUpdateManifest,
  destination: File,
  savedState: DownloadPauseState | null,
  onProgress: (progress: AppUpdateProgress) => void,
): Promise<
  | { status: "paused"; task: DownloadPauseState }
  | { status: "done"; file: File }
> {
  await waitForAppAndInternet();

  const task = savedState
    ? DownloadTask.fromSavable(savedState, {
        onProgress: ({ bytesWritten, totalBytes }) => {
          onProgress({
            progress:
              totalBytes > 0
                ? Math.min(99, Math.floor((bytesWritten / totalBytes) * 100))
                : 0,
            downloadedBytes: bytesWritten,
            totalBytes: Math.max(0, totalBytes),
            detail: `Resuming app update ${manifest.version}…`,
          });
        },
      })
    : File.createDownloadTask(manifest.path, destination, {
        onProgress: ({ bytesWritten, totalBytes }) => {
          onProgress({
            progress:
              totalBytes > 0
                ? Math.min(99, Math.floor((bytesWritten / totalBytes) * 100))
                : 0,
            downloadedBytes: bytesWritten,
            totalBytes: Math.max(0, totalBytes),
            detail: `Downloading app update ${manifest.version}…`,
          });
        },
      });

  const appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state !== "active" && task.state === "active") task.pause();
  });
  const networkSubscription = Network.addNetworkStateListener((state) => {
    if (
      (state.isConnected === false || state.isInternetReachable === false) &&
      task.state === "active"
    ) {
      task.pause();
    }
  });

  try {
    const downloadPromise =
      task.state === "paused" ? task.resumeAsync() : task.downloadAsync();
    if (AppState.currentState !== "active" && task.state === "active") {
      task.pause();
    }
    const file = await downloadPromise;
    if (file) return { status: "done", file };
    if (task.state !== "paused") {
      throw new Error("The app update download stopped unexpectedly.");
    }
    return { status: "paused", task: task.savable() };
  } finally {
    appStateSubscription.remove();
    networkSubscription.remove();
    task.release();
  }
}

export async function launchAndroidUpdateInstaller(apkUri: string) {
  if (Platform.OS !== "android") {
    throw new Error("APK updates can only be installed on Android.");
  }

  const apkFile = new File(apkUri);
  if (!apkFile.exists || apkFile.size <= 0) {
    throw new Error("The downloaded app update is missing. Please retry.");
  }

  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: apkFile.contentUri,
    type: "application/vnd.android.package-archive",
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}

export async function checkAndInstallAndroidUpdate(
  installedVersion: string,
  onProgress: (progress: AppUpdateProgress) => void,
): Promise<
  | { status: "current" }
  | { status: "install-required"; apkUri: string; version: string }
> {
  if (Platform.OS !== "android") return { status: "current" };

  const manifest = await getManifest(onProgress);
  if (compareVersions(manifest.version, installedVersion) <= 0) {
    onProgress({
      progress: 100,
      downloadedBytes: 0,
      totalBytes: 0,
      detail: "The app is up to date.",
    });
    return { status: "current" };
  }

  const updateName = `wild-paw-update-${manifest.version}`;
  const apkFile = new File(Paths.document, `${updateName}.apk`);
  const partialApkFile = new File(Paths.document, `${updateName}.part`);
  const metadataFile = new File(Paths.document, `${updateName}.json`);
  const resumeStateFile = new File(
    Paths.document,
    `${updateName}-download.json`,
  );

  if (apkFile.exists && metadataFile.exists) {
    try {
      const metadata = (await metadataFile.json()) as {
        path?: string;
        size?: number;
      };
      if (
        metadata.path === manifest.path &&
        metadata.size === apkFile.size &&
        apkFile.size >= 1024 * 1024
      ) {
        onProgress({
          progress: 100,
          downloadedBytes: apkFile.size,
          totalBytes: apkFile.size,
          detail: `App update ${manifest.version} is ready to install.`,
        });
        return {
          status: "install-required",
          apkUri: apkFile.uri,
          version: manifest.version,
        };
      }
    } catch {
      // Discard invalid completion metadata and download a clean copy below.
    }
    apkFile.delete();
    metadataFile.delete();
  }

  let savedDownload: SavedUpdateDownload | null = null;
  if (resumeStateFile.exists) {
    try {
      const value: unknown = await resumeStateFile.json();
      if (isSavedUpdateDownload(value, manifest, partialApkFile)) {
        savedDownload = value;
      } else {
        resumeStateFile.delete();
        if (partialApkFile.exists) partialApkFile.delete();
      }
    } catch {
      resumeStateFile.delete();
      if (partialApkFile.exists) partialApkFile.delete();
    }
  }
  if (!savedDownload && partialApkFile.exists) partialApkFile.delete();

  onProgress({
    progress: savedDownload ? 1 : 0,
    downloadedBytes: partialApkFile.exists ? partialApkFile.size : 0,
    totalBytes: 0,
    detail: savedDownload
      ? `Continuing app update ${manifest.version}…`
      : `Downloading app update ${manifest.version}…`,
  });

  let downloadState = savedDownload?.task ?? null;
  let downloadedFile: File | null = null;
  while (!downloadedFile) {
    let result: Awaited<ReturnType<typeof downloadUpdateWithPauseSupport>>;
    try {
      result = await downloadUpdateWithPauseSupport(
        manifest,
        partialApkFile,
        downloadState,
        onProgress,
      );
    } catch (error) {
      const cause =
        error instanceof Error ? error.message : "Unknown download error.";
      throw new Error(
        `Could not download app update ${manifest.version}. Check the APK path in app_manifest.json. ${cause}`,
      );
    }
    if (result.status === "done") {
      downloadedFile = result.file;
      break;
    }

    downloadState = result.task;
    await resumeStateFile.write(
      JSON.stringify({
        version: manifest.version,
        path: manifest.path,
        task: downloadState,
      } satisfies SavedUpdateDownload),
    );
    const downloadedBytes = partialApkFile.exists ? partialApkFile.size : 0;
    onProgress({
      progress: 0,
      downloadedBytes,
      totalBytes: 0,
      detail: `Download paused at ${formatDownloadBytes(downloadedBytes)}. Waiting for the app and internet connection…`,
    });
  }

  if (!downloadedFile.exists || downloadedFile.size < 1024 * 1024) {
    if (downloadedFile.exists) downloadedFile.delete();
    resumeStateFile.delete();
    throw new Error("The app update download is incomplete. Please retry.");
  }

  await downloadedFile.move(apkFile, { overwrite: true });
  await metadataFile.write(
    JSON.stringify({ path: manifest.path, size: apkFile.size }),
  );
  if (resumeStateFile.exists) resumeStateFile.delete();

  onProgress({
    progress: 100,
    downloadedBytes: apkFile.size,
    totalBytes: apkFile.size,
    detail: `App update ${manifest.version} downloaded. Opening installer…`,
  });
  return {
    status: "install-required",
    apkUri: apkFile.uri,
    version: manifest.version,
  };
}

function formatDownloadBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const megabytes = bytes / 1024 / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}
