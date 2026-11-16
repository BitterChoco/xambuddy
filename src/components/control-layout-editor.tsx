import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
    GestureDetector,
    GestureHandlerRootView,
    usePanGesture,
} from "react-native-gesture-handler";

import {
    createBattleControlPreset,
    type BattleControlId,
    type BattleControlSettings,
    type ControlSide,
} from "@/constants/player-settings";
import { getRemoteAssetSource } from "@/services/remote-assets";

const CONTROL_LABELS: Record<BattleControlId, string> = {
  joystick: "Joystick",
  fire: "Fire",
  gun: "Gun",
  grenade: "Grenade",
  heal: "Heal",
  dash: "Dash",
};

const CONTROL_PREVIEW_SIZES: Record<BattleControlId, number> = {
  joystick: 90,
  fire: 84,
  gun: 54,
  grenade: 54,
  heal: 54,
  dash: 54,
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const arenaBackground = getRemoteAssetSource("game/arena/arena_1.png");

type ControlLayoutEditorProps = {
  settings: BattleControlSettings;
  onSave: (settings: BattleControlSettings) => void;
  onCancel: () => void;
};

export function ControlLayoutEditor({
  settings,
  onSave,
  onCancel,
}: ControlLayoutEditorProps) {
  const [draftSettings, setDraftSettings] = useState(settings);
  const [selectedControl, setSelectedControl] =
    useState<BattleControlId>("joystick");
  const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  const [panelPosition, setPanelPosition] = useState({ x: 0.5, y: 0.035 });
  const settingsRef = useRef(draftSettings);
  const panelPositionRef = useRef(panelPosition);
  const controlDragStartRef = useRef<ControlSide | null>(null);
  const panelDragStartRef = useRef({ x: 0.5, y: 0.035 });

  useEffect(() => {
    settingsRef.current = draftSettings;
    panelPositionRef.current = panelPosition;
  }, [draftSettings, panelPosition]);

  const moveControl = (
    controlId: BattleControlId,
    translationX: number,
    translationY: number,
  ) => {
    if (
      !controlDragStartRef.current ||
      !screenSize.width ||
      !screenSize.height
    ) {
      return;
    }
    const start = controlDragStartRef.current;
    const diameter = CONTROL_PREVIEW_SIZES[controlId] * start.size;
    const xPadding = diameter / (2 * screenSize.width);
    const yPadding = diameter / (2 * screenSize.height);
    const position = {
      x: clamp(
        start.x + translationX / screenSize.width,
        xPadding,
        1 - xPadding,
      ),
      y: clamp(
        start.y + translationY / screenSize.height,
        yPadding,
        1 - yPadding,
      ),
    };
    setDraftSettings((latest) => ({
      ...latest,
      mode: "custom",
      controls: {
        ...latest.controls,
        [controlId]: { ...latest.controls[controlId], ...position },
      },
    }));
  };

  const beginControlDrag = (controlId: BattleControlId) => {
    controlDragStartRef.current = {
      ...settingsRef.current.controls[controlId],
    };
    setSelectedControl(controlId);
  };
  const endControlDrag = () => {
    controlDragStartRef.current = null;
  };

  const joystickGesture = usePanGesture({
    runOnJS: true,
    minDistance: 1,
    shouldCancelWhenOutside: false,
    onBegin: () => beginControlDrag("joystick"),
    onUpdate: (event) =>
      moveControl("joystick", event.translationX, event.translationY),
    onFinalize: endControlDrag,
  });
  const fireGesture = usePanGesture({
    runOnJS: true,
    minDistance: 1,
    shouldCancelWhenOutside: false,
    onBegin: () => beginControlDrag("fire"),
    onUpdate: (event) =>
      moveControl("fire", event.translationX, event.translationY),
    onFinalize: endControlDrag,
  });
  const gunGesture = usePanGesture({
    runOnJS: true,
    minDistance: 1,
    shouldCancelWhenOutside: false,
    onBegin: () => beginControlDrag("gun"),
    onUpdate: (event) =>
      moveControl("gun", event.translationX, event.translationY),
    onFinalize: endControlDrag,
  });
  const grenadeGesture = usePanGesture({
    runOnJS: true,
    minDistance: 1,
    shouldCancelWhenOutside: false,
    onBegin: () => beginControlDrag("grenade"),
    onUpdate: (event) =>
      moveControl("grenade", event.translationX, event.translationY),
    onFinalize: endControlDrag,
  });
  const healGesture = usePanGesture({
    runOnJS: true,
    minDistance: 1,
    shouldCancelWhenOutside: false,
    onBegin: () => beginControlDrag("heal"),
    onUpdate: (event) =>
      moveControl("heal", event.translationX, event.translationY),
    onFinalize: endControlDrag,
  });
  const dashGesture = usePanGesture({
    runOnJS: true,
    minDistance: 1,
    shouldCancelWhenOutside: false,
    onBegin: () => beginControlDrag("dash"),
    onUpdate: (event) =>
      moveControl("dash", event.translationX, event.translationY),
    onFinalize: endControlDrag,
  });
  const panelGesture = usePanGesture({
    runOnJS: true,
    minDistance: 1,
    shouldCancelWhenOutside: false,
    onBegin: () => {
      panelDragStartRef.current = { ...panelPositionRef.current };
    },
    onUpdate: (event) => {
      if (!screenSize.width || !screenSize.height) return;
      const maxLeft = Math.max(1, screenSize.width - panelSize.width - 16);
      const maxTop = Math.max(1, screenSize.height - panelSize.height - 16);
      const start = panelDragStartRef.current;
      const position = {
        x: clamp(start.x + event.translationX / maxLeft, 0, 1),
        y: clamp(start.y + event.translationY / maxTop, 0, 1),
      };
      panelPositionRef.current = position;
      setPanelPosition(position);
    },
  });

  const selectedSettings = draftSettings.controls[selectedControl];
  const changeSelected = (property: "size" | "opacity", value: number) => {
    setDraftSettings((current) => ({
      ...current,
      mode: "custom",
      controls: {
        ...current.controls,
        [selectedControl]: {
          ...current.controls[selectedControl],
          [property]: value,
        },
      },
    }));
  };
  const controlGestures = {
    joystick: joystickGesture,
    fire: fireGesture,
    gun: gunGesture,
    grenade: grenadeGesture,
    heal: healGesture,
    dash: dashGesture,
  };
  const panelLeft = clamp(
    panelPosition.x * Math.max(1, screenSize.width - panelSize.width - 16),
    8,
    Math.max(8, screenSize.width - panelSize.width - 8),
  );
  const panelTop = clamp(
    panelPosition.y * Math.max(1, screenSize.height - panelSize.height - 16),
    8,
    Math.max(8, screenSize.height - panelSize.height - 8),
  );

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View
          style={styles.screen}
          onLayout={(event) => setScreenSize(event.nativeEvent.layout)}
        >
          <Image
            source={arenaBackground}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            pointerEvents="none"
          />
          <View pointerEvents="none" style={styles.arenaShade} />
          <View pointerEvents="none" style={styles.arenaCenterMark} />

          <View pointerEvents="none" style={styles.playerHudBox}>
            <View style={styles.hudAvatar}>
              <Text style={styles.hudAvatarText}>P1</Text>
            </View>
            <View style={styles.hudDetails}>
              <Text style={styles.hudName}>PLAYER HUD</Text>
              <View style={styles.healthTrack}>
                <View style={styles.healthFill} />
              </View>
            </View>
          </View>
          <View pointerEvents="none" style={styles.scoreHudBox}>
            <Text style={styles.hudName}>SCORE · WAVE</Text>
            <Text style={styles.scoreText}>1250 · 04</Text>
            <Text style={styles.enemyText}>Enemies remaining: 8</Text>
          </View>
          <View pointerEvents="none" style={styles.pauseHudBox}>
            <View style={styles.pauseGlyphFrame}>
              <Text style={styles.pauseGlyph}>Ⅱ</Text>
            </View>
            <Text style={styles.zoneLabel}>PAUSE</Text>
          </View>
          <View pointerEvents="none" style={styles.countdownHudBox}>
            <Text style={styles.countdownText}>WAVE 4 · STARTS IN 12</Text>
            <Text style={styles.countdownSubtext}>
              PREPARATION · START WAVE
            </Text>
          </View>
          <View pointerEvents="none" style={styles.statusHudBox}>
            <Text style={styles.zoneLabel}>MATCH STATUS / BOSS BAR</Text>
          </View>
          <View pointerEvents="none" style={styles.footerHudBox}>
            <Text style={styles.zoneLabel}>HOST INFO / DEVICE EDGE</Text>
          </View>

          {(Object.keys(CONTROL_LABELS) as BattleControlId[]).map(
            (controlId) => {
              const control = draftSettings.controls[controlId];
              const baseSize = CONTROL_PREVIEW_SIZES[controlId];
              const isJoystick = controlId === "joystick";
              return (
                <GestureDetector
                  key={controlId}
                  gesture={controlGestures[controlId]}
                >
                  <View
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${CONTROL_LABELS[controlId]} battle control`}
                    style={[
                      styles.battleControl,
                      isJoystick
                        ? styles.joystickControl
                        : styles.actionControl,
                      {
                        left: `${control.x * 100}%`,
                        top: `${control.y * 100}%`,
                        width: baseSize * control.size,
                        height: baseSize * control.size,
                        marginLeft: -(baseSize * control.size) / 2,
                        marginTop: -(baseSize * control.size) / 2,
                        opacity: control.opacity,
                        borderColor:
                          selectedControl === controlId ? "#bef264" : "#7dd3fc",
                      },
                    ]}
                  >
                    {isJoystick ? (
                      <View style={styles.joystickKnob} />
                    ) : (
                      <Text style={styles.actionControlLabel} numberOfLines={1}>
                        {controlId === "fire"
                          ? "FIRE"
                          : CONTROL_LABELS[controlId].toUpperCase()}
                      </Text>
                    )}
                  </View>
                </GestureDetector>
              );
            },
          )}

          <View
            onLayout={(event) => setPanelSize(event.nativeEvent.layout)}
            style={[styles.settingsPanel, { left: panelLeft, top: panelTop }]}
          >
            <View style={styles.panelHeading}>
              <GestureDetector gesture={panelGesture}>
                <View style={styles.panelDragHandle}>
                  <View style={styles.dragGrip} />
                  <View style={styles.panelTitleGroup}>
                    <Text style={styles.panelEyebrow}>
                      BATTLE CONTROL EDITOR
                    </Text>
                    <Text style={styles.panelTitle}>CUSTOMIZE LAYOUT</Text>
                  </View>
                </View>
              </GestureDetector>
            </View>

            <Text style={styles.panelHint}>
              Select a control, then drag it over the battle screen.
            </Text>
            <View style={styles.controlPicker}>
              {(Object.keys(CONTROL_LABELS) as BattleControlId[]).map(
                (controlId) => (
                  <Pressable
                    key={controlId}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: selectedControl === controlId,
                    }}
                    onPress={() => setSelectedControl(controlId)}
                    style={[
                      styles.pickerButton,
                      selectedControl === controlId &&
                        styles.pickerButtonSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerButtonText,
                        selectedControl === controlId &&
                          styles.pickerButtonTextSelected,
                      ]}
                    >
                      {CONTROL_LABELS[controlId]}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>

            <View style={styles.sliderHeading}>
              <Text style={styles.sliderLabel}>
                SIZE · {CONTROL_LABELS[selectedControl]}
              </Text>
              <Text style={styles.sliderValue}>
                {Math.round(selectedSettings.size * 100)}%
              </Text>
            </View>
            <Slider
              accessibilityLabel={`${CONTROL_LABELS[selectedControl]} size`}
              minimumValue={0.65}
              maximumValue={1.5}
              step={0.05}
              value={selectedSettings.size}
              onValueChange={(value) => changeSelected("size", value)}
              minimumTrackTintColor="#4ade80"
              maximumTrackTintColor="#475569"
              thumbTintColor="#dcfce7"
              style={styles.slider}
            />
            <View style={styles.sliderHeading}>
              <Text style={styles.sliderLabel}>OPACITY</Text>
              <Text style={styles.sliderValue}>
                {Math.round(selectedSettings.opacity * 100)}%
              </Text>
            </View>
            <Slider
              accessibilityLabel={`${CONTROL_LABELS[selectedControl]} opacity`}
              minimumValue={0.25}
              maximumValue={1}
              step={0.05}
              value={selectedSettings.opacity}
              onValueChange={(value) => changeSelected("opacity", value)}
              minimumTrackTintColor="#4ade80"
              maximumTrackTintColor="#475569"
              thumbTintColor="#dcfce7"
              style={styles.slider}
            />
            <View style={styles.editorActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const reset = createBattleControlPreset("righty");
                  setDraftSettings({ ...reset, mode: "custom" });
                  setSelectedControl("joystick");
                }}
                style={[styles.editorActionButton, styles.resetButton]}
              >
                <Text style={styles.editorActionText}>RESET</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onCancel}
                style={styles.editorActionButton}
              >
                <Text style={styles.editorActionText}>CANCEL</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onSave({ ...draftSettings, mode: "custom" })}
                style={[styles.editorActionButton, styles.saveButton]}
              >
                <Text style={styles.editorActionText}>SAVE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  screen: { flex: 1, overflow: "hidden", backgroundColor: "#07110d" },
  arenaShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(2, 12, 9, 0.25)",
  },
  arenaCenterMark: {
    position: "absolute",
    width: 140,
    height: 140,
    left: "50%",
    top: "52%",
    marginLeft: -70,
    marginTop: -70,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.18)",
    backgroundColor: "rgba(4, 17, 13, 0.18)",
  },
  playerHudBox: {
    position: "absolute",
    top: 12,
    left: 12,
    minWidth: 146,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(190, 242, 100, 0.8)",
    backgroundColor: "rgba(5, 18, 14, 0.72)",
  },
  hudAvatar: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#a3e635",
    backgroundColor: "#1c3226",
  },
  hudAvatarText: { color: "#f0fdf4", fontSize: 9, fontWeight: "900" },
  hudDetails: { flex: 1, gap: 4 },
  hudName: {
    color: "#ecfccb",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  healthTrack: {
    height: 6,
    overflow: "hidden",
    borderRadius: 99,
    backgroundColor: "#334155",
  },
  healthFill: { width: "75%", height: "100%", backgroundColor: "#ef4444" },
  scoreHudBox: {
    position: "absolute",
    top: 12,
    right: 54,
    minWidth: 108,
    padding: 6,
    gap: 3,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(125, 211, 252, 0.8)",
    backgroundColor: "rgba(5, 18, 14, 0.72)",
  },
  scoreText: { color: "#f0fdf4", fontSize: 10, fontWeight: "900" },
  enemyText: { color: "#cbd5e1", fontSize: 7, fontWeight: "700" },
  pauseHudBox: {
    position: "absolute",
    top: 10,
    right: 8,
    alignItems: "center",
    gap: 2,
  },
  pauseGlyphFrame: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 2.5,
    borderStyle: "dashed",
    borderColor: "#7dd3fc",
    backgroundColor: "rgba(15, 23, 42, 0.82)",
  },
  pauseGlyph: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
    textAlignVertical: "center",
  },
  countdownHudBox: {
    position: "absolute",
    top: 76,
    left: "50%",
    width: 220,
    marginLeft: -110,
    alignItems: "center",
    padding: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(251, 191, 36, 0.8)",
    backgroundColor: "rgba(5, 18, 14, 0.66)",
  },
  countdownText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  countdownSubtext: {
    marginTop: 3,
    color: "#fde68a",
    fontSize: 7,
    fontWeight: "800",
  },
  statusHudBox: {
    position: "absolute",
    top: "42%",
    left: 12,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(248, 113, 113, 0.55)",
    backgroundColor: "rgba(5, 18, 14, 0.45)",
  },
  footerHudBox: {
    position: "absolute",
    left: "50%",
    bottom: 4,
    marginLeft: -68,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(190, 242, 100, 0.48)",
    backgroundColor: "rgba(5, 18, 14, 0.52)",
  },
  zoneLabel: {
    color: "#e2e8f0",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  battleControl: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
  },
  joystickControl: { borderRadius: 999, borderColor: "#7dd3fc" },
  actionControl: { borderRadius: 999, borderColor: "#7dd3fc" },
  joystickKnob: {
    width: "38%",
    height: "38%",
    borderRadius: 999,
    backgroundColor: "#bfdbfe",
  },
  actionControlLabel: {
    color: "#f8fafc",
    fontSize: 8,
    fontWeight: "900",
    textAlign: "center",
  },
  settingsPanel: {
    position: "absolute",
    zIndex: 50,
    width: "94%",
    maxWidth: 380,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(190, 242, 100, 0.75)",
    backgroundColor: "rgba(4, 17, 13, 0.94)",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 18,
  },
  panelDragHandle: { flex: 1, paddingBottom: 4 },
  dragGrip: {
    width: 34,
    height: 3,
    alignSelf: "center",
    marginBottom: 5,
    borderRadius: 99,
    backgroundColor: "rgba(226, 232, 240, 0.44)",
  },
  panelHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  panelTitleGroup: { flex: 1, gap: 2 },
  panelEyebrow: {
    color: "#a3e635",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  panelTitle: {
    color: "#f0fdf4",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  editorActions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  editorActionButton: {
    flex: 1,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.35)",
    backgroundColor: "rgba(15, 35, 25, 0.9)",
  },
  resetButton: { borderColor: "rgba(251, 191, 36, 0.65)" },
  saveButton: {
    borderColor: "rgba(190, 242, 100, 0.8)",
    backgroundColor: "rgba(54, 83, 20, 0.85)",
  },
  editorActionText: { color: "#ecfccb", fontSize: 9, fontWeight: "900" },
  panelHint: { marginBottom: 5, color: "#a9bcb0", fontSize: 8, lineHeight: 11 },
  controlPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 5,
  },
  pickerButton: {
    minWidth: "31%",
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(217, 249, 157, 0.2)",
    backgroundColor: "rgba(15, 35, 25, 0.8)",
  },
  pickerButtonSelected: {
    borderColor: "#84cc16",
    backgroundColor: "rgba(54, 83, 20, 0.85)",
  },
  pickerButtonText: { color: "#cbd5e1", fontSize: 8, fontWeight: "800" },
  pickerButtonTextSelected: { color: "#f0fdf4" },
  sliderHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sliderLabel: {
    color: "#f0fdf4",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  sliderValue: { color: "#bef264", fontSize: 9, fontWeight: "900" },
  slider: { width: "100%", height: 25, marginTop: -4 },
});
