#!/usr/bin/env node
import process from 'node:process';
import { DEFAULT_OMR_OPTIONS, OmrJobError, runPdfOmrJob } from './omr/pdfOmr.mjs';

const usage = `Usage:
  npm run omr:pdf -- --input <score.pdf> [options]

Required:
  --input <path>                 PDF to process

Options:
  --output <directory>           Artifact root (default: artifacts/omr)
  --engine <local|docker>        OMR adapter (default: local)
  --audiveris-bin <command>      Local Audiveris executable (default: audiveris)
  --docker-image <image>         Required when --engine docker
  --docker-bin <command>         Docker executable (default: docker)
  --input-mode <pdf|rendered-pages>
                                 Use one multi-page PDF (default) or each rendered PNG
  --dpi <150-600>                Render resolution (default: ${DEFAULT_OMR_OPTIONS.renderDpi})
  --max-bytes <bytes>            Input size limit (default: ${DEFAULT_OMR_OPTIONS.maxInputBytes})
  --max-pages <count>            Page limit (default: ${DEFAULT_OMR_OPTIONS.maxPages})
  --max-rendered-pixels <count>  Rasterized-pixel limit (default: ${DEFAULT_OMR_OPTIONS.maxRenderedPixels})
  --timeout-ms <milliseconds>    Per-command limit (default: ${DEFAULT_OMR_OPTIONS.timeoutMs})
  --help                         Show this help
`;

const optionNames = new Set([
  '--input', '--output', '--engine', '--audiveris-bin', '--docker-image', '--docker-bin', '--input-mode',
  '--dpi', '--max-bytes', '--max-pages', '--max-rendered-pixels', '--timeout-ms', '--help',
]);

const parseArguments = (argumentsList) => {
  const parsed = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const name = argumentsList[index];
    if (!optionNames.has(name)) throw new OmrJobError('unknown-option', `未知のオプションです: ${name}`);
    if (name === '--help') {
      parsed.help = true;
      continue;
    }
    const value = argumentsList[index + 1];
    if (!value || value.startsWith('--')) throw new OmrJobError('missing-option-value', `${name} の値が必要です。`);
    index += 1;
    parsed[name] = value;
  }
  return parsed;
};

const positiveIntegerOption = (value, name) => {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new OmrJobError('invalid-option-value', `${name} は正の整数で指定してください。`);
  return number;
};

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
  } else {
    const job = await runPdfOmrJob({
      inputPath: args['--input'],
      outputDir: args['--output'],
      engine: args['--engine'],
      audiverisBin: args['--audiveris-bin'],
      dockerImage: args['--docker-image'],
      dockerBin: args['--docker-bin'],
      inputMode: args['--input-mode'],
      renderDpi: positiveIntegerOption(args['--dpi'], '--dpi'),
      maxInputBytes: positiveIntegerOption(args['--max-bytes'], '--max-bytes'),
      maxPages: positiveIntegerOption(args['--max-pages'], '--max-pages'),
      maxRenderedPixels: positiveIntegerOption(args['--max-rendered-pixels'], '--max-rendered-pixels'),
      timeoutMs: positiveIntegerOption(args['--timeout-ms'], '--timeout-ms'),
    });
    process.stdout.write(`${JSON.stringify({ status: job.status, jobId: job.jobId, jobDirectory: job.jobDirectory, diagnostics: job.diagnostics }, null, 2)}\n`);
    if (job.status !== 'succeeded') process.exitCode = 1;
  }
} catch (error) {
  const output = {
    status: 'failed',
    code: error instanceof OmrJobError ? error.code : 'unexpected-error',
    message: error instanceof Error ? error.message : '予期しないエラーが発生しました。',
  };
  process.stderr.write(`${JSON.stringify(output)}\n`);
  process.exitCode = 1;
}
