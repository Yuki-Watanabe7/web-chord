#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { evaluateBenchmark, formatMarkdownReport, loadBenchmark, loadCandidateSet } from '../benchmarks/import/evaluate.mjs';

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const manifestPath = argumentValue('--manifest', 'benchmarks/import/manifest.json');
const candidateSetId = argumentValue('--candidate', 'regression-probe-v1');
const format = argumentValue('--format', 'markdown');
const outputPath = argumentValue('--output', null);

if (!['json', 'markdown'].includes(format)) {
  throw new Error('--format must be json or markdown');
}

const benchmark = await loadBenchmark(manifestPath);
const candidateSet = await loadCandidateSet(benchmark, candidateSetId);
const report = evaluateBenchmark(benchmark, candidateSet);
const output = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : formatMarkdownReport(report);

if (outputPath) {
  await writeFile(path.resolve(outputPath), output, 'utf8');
} else {
  process.stdout.write(output);
}
