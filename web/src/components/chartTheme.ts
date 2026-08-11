/**
 * Shared Recharts axis / tooltip config.
 *
 * The charts were originally tuned for a ~600px-wide desktop card. On a phone
 * the same config crowds the X axis (every month label overlaps) and burns 60px
 * of a 340px-wide card on the Y axis gutter. These defaults fix both without
 * needing a JS breakpoint: `minTickGap` drops labels only when they'd collide,
 * so desktop keeps every tick and mobile thins them automatically.
 */

const AXIS_TICK = { fill: '#64748b', fontSize: 10 };

export const X_AXIS = {
  tick: AXIS_TICK,
  axisLine: false,
  tickLine: false,
  tickMargin: 6,
  minTickGap: 16,
  interval: 'preserveStartEnd' as const,
};

export const Y_AXIS = {
  tick: AXIS_TICK,
  axisLine: false,
  tickLine: false,
  tickMargin: 4,
  width: 46,
};

export const TOOLTIP_STYLE = {
  background: '#112240',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 11,
};

/** Taller on phones (the card is full-bleed there), original height from md up. */
export const CHART_BOX = 'h-48 md:h-40';
export const CHART_BOX_SM = 'h-44 md:h-36';
