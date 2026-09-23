import { describe, expect, it } from 'vitest';
import { parseMusicXmlToImportDraft } from './musicXmlImport';
import { confirmOmrNavigationToSong, formatOmrSourceOrder, parseOmrSourceOrder, planOmrNavigation } from './omrNavigation';
import type { ImportDraft } from './importDraft';
import type { OmrJobArtifact, OmrNavigationMark, OmrSourceSlot } from './omrJobImport';

const xml = (notes: string[], keyChange = false) => `<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">
  ${notes.map((pitch, index) => `<measure number="${index + 1}">
    ${index === 0 ? `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
      ${keyChange ? '<key><fifths>2</fifths><mode>minor</mode></key>' : ''}</attributes>` : ''}
    ${index === 0 && keyChange ? '<direction><sound tempo="96"/></direction>' : ''}
    <note><pitch><step>${pitch}</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice></note>
  </measure>`).join('')}
  </part></score-partwise>`;
const firstPath = 'musicxml/candidate-1.musicxml';
const secondPath = 'musicxml/candidate-2.musicxml';
const slots: OmrSourceSlot[] = Array.from({ length: 5 }, (_, index) => ({
  pdfPage: 1, pageId: index < 2 ? '1' : '2', systemIndex: 0, stackIndex: index < 2 ? index : index - 2,
}));
const job: OmrJobArtifact = {
  contractVersion: 1, jobId: 'omr-1234567890abcdef1234', status: 'succeeded',
  input: { fileName: 'score.pdf', sha256: 'a'.repeat(64) }, preflight: { pages: 1 },
  engine: { version: '5.11.0' }, diagnostics: [],
  artifacts: { sourceLayout: slots, musicXml: [
    { path: firstPath, sha256: 'b'.repeat(64), sourceOutput: 'first.mxl', sourceMeasures: slots.slice(0, 2).map((slot, measureIndex) => ({ ...slot, measureIndex })) },
    { path: secondPath, sha256: 'c'.repeat(64), sourceOutput: 'second.mxl', sourceMeasures: slots.slice(2).map((slot, measureIndex) => ({ ...slot, measureIndex })) },
  ] },
};
const drafts = (): Record<string, ImportDraft> => Object.fromEntries([
  [firstPath, xml(['C', 'D']), job.artifacts.musicXml[0].sha256],
  [secondPath, xml(['E', 'F', 'G'], true), job.artifacts.musicXml[1].sha256],
].map(([path, sourceXml, sha256]) => {
  const draft = parseMusicXmlToImportDraft(sourceXml);
  draft.source.omrJob = { jobId: job.jobId, pdfFileName: job.input.fileName, pdfSha256: job.input.sha256,
    engineVersion: job.engine.version, candidatePath: path, candidateSha256: sha256, candidateCount: 2 };
  return [path, draft];
}));
const marks: OmrNavigationMark[] = [
  { kind: 'segno', sourceMeasureIndex: 0 },
  { kind: 'toCoda', sourceMeasureIndex: 1, targetMeasureIndex: 4 },
  { kind: 'dalSegno', sourceMeasureIndex: 3, targetMeasureIndex: 0 },
  { kind: 'coda', sourceMeasureIndex: 4 },
];

describe('OMR navigation review', () => {
  it('replays reviewed notes and restores key and tempo after a cross-candidate jump', () => {
    const plan = planOmrNavigation(job, drafts(), marks);
    expect(plan.ready).toBe(true);
    expect(plan.baselineOrder).toEqual([0, 1, 2, 3, 4]);
    expect(plan.proposedOrder).toEqual([0, 1, 2, 3, 0, 1, 4]);
    const result = confirmOmrNavigationToSong(job, drafts(), plan.proposedOrder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.totalMeasures).toBe(7);
    expect(result.song.melodyNotes.map((note) => note.pitch)).toEqual(['C', 'D', 'E', 'F', 'C', 'D', 'G']);
    expect(result.song.melodyNotes.map((note) => note.startTick)).toEqual([0, 1920, 3840, 5760, 7680, 9600, 11520]);
    expect(new Set(result.song.melodyNotes.map((note) => note.id)).size).toBe(7);
    expect(result.song.keySignatureEvents).toContainEqual({ tick: 7680, key: { tonic: 'C', mode: 'major' } });
    expect(result.song.keySignatureEvents).toContainEqual({ tick: 11520, key: { tonic: 'B', mode: 'minor' } });
    expect(result.song.tempoEvents).toContainEqual({ tick: 7680, bpm: 120 });
    expect(result.song.tempoEvents).toContainEqual({ tick: 11520, bpm: 96 });
  });

  it('accepts an explicit full route while rejecting incomplete jumps and invalid ranges', () => {
    expect(formatOmrSourceOrder([0, 1, 2, 1, 2, 4])).toBe('1-3, 2-3, 5');
    expect(parseOmrSourceOrder('1-3, 2-3, 5', 5)).toEqual([0, 1, 2, 1, 2, 4]);
    expect(() => parseOmrSourceOrder('1-6', 5)).toThrow();
    expect(() => parseOmrSourceOrder('5-2', 5)).toThrow();
    expect(() => parseOmrSourceOrder('1, bad', 5)).toThrow();
    expect(planOmrNavigation(job, drafts(), marks.filter((mark) => mark.kind !== 'coda')).issues)
      .toContainEqual(expect.objectContaining({ code: 'missing-navigation-target' }));
    expect(planOmrNavigation(job, drafts(), marks.map((mark) => mark.kind === 'dalSegno'
      ? { ...mark, targetMeasureIndex: 99 } : mark)).issues)
      .toContainEqual(expect.objectContaining({ code: 'invalid-navigation-location' }));
    const captured = drafts();
    captured[secondPath].score.sourceMeasures[1].directions.dalsegno = 'default';
    expect(planOmrNavigation(job, captured, marks).issues)
      .toContainEqual(expect.objectContaining({ code: 'navigation-already-in-musicxml' }));
    expect(confirmOmrNavigationToSong(job, drafts(), [0, 99]).ok).toBe(false);
  });
});
