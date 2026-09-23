import { readFile } from 'node:fs/promises';
import path from 'node:path';

const NOTE_TO_PITCH_CLASS = new Map([
  ['B#', 0], ['C', 0], ['C#', 1], ['DB', 1], ['D', 2], ['D#', 3],
  ['EB', 3], ['E', 4], ['FB', 4], ['E#', 5], ['F', 5], ['F#', 6],
  ['GB', 6], ['G', 7], ['G#', 8], ['AB', 8], ['A', 9], ['A#', 10],
  ['BB', 10], ['B', 11], ['CB', 11],
]);

const QUALITY_ALIASES = new Map([
  ['', 'major'], ['MAJ', 'major'], ['MAJOR', 'major'],
  ['M', 'minor'], ['MIN', 'minor'], ['MINOR', 'minor'],
  ['7', 'dominant7'], ['DOM7', 'dominant7'], ['DOMINANT7', 'dominant7'],
  ['MAJ7', 'major7'], ['M7', 'major7'], ['MAJOR7', 'major7'],
  ['MIN7', 'minor7'], ['MINOR7', 'minor7'], ['M7_MINOR', 'minor7'],
  ['DIM', 'diminished'], ['DIMINISHED', 'diminished'], ['°', 'diminished'],
  ['AUG', 'augmented'], ['AUGMENTED', 'augmented'], ['+', 'augmented'],
  ['SUS4', 'suspended4'], ['SUSPENDED4', 'suspended4'],
  ['M7B5', 'halfDiminished7'], ['MIN7B5', 'halfDiminished7'], ['Ø7', 'halfDiminished7'],
]);

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export const validateManifest = (manifest) => {
  assert(manifest?.schemaVersion === 1, 'manifest.schemaVersion must be 1');
  assert(typeof manifest.benchmarkId === 'string' && manifest.benchmarkId.length > 0, 'manifest.benchmarkId is required');
  assert(Number.isInteger(manifest.ticksPerQuarter) && manifest.ticksPerQuarter > 0, 'manifest.ticksPerQuarter must be a positive integer');
  assert(Number.isInteger(manifest.tolerances?.onsetTicks) && manifest.tolerances.onsetTicks >= 0, 'manifest.tolerances.onsetTicks must be a non-negative integer');
  assert(Number.isInteger(manifest.tolerances?.durationTicks) && manifest.tolerances.durationTicks >= 0, 'manifest.tolerances.durationTicks must be a non-negative integer');
  assert(Array.isArray(manifest.sources) && manifest.sources.length > 0, 'manifest.sources must not be empty');

  const sourceIds = new Set();
  for (const source of manifest.sources) {
    assert(typeof source.id === 'string' && source.id.length > 0, 'every source needs an id');
    assert(!sourceIds.has(source.id), `duplicate source id: ${source.id}`);
    sourceIds.add(source.id);
    assert(/^[a-f0-9]{64}$/.test(source.sha256), `${source.id}.sha256 must be lowercase SHA-256`);
    assert(Number.isInteger(source.pages) && source.pages > 0, `${source.id}.pages must be positive`);
    assert(source.redistribution === 'prohibited', `${source.id}.redistribution must be prohibited`);
    assert(Array.isArray(source.difficultyRegions) && source.difficultyRegions.length > 0, `${source.id} needs difficultyRegions`);
    assert(Array.isArray(source.evaluationSegments) && source.evaluationSegments.length > 0, `${source.id} needs evaluationSegments`);
    for (const segment of source.evaluationSegments) {
      assert(typeof segment.id === 'string' && segment.id.length > 0, `${source.id} has a segment without id`);
      assert(typeof segment.fixture === 'string' && segment.fixture.length > 0, `${source.id}/${segment.id} needs a fixture path`);
      assert(Array.isArray(segment.difficultyTags) && segment.difficultyTags.length > 0, `${source.id}/${segment.id} needs difficultyTags`);
    }
  }

  assert(Array.isArray(manifest.candidateSets) && manifest.candidateSets.length > 0, 'manifest.candidateSets must not be empty');
  return manifest;
};

