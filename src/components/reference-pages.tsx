import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
    Animated,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import aniimoData from "@/data/aniimos.json";
import eventData from "@/data/events.json";
import codeData from "@/data/redeem-codes.json";
import regionData from "@/data/regions.json";
import counterData from "@/data/skill-counters.json";
import { useTheme } from "@/hooks/use-theme";

const ACCENT = "#6C63FF";

type Region = (typeof regionData.regions)[number];
type AniimoRecord = (typeof aniimoData.aniimos)[number];

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const router = useRouter();
  return (
    <View style={styles.pageHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <ThemedText style={styles.backArrow}>‹</ThemedText>
        <ThemedText type="smallBold">Back</ThemedText>
      </Pressable>
      <ThemedText type="title" style={styles.pageTitle}>
        {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary">{subtitle}</ThemedText>
    </View>
  );
}

export function MapPage() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ region?: string }>();
  const initialRegion =
    regionData.regions.find((region) => region.id === params.region) ??
    regionData.regions[0];
  const [selectedRegion, setSelectedRegion] = useState<Region>(initialRegion);
  const [zoom, setZoom] = useState(1);
  const [scale] = useState(() => new Animated.Value(1));

  const regionAniimos = aniimoData.aniimos.filter((aniimo) =>
    selectedRegion.availableAniimoNumbers.includes(aniimo.number),
  );

  const updateZoom = (nextZoom: number) => {
    const boundedZoom = Math.max(1, Math.min(4, nextZoom));
    setZoom(boundedZoom);
    scale.setValue(boundedZoom);
  };

  const chooseRegion = (region: Region) => {
    setSelectedRegion(region);
    updateZoom(1);
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="World map"
          subtitle="Choose a region, then zoom in or out."
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.regionChips}
        >
          {regionData.regions.map((region) => (
            <Pressable
              key={region.id}
              onPress={() => chooseRegion(region)}
              style={[
                styles.regionChip,
                {
                  backgroundColor:
                    selectedRegion.id === region.id
                      ? ACCENT
                      : theme.backgroundElement,
                },
              ]}
            >
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    selectedRegion.id === region.id ? "#FFFFFF" : theme.text,
                }}
              >
                {region.name}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.mapFrame}>
          <Animated.View
            style={[styles.mapImageWrap, { transform: [{ scale }] }]}
          >
            <Image
              source={{ uri: selectedRegion.picture }}
              contentFit="contain"
              style={styles.mapImage}
              transition={200}
            />
          </Animated.View>
          <View style={styles.zoomControls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              onPress={() => updateZoom(zoom + 0.5)}
              style={styles.zoomButton}
            >
              <ThemedText type="subtitle" style={styles.zoomText}>
                +
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset map zoom"
              onPress={() => updateZoom(1)}
              style={styles.zoomButton}
            >
              <ThemedText type="smallBold">⌂</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              onPress={() => updateZoom(zoom - 0.5)}
              style={styles.zoomButton}
            >
              <ThemedText type="subtitle" style={styles.zoomText}>
                −
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.mapCaption}>
            <ThemedText type="smallBold" style={styles.mapCaptionText}>
              {selectedRegion.name}
            </ThemedText>
            <ThemedText type="small" style={styles.mapCaptionText}>
              {Math.round(zoom * 100)}%
            </ThemedText>
          </View>
        </View>

        <ThemedView type="backgroundElement" style={styles.regionInfo}>
          <ThemedText type="subtitle" style={styles.regionTitle}>
            {selectedRegion.name}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.bodyText}>
            {selectedRegion.description}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.subhead}>
            Available Aniimo
          </ThemedText>
          {regionAniimos.length > 0 ? (
            <View style={styles.aniimoChipList}>
              {regionAniimos.map((aniimo) => (
                <View key={aniimo.number} style={styles.aniimoChip}>
                  <ThemedText type="smallBold">{aniimo.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    #{aniimo.number}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No sightings added yet. Add confirmed Aniimo numbers to
              src/data/regions.json.
            </ThemedText>
          )}
        </ThemedView>

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.sourceNote}
        >
          Map image source: AniimoTools, an unofficial fan site. Region notes
          and sightings are editable in src/data/regions.json.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

export function EventsPage() {
  const theme = useTheme();
  const [selectedEvent, setSelectedEvent] = useState<
    (typeof eventData.events)[number] | null
  >(null);
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title={selectedEvent?.title ?? "Events"}
          subtitle={
            selectedEvent
              ? selectedEvent.date
              : "Event notes, dates, and rewards"
          }
        />
        {selectedEvent ? (
          <>
            <Pressable
              onPress={() => setSelectedEvent(null)}
              style={styles.inlineBack}
            >
              <ThemedText style={styles.backArrow}>‹</ThemedText>
              <ThemedText type="smallBold">All events</ThemedText>
            </Pressable>
            <Image
              source={{ uri: selectedEvent.picture }}
              contentFit="cover"
              style={styles.eventHero}
            />
            <ThemedView type="backgroundElement" style={styles.infoPanel}>
              <ThemedText type="smallBold">Event details</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.bodyText}>
                {selectedEvent.description}
              </ThemedText>
              <ThemedText type="smallBold">Rewards</ThemedText>
              {selectedEvent.rewards.map((reward) => (
                <ThemedText
                  key={reward}
                  type="small"
                  themeColor="textSecondary"
                >
                  • {reward}
                </ThemedText>
              ))}
            </ThemedView>
          </>
        ) : (
          eventData.events.map((event) => (
            <Pressable
              key={event.id}
              onPress={() => setSelectedEvent(event)}
              style={({ pressed }) => [
                styles.eventCard,
                pressed && styles.pressed,
              ]}
            >
              <Image
                source={{ uri: event.picture }}
                contentFit="cover"
                style={styles.eventImage}
              />
              <ThemedView type="backgroundElement" style={styles.eventCopy}>
                <ThemedText type="smallBold" style={styles.eventTitle}>
                  {event.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {event.date}
                </ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  numberOfLines={2}
                >
                  {event.description}
                </ThemedText>
                <ThemedText type="smallBold" style={styles.eventLink}>
                  View event details ›
                </ThemedText>
              </ThemedView>
            </Pressable>
          ))
        )}
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.sourceNote}
        >
          {eventData._note}
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

export function CodesPage() {
  const theme = useTheme();
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="Redeem codes"
          subtitle="Code rewards and redemption notes"
        />
        {codeData.codes.map((entry) => (
          <ThemedView
            key={entry.code}
            type="backgroundElement"
            style={styles.codeCard}
          >
            <View style={styles.codeTop}>
              <ThemedText type="smallBold" style={styles.codeText}>
                {entry.code}
              </ThemedText>
              <ThemedText type="smallBold" style={styles.exampleTag}>
                DEMO
              </ThemedText>
            </View>
            <ThemedText type="smallBold">{entry.status}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Rewards
            </ThemedText>
            {entry.rewards.map((reward) => (
              <ThemedText key={reward} type="small" themeColor="textSecondary">
                • {reward}
              </ThemedText>
            ))}
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.bodyText}
            >
              {entry.details}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Expires: {entry.expires}
            </ThemedText>
          </ThemedView>
        ))}
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.sourceNote}
        >
          {codeData._note}
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

export function CountersPage() {
  const theme = useTheme();
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="Skill counters"
          subtitle="Tap the reference card on Home to view this type chart."
        />
        <ThemedView type="backgroundElement" style={styles.counterLegend}>
          <ThemedText type="smallBold">Type matchup quick reference</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Each type lists the types it is strong against and weak against.
          </ThemedText>
        </ThemedView>
        {counterData.skillTypes.map((type) => (
          <ThemedView
            key={type.name}
            type="backgroundElement"
            style={styles.counterCard}
          >
            <View style={styles.counterTitle}>
              <ThemedText style={styles.counterIcon}>{type.icon}</ThemedText>
              <ThemedText type="smallBold" style={styles.counterName}>
                {type.name}
              </ThemedText>
            </View>
            <View style={styles.matchRow}>
              <ThemedText type="smallBold" style={styles.matchLabel}>
                Strong against
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {type.strongAgainst.join(" · ") || "—"}
              </ThemedText>
            </View>
            <View style={styles.matchRow}>
              <ThemedText type="smallBold" style={styles.matchLabel}>
                Weak against
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {type.weakAgainst.join(" · ") || "—"}
              </ThemedText>
            </View>
          </ThemedView>
        ))}
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.sourceNote}
        >
          {counterData._note}
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AniimoEvolutionPath({
  aniimo,
  pathNumbers,
  onSelect,
}: {
  aniimo: AniimoRecord;
  pathNumbers: string[];
  onSelect: (next: AniimoRecord) => void;
}) {
  const path = pathNumbers
    .map((number) => aniimoData.aniimos.find((item) => item.number === number))
    .filter((item): item is AniimoRecord => Boolean(item));
  if (path.length === 0)
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No evolution path recorded yet. Add its Aniimo numbers to the JSON file.
      </ThemedText>
    );
  return (
    <View style={styles.evolutionList}>
      {path.map((item, index) => (
        <React.Fragment key={item.number}>
          {index > 0 ? (
            <ThemedText style={styles.evolutionArrow}>→</ThemedText>
          ) : null}
          <Pressable
            onPress={() => onSelect(item)}
            style={[
              styles.evolutionNode,
              item.number === aniimo.number && styles.evolutionCurrent,
            ]}
          >
            <Image
              source={{ uri: item.picture }}
              contentFit="cover"
              style={styles.evolutionImage}
            />
            <ThemedText type="smallBold" numberOfLines={1}>
              {item.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              #{item.number}
            </ThemedText>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  pageContent: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    padding: Spacing.three,
    paddingBottom: 100,
    gap: Spacing.three,
  },
  pageHeader: { gap: Spacing.one, paddingTop: Spacing.one },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    alignSelf: "flex-start",
    minHeight: 38,
  },
  backArrow: { color: ACCENT, fontSize: 32, lineHeight: 36 },
  pageTitle: { fontSize: 34, lineHeight: 40 },
  regionChips: { gap: Spacing.two, paddingRight: Spacing.three },
  regionChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 18,
  },
  mapFrame: {
    height: 420,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#E7E6DA",
    justifyContent: "center",
    alignItems: "center",
  },
  mapImageWrap: { width: "100%", height: "100%" },
  mapImage: { width: "100%", height: "100%" },
  zoomControls: {
    position: "absolute",
    right: Spacing.two,
    top: Spacing.two,
    gap: Spacing.one,
  },
  zoomButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFFFFFEE",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomText: { lineHeight: 30 },
  mapCaption: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: "#161726B8",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  mapCaptionText: { color: "#FFFFFF" },
  regionInfo: { padding: Spacing.three, borderRadius: 18, gap: Spacing.two },
  regionTitle: { fontSize: 23, lineHeight: 29 },
  bodyText: { lineHeight: 23 },
  subhead: { marginTop: Spacing.two },
  aniimoChipList: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  aniimoChip: {
    backgroundColor: "#FFFFFF70",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    gap: Spacing.one,
  },
  sourceNote: { lineHeight: 20, textAlign: "center" },
  inlineBack: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.one,
  },
  eventCard: { borderRadius: 18, overflow: "hidden" },
  eventImage: { width: "100%", height: 190, backgroundColor: "#E9E7FF" },
  eventCopy: { padding: Spacing.three, gap: Spacing.two },
  eventTitle: { fontSize: 19 },
  eventLink: { color: ACCENT },
  eventHero: {
    width: "100%",
    height: 260,
    borderRadius: 20,
    backgroundColor: "#E9E7FF",
  },
  infoPanel: { padding: Spacing.three, borderRadius: 18, gap: Spacing.two },
  codeCard: { padding: Spacing.three, borderRadius: 18, gap: Spacing.two },
  codeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  codeText: { color: ACCENT, fontSize: 18, letterSpacing: 0.5 },
  exampleTag: {
    color: "#8A4B12",
    backgroundColor: "#FDE8C8",
    overflow: "hidden",
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 10,
  },
  counterLegend: { padding: Spacing.three, borderRadius: 18, gap: Spacing.two },
  counterCard: { padding: Spacing.three, borderRadius: 18, gap: Spacing.two },
  counterTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  counterIcon: { fontSize: 24 },
  counterName: { fontSize: 18 },
  matchRow: {
    flexDirection: "row",
    gap: Spacing.two,
    alignItems: "flex-start",
  },
  matchLabel: { width: 120 },
  evolutionList: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  evolutionNode: {
    width: 90,
    alignItems: "center",
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: 14,
    backgroundColor: "#FFFFFF24",
  },
  evolutionCurrent: { borderWidth: 2, borderColor: ACCENT },
  evolutionImage: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: "#E9E7FF",
  },
  evolutionArrow: { color: ACCENT, fontSize: 20 },
  pressed: { opacity: 0.8 },
});
