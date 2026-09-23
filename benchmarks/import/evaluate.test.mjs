import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateBenchmark, formatMarkdownReport, loadBenchmark, loadCandidateSet } from './evaluate.mjs';

const benchmarkDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(benchmarkDirectory, 'manifest.json');

describe('import benchmark', () => {
  it('loads all protected-score metadata and ground-truth fixtures without the source PDFs', async () => {
    const benchmark = await loadBenchmark(manifestPath);

    expect(benchmark.manifest.sources).toHaveLength(3);
    expect([...benchmark.expected.values()]).toHaveLength(3);
    for (const source of benchmark.manifest.sources) {
      expect(source.redistribution).toBe('prohibited');
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.difficultyRegions.length).toBeGreaterThan(0);
      expect(source.evaluationSegments.length).toBeGreaterThan(0);
    }
    for (const fixture of benchmark.expected.values()) {
      expect(fixture.measures.length).toBeGreaterThan(0);
      expect(fixture.chords.length).toBeGreaterThan(0);
      expect(fixture.melody.length).toBeGreaterThan(0);
      expect(fixture.structure.playbackOrder.length).toBeGreaterThan(0);
    }
  });

  it('gives a perfect result when candidate fixtures equal the ground truth', async () => {
    const benchmark = await loadBenchmark(manifestPath);
    const report = evaluateBenchmark(benchmark, {
      candidateSet: {
        id: 'perfect-reference',
        description: 'test only',
        converter: { name: 'reference', version: '1', options: {} },
        directory: '',
      },
      candidates: benchmark.expected,
    });

    expect(report.summary.errorCount).toBe(0);
    expect(report.summary.chords.normalizedAccuracy.rate).toBe(1);
    expect(report.summary.chords.rawSymbolAccuracy.rate).toBe(1);
    expect(report.summary.melody.pitch.f1).toBe(1);
    expect(report.summary.melody.onsetAccuracy.rate).toBe(1);
    expect(report.summary.structure.playbackOrder.rate).toBe(1);
  });

  it('reproduces the same report and localizes deliberate failures by score, measure, and field', async () => {
    const benchmark = await loadBenchmark(manifestPath);
    const candidates = await loadCandidateSet(benchmark, 'regression-probe-v1');
    const first = evaluateBenchmark(benchmark, candidates);
    const second = evaluateBenchmark(benchmark, candidates);

    expect(second).toEqual(first);
    expect(first.summary.errorCount).toBeGreaterThan(0);
    expect(first.summary.manualCorrectionMeasures).toBe(2);
    expect(first.summary.chords.normalizedAccuracy.rate).toBeGreaterThanOrEqual(0.9);
    expect(first.summary.melody.pitch.f1).toBeGreaterThanOrEqual(0.85);
    const intro = first.scores.find((score) => score.scoreId === 'sekai-ga-hitotsu-ni-naru-made');
    expect(intro?.metrics.chords.normalizedAccuracy.rate).toBe(1);
    expect(intro?.metrics.melody.pitch.f1).toBe(1);
    expect(first.errors.some((error) => error.scoreId === 'sekai-ga-hitotsu-ni-naru-made')).toBe(false);
    expect(first.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ scoreId: 'charismax', measure: 19, field: 'melody.pitch' }),
      expect.objectContaining({ scoreId: 'automatic', measure: 3, field: 'structure.key' }),
      expect.objectContaining({ scoreId: 'automatic', measure: 3, field: 'structure.navigation' }),
    ]));

    const markdown = formatMarkdownReport(first);
    expect(markdown).toContain('charismax / measure 19 / melody.pitch');
    expect(markdown).toContain('automatic / measure 3 / structure.key');
    expect(markdown).not.toContain('sekai-ga-hitotsu-ni-naru-made / measure 1 /');
  });
});