export const validateFixture = (fixture, label = 'fixture') => {
  assert(fixture?.schemaVersion === 1, `${label}.schemaVersion must be 1`);
  assert(typeof fixture.scoreId === 'string' && fixture.scoreId.length > 0, `${label}.scoreId is required`);
  assert(typeof fixture.segment?.id === 'string', `${label}.segment.id is required`);
  assert(Number.isInteger(fixture.ppq) && fixture.ppq > 0, `${label}.ppq must be positive`);
  assert(Array.isArray(fixture.measures) && fixture.measures.length > 0, `${label}.measures must not be empty`);
  assert(Array.isArray(fixture.chords), `${label}.chords must be an array`);
  assert(Array.isArray(fixture.melody), `${label}.melody must be an array`);
  assert(Array.isArray(fixture.structure?.timeSignatures), `${label}.structure.timeSignatures must be an array`);
  assert(Array.isArray(fixture.structure?.keys), `${label}.structure.keys must be an array`);
  assert(Array.isArray(fixture.structure?.tempos), `${label}.structure.tempos must be an array`);
  assert(Array.isArray(fixture.structure?.navigation), `${label}.structure.navigation must be an array`);
  assert(Array.isArray(fixture.structure?.playbackOrder), `${label}.structure.playbackOrder must be an array`);

  for (const chord of fixture.chords) {
    assert(Number.isInteger(chord.measure), `${label} chord measure must be an integer`);
    assert(Number.isInteger(chord.onsetTick) && chord.onsetTick >= 0, `${label} chord onsetTick must be non-negative`);
    assert(Number.isInteger(chord.durationTicks) && chord.durationTicks > 0, `${label} chord durationTicks must be positive`);
    assert(typeof chord.symbol === 'string' && chord.symbol.length > 0, `${label} chord symbol is required`);
    assert(typeof chord.root === 'string' && typeof chord.quality === 'string', `${label} chord root and quality are required`);
  }

  for (const note of fixture.melody) {
    assert(Number.isInteger(note.measure), `${label} melody measure must be an integer`);
    assert(Number.isInteger(note.onsetTick) && note.onsetTick >= 0, `${label} melody onsetTick must be non-negative`);
    assert(Number.isInteger(note.durationTicks) && note.durationTicks > 0, `${label} melody durationTicks must be positive`);
    assert(Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127, `${label} melody midi must be 0..127`);
    assert(['none', 'start', 'continue', 'stop'].includes(note.tie), `${label} melody tie is invalid`);
  }
  return fixture;
};

export const loadBenchmark = async (manifestPath) => {
  const resolvedManifestPath = path.resolve(manifestPath);
  const baseDirectory = path.dirname(resolvedManifestPath);
  const manifest = validateManifest(await readJson(resolvedManifestPath));
  const expected = new Map();

  for (const source of manifest.sources) {
    for (const segment of source.evaluationSegments) {
      const fixture = validateFixture(await readJson(path.resolve(baseDirectory, segment.fixture)), segment.fixture);
      assert(fixture.scoreId === source.id, `${segment.fixture} scoreId does not match ${source.id}`);
      assert(fixture.segment.id === segment.id, `${segment.fixture} segment id does not match ${segment.id}`);
      assert(fixture.ppq === manifest.ticksPerQuarter, `${segment.fixture} ppq does not match the manifest`);
      expected.set(`${source.id}/${segment.id}`, fixture);
    }
  }

  return { manifest, baseDirectory, expected };
};

