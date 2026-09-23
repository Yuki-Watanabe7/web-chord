import { describe, expect, it } from 'vitest';
import {
  addImportDraftKeySignature,
  addImportDraftTempo,
  confirmImportDraftToSong,
  getUnresolvedImportDraftIssues,
  moveImportDraftLinearMeasure,
  selectImportDraftMelody,
  setImportDraftIssueResolved,
  toggleImportDraftMelodyExcluded,
  updateImportDraftChordSymbol,
  updateImportDraftMelodyNote,
  validateImportDraft,
} from './importDraft';
import { parseMusicXmlToImportDraft } from './musicXmlImport';
import { musicXmlImportFixture } from './fixtures/musicXmlImport.fixture';

describe('MusicXML ImportDraft adapter', () => {
  it('creates a deterministic review draft with expanded score positions and source provenance', () => {
    const first = parseMusicXmlToImportDraft(musicXmlImportFixture, { fileName: 'repeat-score.musicxml' });
    const second = parseMusicXmlToImportDraft(musicXmlImportFixture, { fileName: 'repeat-score.musicxml' });

    expect(second).toEqual(first);
    expect(first.source).toMatchObject({
      fileName: 'repeat-score.musicxml',
      musicXmlVersion: '4.0',
      generators: ['Audiveris 5.4 OMR'],
      omrEngine: 'Audiveris 5.4 OMR',
    });
    expect(first.ticksPerQuarter).toBe(480);
    expect(first.score.linearMeasures.map((measure) => measure.sourceMeasureIndex)).toEqual([0, 1, 2, 1, 3]);
    expect(first.score.linearMeasures.map((measure) => measure.startTick)).toEqual([0, 480, 2400, 4320, 6240]);
    expect(first.score.sourceMeasures.find((measure) => measure.partId === 'P1' && measure.measureIndex === 2)).toMatchObject({
      repeat: { forward: false, backwardTimes: 2 },
      endings: [{ type: 'start', numbers: [1] }, { type: 'stop', numbers: [1] }],
    });
    expect(first.melodySelection).toMatchObject({
      selected: { partId: 'P2', staff: 1, voice: '1' },
      status: 'auto-selected',
    });
    expect(first.candidates.melodyNotes.find((candidate) => candidate.normalized.timeModification)?.normalized).toMatchObject({
      startTick: 2400,
      durationTicks: 160,
      timeModification: { actualNotes: 3, normalNotes: 2 },
    });
    expect(first.candidates.melodyNotes.find((candidate) => candidate.normalized.isGrace)).toMatchObject({
      normalized: { startTick: 6240, durationTicks: 0, isGrace: true },
      source: { partId: 'P2', measureNumber: '3', staff: 1, voice: '1', occurrence: 1 },
    });
    expect(first.candidates.chords.map((candidate) => candidate.raw)).toEqual(['C7', 'F', 'G', 'F', 'N.C.']);
    expect(first.candidates.chords[0]?.normalized.chordSymbol.degrees).toEqual([{ value: 9, alter: 0, type: 'add' }]);
    expect(first.candidates.timeSignatures.map((candidate) => candidate.normalized)).toEqual([
      { tick: 0, timeSignature: { beatsPerMeasure: 4, beatUnit: 4 } },
      { tick: 6240, timeSignature: { beatsPerMeasure: 3, beatUnit: 4 } },
    ]);
    expect({
      linearMeasureOrder: first.score.linearMeasures.map((measure) => measure.sourceMeasureIndex),
      chordSymbols: first.candidates.chords.map((candidate) => candidate.normalized.chordSymbol.normalized),
      melodyCandidateCount: first.candidates.melodyNotes.length,
      selectedMelody: first.melodySelection.selected,
      warningCodes: first.issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.code),
    }).toMatchInlineSnapshot(`
      {
        "chordSymbols": [
          "C7",
          "F",
          "G",
          "F",
          "N.C.",
        ],
        "linearMeasureOrder": [
          0,
          1,
          2,
          1,
          3,
        ],
        "melodyCandidateCount": 10,
        "selectedMelody": {
          "partId": "P2",
          "staff": 1,
          "voice": "1",
        },
        "warningCodes": [
          "unpaired-tie",
          "multiple-melody-candidates",
        ],
      }
    `);
  });

  it('keeps validation separate from Song creation and leaves a visible warning for grace notes', () => {
    const draft = parseMusicXmlToImportDraft(musicXmlImportFixture, { fileName: 'repeat-score.musicxml' });
    const validation = validateImportDraft(draft);
    const result = confirmImportDraftToSong(draft, { id: 'imported-song', title: '読み込みテスト' });

    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'grace-note-not-confirmable', severity: 'warning' }),
    ]));
    expect(result).toMatchObject({ ok: true, song: { id: 'imported-song', totalMeasures: 5, pickupTicks: 480 } });
    if (!result.ok) throw new Error('expected Song conversion');
    expect(result.song.melodyNotes).toHaveLength(5);
    expect(result.song.melodyNotes.find((note) => note.startTick === 2400)).toMatchObject({ durationTicks: 160 });
    expect(result.song.timeSignatureEvents).toContainEqual({ tick: 6240, timeSignature: { beatsPerMeasure: 3, beatUnit: 4 } });
  });

  it('marks a user re-selection separately from parser auto-selection', () => {
    const draft = parseMusicXmlToImportDraft(musicXmlImportFixture);
    const reselected = selectImportDraftMelody(draft, { partId: 'P1', staff: 1, voice: '1' });

    expect(reselected.melodySelection).toMatchObject({
      selected: { partId: 'P1', staff: 1, voice: '1' },
      status: 'user-confirmed',
    });
    expect(reselected.candidates.melodyNotes.some((candidate) => candidate.reviewStatus === 'user-confirmed')).toBe(true);
  });

  it('keeps source values while allowing review edits and warning acknowledgement', () => {
    const draft = parseMusicXmlToImportDraft(musicXmlImportFixture);
    const chord = draft.candidates.chords[0]!;
    const note = draft.candidates.melodyNotes.find((candidate) => candidate.reviewStatus === 'auto-selected')!;
    const warning = validateImportDraft(draft).issues.find((issue) => issue.severity === 'warning')!;
    const withChordEdit = updateImportDraftChordSymbol(draft, chord.id, 'F♯m7♭5/A♯');
    const withNoteEdit = updateImportDraftMelodyNote(withChordEdit, note.id, {
      ...note.normalized,
      pitch: 'F#',
      startTick: note.normalized.startTick + 20,
      tie: { id: 'review-tie', type: 'start' },
    });
    const reviewed = setImportDraftIssueResolved(withNoteEdit, warning, true);

    expect(reviewed.candidates.chords[0]).toMatchObject({
      raw: 'C7',
      reviewRaw: 'F♯m7♭5/A♯',
      reviewStatus: 'edited',
      normalized: { root: 'F#', bass: 'A#', chordSymbol: { kind: 'half-diminished', extension: 7 } },
    });
    expect(reviewed.candidates.melodyNotes.find((candidate) => candidate.id === note.id)).toMatchObject({
      reviewStatus: 'edited',
      normalized: { pitch: 'F#', tie: { id: 'review-tie', type: 'start' } },
    });
    expect(getUnresolvedImportDraftIssues(reviewed)).not.toContainEqual(warning);
  });

  it('can reorder an expanded measure and rebase the events it contains', () => {
    const draft = parseMusicXmlToImportDraft(musicXmlImportFixture);
    const moved = moveImportDraftLinearMeasure(draft, 0, 1);

    expect(moved.score.linearMeasures.map((measure) => measure.sourceMeasureIndex)).toEqual([1, 0, 2, 1, 3]);
    expect(moved.score.linearMeasures.map((measure) => measure.startTick)).toEqual([0, 1920, 2400, 4320, 6240]);
    expect(moved.candidates.chords.find((candidate) => candidate.raw === 'C7')).toMatchObject({
      normalized: { startTick: 1920 },
      reviewStatus: 'edited',
    });
  });

  it('blocks a reviewed draft with invalid editable timing without mutating its candidate order', () => {
    const draft = parseMusicXmlToImportDraft(musicXmlImportFixture);
    const invalid = {
      ...draft,
      candidates: {
        ...draft.candidates,
        chords: draft.candidates.chords.map((candidate, index) => index === 0 ? {
          ...candidate,
          normalized: { ...candidate.normalized, durationTicks: 0 },
        } : candidate),
      },
    };
    const orderBeforeConfirm = invalid.candidates.chords.map((candidate) => candidate.id);
    const result = confirmImportDraftToSong(invalid);

    expect(result).toMatchObject({ ok: false });
    expect(result.validation.issues).toContainEqual(expect.objectContaining({ code: 'invalid-chord-timing', severity: 'error' }));
    expect(invalid.candidates.chords.map((candidate) => candidate.id)).toEqual(orderBeforeConfirm);
  });

  it('expands a basic D.S. al Fine route while retaining Segno and Coda positions', () => {
    const draft = parseMusicXmlToImportDraft(`
      <score-partwise version="4.0">
        <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><direction><direction-type><segno/></direction-type></direction><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure>
          <measure number="2"><direction><direction-type><coda/></direction-type></direction><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration></note></measure>
          <measure number="3"><direction><sound dalsegno="default"/></direction><note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration></note></measure>
          <measure number="4"><direction><direction-type><words>Fine</words></direction-type></direction><note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration></note></measure>
        </part>
      </score-partwise>
    `);

    expect(draft.score.linearMeasures.map((measure) => measure.sourceMeasureIndex)).toEqual([0, 1, 2, 0, 1, 2, 3]);
    expect(draft.score.sourceMeasures).toEqual(expect.arrayContaining([
      expect.objectContaining({ measureIndex: 0, directions: expect.objectContaining({ segno: 'default' }) }),
      expect.objectContaining({ measureIndex: 1, directions: expect.objectContaining({ coda: 'default' }) }),
      expect.objectContaining({ measureIndex: 2, directions: expect.objectContaining({ dalsegno: 'default' }) }),
    ]));
  });

  it('maps a minor key signature to its relative minor tonic', () => {
    const draft = parseMusicXmlToImportDraft(`
      <score-partwise version="4.0">
        <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><key><fifths>2</fifths><mode>minor</mode></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration></note>
        </measure></part>
      </score-partwise>
    `);
    expect(draft.candidates.keySignatures[0]?.normalized.key).toEqual({ tonic: 'B', mode: 'minor' });
  });

  it('excludes a false OMR note and adds missing key and tempo during review', () => {
    const original = parseMusicXmlToImportDraft(musicXmlImportFixture);
    const selected = original.candidates.melodyNotes.find((candidate) => candidate.reviewStatus === 'auto-selected');
    expect(selected).toBeDefined();
    const withoutNote = toggleImportDraftMelodyExcluded(original, selected!.id);
    expect(withoutNote.candidates.melodyNotes.find((candidate) => candidate.id === selected!.id)?.reviewStatus).toBe('excluded');
    const withChanges = addImportDraftTempo(addImportDraftKeySignature(withoutNote, 1), 1);
    expect(withChanges.candidates.keySignatures[withChanges.candidates.keySignatures.length - 1]).toMatchObject({
      normalized: { tick: 480, key: { tonic: 'C', mode: 'major' } },
      source: { measureNumber: '1' },
      reviewStatus: 'edited',
    });
    expect(withChanges.candidates.tempos[withChanges.candidates.tempos.length - 1]?.normalized).toEqual({ tick: 480, bpm: 120 });
    const initialSong = confirmImportDraftToSong(original);
    const reviewedSong = confirmImportDraftToSong(withChanges);
    expect(initialSong.ok && reviewedSong.ok).toBe(true);
    if (initialSong.ok && reviewedSong.ok) {
      expect(reviewedSong.song.melodyNotes.length).toBe(initialSong.song.melodyNotes.length - 1);
      expect(reviewedSong.song.tempoEvents).toContainEqual({ tick: 480, bpm: 120 });
    }
    expect(toggleImportDraftMelodyExcluded(withoutNote, selected!.id).candidates.melodyNotes
      .find((candidate) => candidate.id === selected!.id)?.reviewStatus).toBe('user-confirmed');
  });
});
