import { View } from "react-native";

export function ActionIcon({ name, color, cutout = "#FFFFFF", size = 20 }: {
  name: "edit" | "remove";
  color: string;
  cutout?: string;
  size?: number;
}) {
  const scale = size / 20;
  const part = (left: number, top: number, width: number, height: number, extra: object = {}, fill = color) => (
    <View style={[{ position: "absolute", left: left * scale, top: top * scale, width: width * scale, height: height * scale, backgroundColor: fill }, extra]} />
  );

  if (name === "edit") {
    return (
      <View accessible={false} style={{ width: size, height: size }}>
        <View style={{ position: "absolute", left: 7 * scale, top: 0, width: 6 * scale, height: 20 * scale, transform: [{ rotate: "38deg" }] }}>
          <View style={{ height: 3 * scale, borderTopLeftRadius: 2 * scale, borderTopRightRadius: 2 * scale, backgroundColor: color }} />
          <View style={{ flex: 1, backgroundColor: color }} />
          <View style={{ width: 0, height: 0, alignSelf: "center", borderLeftWidth: 3 * scale, borderRightWidth: 3 * scale, borderTopWidth: 4 * scale, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: color }} />
        </View>
        {part(8.2, 2.2, 1.2, 2.5, { borderRadius: 1, transform: [{ rotate: "38deg" }] }, cutout)}
      </View>
    );
  }

  return (
    <View accessible={false} style={{ width: size, height: size }}>
      {part(7, 1, 6, 2, { borderTopLeftRadius: 2, borderTopRightRadius: 2 })}
      {part(3, 4, 14, 2, { borderRadius: 1 })}
      {part(5, 7, 10, 11, { borderBottomLeftRadius: 2, borderBottomRightRadius: 2 })}
      {part(8, 9, 1.5, 7, { borderRadius: 1 }, cutout)}
      {part(10.5, 9, 1.5, 7, { borderRadius: 1 }, cutout)}
    </View>
  );
}
