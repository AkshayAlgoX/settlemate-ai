/**
 * SettleMate AI — Data Visualization Semantic Palette
 * Provides consistent, restrained chart colors across all dashboards.
 */

export const CHART_COLORS = {
  primary: "#0070f3",      // Primary dataset (Vercel Blue)
  secondary: "#8e8e8e",    // Baseline / Reference (Muted Gray)
  success: "#10b981",      // Confirmed / Healthy (Emerald Green)
  warning: "#f59e0b",      // Attention / Advisory (Amber)
  danger: "#ef4444",       // Discrepancy / Risk (Red)
  purple: "#8b5cf6",       // Secondary Analytical Series (Purple)
  cyan: "#06b6d4",         // Throughput / Technical Stream (Cyan)
  grid: "#1e1e1e",         // Subtle chart grid lines
  axis: "#666666",         // Axis labels
  tooltipBg: "#080808",    // Tooltip surface
  tooltipBorder: "#1e1e1e",// Tooltip border
} as const;

export const CHART_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.purple,
  CHART_COLORS.cyan,
  CHART_COLORS.danger,
  CHART_COLORS.secondary,
];