import { SoundPressable as Pressable } from "@/components/ui/sound-pressable";
import { initializeRemoteBuddyCatalog } from "@/constants/buddy-catalog";
import { initializeRemoteGameCatalogs } from "@/constants/game-catalog";
import { initializeRemoteGameConfiguration } from "@/constants/game-configuration";
import { initializeDefaultPlayerInventory } from "@/constants/player-inventory";
import {
  getMusicVolume,
  subscribeToMusicVolume,
} from "@/constants/player-settings";
import { initializeRemoteStorePricing } from "@/constants/store-pricing";
import "@/global.css";
import {
  checkAndInstallAndroidUpdate,
  launchAndroidUpdateInstaller,
  type AppUpdateProgress,
} from "@/services/app-update";
import {
  createInitialAssetLoadingState,
  getRemoteAssetSource,
  loadRemoteAssets,
  type AssetLoadingState,
} from "@/services/remote-assets";
import * as Application from "expo-application";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Image } from "expo-image";
import { useNetworkState } from "expo-network";
import { DarkTheme, Stack, ThemeProvider, usePathname } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { BackHandler, Platform, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

const loadingScreenImage = require("@/assets/images/loading_screen.jpg");
const loadingMusic = require("@/assets/sound/turning_pages-lantern-in-the-glade-600973.mp3");
const menuMusic = getRemoteAssetSource("game/music/menu_1.mp3");
const battleMusic = getRemoteAssetSource("game/music/battle_1.mp3");

type AppUpdateState = AppUpdateProgress & {
  status:
    | "checking"
    | "downloading"
    | "installing"
    | "required"
    | "error"
    | "complete";
  error: string | null;
  apkUri: string | null;
  version: string | null;
};

function createInitialAppUpdateState(): AppUpdateState {
  return {
    status: "checking",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    detail: "Checking for app updates…",
    error: null,
    apkUri: null,
    version: null,
  };
}

if (Platform.OS !== "web") {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function RootLayout() {
  const pathname = usePathname();
  const networkState = useNetworkState();
  const musicPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(
    null,
  );
  const [isAppLayoutReady, setIsAppLayoutReady] = useState(false);
  const [isLoadingScreenVisible, setIsLoadingScreenVisible] = useState(true);
  const [assetLoadingState, setAssetLoadingState] = useState<AssetLoadingState>(
    createInitialAssetLoadingState,
  );
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>(
    createInitialAppUpdateState,
  );
  const [assetLoadAttempt, setAssetLoadAttempt] = useState(0);
  const [musicVolume, setMusicVolume] = useState(0.5);
  const [isAudioModeReady, setIsAudioModeReady] = useState(false);
  const activeTrackRef = useRef<string | number | null>(null);
  const musicVolumeRef = useRef(musicVolume);
  const isInternetUnavailable =
    networkState.isConnected === false ||
    networkState.isInternetReachable === false;
  const isInternetWarningVisible =
    isInternetUnavailable &&
    appUpdateState.status !== "required" &&
    appUpdateState.status !== "installing";
  const isInternetUnavailableRef = useRef(isInternetUnavailable);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    isInternetUnavailableRef.current = isInternetUnavailable;
  }, [isInternetUnavailable]);

  useEffect(() => {
    let isMounted = true;
    let updateCheckComplete = false;
    void (async () => {
      try {
        setAppUpdateState(createInitialAppUpdateState());
        const updateResult = await checkAndInstallAndroidUpdate(
          Application.nativeApplicationVersion ?? "0.0.0",
          (progress) => {
            if (!isMounted) return;
            setAppUpdateState((current) => ({
              ...current,
              ...progress,
              status:
                progress.detail.startsWith("Downloading") ||
                progress.detail.startsWith("Resuming")
                  ? "downloading"
                  : "checking",
              error: null,
            }));
          },
        );
        if (!isMounted) return;
        if (updateResult.status === "install-required") {
          setAppUpdateState((current) => ({
            ...current,
            status: "installing",
            detail: `Installing app update ${updateResult.version}… Confirm installation in Android.`,
            apkUri: updateResult.apkUri,
            version: updateResult.version,
            error: null,
          }));
          await launchAndroidUpdateInstaller(updateResult.apkUri);
          if (!isMounted) return;
          setAppUpdateState((current) => ({
            ...current,
            status: "required",
            detail: `Update ${updateResult.version} is required. Complete installation in Android, then reopen Wild Paw.`,
          }));
          return;
        }
        setAppUpdateState((current) => ({
          ...current,
          status: "complete",
          progress: 100,
          detail: "The app is up to date.",
          error: null,
        }));
        updateCheckComplete = true;

        await loadRemoteAssets((state) => {
          if (isMounted && !state.isComplete) setAssetLoadingState(state);
        });
        if (!isMounted) return;
        setAssetLoadingState((state) => ({
          ...state,
          progress: 99,
          detail: "Loading game catalogs…",
          isComplete: false,
        }));
        await Promise.all([
          initializeRemoteGameCatalogs(),
          initializeRemoteBuddyCatalog(),
          initializeRemoteGameConfiguration(),
          initializeRemoteStorePricing(),
        ]);
        initializeDefaultPlayerInventory();
        if (!isMounted) return;
        setAssetLoadingState((state) => ({
          ...state,
          progress: 100,
          detail: "All game assets and catalogs are ready.",
          isComplete: true,
        }));
      } catch (error: unknown) {
        if (!isMounted) return;
        const message = isInternetUnavailableRef.current
          ? "An internet connection is required to start Wild Paw. Connect to Wi-Fi or mobile data and retry."
          : error instanceof Error
            ? error.message
            : "Unable to complete startup.";
        if (updateCheckComplete) {
          setAssetLoadingState((current) => ({
            ...current,
            detail: "Asset download failed.",
            error: message,
            isComplete: false,
          }));
          return;
        }
        setAppUpdateState((current) => ({
          ...current,
          status: "error",
          detail: "Unable to check or install the app update.",
          error: message,
        }));
        setAssetLoadingState((current) => ({
          ...current,
          detail: "Startup is paused until the app update check succeeds.",
          error: null,
          isComplete: false,
        }));
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [assetLoadAttempt]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      ).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    })
      .catch(() => undefined)
      .then(() => {
        if (!isMounted) return;
        const player = createAudioPlayer(loadingMusic);
        player.loop = true;
        player.volume = musicVolumeRef.current;
        musicPlayerRef.current = player;
        activeTrackRef.current = loadingMusic;
        player.play();
        setIsAudioModeReady(true);
      });

    return () => {
      isMounted = false;
      musicPlayerRef.current?.pause();
      musicPlayerRef.current?.remove();
      musicPlayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToMusicVolume(setMusicVolume);
    void getMusicVolume().then((volume) => {
      if (isMounted) setMusicVolume(volume);
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    musicVolumeRef.current = musicVolume;
    const player = musicPlayerRef.current;
    if (player) player.volume = musicVolume;
  }, [musicVolume]);

  useEffect(() => {
    if (!isAudioModeReady) return;
    const player = musicPlayerRef.current;
    if (!player) return;

    const nextTrack = isLoadingScreenVisible
      ? loadingMusic
      : pathname === "/game"
        ? battleMusic
        : menuMusic;
    const nextTrackId =
      typeof nextTrack === "number" ? nextTrack : nextTrack.uri;
    if (activeTrackRef.current === nextTrackId) return;

    if (activeTrackRef.current !== null) player.pause();
    player.replace(nextTrack);
    player.loop = true;
    player.volume = musicVolumeRef.current;
    player.play();
    activeTrackRef.current = nextTrackId;
  }, [isAudioModeReady, isLoadingScreenVisible, pathname]);

  useEffect(() => {
    if (!isAppLayoutReady) return;

    if (Platform.OS !== "web") {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
    if (!assetLoadingState.isComplete) return;

    const timeout = setTimeout(() => setIsLoadingScreenVisible(false), 900);
    return () => clearTimeout(timeout);
  }, [assetLoadingState.isComplete, isAppLayoutReady]);

  const retryAssetDownload = () => {
    setAssetLoadingState(createInitialAssetLoadingState());
    setAssetLoadAttempt((attempt) => attempt + 1);
  };

  const retryAppUpdate = () => {
    if (appUpdateState.status === "required" && appUpdateState.apkUri) {
      setAppUpdateState((current) => ({
        ...current,
        status: "installing",
        detail: `Opening installer for update ${current.version}…`,
        error: null,
      }));
      void launchAndroidUpdateInstaller(appUpdateState.apkUri)
        .then(() => {
          setAppUpdateState((current) => ({
            ...current,
            status: "required",
            detail: `Update ${current.version} is required. Complete installation in Android, then reopen Wild Paw.`,
          }));
        })
        .catch((error: unknown) => {
          setAppUpdateState((current) => ({
            ...current,
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Unable to open the Android installer.",
          }));
        });
      return;
    }

    retryAssetDownload();
  };

  const isAppUpdateBlocking = appUpdateState.status !== "complete";
  const visibleProgress = isAppUpdateBlocking
    ? appUpdateState.progress
    : assetLoadingState.progress;
  const visibleDownloadedBytes = isAppUpdateBlocking
    ? appUpdateState.downloadedBytes
    : assetLoadingState.downloadedBytes;
  const visibleTotalDownloadBytes = isAppUpdateBlocking
    ? appUpdateState.totalBytes
    : assetLoadingState.totalDownloadBytes;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }} onLayout={() => setIsAppLayoutReady(true)}>
        <StatusBar hidden />
        {assetLoadingState.isComplete && (
          <ThemeProvider value={DarkTheme}>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: "none",
                gestureEnabled: false,
                contentStyle: { backgroundColor: "#06150f" },
              }}
            ></Stack>
          </ThemeProvider>
        )}
        {isLoadingScreenVisible && (
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "#06150f",
            }}
          >
            <Image
              source={loadingScreenImage}
              contentFit="cover"
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                width: "100%",
                height: "100%",
              }}
              accessibilityLabel="Wild Paw loading screen"
            />
            <View
              style={{
                position: "absolute",
                left: 24,
                right: 24,
                bottom: 20,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 20,
                  fontWeight: "800",
                  textShadowColor: "rgba(0,0,0,0.95)",
                  textShadowOffset: { width: 1, height: 1 },
                  textShadowRadius: 3,
                }}
              >
                Preparing Wild Paw
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  color: "#fff",
                  marginTop: 6,
                  fontSize: 13,
                  textShadowColor: "rgba(0,0,0,0.95)",
                  textShadowOffset: { width: 1, height: 1 },
                  textShadowRadius: 3,
                }}
              >
                {isInternetWarningVisible
                  ? "An internet connection is required to start Wild Paw."
                  : isAppUpdateBlocking
                    ? (appUpdateState.error ?? appUpdateState.detail)
                    : (assetLoadingState.error ?? assetLoadingState.detail)}
              </Text>
              {isInternetWarningVisible && (
                <Text
                  accessibilityRole="alert"
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 8,
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "rgba(252, 165, 165, 0.75)",
                    backgroundColor: "rgba(127, 29, 29, 0.78)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: "800",
                  }}
                >
                  ⚠ Internet is needed to check app updates and download game
                  content. Connect to Wi-Fi or mobile data, then retry.
                </Text>
              )}
              <View
                style={{
                  height: 9,
                  overflow: "hidden",
                  marginTop: 13,
                  borderRadius: 8,
                  backgroundColor: "rgba(255,255,255,0.18)",
                }}
              >
                <View
                  style={{
                    width: `${visibleProgress}%`,
                    height: "100%",
                    borderRadius: 8,
                    backgroundColor: "#34d399",
                  }}
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 7,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 12,
                    textShadowColor: "rgba(0,0,0,0.95)",
                    textShadowOffset: { width: 1, height: 1 },
                    textShadowRadius: 3,
                  }}
                >
                  {isAppUpdateBlocking
                    ? "App update"
                    : assetLoadingState.totalFiles > 0
                      ? `${assetLoadingState.completedFiles}/${assetLoadingState.totalFiles} files`
                      : "Release assets"}
                </Text>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: "700",
                    textShadowColor: "rgba(0,0,0,0.95)",
                    textShadowOffset: { width: 1, height: 1 },
                    textShadowRadius: 3,
                  }}
                >
                  {visibleProgress}%
                </Text>
              </View>
              <Text
                style={{
                  color: "rgba(255,255,255,0.9)",
                  marginTop: 4,
                  fontSize: 11,
                  textAlign: "center",
                  textShadowColor: "rgba(0,0,0,0.95)",
                  textShadowOffset: { width: 1, height: 1 },
                  textShadowRadius: 3,
                }}
              >
                {isAppUpdateBlocking
                  ? visibleTotalDownloadBytes > 0
                    ? `${formatBytes(visibleDownloadedBytes)} / ${formatBytes(visibleTotalDownloadBytes)} downloaded`
                    : "Checking the latest app version…"
                  : Platform.OS === "web"
                    ? "Assets load on demand"
                    : assetLoadingState.totalFiles === 0
                      ? "Calculating download size…"
                      : `${formatBytes(assetLoadingState.downloadedBytes)} / ${formatBytes(assetLoadingState.totalDownloadBytes)} downloaded`}
              </Text>
              {!isAppUpdateBlocking &&
                Platform.OS !== "web" &&
                assetLoadingState.totalDownloadBytes > 0 &&
                !assetLoadingState.isComplete && (
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.9)",
                      marginTop: 3,
                      fontSize: 11,
                      textAlign: "center",
                      textShadowColor: "rgba(0,0,0,0.95)",
                      textShadowOffset: { width: 1, height: 1 },
                      textShadowRadius: 3,
                    }}
                  >
                    Download speed:{" "}
                    {formatBytes(assetLoadingState.downloadSpeedBytesPerSecond)}
                    /s
                  </Text>
                )}
              {(appUpdateState.status === "error" ||
                appUpdateState.status === "required") && (
                <Pressable
                  onPress={retryAppUpdate}
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 12,
                    paddingHorizontal: 15,
                    paddingVertical: 8,
                    borderRadius: 9,
                    backgroundColor: "#059669",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    {appUpdateState.status === "required"
                      ? "Install update"
                      : "Retry update check"}
                  </Text>
                </Pressable>
              )}
              {!isAppUpdateBlocking && assetLoadingState.error && (
                <Pressable
                  onPress={retryAssetDownload}
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 12,
                    paddingHorizontal: 15,
                    paddingVertical: 8,
                    borderRadius: 9,
                    backgroundColor: "#059669",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    Retry
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
