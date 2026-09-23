import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationReferenceHints } from './navigationReferences.mjs';

test('exact PDF hashes produce source-anchored review hints only for the matching score layout', () => {
  const layout = Array.from({ length: 72 }, (_, index) => ({
    pdfPage: Math.floor(index / 18) + 1, pageId: '1', systemIndex: 0, stackIndex: index % 4,
  }));
  layout[4] = { pdfPage: 1, pageId: '1', systemIndex: 1, stackIndex: 0 };
  layout[38] = { pdfPage: 3, pageId: '1', systemIndex: 2, stackIndex: 0 };
  layout[39] = { pdfPage: 3, pageId: '1', systemIndex: 3, stackIndex: 0 };
  const hash = 'b927162911cfd804178baffac255d290251a8dc7b4c8e2a078c2184f5d2b052c';
  assert.deepEqual(navigationReferenceHints(hash, layout), [
    { kind: 'segno', sourceMeasureIndex: 4, evidence: 'manual-pdf-review' },
    { kind: 'dalSegno', sourceMeasureIndex: 38, targetMeasureIndex: 4, evidence: 'manual-pdf-review' },
    { kind: 'toCoda', sourceMeasureIndex: 38, targetMeasureIndex: 39, evidence: 'manual-pdf-review' },
    { kind: 'coda', sourceMeasureIndex: 39, evidence: 'manual-pdf-review' },
  ]);
  assert.deepEqual(navigationReferenceHints(hash, layout.slice(0, 71)), []);
  assert.deepEqual(navigationReferenceHints(hash, layout.map((slot, index) => index === 38
    ? { ...slot, stackIndex: 1 } : slot)), []);
  assert.deepEqual(navigationReferenceHints('0'.repeat(64), layout), []);
});
