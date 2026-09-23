import { describe, expect, it } from 'vitest';
import { parseMusicXmlToImportDraft } from './musicXmlImport';
import { combineOmrCandidateDrafts, planOmrCandidateMerge } from './omrJobMerge';
import type { ImportDraft } from './importDraft';
import type { OmrJobArtifact, OmrSourceSlot } from './omrJobImport';

const firstXml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
  <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice></note></measure></part></score-partwise>`;
const secondXml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>2</fifths><mode>minor</mode></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
  <direction><sound tempo="96"/></direction><barline location="left"><repeat direction="forward"/></barline>
  <note><pitch><step>D</step><octave>5</octave></pitch><duration>3</duration><voice>1</voice></note></measure>
  <measure number="2"><note><pitch><step>E</step><octave>5</octave></pitch><duration>3</duration><voice>1</voice></note>
  <barline location="right"><repeat direction="backward" times="2"/></barline></measure></part></score-partwise>`;
const slots: OmrSourceSlot[] = [
  { pdfPage: 1, pageId: '1', systemIndex: 0, stackIndex: 0 },
  { pdfPage: 1, pageId: '2', systemIndex: 0, stackIndex: 0 },
  { pdfPage: 1, pageId: '2', systemIndex: 0, stackIndex: 1 },
];
const firstPath = 'musicxml/candidate-1.musicxml';
const secondPath = 'musicxml/candidate-2.musicxml';
const job: OmrJobArtifact = {
  contractVersion: 1, jobId: 'omr-1234567890abcdef1234', status: 'succeeded',
  input: { fileName: 'Automatic.pdf', sha256: 'f'.repeat(64) }, preflight: { pages: 1 },
  engine: { version: '5.11.0' }, diagnostics: [],
  artifacts: {
    sourceLayout: slots,
    musicXml: [
      { path: firstPath, sha256: 'a'.repeat(64), sourceOutput: 'first.mxl', sourceMeasures: [{ measureIndex: 0, ...slots[0] }] },
      { path: secondPath, sha256: 'b'.repeat(64), sourceOutput: 'second.mxl', sourceMeasures: [
        { measureIndex: 0, ...slots[1] }, { measureIndex: 1, ...slots[2] },
      ] },
    ],
  },
};
const drafts = (): Record<string, ImportDraft> => Object.fromEntries([
  [firstPath, firstXml, job.artifacts.musicXml[0].sha256],
  [secondPath, secondXml, job.artifacts.musicXml[1].sha256],
].map(([path, xml, sha256]) => {
  const draft = parseMusicXmlToImportDraft(xml, { fileName: path.split('/')[1] });
  draft.source.omrJob = {
    jobId: job.jobId, pdfFileName: job.input.fileName, pdfSha256: job.input.sha256,
    engineVersion: job.engine.version, candidatePath: path, candidateSha256: sha256,
    candidateCount: 2,
  };
  return [path, draft];
}));

describe('OMR split-score merge', () => {
  it('orders two score regions on the same PDF page and rebases expanded events', () => {
    const reversed = { ...job, artifacts: { ...job.artifacts, musicXml: [...job.artifacts.musicXml].reverse() } };
    const sourceDrafts = drafts();
    const plan = planOmrCandidateMerge(reversed, sourceDrafts);
    expect(plan.ready).toBe(true);
    expect(plan.segments.map((segment) => segment.path)).toEqual([firstPath, secondPath]);
    expect(plan.segments.map((segment) => segment.playbackMeasureCount)).toEqual([1, 4]);

    const merged = combineOmrCandidateDrafts(reversed, sourceDrafts);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.song.totalMeasures).toBe(5);
    expect(merged.song.measures.map((measure) => measure.startTick)).toEqual([0, 1920, 3360, 4800, 6240]);
    expect(merged.song.melodyNotes.map((note) => note.startTick).sort((a, b) => a - b)).toEqual([0, 1920, 3360, 4800, 6240]);
    expect(new Set(merged.song.melodyNotes.map((note) => note.id)).size).toBe(5);
    expect(merged.song.timeSignatureEvents).toContainEqual({ tick: 1920, timeSignature: { beatsPerMeasure: 3, beatUnit: 4 } });
    expect(merged.song.keySignatureEvents).toContainEqual({ tick: 1920, key: { tonic: 'B', mode: 'minor' } });
    expect(merged.song.tempoEvents).toContainEqual({ tick: 1920, bpm: 96 });
    expect(merged.song.tempoEvents).toContainEqual({ tick: 4800, bpm: 96 });
  });

  it('blocks missing candidates, overlapping slots, gaps, and old jobs without layout', () => {
    expect(planOmrCandidateMerge(job, { [firstPath]: drafts()[firstPath] }).issues)
      .toContainEqual(expect.objectContaining({ code: 'candidate-not-loaded' }));
    const overlapping = { ...job, artifacts: { ...job.artifacts, musicXml: [
      job.artifacts.musicXml[0],
      { ...job.artifacts.musicXml[1], sourceMeasures: [
        { measureIndex: 0, ...slots[0] }, { measureIndex: 1, ...slots[2] },
      ] },
    ] } };
    const overlap = planOmrCandidateMerge(overlapping, drafts());
    expect(overlap.ready).toBe(false);
    expect(overlap.issues.map((issue) => issue.code)).toContain('overlapping-candidates');
    expect(overlap.issues.map((issue) => issue.code)).toContain('missing-source-measure');
    expect(overlap.issues.find((issue) => issue.code === 'overlapping-candidates')?.message).toContain('PDF 1ページ');
    expect(combineOmrCandidateDrafts(overlapping, drafts()).ok).toBe(false);
    const oldJob = { ...job, artifacts: { ...job.artifacts, sourceLayout: undefined } };
    expect(planOmrCandidateMerge(oldJob, drafts()).issues).toContainEqual(expect.objectContaining({ code: 'source-layout-unavailable' }));
    const invalid = drafts();
    invalid[secondPath] = { ...invalid[secondPath], candidates: { ...invalid[secondPath].candidates,
      melodyNotes: invalid[secondPath].candidates.melodyNotes.map((note, index) => index === 0
        ? { ...note, normalized: { ...note.normalized, durationTicks: 0 } } : note),
    } };
    expect(planOmrCandidateMerge(job, invalid).issues).toContainEqual(expect.objectContaining({ code: 'invalid-melody-note' }));
    const unclosed = drafts();
    unclosed[firstPath] = { ...unclosed[firstPath], score: { ...unclosed[firstPath].score,
      sourceMeasures: unclosed[firstPath].score.sourceMeasures.map((measure) => ({ ...measure, repeat: { forward: true } })),
    } };
    expect(planOmrCandidateMerge(job, unclosed).issues).toContainEqual(expect.objectContaining({ code: 'cross-candidate-repeat' }));
  });
});
