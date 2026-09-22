#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { loadBenchmark } from '../benchmarks/import/evaluate.mjs';

const manifestPath = process.argv[2] ?? 'benchmarks/import/manifest.json';
const benchmark = await loadBenchmark(manifestPath);
let failed = false;

for (const source of benchmark.manifest.sources) {
  const sourcePath = path.resolve(source.localPath);
  try {
    const digest = createHash('sha256').update(await readFile(sourcePath)).digest('hex');
    if (digest === source.sha256) {
      process.stdout.write(`OK ${source.id}: ${source.localPath}\n`);
    } else {
      failed = true;
      process.stderr.write(`MISMATCH ${source.id}: expected ${source.sha256}, got ${digest}\n`);
    }
  } catch (error) {
    failed = true;
    process.stderr.write(`MISSING ${source.id}: ${source.localPath} (${error.code ?? error.message})\n`);
  }
}

if (failed) process.exitCode = 1;
