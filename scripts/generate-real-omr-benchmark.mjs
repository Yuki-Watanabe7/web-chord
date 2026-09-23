#!/usr/bin/env node
/** Extracts only the manifest's short evaluation segments from local, hash-checked OMR jobs. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { loadBenchmark } from '../benchmarks/import/evaluate.mjs';

const jobsRoot = path.resolve(process.argv[2] ?? 'artifacts/omr-host');
const outputRoot = path.resolve('benchmarks/import/candidates/audiveris-5.11.0-real-omr-v1');
const candidateNumber = { 'sekai-ga-hitotsu-ni-naru-made': 1, charismax: 1, automatic: 1 };
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pitchClass = (name) => noteNames.indexOf(name);
const fifthsForKey = (key) => {
  const target = pitchClass(key.tonic);
  if (target < 0) throw new Error(`Unknown tonic: ${key.tonic}`);
  return Array.from({ length: 15 }, (_, index) => index - 7)
    .filter((fifths) => ((fifths * 7 + (key.mode === 'minor' ? 9 : 0)) % 12 + 12) % 12 === target)
    .sort((left, right) => Math.abs(left) - Math.abs(right))[0];
};

const bundle = await build({
  stdin: {
    contents: "export { parseOmrJobArtifact, parseOmrCandidateToImportDraft } from '../src/domain/music/omrJobImport.ts'; export { confirmImportDraftToSong } from '../src/domain/music/importDraft.ts';",
    resolveDir: path.resolve('scripts'),
    sourcefile: 'real-omr-benchmark-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const code = bundle.outputFiles[0].text;
const { parseOmrJobArtifact, parseOmrCandidateToImportDraft, confirmImportDraftToSong } =
  await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const benchmark = await loadBenchmark('benchmarks/import/manifest.json');

const jobs = [];
for (const entry of await readdir(jobsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('omr-')) continue;
  const directory = path.join(jobsRoot, entry.name);
  const job = parseOmrJobArtifact(await readFile(path.join(directory, 'job.json'), 'utf8'));
  jobs.push({ directory, job });
}

const effectiveChange = (candidates, measureStart, value) => candidates
  .filter((candidate) => candidate.normalized.tick <= measureStart)
  .sort((left, right) => right.normalized.tick - left.normalized.tick)[0]?.normalized[value];

const navigationFor = (sourceMeasure, number) => {
  if (!sourceMeasure) return [];
  const events = [];
  const add = (kind, extra = {}) => events.push({ measure: number, onsetTick: 0, kind, ...extra });
  if (sourceMeasure.repeat.forward) add('repeatStart');
  if (sourceMeasure.repeat.backwardTimes) add('repeatEnd', { repeatCount: sourceMeasure.repeat.backwardTimes });
  for (const ending of sourceMeasure.endings) {
    if (ending.type === 'start') add('endingStart', { endingNumbers: ending.numbers });
    if (ending.type === 'stop' || ending.type === 'discontinue') add('endingStop', { endingNumbers: ending.numbers });
  }
  if (sourceMeasure.directions.segno) add('segno');
  if (sourceMeasure.directions.dalsegno) add('dalSegno');
  if (sourceMeasure.directions.coda) add('coda');
  if (sourceMeasure.directions.tocoda) add('toCoda');
  if (sourceMeasure.directions.fine) add('fine');
  return events;
};

const extractSegment = (draft, fixture) => {
  const number = fixture.segment.measureStart;
  if (number !== fixture.segment.measureEnd) throw new Error('Multi-measure extraction is not yet supported');
  const measure = draft.score.linearMeasures.find((item) => item.sourceMeasureNumber === String(number));
  if (!measure) throw new Error(`OMR candidate has no measure ${number}`);
  const sameMeasure = (candidate) => candidate.source.measureIndex === measure.sourceMeasureIndex && candidate.source.occurrence === measure.occurrence;
  const selected = draft.melodySelection.selected;
  const time = effectiveChange(draft.candidates.timeSignatures, measure.startTick, 'timeSignature');
  const key = effectiveChange(draft.candidates.keySignatures, measure.startTick, 'key');
  const tempo = effectiveChange(draft.candidates.tempos, measure.startTick, 'bpm');
  const timeValue = time ? { beats: time.beatsPerMeasure, beatType: time.beatUnit } : null;
  const keyValue = key ? { fifths: fifthsForKey(key), mode: key.mode } : null;
  const sourceMeasure = draft.score.sourceMeasures.find((item) =>
    item.partId === draft.score.parts[0]?.id && item.measureIndex === measure.sourceMeasureIndex);
  const chords = draft.candidates.chords.filter((candidate) => sameMeasure(candidate) && candidate.reviewStatus !== 'unselected')
    .map((candidate) => ({
      measure: number,
      onsetTick: candidate.normalized.startTick - measure.startTick,
      durationTicks: candidate.normalized.durationTicks,
      symbol: candidate.raw,
      root: candidate.normalized.root,
      bass: candidate.normalized.bass ?? null,
      quality: candidate.normalized.quality,
    }));
  const melody = draft.candidates.melodyNotes.filter((candidate) => sameMeasure(candidate) &&
    candidate.source.partId === selected?.partId && candidate.source.staff === selected.staff &&
    candidate.source.voice === selected.voice && !candidate.normalized.isGrace && candidate.normalized.durationTicks > 0)
    .map((candidate) => ({
      measure: number,
      onsetTick: candidate.normalized.startTick - measure.startTick,
      durationTicks: candidate.normalized.durationTicks,
      midi: (candidate.normalized.octave + 1) * 12 + pitchClass(candidate.normalized.pitch),
      tie: candidate.normalized.tie?.type ?? 'none',
    }));
  const warnings = draft.issues.filter((issue) => issue.severity === 'warning' && issue.source?.measureIndex === measure.sourceMeasureIndex)
    .map((issue) => ({ measure: number, field: 'review', code: issue.code, message: issue.message }));
  return {
    $schema: '../fixture.schema.json',
    schemaVersion: 1,
    scoreId: fixture.scoreId,
    segment: fixture.segment,
    ppq: draft.ticksPerQuarter,
    measures: [{
      number,
      durationTicks: measure.durationTicks,
      timeSignature: timeValue,
      key: keyValue,
      tempoBpm: tempo ?? null,
      pickupTicks: time ? Math.max(0, draft.ticksPerQuarter * 4 * time.beatsPerMeasure / time.beatUnit - measure.durationTicks) : 0,
    }],
    chords,
    melody,
    structure: {
      timeSignatures: timeValue ? [{ measure: number, onsetTick: 0, ...timeValue }] : [],
      keys: keyValue ? [{ measure: number, onsetTick: 0, ...keyValue }] : [],
      tempos: tempo ? [{ measure: number, onsetTick: 0, bpm: tempo }] : [],
      navigation: navigationFor(sourceMeasure, number),
      playbackOrder: [number],
    },
    warnings,
  };
};

await mkdir(outputRoot, { recursive: true });
for (const source of benchmark.manifest.sources) {
  const matches = jobs.filter(({ job }) => job.input.sha256 === source.sha256);
  if (matches.length !== 1) throw new Error(`Expected one successful local job for ${source.id}, got ${matches.length}`);
  const { directory, job } = matches[0];
  if (job.engine.version !== '5.11.0') throw new Error(`Unexpected engine version for ${source.id}`);
  const selectedPath = `musicxml/candidate-${candidateNumber[source.id]}.musicxml`;
  const candidate = job.artifacts.musicXml.find((item) => item.path === selectedPath);
  if (!candidate) throw new Error(`Candidate ${selectedPath} not found for ${source.id}`);
  let draft;
  const songMeasures = [];
  for (const artifact of job.artifacts.musicXml) {
    const xml = await readFile(path.join(directory, artifact.path), 'utf8');
    const parsed = await parseOmrCandidateToImportDraft(job, { name: path.basename(artifact.path), text: async () => xml });
    const confirmation = confirmImportDraftToSong(parsed, { id: source.id, title: source.title });
    if (!confirmation.ok) throw new Error(`Cannot confirm ${source.id}/${artifact.path}: ${confirmation.validation.issues.map((issue) => issue.code).join(', ')}`);
    songMeasures.push(`${artifact.path}:${confirmation.song.measures.length}`);
    if (artifact.path === selectedPath) draft = parsed;
  }
  for (const segment of source.evaluationSegments) {
    const fixture = benchmark.expected.get(`${source.id}/${segment.id}`);
    const extracted = extractSegment(draft, fixture);
    const filePath = path.join(outputRoot, `${source.id}.${segment.id}.json`);
    await writeFile(filePath, `${JSON.stringify(extracted, null, 2)}\n`);
  }
  process.stdout.write(`${source.id}: ${job.jobId} selected=${selectedPath} sha256=${candidate.sha256} Song measures=[${songMeasures.join(', ')}]\n`);
}
