"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/** Client-side providers. `reducedMotion="user"` makes every framer-motion animation honour the OS "reduce motion" setting. */
export function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