export const loadCandidateSet = async (benchmark, candidateSetId) => {
  const candidateSet = benchmark.manifest.candidateSets.find((candidate) => candidate.id === candidateSetId);
  assert(candidateSet, `candidate set not found: ${candidateSetId}`);
  const candidates = new Map();
  for (const source of benchmark.manifest.sources) {
    for (const segment of source.evaluationSegments) {
      const candidatePath = path.resolve(benchmark.baseDirectory, candidateSet.directory, `${source.id}.${segment.id}.json`);
      const fixture = validateFixture(await readJson(candidatePath), candidatePath);
      assert(fixture.scoreId === source.id && fixture.segment.id === segment.id, `${candidatePath} identifies the wrong segment`);
      candidates.set(`${source.id}/${segment.id}`, fixture);
    }
  }
  return { candidateSet, candidates };
};

const ratio = (matched, total) => ({
  matched,
  total,
  rate: total === 0 ? 1 : matched / total,
});

const normalizeNote = (note) => {
  if (note === null || note === undefined || note === '') return null;
  const normalized = String(note).trim().replaceAll('♭', 'b').replaceAll('♯', '#').toUpperCase();
  return NOTE_TO_PITCH_CLASS.get(normalized) ?? `unknown:${normalized}`;
};

const normalizeQuality = (quality) => {
  const raw = String(quality).trim();
  if (raw === 'M7') return 'major7';
  if (raw === 'm7') return 'minor7';
  if (raw === 'm7b5') return 'halfDiminished7';
  if (raw === 'm') return 'minor';
  return QUALITY_ALIASES.get(raw.toUpperCase()) ?? `unknown:${raw}`;
};

const normalizedChord = (chord) => ({
  root: normalizeNote(chord.root),
  bass: normalizeNote(chord.bass),
  quality: normalizeQuality(chord.quality),
});

const sameNormalizedChord = (left, right) => JSON.stringify(normalizedChord(left)) === JSON.stringify(normalizedChord(right));

