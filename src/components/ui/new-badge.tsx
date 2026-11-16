import { StyleSheet, View, type ViewStyle } from "react-native";

export function NewBadge({ style }: { style?: ViewStyle }) {
  return (
    <View
      pointerEvents="none"
      accessibilityLabel="New"
      style={[styles.badge, style]}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#fff",
    backgroundColor: "#ef4444",
    zIndex: 10,
    elevation: 10,
  },
});
