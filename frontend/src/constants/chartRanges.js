// Single source of truth for the timeframe buttons on every price/portfolio
// chart in the app (AssetChart, AssetDetail, Dashboard) — same options,
// same order, same labels everywhere. Every button is a CANDLE SIZE, not a
// look-back window: the backend always returns the last N_BARS (~70)
// candles of that size — 15m shows the last 70 fifteen-minute candles, 1D
// the last 70 daily candles, 1Y the last 70 yearly candles, and so on,
// however far back that reaches (or fewer, if there isn't 70 candles' worth
// of history yet). "ALL" is the one exception: it always shows the complete
// available history, uncapped. See backend/routes/news.py for the matching
// logic.
// Target candle count enforced on every chart (backend already does this
// for AssetChart/AssetDetail; Dashboard's portfolio chart re-buckets
// client-side, so it slices to this same cap for consistency).
export const N_BARS = 70;

export const CHART_RANGES = [
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "1h",  label: "1h"  },
  { value: "4h",  label: "4h"  },
  { value: "1d",  label: "1D"  },
  { value: "1w",  label: "1W"  },
  { value: "1m",  label: "1M"  },
  { value: "1y",  label: "1Y"  },
  { value: "all", label: "ALL" },
];

// Ranges wide enough that x-axis ticks need a date (not just a time) to be
// unambiguous — used by tick formatters across the charts. From "1D"
// upwards the candles themselves are daily-or-coarser, so a time-of-day
// label wouldn't mean anything.
export const CHART_RANGES_SHOW_DATE = new Set(["4h", "1d", "1w", "1m", "1y", "all"]);

// Day-boundary markers (ChartAnnotations.renderDayBoundaries) only make
// sense when a single calendar day can hold MULTIPLE candles — on 1D-or-
// coarser ranges every candle already starts its own day (or week/month/
// year), so the marker would draw on every single candle: visually
// meaningless, and on ranges with many candles (e.g. "ALL" over a year of
// daily candles) expensive enough to noticeably lag the chart on hover
// (Recharts re-renders every <ReferenceLine> on each mouse move). Gate the
// getDayBoundaries() call itself behind this set, not just the render, so
// the wasted computation never happens.
export const CHART_RANGES_DAY_MARKERS = new Set(["15m", "30m", "1h", "4h"]);

// Weekend shading only makes sense while a single candle is smaller than a
// week — "1W"/"1M"/"1Y"/"ALL" candles already span past any single weekend,
// so there's nothing meaningful (or cheap) to shade.
export const CHART_RANGES_WEEKEND_SHADING = new Set(["15m", "30m", "1h", "4h", "1d"]);

// Bucket size (ms) per range — used to group a series of point-in-time
// portfolio snapshots (sampled every ~15 min) into OHLC candles of the same
// size the range button implies. "all" has no fixed bucket: the underlying
// data is already coarse (daily), so each raw point becomes its own candle.
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const CHART_RANGE_BUCKET_MS = {
  "15m": 15 * MIN,
  "30m": 30 * MIN,
  "1h": HOUR,
  "4h": 4 * HOUR,
  "1d": DAY,
  "1w": 7 * DAY,
  "1m": 30 * DAY,
  "1y": 365 * DAY,
  "all": null,
};