const groupByMeasure = (events) => {
  const grouped = new Map();
  for (const event of events) {
    const values = grouped.get(event.measure) ?? [];
    values.push(event);
    grouped.set(event.measure, values);
  }
  for (const values of grouped.values()) {
    values.sort((left, right) => left.onsetTick - right.onsetTick || JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  return grouped;
};

const orderedPairs = (expectedEvents, actualEvents) => {
  const expectedByMeasure = groupByMeasure(expectedEvents);
  const actualByMeasure = groupByMeasure(actualEvents);
  const measures = [...new Set([...expectedByMeasure.keys(), ...actualByMeasure.keys()])].sort((left, right) => left - right);
  const pairs = [];
  for (const measure of measures) {
    const expected = expectedByMeasure.get(measure) ?? [];
    const actual = actualByMeasure.get(measure) ?? [];
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      pairs.push({ measure, expected: expected[index], actual: actual[index] });
    }
  }
  return pairs;
};

const alignedMelodyPairs = (expectedEvents, actualEvents, tolerance) => {
  const measures = [...new Set([...expectedEvents, ...actualEvents].map((event) => event.measure))].sort((a, b) => a - b);
  const pairs = [];
  for (const measure of measures) {
    const expected = expectedEvents.filter((event) => event.measure === measure);
    const actual = actualEvents.filter((event) => event.measure === measure);
    const gapCost = 3;
    const cost = (left, right) => (left.midi === right.midi ? 0 : 2)
      + Math.min(2, Math.abs(left.onsetTick - right.onsetTick) / Math.max(1, tolerance.onsetTicks))
      + Math.min(1, Math.abs(left.durationTicks - right.durationTicks) / Math.max(1, tolerance.durationTicks));
    const table = Array.from({ length: expected.length + 1 }, () => Array(actual.length + 1).fill(0));
    const steps = Array.from({ length: expected.length + 1 }, () => Array(actual.length + 1).fill(''));
    for (let i = 1; i <= expected.length; i += 1) { table[i][0] = i * gapCost; steps[i][0] = 'missing'; }
    for (let j = 1; j <= actual.length; j += 1) { table[0][j] = j * gapCost; steps[0][j] = 'unexpected'; }
    for (let i = 1; i <= expected.length; i += 1) {
      for (let j = 1; j <= actual.length; j += 1) {
        const match = table[i - 1][j - 1] + cost(expected[i - 1], actual[j - 1]);
        const missing = table[i - 1][j] + gapCost;
        const unexpected = table[i][j - 1] + gapCost;
        const minimum = Math.min(match, missing, unexpected);
        table[i][j] = minimum;
        steps[i][j] = minimum === match ? 'match' : minimum === missing ? 'missing' : 'unexpected';
      }
    }
    const measurePairs = [];
    let i = expected.length;
    let j = actual.length;
    while (i > 0 || j > 0) {
      const step = steps[i][j];
      if (step === 'match') measurePairs.push({ measure, expected: expected[--i], actual: actual[--j] });
      else if (step === 'missing') measurePairs.push({ measure, expected: expected[--i], actual: undefined });
      else measurePairs.push({ measure, expected: undefined, actual: actual[--j] });
    }
    pairs.push(...measurePairs.reverse());
  }
  return pairs;
};

const addError = (errors, scoreId, segmentId, measure, field, code, expected, actual) => {
  errors.push({ scoreId, segmentId, measure, field, code, expected, actual });
};

const evaluateChords = (expected, actual, tolerance, context, errors) => {
  const pairs = orderedPairs(expected, actual);
  let normalizedMatches = 0;
  let rawMatches = 0;
  let onsetMatches = 0;
  let durationMatches = 0;

  for (const pair of pairs) {
    if (!pair.expected) {
      addError(errors, context.scoreId, context.segmentId, pair.measure, 'chord.event', 'unexpected', null, pair.actual);
      continue;
    }
    if (!pair.actual) {
      addError(errors, context.scoreId, context.segmentId, pair.measure, 'chord.event', 'missing', pair.expected, null);
      continue;
    }

    if (sameNormalizedChord(pair.expected, pair.actual)) normalizedMatches += 1;
    else addError(errors, context.scoreId, context.segmentId, pair.measure, 'chord.normalized', 'mismatch', normalizedChord(pair.expected), normalizedChord(pair.actual));

    if (pair.expected.symbol === pair.actual.symbol) rawMatches += 1;
    else addError(errors, context.scoreId, context.segmentId, pair.measure, 'chord.rawSymbol', 'mismatch', pair.expected.symbol, pair.actual.symbol);

    if (Math.abs(pair.expected.onsetTick - pair.actual.onsetTick) <= tolerance.onsetTicks) onsetMatches += 1;
    else addError(errors, context.scoreId, context.segmentId, pair.measure, 'chord.onset', 'outsideTolerance', pair.expected.onsetTick, pair.actual.onsetTick);

    if (Math.abs(pair.expected.durationTicks - pair.actual.durationTicks) <= tolerance.durationTicks) durationMatches += 1;
    else addError(errors, context.scoreId, context.segmentId, pair.measure, 'chord.duration', 'outsideTolerance', pair.expected.durationTicks, pair.actual.durationTicks);
  }

  return {
    normalizedAccuracy: ratio(normalizedMatches, pairs.length),
    rawSymbolAccuracy: ratio(rawMatches, pairs.length),
    onsetAccuracy: ratio(onsetMatches, pairs.length),
    durationAccuracy: ratio(durationMatches, pairs.length),
  };
};

const countPitchMatches = (expected, actual) => {
  const used = new Set();
  let matches = 0;
  for (const expectedNote of expected) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    actual.forEach((actualNote, index) => {
      if (used.has(index) || actualNote.measure !== expectedNote.measure || actualNote.midi !== expectedNote.midi) return;
      const distance = Math.abs(actualNote.onsetTick - expectedNote.onsetTick);
      if (distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    });
    if (bestIndex >= 0) {
      used.add(bestIndex);
      matches += 1;
    }
  }
  return matches;
};

const evaluateMelody = (expected, actual, tolerance, context, errors) => {
  const pitchMatches = countPitchMatches(expected, actual);
  const precision = actual.length === 0 ? (expected.length === 0 ? 1 : 0) : pitchMatches / actual.length;
  const recall = expected.length === 0 ? 1 : pitchMatches / expected.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const pairs = alignedMelodyPairs(expected, actual, tolerance);
  let onsetMatches = 0;
  let durationMatches = 0;
  let tieMatches = 0;

  for (const pair of pairs) {
    if (!pair.expected) {
      addError(errors, context.scoreId, context.segmentId, pair.measure, 'melody.note', 'unexpected', null, pair.actual);
      continue;
    }
    if (!pair.actual) {
      addError(errors, context.scoreId, context.segmentId, pair.measure, 'melody.note', 'missing', pair.expected, null);
      continue;
    }
    if (pair.expected.midi !== pair.actual.midi) {
      addError(errors, context.scoreId, context.segmentId, pair.measure, 'melody.pitch', 'mismatch', pair.expected.midi, pair.actual.midi);
    }
    if (Math.abs(pair.expected.onsetTick - pair.actual.onsetTick) <= tolerance.onsetTicks) onsetMatches += 1;
    else addError(errors, context.scoreId, context.segmentId, pair.measure, 'melody.onset', 'outsideTolerance', pair.expected.onsetTick, pair.actual.onsetTick);
    if (Math.abs(pair.expected.durationTicks - pair.actual.durationTicks) <= tolerance.durationTicks) durationMatches += 1;
    else addError(errors, context.scoreId, context.segmentId, pair.measure, 'melody.duration', 'outsideTolerance', pair.expected.durationTicks, pair.actual.durationTicks);
    if (pair.expected.tie === pair.actual.tie) tieMatches += 1;
    else addError(errors, context.scoreId, context.segmentId, pair.measure, 'melody.tie', 'mismatch', pair.expected.tie, pair.actual.tie);
  }

  return {
    pitch: {
      truePositives: pitchMatches,
      expected: expected.length,
      actual: actual.length,
      precision,
      recall,
      f1,
    },
    onsetAccuracy: ratio(onsetMatches, pairs.length),
    durationAccuracy: ratio(durationMatches, pairs.length),
    tieAccuracy: ratio(tieMatches, pairs.length),
  };
};

const structureKey = (event, type) => {
  const base = { measure: event.measure, onsetTick: event.onsetTick };
  if (type === 'timeSignature') return { ...base, beats: event.beats, beatType: event.beatType };
  if (type === 'key') return { ...base, fifths: event.fifths, mode: event.mode };
  if (type === 'navigation') {
    return {
      ...base,
      kind: event.kind,
      targetMeasure: event.targetMeasure ?? null,
      endingNumbers: event.endingNumbers ?? [],
      repeatCount: event.repeatCount ?? null,
    };
  }
  return { ...base, bpm: event.bpm };
};

const evaluateStructureEvents = (expected, actual, type, context, errors) => {
  const length = Math.max(expected.length, actual.length);
  let matches = 0;
  for (let index = 0; index < length; index += 1) {
    const expectedEvent = expected[index];
    const actualEvent = actual[index];
    if (!expectedEvent || !actualEvent) {
      addError(errors, context.scoreId, context.segmentId, expectedEvent?.measure ?? actualEvent?.measure ?? null, `structure.${type}`, expectedEvent ? 'missing' : 'unexpected', expectedEvent ?? null, actualEvent ?? null);
      continue;
    }
    const expectedKey = structureKey(expectedEvent, type);
    const actualKey = structureKey(actualEvent, type);
    if (JSON.stringify(expectedKey) === JSON.stringify(actualKey)) matches += 1;
    else addError(errors, context.scoreId, context.segmentId, expectedEvent.measure, `structure.${type}`, 'mismatch', expectedKey, actualKey);
  }
  return ratio(matches, length);
};

const evaluateStructure = (expected, actual, context, errors) => {
  const timeSignatures = evaluateStructureEvents(expected.timeSignatures, actual.timeSignatures, 'timeSignature', context, errors);
  const keys = evaluateStructureEvents(expected.keys, actual.keys, 'key', context, errors);
  const tempos = evaluateStructureEvents(expected.tempos, actual.tempos, 'tempo', context, errors);
  const navigation = evaluateStructureEvents(expected.navigation, actual.navigation, 'navigation', context, errors);
  const expectedOrder = expected.playbackOrder;
  const actualOrder = actual.playbackOrder;
  let orderMatches = 0;
  const length = Math.max(expectedOrder.length, actualOrder.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedOrder[index] === actualOrder[index]) orderMatches += 1;
    else addError(errors, context.scoreId, context.segmentId, expectedOrder[index] ?? actualOrder[index] ?? null, 'structure.playbackOrder', 'mismatch', expectedOrder[index] ?? null, actualOrder[index] ?? null);
  }
  return { timeSignatures, keys, tempos, navigation, playbackOrder: ratio(orderMatches, length) };
};

