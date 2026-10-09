"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/** Counts from 0 to `value` once, in ~600ms. Jumps straight there with reduced motion. */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: setShown,
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduced]);

  return <>{format(shown)}</>;
}
