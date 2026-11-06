"use client";

import type { CSSProperties, ReactNode } from "react";
import PixelCard from "@/components/ui/PixelCard";

/**
 * Ferry's standard glass card with a restrained PixelCard hover effect:
 * monochrome pixels that sparkle only along the edges (fade=1), so amounts,
 * inputs and errors in the middle stay perfectly legible. No intro animation,
 * no click ripple, and focus inside form fields doesn't trigger the effect.
 */
export default function FerryCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <PixelCard
      className={`w-full p-6 backdrop-blur-xl ${className}`.trim()}
      style={{ "--pixel-card-surface": "rgba(255, 255, 255, 0.03)" } as CSSProperties}
      radius={16}
      colors={["#f4f4f5", "#d4d4d8", "#a1a1aa"]}
      glowColor="#a1a1aa"
      gap={6}
      speed={30}
      opacity={0.7}
      pixelSize={2.5}
      glow={0.2}
      spotlight={0.3}
      fade={1}
      fadeReach={0.12}
      intro={false}
      clickPulse={false}
      noFocus
    >
      {children}
    </PixelCard>
  );
}