const warningMatchesError = (warning, error) => {
  if (warning.measure !== error.measure) return false;
  return warning.field === error.field || warning.field.startsWith(`${error.field}.`) || error.field.startsWith(`${warning.field}.`);
};

const evaluateWarnings = (warnings, errors) => {
  const matchedWarnings = warnings.filter((warning) => errors.some((error) => warningMatchesError(warning, error))).length;
  return {
    precision: ratio(matchedWarnings, warnings.length),
    warnings: warnings.length,
    warningsCoveringErrors: matchedWarnings,
  };
};

const scoreMetrics = (expected, actual, tolerance) => {
  const errors = [];
  const context = { scoreId: expected.scoreId, segmentId: expected.segment.id };
  const chords = evaluateChords(expected.chords, actual.chords, tolerance, context, errors);
  const melody = evaluateMelody(expected.melody, actual.melody, tolerance, context, errors);
  const structure = evaluateStructure(expected.structure, actual.structure, context, errors);
  const warnings = evaluateWarnings(actual.warnings ?? [], errors);
  const manualCorrectionMeasures = [...new Set(errors.map((error) => error.measure).filter(Number.isInteger))].sort((left, right) => left - right);
  return { chords, melody, structure, warnings, manualCorrectionMeasures, errors };
};

const combineRatios = (scores, selector) => {
  const values = scores.map(selector);
  return ratio(values.reduce((sum, value) => sum + value.matched, 0), values.reduce((sum, value) => sum + value.total, 0));
};

