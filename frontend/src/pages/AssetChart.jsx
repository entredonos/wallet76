// AssetChart.jsx used to be a near-duplicate of AssetDetail.jsx (same
// header/chart/key-metrics/analyst layout, ~85% identical code) — the only
// real difference was that this route (/asset/:assetType/:symbol) already
// knows the asset type from the URL, while AssetDetail's route
// (/asset/:symbol) has to look it up. AssetDetail.jsx now handles both
// cases (see the `urlAssetType` handling there), so this file just points
// both routes at the same component.
export { default } from "./AssetDetail";
