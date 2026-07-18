// Chart colors resolved from the CSS design tokens so the chart always
// matches the active theme. Values are read from the live document at
// render time and re-read when the theme changes.

export interface ChartTokens {
  temperature: string;
  humidity: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  hairline: string;
  raised: string;
  canvas: string;
  gold: string;
  warning: string;
  ribbonOn: string;
  ribbonUnknown: string;
}

export const FALLBACK_TOKENS: ChartTokens = {
  temperature: "#c2503c",
  humidity: "#3d63c0",
  ink: "#1c2a45",
  inkSecondary: "#56617a",
  inkMuted: "#64708a",
  hairline: "#e4e1d8",
  raised: "#fdfcf8",
  canvas: "#f7f6f2",
  gold: "#8a6d2f",
  warning: "#8a5d10",
  ribbonOn: "rgba(28, 42, 69, 0.18)",
  ribbonUnknown: "rgba(138, 93, 16, 0.22)",
};

export function readChartTokens(root: HTMLElement): ChartTokens {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value === "" ? fallback : value;
  };
  return {
    temperature: read("--temperature", FALLBACK_TOKENS.temperature),
    humidity: read("--humidity", FALLBACK_TOKENS.humidity),
    ink: read("--ink", FALLBACK_TOKENS.ink),
    inkSecondary: read("--ink-secondary", FALLBACK_TOKENS.inkSecondary),
    inkMuted: read("--ink-muted", FALLBACK_TOKENS.inkMuted),
    hairline: read("--hairline", FALLBACK_TOKENS.hairline),
    raised: read("--raised", FALLBACK_TOKENS.raised),
    canvas: read("--canvas", FALLBACK_TOKENS.canvas),
    gold: read("--gold", FALLBACK_TOKENS.gold),
    warning: read("--warning", FALLBACK_TOKENS.warning),
    ribbonOn: read("--ribbon-on", FALLBACK_TOKENS.ribbonOn),
    ribbonUnknown: read("--ribbon-unknown", FALLBACK_TOKENS.ribbonUnknown),
  };
}

export function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (!match || match[1] === undefined) {
    return color;
  }
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
