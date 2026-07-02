import { ReferenceLine, ReferenceArea } from "recharts";

// Soft vertical line marking a new day. Recharts only recognizes its own
// component types (ReferenceLine, Bar, Area...) as direct children of a
// chart — wrapping them in a custom component breaks that detection. So
// this is a plain function returning an array of <ReferenceLine> elements:
// call it inline as `{renderDayBoundaries(dayBoundaries)}` (an expression,
// not a JSX tag) and place that call BEFORE the chart's data series so the
// lines paint behind it. Just a faint marker (95% transparent) — no day
// number label.
export function renderDayBoundaries(boundaries, color = "#93c5fd") {
  return boundaries.map((b) => (
    <ReferenceLine
      key={`day-${b.x}`}
      x={b.x}
      stroke={color}
      strokeOpacity={0.05}
      strokeWidth={1.5}
      ifOverflow="visible"
    />
  ));
}

// Subtle "off hours" tint over Saturday/Sunday spans — used on charts that
// mix 24/7 assets (crypto) with Mon-Fri-only ones, where a data-driven gap
// heuristic doesn't apply (crypto keeps producing real points all weekend).
// Same rule as above: call inline as `{renderWeekendBands(bands)}`.
export function renderWeekendBands(bands) {
  return bands.map((b, i) => (
    <ReferenceArea
      key={`weekend-${i}`}
      x1={b.x1}
      x2={b.x2}
      fill="#ffffff"
      fillOpacity={0.035}
      stroke="none"
      ifOverflow="visible"
    />
  ));
}
