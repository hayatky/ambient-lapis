import "@testing-library/jest-dom/vitest";

// jsdom does not implement matchMedia; provide a minimal non-matching
// stub so components can query pointer type / color scheme / motion.
if (typeof window !== "undefined" && window.matchMedia === undefined) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
