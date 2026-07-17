"use client";

import { useEffect, useState } from "react";

// Tracks whether the document is currently visible so polling can pause
// while the tab is hidden.
export function useVisibility(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const update = (): void => {
      setVisible(document.visibilityState === "visible");
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return visible;
}
