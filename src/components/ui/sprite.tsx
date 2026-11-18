import { useEffect, useState } from "react";
import { Image, ImageStyle, StyleProp, View } from "react-native";

interface AnimatedSpriteProps {
  source: any;
  totalFrames: number;
  frameSize: number;
  facing: 1 | -1;
  animationSpeed?: number;
  style?: StyleProp<ImageStyle>;
  displaySize: number;
}

export default function AnimatedSprite({
  source,
  totalFrames,
  frameSize,
  facing,
  animationSpeed = 100,
  style,
  displaySize,
}: AnimatedSpriteProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % totalFrames);
    }, animationSpeed);

    return () => clearInterval(interval);
  }, [totalFrames, animationSpeed]);

  const scale: number = (displaySize ?? 100) / 100;
  const row = facing > 0 ? 0 : 1;

  return (
    <View
      style={[
        {
          justifyContent: "flex-start", // Align items at the top vertically
          alignItems: "center", // Center items horizontally
          width: frameSize,
          height: frameSize,
          overflow: "hidden",
          transform: [{ scale }],
        },
      ]}
    >
      <Image
        source={source}
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: frameSize * totalFrames,
            height: frameSize * 2,
            left: -(frame * frameSize),
            top: -(row * frameSize),
          },
          style,
        ]}
      />
    </View>
  );
}
