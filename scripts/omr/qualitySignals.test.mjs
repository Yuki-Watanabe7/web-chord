import assert from 'node:assert/strict';
import test from 'node:test';
import { extractOmrScoreMetadata, LOW_HEAD_CHORD_GRADE } from './qualitySignals.mjs';

test('maps low Audiveris head-chord grade to a score measure, without treating all notes as low', () => {
  const book = '<book><score><logical-part id="1"><staff-configuration/></logical-part><page sheet-number="1" sheet-page-id="1"/></score></book>';
  const sheet = `<sheet><page id="1"><system>
    <stack id="1"></stack><stack id="2"></stack><stack id="3"></stack>
    <part id="1"><measure id="1"></measure><measure id="2"><head-chords>8</head-chords></measure><measure id="3"><head-chords>9 10</head-chords></measure></part>
    <sig><head-chord id="8" grade="0.93"></head-chord><head-chord id="9" grade="0.63"></head-chord><head-chord id="10" grade="0.94"></head-chord></sig>
  </system></page></sheet>`;
  assert.equal(LOW_HEAD_CHORD_GRADE, 0.8);
  const result = extractOmrScoreMetadata(book, () => sheet, 1);
  assert.deepEqual(result.sourceLayout, [0, 1, 2].map((stackIndex) =>
    ({ pdfPage: 1, pageId: '1', systemIndex: 0, stackIndex })));
  assert.deepEqual(result.scores, [{
    measureCount: 3,
    sourceMeasures: result.sourceLayout.map((slot, measureIndex) => ({ measureIndex, ...slot })),
    signals: [{ measureIndex: 2, minGrade: 0.63, lowNoteCount: 1 }],
  }]);
});

test('skips a cautionary stack that Audiveris does not export as a MusicXML measure', () => {
  const book = '<book><score><logical-part id="1"><staff-configuration/></logical-part><page sheet-number="1" sheet-page-id="1"/></score></book>';
  const sheet = `<sheet><page id="1"><system>
    <stack id="1"></stack><stack id="2" special="CAUTIONARY" duration="0"/>
    <part id="1"><measure id="1"><head-chords>8</head-chords></measure><measure id="2"></measure></part>
    <sig><head-chord id="8" grade="0.63"></head-chord></sig>
  </system><system><stack id="3"></stack><part id="1"><measure id="3"><head-chords>9</head-chords></measure></part>
    <sig><head-chord id="9" grade="0.71"></head-chord></sig></system></page></sheet>`;
  const result = extractOmrScoreMetadata(book, () => sheet, 1);
  assert.deepEqual(result.sourceLayout, [
    { pdfPage: 1, pageId: '1', systemIndex: 0, stackIndex: 0 },
    { pdfPage: 1, pageId: '1', systemIndex: 1, stackIndex: 0 },
  ]);
  assert.deepEqual(result.scores, [{
    measureCount: 2,
    sourceMeasures: result.sourceLayout.map((slot, measureIndex) => ({ measureIndex, ...slot })),
    signals: [{ measureIndex: 0, minGrade: 0.63, lowNoteCount: 1 }, { measureIndex: 1, minGrade: 0.71, lowNoteCount: 1 }],
  }]);
});

test('keeps separate score regions on one PDF page even where the first logical part is absent', () => {
  const book = `<book>
    <score><logical-part id="1"><staff-configuration/></logical-part><page sheet-number="1" sheet-page-id="1"/></score>
    <score><logical-part id="1"><staff-configuration/></logical-part><page sheet-number="1" sheet-page-id="2"/></score>
  </book>`;
  const sheet = `<sheet>
    <page id="1"><system><stack id="1"></stack><part id="1"><measure id="1"></measure></part></system></page>
    <page id="2"><system><stack id="2"></stack><stack id="3"></stack></system>
      <system><stack id="4"></stack><part id="1"><measure id="4"><head-chords>8</head-chords></measure></part>
      <sig><head-chord id="8" grade="0.63"></head-chord></sig></system></page>
  </sheet>`;
  const result = extractOmrScoreMetadata(book, () => sheet, 1);
  assert.equal(result.sourceLayout.length, 4);
  assert.deepEqual(result.scores.map((score) => score.measureCount), [1, 3]);
  assert.deepEqual(result.scores[1].sourceMeasures.map((measure) => measure.pageId), ['2', '2', '2']);
  assert.deepEqual(result.scores[1].signals, [{ measureIndex: 2, minGrade: 0.63, lowNoteCount: 1 }]);
});
