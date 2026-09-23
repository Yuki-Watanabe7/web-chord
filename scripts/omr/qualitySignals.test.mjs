import assert from 'node:assert/strict';
import test from 'node:test';
import { extractNoteQualityByScore, LOW_HEAD_CHORD_GRADE } from './qualitySignals.mjs';

test('maps low Audiveris head-chord grade to a score measure, without treating all notes as low', () => {
  const book = '<book><score><logical-part id="1"><staff-configuration/></logical-part><page sheet-number="1" sheet-page-id="1"/></score></book>';
  const sheet = `<sheet><page id="1"><system>
    <stack id="1"></stack><stack id="2"></stack><stack id="3"></stack>
    <part id="1"><measure id="1"></measure><measure id="2"><head-chords>8</head-chords></measure><measure id="3"><head-chords>9 10</head-chords></measure></part>
    <sig><head-chord id="8" grade="0.93"></head-chord><head-chord id="9" grade="0.63"></head-chord><head-chord id="10" grade="0.94"></head-chord></sig>
  </system></page></sheet>`;
  assert.equal(LOW_HEAD_CHORD_GRADE, 0.8);
  assert.deepEqual(extractNoteQualityByScore(book, () => sheet), [{
    measureCount: 3,
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
  assert.deepEqual(extractNoteQualityByScore(book, () => sheet), [{
    measureCount: 2,
    signals: [{ measureIndex: 0, minGrade: 0.63, lowNoteCount: 1 }, { measureIndex: 1, minGrade: 0.71, lowNoteCount: 1 }],
  }]);
});