const combinePitch = (scores) => {
  const truePositives = scores.reduce((sum, score) => sum + score.metrics.melody.pitch.truePositives, 0);
  const expected = scores.reduce((sum, score) => sum + score.metrics.melody.pitch.expected, 0);
  const actual = scores.reduce((sum, score) => sum + score.metrics.melody.pitch.actual, 0);
  const precision = actual === 0 ? (expected === 0 ? 1 : 0) : truePositives / actual;
  const recall = expected === 0 ? 1 : truePositives / expected;
  return { truePositives, expected, actual, precision, recall, f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall) };
};

export const evaluateBenchmark = (benchmark, loadedCandidateSet) => {
  const scores = [];
  const errors = [];
  for (const source of benchmark.manifest.sources) {
    for (const segment of source.evaluationSegments) {
      const key = `${source.id}/${segment.id}`;
      const expected = benchmark.expected.get(key);
      const actual = loadedCandidateSet.candidates.get(key);
      assert(expected && actual, `missing expected or candidate fixture for ${key}`);
      const metrics = scoreMetrics(expected, actual, benchmark.manifest.tolerances);
      errors.push(...metrics.errors);
      scores.push({
        scoreId: source.id,
        title: source.title,
        sourceSha256: source.sha256,
        segmentId: segment.id,
        measureRange: [segment.measureStart, segment.measureEnd],
        metrics,
      });
    }
  }

  const summary = {
    chords: {
      normalizedAccuracy: combineRatios(scores, (score) => score.metrics.chords.normalizedAccuracy),
      rawSymbolAccuracy: combineRatios(scores, (score) => score.metrics.chords.rawSymbolAccuracy),
      onsetAccuracy: combineRatios(scores, (score) => score.metrics.chords.onsetAccuracy),
      durationAccuracy: combineRatios(scores, (score) => score.metrics.chords.durationAccuracy),
    },
    melody: {
      pitch: combinePitch(scores),
      onsetAccuracy: combineRatios(scores, (score) => score.metrics.melody.onsetAccuracy),
      durationAccuracy: combineRatios(scores, (score) => score.metrics.melody.durationAccuracy),
      tieAccuracy: combineRatios(scores, (score) => score.metrics.melody.tieAccuracy),
    },
    structure: {
      timeSignatures: combineRatios(scores, (score) => score.metrics.structure.timeSignatures),
      keys: combineRatios(scores, (score) => score.metrics.structure.keys),
      tempos: combineRatios(scores, (score) => score.metrics.structure.tempos),
      navigation: combineRatios(scores, (score) => score.metrics.structure.navigation),
      playbackOrder: combineRatios(scores, (score) => score.metrics.structure.playbackOrder),
    },
    warnings: combineRatios(scores, (score) => score.metrics.warnings.precision),
    manualCorrectionMeasures: [...new Set(errors.map((error) => `${error.scoreId}:${error.measure}`).filter((value) => !value.endsWith(':null')))].length,
    errorCount: errors.length,
  };

  return {
    schemaVersion: 1,
    benchmarkId: benchmark.manifest.benchmarkId,
    ticksPerQuarter: benchmark.manifest.ticksPerQuarter,
    tolerances: benchmark.manifest.tolerances,
    candidate: loadedCandidateSet.candidateSet,
    summary,
    scores,
    errors,
  };
};

