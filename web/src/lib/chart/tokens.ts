// Chart colors resolved from the CSS design tokens so the chart always
// matches the active theme. Values are read from the live document at
// render time and re-read when the theme changes.

export interface ChartTokens {
  temperature: string;
  humidity: string;
  airconOn: string;
  textPrimary: string;
  textSecondary: string;
  borderSubtle: string;
  bgSurface: string;
  bgElevated: string;
  accent: string;
  warning: string;
}

export const FALLBACK_TOKENS: ChartTokens = {
  temperature: "#c75b3f",
  humidity: "#3379b8",
  airconOn: "#6379c8",
  textPrimary: "#17212d",
  textSecondary: "#5f6e7d",
  borderSubtle: "#dde5ec",
  bgSurface: "#ffffff",
  bgElevated: "#f9fbfd",
  accent: "#315fd5",
  warning: "#9a6518",
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
    airconOn: read("--aircon-on", FALLBACK_TOKENS.airconOn),
    textPrimary: read("--text-primary", FALLBACK_TOKENS.textPrimary),
    textSecondary: read("--text-secondary", FALLBACK_TOKENS.textSecondary),
    borderSubtle: read("--border-subtle", FALLBACK_TOKENS.borderSubtle),
    bgSurface: read("--bg-surface", FALLBACK_TOKENS.bgSurface),
    bgElevated: read("--bg-elevated", FALLBACK_TOKENS.bgElevated),
    accent: read("--accent-lapis", FALLBACK_TOKENS.accent),
    warning: read("--warning", FALLBACK_TOKENS.warning),
  };
}

// 26% alpha for the aircon ON band keeps it a quiet background layer.
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
