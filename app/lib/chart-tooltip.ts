// Shared recharts <Tooltip position> for every chart in the app.
//
// Recharts positions the tooltip from the live cursor, so a multi-line box
// slides out from under the reader on every mouse move. Pinning y stops that.
// Only y: for a horizontal layout recharts already snaps x to the hovered
// category (util/getActiveCoordinate.js), and an explicit x would be used
// verbatim — skipping the edge-clamping that keeps the last bar's tooltip
// inside the card (util/tooltip/translate.js).
export const TOOLTIP_POSITION = { y: 0 }
