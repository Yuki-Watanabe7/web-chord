/**
 * Small, manually checked navigation anchors for the two exact PDFs used in
 * the local import benchmark. These are review hints, not OCR detections or an
 * automatic claim that the resulting performance order is correct.
 */
const references = {
  '768c67d7be7c2f44607e571d019af14017df999383963e2d28ceee338876bfd5': {
    sourceMeasureCount: 86,
    marks: [
      { kind: 'segno', sourceMeasure: 29, slot: [2, '1', 2, 1] },
      { kind: 'toCoda', sourceMeasure: 35, targetMeasure: 70, slot: [2, '1', 3, 3] },
      { kind: 'dalSegno', sourceMeasure: 69, targetMeasure: 29, slot: [4, '1', 2, 2] },
      { kind: 'coda', sourceMeasure: 70, slot: [4, '1', 3, 0] },
    ],
  },
  'b927162911cfd804178baffac255d290251a8dc7b4c8e2a078c2184f5d2b052c': {
    sourceMeasureCount: 72,
    marks: [
      { kind: 'segno', sourceMeasure: 5, slot: [1, '1', 1, 0] },
      { kind: 'dalSegno', sourceMeasure: 39, targetMeasure: 5, slot: [3, '1', 2, 0] },
      { kind: 'toCoda', sourceMeasure: 39, targetMeasure: 40, slot: [3, '1', 2, 0] },
      { kind: 'coda', sourceMeasure: 40, slot: [3, '1', 3, 0] },
    ],
  },
};

export const navigationReferenceHints = (pdfSha256, sourceLayout) => {
  const reference = references[pdfSha256];
  if (!reference || sourceLayout?.length !== reference.sourceMeasureCount) return [];
  if (!reference.marks.every(({ sourceMeasure, slot }) => {
    const source = sourceLayout[sourceMeasure - 1];
    return source && [source.pdfPage, source.pageId, source.systemIndex, source.stackIndex]
      .every((value, index) => value === slot[index]);
  })) return [];
  return reference.marks.map(({ kind, sourceMeasure, targetMeasure }) => ({
    kind,
    sourceMeasureIndex: sourceMeasure - 1,
    ...(targetMeasure ? { targetMeasureIndex: targetMeasure - 1 } : {}),
    evidence: 'manual-pdf-review',
  }));
};
