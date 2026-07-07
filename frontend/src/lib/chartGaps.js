// Shared helpers for price/portfolio charts (AssetChart, AssetDetail, Dashboard).
//
// Every chart here uses a category/index x-axis (Recharts `type="category"`)
// so points are spaced evenly by array position, not by real elapsed time —
// a missing weekend or holiday simply isn't allocated any width, so there's
// no artificial straight line stretched across dead time.
//
// On top of that, three small helpers make the chart easier to read:
//   - getDayBoundaries: every time the calendar day changes, return a marker
//     (always labeled with the day-of-month number) so callers can draw a
//     soft "new day" line behind the data.
//   - getWeekendBands: for charts that mix 24/7 assets (crypto) with
//     Mon-Fri-only assets (stocks/ETFs), a data-driven "gap" heuristic is
//     the wrong tool — crypto keeps producing real points through the
//     weekend. Instead this returns actual Saturday/Sunday calendar spans
//     so callers can shade the background, without touching the data.
//   - bucketOHLC: groups a series of point-in-time snapshots (e.g. portfolio
//     value sampled every ~15 min) into OHLC candles at a coarser timeframe.

/**
 * @param {Array<object>} data   chart data, ascending by time
 * @param {string} tsKey         field holding the timestamp used as the
 *                               chart's XAxis dataKey — may be a number
 *                               (ms) or a date/datetime string
 * @param {(v:any)=>number} toMs parses a tsKey value into milliseconds;
 *                               defaults to `new Date(v)`. The RAW tsKey
 *                               value (not the parsed ms) is what gets
 *                               returned as `x`, so it matches whatever the
 *                               chart's dataKey holds.
 * @returns {Array<{x:any,label:string}>}
 */
export function getDayBoundaries(data, tsKey = "t", toMs = (v) => new Date(v).getTime()) {
  const boundaries = [];
  if (!Array.isArray(data) || data.length < 2) return boundaries;

  let lastDay = new Date(toMs(data[0][tsKey])).toDateString();
  for (let i = 1; i < data.length; i++) {
    const raw = data[i][tsKey];
    const ms = toMs(raw);
    const day = new Date(ms).toDateString();
    if (day === lastDay) continue;
    boundaries.push({ x: raw, label: String(new Date(ms).getDate()) });
    lastDay = day;
  }

  return boundaries;
}

/**
 * Groups consecutive Saturday/Sunday points into shaded bands.
 * @returns {Array<{x1:any,x2:any}>} raw tsKey values bounding each band
 */
export function getWeekendBands(data, tsKey = "t", toMs = (v) => new Date(v).getTime()) {
  const bands = [];
  if (!Array.isArray(data) || data.length < 2) return bands;

  let bandStart = null;
  for (let i = 0; i < data.length; i++) {
    const raw = data[i][tsKey];
    const day = new Date(toMs(raw)).getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = day === 0 || day === 6;
    if (isWeekend && bandStart == null) {
      bandStart = raw;
    } else if (!isWeekend && bandStart != null) {
      bands.push({ x1: bandStart, x2: raw });
      bandStart = null;
    }
  }
  if (bandStart != null) {
    bands.push({ x1: bandStart, x2: data[data.length - 1][tsKey] });
  }

  return bands;
}

/**
 * Groups a series of point-in-time snapshots (e.g. portfolio value sampled
 * every ~15 min) into OHLC candles at a coarser timeframe — the same idea
 * as the backend resampling 60m stock candles into 4h ones (see
 * backend/routes/news.py _resample_ohlc), just done client-side since this
 * data doesn't need a network round-trip to re-bucket.
 * @param {Array<object>} points   ascending by time
 * @param {string} tsKey           field holding the timestamp
 * @param {string} valueKey        field holding the numeric value to bucket
 * @param {number|null} bucketMs   bucket size in ms; null/0 = one candle per point
 * @returns {Array<{t:number,o:number,h:number,l:number,c:number}>}
 */
export function bucketOHLC(points, tsKey, valueKey, bucketMs, toMs = (v) => new Date(v).getTime()) {
  if (!Array.isArray(points) || !points.length) return [];

  if (!bucketMs) {
    return points
      .map((p) => ({ t: toMs(p[tsKey]), v: Number(p[valueKey]) }))
      .filter((p) => Number.isFinite(p.v))
      .map((p) => ({ t: p.t, o: p.v, h: p.v, l: p.v, c: p.v }));
  }

  const buckets = new Map();
  let firstMs = null;
  for (const p of points) {
    const v = Number(p[valueKey]);
    if (!Number.isFinite(v)) continue;
    const ms = toMs(p[tsKey]);
    if (firstMs === null) firstMs = ms;
    const key = Math.floor(ms / bucketMs) * bucketMs;
    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { t: key, o: v, h: v, l: v, c: v });
    } else {
      if (v > bucket.h) bucket.h = v;
      if (v < bucket.l) bucket.l = v;
      bucket.c = v;
    }
  }

  const sorted = [...buckets.values()].sort((a, b) => a.t - b.t);

  // The first bucket's key is epoch-floor-aligned (e.g. the start of
  // whatever ISO week/month/year it falls in) — when the requested window
  // (up to N_BARS candles) reaches further back than the wallet's actual
  // first transaction, that floor can land BEFORE any real data exists,
  // making the chart's leading edge (and its tooltip) claim a date older
  // than the account itself. Snap the first candle's timestamp forward to
  // the true earliest data point instead — every OTHER candle keeps its
  // regular epoch-aligned key (needed for correct grouping), only the very
  // first one is corrected, and only ever forward (never earlier).
  if (sorted.length && firstMs != null && firstMs > sorted[0].t) {
    sorted[0] = { ...sorted[0], t: firstMs };
  }

  return sorted;
}

/**
 * Same bucketing (same epoch-floor bucket keys as bucketOHLC, so the two
 * line up on the same x-axis) but for a per-category breakdown instead of a
 * single OHLC value — used by the "Evolução da Carteira" chart's per-class
 * lines (7 jul 2026). Keeps the LAST value seen per bucket per class (the
 * "close" of that bucket for that class), since these render as simple
 * lines, not candles — there's no need for open/high/low per category.
 * @param {Array<object>} points     ascending by time
 * @param {string} tsKey             field holding the timestamp
 * @param {string} classesKey       field holding a { class: value } object (may be null/missing on some points — e.g. safety-net snapshots don't carry a per-class breakdown, see REGRA #2)
 * @param {number|null} bucketMs
 * @returns {Array<{t:number, [cls:string]:number}>} one object per bucket, spreading each class value as a top-level key so Recharts can read it directly as a dataKey
 */
export function bucketClassClose(points, tsKey, classesKey, bucketMs, toMs = (v) => new Date(v).getTime()) {
  if (!Array.isArray(points) || !points.length) return [];

  const buckets = new Map();
  let firstMs = null;
  for (const p of points) {
    const byClass = p[classesKey];
    if (!byClass) continue;
    const ms = toMs(p[tsKey]);
    if (firstMs === null) firstMs = ms;
    const key = bucketMs ? Math.floor(ms / bucketMs) * bucketMs : ms;
    buckets.set(key, byClass); // last write per bucket wins == "close"
  }

  const sorted = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, byClass]) => ({ t, ...byClass }));

  if (sorted.length && firstMs != null && firstMs > sorted[0].t) {
    sorted[0] = { ...sorted[0], t: firstMs };
  }

  return sorted;
}
