import assert from "node:assert/strict";

/** Validates only anonymized DOM rectangles captured by the authorized browser. */
export function assertPurchasingListGeometry(snapshot) {
  assert.ok(snapshot.scrollWidth <= snapshot.width + 1, "No horizontal page overflow");
  for (const control of snapshot.controls) {
    assert.ok(control.width >= 43.5 && control.height >= 43.5, "Working controls need 44px hit targets");
  }
  assert.ok(snapshot.saveCount <= 1, "At most one Save Changes action");
  assert.equal(snapshot.noteCount, 0, "No primary Note fields");
  for (const row of snapshot.rows) {
    assert.equal(Math.round(row.image.width), 52, "Fixed image width");
    assert.equal(Math.round(row.image.height), 52, "Fixed image height");
    if (snapshot.width >= 1280) {
      for (const column of ["quantity", "price", "stock", "actions"]) {
        assert.ok(Math.abs(row[column].x - snapshot.rows[0][column].x) <= 1, `${column} column alignment`);
      }
      assert.ok(Math.abs(row.quantity.y - row.price.y) <= 1, "Quantity and price labels align");
      assert.ok(Math.abs(row.quantity.y - row.stock.y) <= 1, "Quantity and stock labels align");
    }
  }
  return { rows: snapshot.rows.length, controls: snapshot.controls.length, width: snapshot.width, passed: true };
}