const percent = (value) => `${(value * 100).toFixed(1)}%`;

export const formatMarkdownReport = (report) => {
  const lines = [
    `# Import benchmark: ${report.candidate.id}`,
    '',
    `Converter: \`${report.candidate.converter.name}@${report.candidate.converter.version}\``,
    '',
    '| Metric | Result |',
    '| --- | ---: |',
    `| Chord normalized | ${percent(report.summary.chords.normalizedAccuracy.rate)} |`,
    `| Chord raw symbol | ${percent(report.summary.chords.rawSymbolAccuracy.rate)} |`,
    `| Chord onset | ${percent(report.summary.chords.onsetAccuracy.rate)} |`,
    `| Melody pitch F1 | ${percent(report.summary.melody.pitch.f1)} |`,
    `| Melody onset | ${percent(report.summary.melody.onsetAccuracy.rate)} |`,
    `| Melody duration | ${percent(report.summary.melody.durationAccuracy.rate)} |`,
    `| Structure playback order | ${percent(report.summary.structure.playbackOrder.rate)} |`,
    `| Warning precision | ${report.summary.warnings.total === 0 ? 'N/A (0 warnings)' : percent(report.summary.warnings.rate)} |`,
    `| Measures needing correction | ${report.summary.manualCorrectionMeasures} |`,
    '',
    '## Errors by score and measure',
    '',
  ];
  if (report.errors.length === 0) lines.push('No errors.');
  for (const error of report.errors) {
    lines.push(`- ${error.scoreId} / measure ${error.measure ?? '-'} / ${error.field}: ${error.code} (expected ${JSON.stringify(error.expected)}, actual ${JSON.stringify(error.actual)})`);
  }
  return `${lines.join('\n')}\n`;
};
