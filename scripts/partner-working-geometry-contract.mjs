import assert from "node:assert/strict";

export function assertPartnerWorkingGeometry(snapshot) {
  assert.ok(snapshot.scrollWidth <= snapshot.width + 1, "No horizontal page overflow");
  for (const control of snapshot.controls) {
    assert.ok(control.width >= 43.5 && control.height >= 43.5, "Working action hit targets >=44px");
  }
  for (const empty of snapshot.emptyStates) assert.ok(empty.height <= 100, "Compact empty state");
  for (const card of snapshot.attentionCards) assert.ok(card.height <= (snapshot.width < 640 ? 280 : 180), "Compact attention cards");
  if (snapshot.width >= 1280 && snapshot.paymentRows.length) {
    for (const row of snapshot.paymentRows) {
      row.forEach((column, index) => assert.ok(Math.abs(column.x - snapshot.paymentRows[0][index].x) <= 1, "Aligned finance amount columns"));
    }
  }
  assert.equal(snapshot.redundantHeaderBands, 0, "No decorative header spacer bands");
  assert.equal(snapshot.searchSubtitle, false, "No redundant Quick Search subtitle");
  return { passed: true, width: snapshot.width, controls: snapshot.controls.length, paymentRows: snapshot.paymentRows.length };
}
