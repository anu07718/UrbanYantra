/**
 * Color utilities for heatmap visualization and driver charts
 */

// Color palette for drivers (feature importance)
export const DRIVER_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#f43f5e", // rose
  "#d97706", // amber
];

/**
 * Convert LST (Land Surface Temperature) value to color
 * Expects normalized value between 0-1 or raw temperature value
 * @param value - LST value (0-1 normalized or raw temperature in Celsius)
 * @returns Hex color code
 */
export function lstToColor(value: number): string {
  // Normalize value to 0-1 range
  // Assume raw temp values are typically 15-50°C
  let normalized = value;
  if (value > 1) {
    // Treat as raw temperature
    normalized = Math.max(0, Math.min(1, (value - 15) / (50 - 15)));
  }

  // Create a heat map color scale from cool (blue) to hot (red)
  if (normalized < 0.25) {
    // Blue to Cyan
    const t = normalized / 0.25;
    const r = Math.round(0 * (1 - t) + 0 * t);
    const g = Math.round(150 * (1 - t) + 255 * t);
    const b = Math.round(255 * (1 - t) + 255 * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (normalized < 0.5) {
    // Cyan to Green
    const t = (normalized - 0.25) / 0.25;
    const r = Math.round(0 * (1 - t) + 0 * t);
    const g = Math.round(255 * (1 - t) + 255 * t);
    const b = Math.round(255 * (1 - t) + 0 * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (normalized < 0.75) {
    // Green to Yellow
    const t = (normalized - 0.5) / 0.25;
    const r = Math.round(0 * (1 - t) + 255 * t);
    const g = Math.round(255 * (1 - t) + 255 * t);
    const b = Math.round(0 * (1 - t) + 0 * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Yellow to Red
    const t = (normalized - 0.75) / 0.25;
    const r = Math.round(255 * (1 - t) + 255 * t);
    const g = Math.round(255 * (1 - t) + 0 * t);
    const b = Math.round(0 * (1 - t) + 0 * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Get hex color for LST value
 * @param value - LST value (0-1 normalized or raw temperature)
 * @returns Hex color code
 */
export function lstToColorHex(value: number): string {
  const rgb = lstToColor(value);
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return "#888888";
  
  const r = parseInt(match[1]).toString(16).padStart(2, "0");
  const g = parseInt(match[2]).toString(16).padStart(2, "0");
  const b = parseInt(match[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}
