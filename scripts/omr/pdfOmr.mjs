import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { extractNoteQualityByScore } from './qualitySignals.mjs';

export const OMR_JOB_CONTRACT_VERSION = 1;
export const OMR_JOB_CONTRACT_SCHEMA = 'schemas/omr-job-v1.schema.json';

export const DEFAULT_OMR_OPTIONS = Object.freeze({
  maxInputBytes: 32 * 1024 * 1024,
  maxPages: 20,
  maxRenderedPixels: 250 * 1024 * 1024,
  renderDpi: 300,
  timeoutMs: 10 * 60 * 1000,
});

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_CAPTURED_LOG_BYTES = 4 * 1024 * 1024;

export class OmrJobError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OmrJobError';
    this.code = code;
    this.details = details;
  }
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const pathForDisplay = (value) => path.basename(value) || value;
const sortNaturally = (values) => [...values].sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));

const decodeXml = (value) => value
  .replace(/&(?:apos|#39);/g, "'")
  .replace(/&(?:quot|#34);/g, '"')
  .replace(/&(?:amp|#38);/g, '&')
  .replace(/&(?:lt|#60);/g, '<')
  .replace(/&(?:gt|#62);/g, '>')
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));

const parseAttributes = (value) => Object.fromEntries([...value.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
  .map((match) => [match[1], decodeXml(match[2] ?? match[3] ?? '')]));

const asPositiveInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};

const redactText = (value, replacements) => replacements.reduce(
  (redacted, replacement) => replacement ? redacted.split(replacement).join(`<${replacement === replacements[0] ? 'input' : 'workspace'}>`) : redacted,
  value,
);

const quotedCommand = (command, args) => [command, ...args].map((item) => JSON.stringify(item)).join(' ');

/** Runs an executable without invoking a shell, with bounded log capture and a hard timeout. */
export const runProcess = (command, args, { cwd, timeoutMs }) => new Promise((resolve) => {
  const startedAt = Date.now();
  let stdout = '';
  let stderr = '';
  let settled = false;
  let timedOut = false;
  let timer;
  let killTimer;

  const append = (current, chunk) => {
    if (Buffer.byteLength(current) >= MAX_CAPTURED_LOG_BYTES) return current;
    const remaining = MAX_CAPTURED_LOG_BYTES - Buffer.byteLength(current);
    const text = chunk.toString('utf8');
    return Buffer.byteLength(text) <= remaining ? `${current}${text}` : `${current}${Buffer.from(text).subarray(0, remaining).toString('utf8')}\n[log truncated]\n`;
  };

  const finish = (result) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (killTimer) clearTimeout(killTimer);
    resolve({
      command,
      args,
      stdout,
      stderr,
      timedOut,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  };

  let child;
  try {
    child = spawn(command, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (error) {
    finish({ exitCode: null, spawnError: { code: error.code, message: error.message } });
    return;
  }

  child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
  child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
  child.once('error', (error) => finish({ exitCode: null, spawnError: { code: error.code, message: error.message } }));
  child.once('close', (exitCode, signal) => finish({ exitCode, signal }));

  timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    killTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  }, timeoutMs);
});

export const parsePdfInfo = (output) => {
  const valueFor = (label) => output.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'))?.[1]?.trim();
  const pages = asPositiveInteger(valueFor('Pages'));
  const pageSize = valueFor('Page size')?.match(/([\d.]+)\s+x\s+([\d.]+)\s+pts/i);
  const encrypted = valueFor('Encrypted');
  return {
    pages,
    pageSizePoints: pageSize ? { width: Number(pageSize[1]), height: Number(pageSize[2]) } : undefined,
    encrypted: encrypted ? /^yes\b/i.test(encrypted) : undefined,
    pdfVersion: valueFor('PDF version'),
  };
};

export const extractTextLayer = (html) => {
  const pages = [...html.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/gi)];
  const pageBlocks = pages.length > 0 ? pages.map((match) => match[1]) : [html];
  const words = [];
  pageBlocks.forEach((page, pageIndex) => {
    for (const match of page.matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/gi)) {
      const attributes = parseAttributes(match[1]);
      const text = decodeXml(match[2]).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const xMin = Number(attributes.xMin);
      const yMin = Number(attributes.yMin);
      const xMax = Number(attributes.xMax);
      const yMax = Number(attributes.yMax);
      words.push({
        text,
        page: pageIndex + 1,
        boundingBox: Number.isFinite(xMin) && Number.isFinite(yMin) && Number.isFinite(xMax) && Number.isFinite(yMax)
          ? { xMin, yMin, xMax, yMax }
          : undefined,
      });
    }
  });
  return words;
};

const chordPattern = /^(?:N\.?C\.?|[A-G](?:[#♯b♭])?(?:(?:maj|min|m|M|dim|aug|sus|add|omit|no)?\d{0,2}|(?:maj|min|m|M|dim|aug|sus|add|omit|no)|[+°øΔ])*(?:\([^)]*\))?(?:\/[A-G](?:[#♯b♭])?)?)$/i;

/** Retains only likely chord symbols, never the complete PDF text layer. */
export const extractChordCandidates = (words) => words
  .filter((word) => chordPattern.test(word.text.replace(/\s+/g, '')))
  .map((word) => ({
    value: word.text,
    page: word.page,
    boundingBox: word.boundingBox,
    source: 'pdf-text-layer',
    coordinateSpace: { origin: 'top-left', unit: 'pdf-points' },
  }));

const countPdfImages = (output) => output.split(/\r?\n/)
  .filter((line) => /^\s*\d+\s+\d+\s+\S+\s+\d+\s+\d+\s+/.test(line)).length;

const commandFailure = (tool, result) => {
  if (result.spawnError?.code === 'ENOENT') {
    return new OmrJobError('dependency-unavailable', `${tool} が見つかりません。PopplerとOMRエンジンの必要条件を確認してください。`, { tool });
  }
  if (result.timedOut) return new OmrJobError('command-timeout', `${tool} が制限時間内に完了しませんでした。`, { tool });
  return new OmrJobError('command-failed', `${tool} が失敗しました。`, { tool, exitCode: result.exitCode });
};

const requireSuccess = (tool, result) => {
  if (result.exitCode === 0 && !result.spawnError && !result.timedOut) return result;
  throw commandFailure(tool, result);
};

const pngDimensions = async (filePath) => {
  const header = await readFile(filePath);
  if (header.length < 24 || !header.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new OmrJobError('invalid-rendered-page', `${pathForDisplay(filePath)} はPNGとして読み取れません。`);
  }
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

const relativeFile = (base, filePath) => path.relative(base, filePath).split(path.sep).join('/');

const collectFiles = async (directory) => {
  const files = [];
  const visit = async (current) => {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const itemPath = path.join(current, item.name);
      if (item.isDirectory()) await visit(itemPath);
      else if (item.isFile()) files.push(itemPath);
    }
  };
  await visit(directory);
  return files;
};

const isMusicXml = (value) => /<score-(?:partwise|timewise)\b/i.test(value);

const readZipEntry = (archive, entryName) => {
  const minimumEocdOffset = Math.max(0, archive.length - 65_557);
  let eocdOffset = -1;
  for (let offset = archive.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new OmrJobError('invalid-mxl', 'MXLのZIP終端を読み取れません。');
  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new OmrJobError('invalid-mxl', 'MXLの中央ディレクトリを読み取れません。');
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== entryName) continue;
    if (archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new OmrJobError('invalid-mxl', 'MXLのローカルヘッダーを読み取れません。');
    const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const payload = archive.subarray(localHeaderOffset + 30 + localNameLength + localExtraLength, localHeaderOffset + 30 + localNameLength + localExtraLength + compressedSize);
    if (method === 0) return payload;
    if (method === 8) return inflateRawSync(payload);
    throw new OmrJobError('unsupported-mxl-compression', `MXLの圧縮形式 ${method} には対応していません。`);
  }
  throw new OmrJobError('invalid-mxl', `MXLに ${entryName} がありません。`);
};

const musicXmlFromMxl = async (filePath) => {
  const archive = await readFile(filePath);
  const container = readZipEntry(archive, 'META-INF/container.xml').toString('utf8');
  const rootFile = container.match(/<rootfile\b[^>]*full-path\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!rootFile) throw new OmrJobError('invalid-mxl', 'MXLのMusicXMLルートを読み取れません。');
  const xml = readZipEntry(archive, rootFile).toString('utf8');
  if (!isMusicXml(xml)) throw new OmrJobError('invalid-mxl', 'MXL内にMusicXMLスコアがありません。');
  return xml;
};

const readMusicXmlCandidate = async (filePath) => {
  if (/\.mxl$/i.test(filePath)) return musicXmlFromMxl(filePath);
  const xml = await readFile(filePath, 'utf8');
  return isMusicXml(xml) ? xml : undefined;
};

const parseEngineVersion = (output) => output.match(/Audiveris(?:\s+version)?\s*[:=]\s*([^\r\n]+)/i)?.[1]?.trim()
  ?? output.match(/Audiveris\s+([0-9][^\s]*)/i)?.[1];

const audiverisLogLocation = (line) => {
  const location = {};
  for (const key of ['sheet', 'page']) {
    const value = line.match(new RegExp(`\\b${key}\\s*(?:[#:{]\\s*)?(\\d+)\\b`, 'i'))?.[1];
    if (value) location[key] = Number(value);
  }
  return location;
};

/**
 * Finds the export warning emitted when PartwiseBuilder cannot turn a
 * MetronomeInter into MusicXML. Keep this intentionally narrow: other
 * Audiveris warnings remain available only in the preserved engine log.
 */
export const parseAudiverisMetronomeExportWarnings = (log) => String(log)
  .split(/\r?\n/)
  .filter((line) => /\bError visiting\b.*\bMetronomeInter\b/i.test(line))
  .map(audiverisLogLocation);

/**
 * macOS jpackage launchers commonly do not write `-help` output to stdout.
 * When the configured executable belongs to an .app bundle, retain the
 * bundle's declared version as a reproducible engine identifier instead.
 */
export const readMacOsBundleVersion = async (executable) => {
  const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
  const markerIndex = path.resolve(executable).lastIndexOf(marker);
  if (markerIndex < 0) return undefined;
  const bundlePath = path.resolve(executable).slice(0, markerIndex);
  if (!bundlePath.endsWith('.app')) return undefined;
  try {
    const info = await readFile(path.join(bundlePath, 'Contents', 'Info.plist'), 'utf8');
    return info.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/i)?.[1]?.trim();
  } catch {
    return undefined;
  }
};

const buildLocalEngineCommand = ({ audiverisBin, engineOutput, inputs }) => ({
  command: audiverisBin,
  args: ['-batch', '-export', '-save', '-output', engineOutput, '--', ...inputs],
});

const buildDockerEngineCommand = ({ dockerBin, dockerImage, engineOutput, workspace, inputs }) => {
  const inputNames = inputs.map((input) => `/work/${path.basename(input)}`);
  return {
    command: dockerBin,
    args: [
      'run', '--rm', '--network=none', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=2g', '-e', 'HOME=/tmp',
      '--entrypoint', 'audiveris',
      '--mount', `type=bind,src=${workspace},dst=/work,readonly`,
      '--mount', `type=bind,src=${engineOutput},dst=/output`,
      dockerImage,
      '-batch', '-export', '-save', '-output', '/output', '--', ...inputNames,
    ],
  };
};

const serializeCommand = (record, pathsToRedact) => ({
  tool: pathForDisplay(record.command),
  exitCode: record.exitCode,
  timedOut: Boolean(record.timedOut),
  durationMs: record.durationMs,
  spawnError: record.spawnError?.code,
  command: redactText(quotedCommand(record.command, record.args), pathsToRedact),
});

const formatCommandLog = (label, record, pathsToRedact) => [
  `## ${label}`,
  `$ ${redactText(quotedCommand(record.command, record.args), pathsToRedact)}`,
  `exitCode=${record.exitCode ?? 'none'} timedOut=${Boolean(record.timedOut)} durationMs=${record.durationMs}`,
  record.spawnError ? `spawnError=${record.spawnError.code ?? 'unknown'} ${record.spawnError.message ?? ''}` : '',
  record.stdout ? `--- stdout ---\n${redactText(record.stdout, pathsToRedact)}` : '',
  record.stderr ? `--- stderr ---\n${redactText(record.stderr, pathsToRedact)}` : '',
  '',
].filter(Boolean).join('\n');

const toolNames = (options) => ({
  pdfInfo: options.pdfInfoBin ?? 'pdfinfo',
  pdfImages: options.pdfImagesBin ?? 'pdfimages',
  pdfToText: options.pdfToTextBin ?? 'pdftotext',
  pdfToPpm: options.pdfToPpmBin ?? 'pdftoppm',
  audiveris: options.audiverisBin ?? 'audiveris',
  docker: options.dockerBin ?? 'docker',
});

const createJobManifest = ({ jobId, input, config, status, preflight, engine, artifacts, diagnostics, commands }) => ({
  contractVersion: OMR_JOB_CONTRACT_VERSION,
  contractSchema: OMR_JOB_CONTRACT_SCHEMA,
  jobId,
  status,
  input,
  config,
  preflight,
  engine,
  artifacts,
  diagnostics,
  commands,
});

const writeArtifact = async (stageDirectory, relativePath, content) => {
  const destination = path.join(stageDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
  return destination;
};

const failureDiagnostic = (error) => ({
  severity: 'error',
  code: error instanceof OmrJobError ? error.code : 'unexpected-error',
  message: error instanceof Error ? error.message : 'OMRジョブで予期しないエラーが発生しました。',
  ...(error instanceof OmrJobError && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
});

/**
 * Runs a PDF-to-MusicXML job. The original PDF and rendered pages live only in
 * an OS temporary directory; the published job directory has derived metadata,
 * logs, text-layer chord candidates, and MusicXML only.
 */
export const runPdfOmrJob = async (options) => {
  if (!options?.inputPath) throw new OmrJobError('missing-input', '--input でPDFを指定してください。');

  const config = {
    renderDpi: options.renderDpi ?? DEFAULT_OMR_OPTIONS.renderDpi,
    maxInputBytes: options.maxInputBytes ?? DEFAULT_OMR_OPTIONS.maxInputBytes,
    maxPages: options.maxPages ?? DEFAULT_OMR_OPTIONS.maxPages,
    maxRenderedPixels: options.maxRenderedPixels ?? DEFAULT_OMR_OPTIONS.maxRenderedPixels,
    timeoutMs: options.timeoutMs ?? DEFAULT_OMR_OPTIONS.timeoutMs,
    engine: options.engine ?? 'local',
    inputMode: options.inputMode ?? 'pdf',
  };
  if (!Number.isInteger(config.renderDpi) || config.renderDpi < 150 || config.renderDpi > 600) {
    throw new OmrJobError('invalid-render-dpi', '--dpi は150から600の整数で指定してください。');
  }
  if (!Number.isInteger(config.maxInputBytes) || config.maxInputBytes <= 0 || !Number.isInteger(config.maxPages) || config.maxPages <= 0 || !Number.isInteger(config.maxRenderedPixels) || config.maxRenderedPixels <= 0 || !Number.isInteger(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new OmrJobError('invalid-limits', '入力上限・ページ上限・画像上限・timeoutは正の整数で指定してください。');
  }
  if (!['local', 'docker'].includes(config.engine) || !['pdf', 'rendered-pages'].includes(config.inputMode)) {
    throw new OmrJobError('invalid-option', '--engine はlocal/docker、--input-modeはpdf/rendered-pagesで指定してください。');
  }
  if (config.engine === 'docker' && !options.dockerImage) {
    throw new OmrJobError('missing-docker-image', '--engine docker には --docker-image が必要です。');
  }

  const inputPath = path.resolve(options.inputPath);
  const outputRoot = path.resolve(options.outputDir ?? 'artifacts/omr');
  const names = toolNames(options);
  const run = options.commandRunner ?? runProcess;
  let inputStats;
  try {
    inputStats = await stat(inputPath);
  } catch (error) {
    throw new OmrJobError('input-not-readable', '入力PDFを読み取れません。', { code: error.code });
  }
  if (!inputStats.isFile()) throw new OmrJobError('input-not-file', '入力パスは通常ファイルである必要があります。');
  if (inputStats.size > config.maxInputBytes) {
    throw new OmrJobError('input-too-large', `入力PDFが上限 ${config.maxInputBytes} bytes を超えています。`, { bytes: inputStats.size, maxInputBytes: config.maxInputBytes });
  }

  const inputBytes = await readFile(inputPath);
  if (!inputBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new OmrJobError('invalid-pdf', '入力ファイルがPDFヘッダーを持っていません。');
  }
  const inputHash = sha256(inputBytes);
  const configuredEngine = config.engine === 'docker'
    ? { adapter: 'docker', image: options.dockerImage, executable: names.docker }
    : { adapter: 'local-cli', executable: names.audiveris };
  const jobId = `omr-${sha256(JSON.stringify({ inputHash, config, configuredEngine })).slice(0, 20)}`;
  const jobDirectory = path.join(outputRoot, jobId);
  try {
    await stat(jobDirectory);
    throw new OmrJobError('job-output-exists', `同じ入力と設定の成果物が既にあります: ${relativeFile(outputRoot, jobDirectory)}`, { jobDirectory });
  } catch (error) {
    if (!(error instanceof OmrJobError) && error.code !== 'ENOENT') throw error;
    if (error instanceof OmrJobError) throw error;
  }

  await mkdir(outputRoot, { recursive: true });
  const stageDirectory = await mkdtemp(path.join(outputRoot, '.omr-inflight-'));
  const workspace = await mkdtemp(path.join(tmpdir(), 'web-chord-omr-'));
  const pathsToRedact = [inputPath, workspace, stageDirectory];
  const commands = [];
  const commandLogs = [];
  const input = { fileName: path.basename(inputPath), sha256: inputHash, bytes: inputStats.size };
  let preflight;
  let engine = configuredEngine;
  let artifacts = {};
  let diagnostics = [];
  let manifest;

  const runAndLog = async (label, command, args, commandOptions = {}) => {
    const result = await run(command, args, { timeoutMs: commandOptions.timeoutMs ?? config.timeoutMs, cwd: commandOptions.cwd });
    commands.push(serializeCommand(result, pathsToRedact));
    commandLogs.push(formatCommandLog(label, result, pathsToRedact));
    return result;
  };

  try {
    const pdfInfoResult = requireSuccess('pdfinfo', await runAndLog('pdfinfo', names.pdfInfo, [inputPath]));
    const info = parsePdfInfo(pdfInfoResult.stdout);
    input.pdfVersion = info.pdfVersion ?? inputBytes.subarray(5, 12).toString('ascii').trim();
    if (!info.pages) throw new OmrJobError('invalid-pdf', 'PDFのページ数を読み取れません。');
    if (info.encrypted) throw new OmrJobError('encrypted-pdf', '暗号化されたPDFは取り込めません。パスワードを外したコピーを使ってください。');
    if (info.pages > config.maxPages) {
      throw new OmrJobError('too-many-pages', `PDFが上限 ${config.maxPages} ページを超えています。`, { pages: info.pages, maxPages: config.maxPages });
    }
    const estimatedPixelsPerPage = info.pageSizePoints
      ? Math.ceil(info.pageSizePoints.width * config.renderDpi / 72) * Math.ceil(info.pageSizePoints.height * config.renderDpi / 72)
      : undefined;
    const estimatedRenderedPixels = estimatedPixelsPerPage ? estimatedPixelsPerPage * info.pages : undefined;
    if (estimatedRenderedPixels && estimatedRenderedPixels > config.maxRenderedPixels) {
      throw new OmrJobError('render-size-too-large', `画像化後の推定総画素数が上限 ${config.maxRenderedPixels} を超えています。`, {
        estimatedRenderedPixels,
        maxRenderedPixels: config.maxRenderedPixels,
      });
    }

    const textOutputPath = path.join(workspace, 'text-layer.html');
    const textResult = requireSuccess('pdftotext', await runAndLog('pdftotext', names.pdfToText, ['-bbox-layout', inputPath, textOutputPath]));
    // pdftotext writes the text layer to a temporary file. Its stdout is not used.
    void textResult;
    const textWords = extractTextLayer(await readFile(textOutputPath, 'utf8'));
    const imagesResult = requireSuccess('pdfimages', await runAndLog('pdfimages', names.pdfImages, ['-list', inputPath]));
    const embeddedImageCount = countPdfImages(imagesResult.stdout);
    const contentKind = textWords.length > 0 && embeddedImageCount === 0
      ? 'vector-or-text'
      : textWords.length === 0 && embeddedImageCount > 0
        ? 'image-dominant'
        : textWords.length > 0 && embeddedImageCount > 0
          ? 'mixed'
          : 'unknown';
    preflight = {
      pages: info.pages,
      pageSizePoints: info.pageSizePoints,
      encrypted: false,
      renderDpi: config.renderDpi,
      textLayer: { available: true, wordCount: textWords.length, chordCandidateCount: extractChordCandidates(textWords).length },
      embeddedImageCount,
      contentKind,
      estimatedRenderedPixels,
    };
    const textLayerArtifact = {
      source: 'pdf-text-layer',
      coordinateSpace: { origin: 'top-left', unit: 'pdf-points' },
      candidateCount: extractChordCandidates(textWords).length,
      candidates: extractChordCandidates(textWords),
      note: 'ページ番号とPDF座標を保持します。小節との対応付けはレビュー段階でOMR出力と照合します。',
    };
    const textLayerPath = await writeArtifact(stageDirectory, 'text-layer/chord-candidates.json', `${JSON.stringify(textLayerArtifact, null, 2)}\n`);

    const renderedPageDirectory = path.join(workspace, 'pages');
    await mkdir(renderedPageDirectory);
    const renderPrefix = path.join(renderedPageDirectory, 'page');
    requireSuccess('pdftoppm', await runAndLog('pdftoppm', names.pdfToPpm, ['-png', '-r', String(config.renderDpi), inputPath, renderPrefix]));
    const renderedPages = sortNaturally((await readdir(renderedPageDirectory))
      .filter((name) => /\.png$/i.test(name))
      .map((name) => path.join(renderedPageDirectory, name)));
    if (renderedPages.length !== info.pages) {
      throw new OmrJobError('rendered-page-count-mismatch', `画像化ページ数 ${renderedPages.length} がPDFページ数 ${info.pages} と一致しません。`);
    }
    preflight.renderedPages = await Promise.all(renderedPages.map(async (filePath, index) => ({
      page: index + 1,
      ...await pngDimensions(filePath),
    })));
    const actualRenderedPixels = preflight.renderedPages.reduce((total, page) => total + page.width * page.height, 0);
    if (actualRenderedPixels > config.maxRenderedPixels) {
      throw new OmrJobError('render-size-too-large', `画像化後の総画素数が上限 ${config.maxRenderedPixels} を超えています。`, {
        actualRenderedPixels,
        maxRenderedPixels: config.maxRenderedPixels,
      });
    }

    let engineInputs;
    if (config.inputMode === 'pdf') {
      const stagedPdf = path.join(workspace, 'input.pdf');
      await copyFile(inputPath, stagedPdf);
      engineInputs = [stagedPdf];
    } else {
      engineInputs = renderedPages;
    }
    const engineOutput = path.join(workspace, 'engine-output');
    await mkdir(engineOutput);

    if (config.engine === 'local') {
      const versionResult = requireSuccess('audiveris version', await runAndLog('audiveris -help', names.audiveris, ['-help'], { timeoutMs: Math.min(config.timeoutMs, 30_000) }));
      const commandVersion = parseEngineVersion(`${versionResult.stdout}\n${versionResult.stderr}`);
      const bundleVersion = commandVersion ? undefined : await readMacOsBundleVersion(names.audiveris);
      engine = {
        ...configuredEngine,
        version: commandVersion ?? bundleVersion ?? 'unreported',
        versionSource: commandVersion ? 'engine-cli' : bundleVersion ? 'macos-bundle-info' : 'unreported',
      };
      const command = buildLocalEngineCommand({ audiverisBin: names.audiveris, engineOutput, inputs: engineInputs });
      requireSuccess('audiveris', await runAndLog('audiveris export', command.command, command.args));
    } else {
      const imageResult = requireSuccess('docker image inspect', await runAndLog('docker image inspect', names.docker, ['image', 'inspect', '--format', '{{.Id}}', options.dockerImage], { timeoutMs: Math.min(config.timeoutMs, 30_000) }));
      const imageId = imageResult.stdout.trim();
      const versionCommand = {
        command: names.docker,
        args: ['run', '--rm', '--network=none', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=2g', '-e', 'HOME=/tmp', '--entrypoint', 'audiveris', options.dockerImage, '-help'],
      };
      const versionResult = requireSuccess('audiveris container version', await runAndLog('docker audiveris -help', versionCommand.command, versionCommand.args, { timeoutMs: Math.min(config.timeoutMs, 30_000) }));
      engine = {
        ...configuredEngine,
        imageId,
        version: parseEngineVersion(`${versionResult.stdout}\n${versionResult.stderr}`) ?? `container-image:${imageId}`,
        versionSource: parseEngineVersion(`${versionResult.stdout}\n${versionResult.stderr}`) ? 'engine-cli' : 'docker-image-id',
      };
      const command = buildDockerEngineCommand({
        dockerBin: names.docker,
        dockerImage: options.dockerImage,
        engineOutput,
        workspace,
        inputs: engineInputs,
      });
      requireSuccess('audiveris container', await runAndLog('docker audiveris export', command.command, command.args));
    }

    const outputFiles = await collectFiles(engineOutput);
    const candidateFiles = sortNaturally(outputFiles.filter((filePath) => /\.(?:mxl|musicxml|xml)$/i.test(filePath)));
    const musicXmlArtifacts = [];
    for (const [index, filePath] of candidateFiles.entries()) {
      const xml = await readMusicXmlCandidate(filePath);
      if (!xml) continue;
      const artifactPath = `musicxml/candidate-${index + 1}.musicxml`;
      const destination = await writeArtifact(stageDirectory, artifactPath, xml);
      musicXmlArtifacts.push({
        path: relativeFile(stageDirectory, destination),
        sha256: sha256(xml),
        sourceOutput: path.basename(filePath),
      });
    }
    if (musicXmlArtifacts.length === 0) {
      throw new OmrJobError('musicxml-not-produced', 'OMRエンジンはMusicXMLを出力しませんでした。ログを確認してください。');
    }
    try {
      const projects = outputFiles.filter((filePath) => /\.omr$/i.test(filePath));
      if (projects.length !== 1) throw new Error('Expected one saved Audiveris project');
      const archive = await readFile(projects[0]);
      const book = readZipEntry(archive, 'book.xml').toString('utf8');
      const qualities = extractNoteQualityByScore(book, (number) =>
        readZipEntry(archive, `sheet#${number}/sheet#${number}.xml`).toString('utf8'));
      if (qualities.length !== musicXmlArtifacts.length) throw new Error('Score and MusicXML candidate counts differ');
      const unmatched = [];
      for (const [index, artifact] of musicXmlArtifacts.entries()) {
        const xml = await readFile(path.join(stageDirectory, artifact.path), 'utf8');
        const firstPart = xml.match(/<part(?=\s|>)[^>]*>([\s\S]*?)<\/part>/)?.[1];
        const measureCount = firstPart ? [...firstPart.matchAll(/<measure(?=\s|>)/g)].length : 0;
        if (measureCount === qualities[index].measureCount) artifact.reviewSignals = qualities[index].signals;
        else unmatched.push(artifact.path);
      }
      if (unmatched.length > 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'omr-note-quality-unavailable',
          message: `音符品質スコアを小節へ対応付けられない候補があります（${unmatched.join('、')}）。原譜と旋律を確認してください。`,
        });
      }
    } catch (error) {
      musicXmlArtifacts.forEach((artifact) => { delete artifact.reviewSignals; });
      diagnostics.push({
        severity: 'warning',
        code: 'omr-note-quality-unavailable',
        message: 'Audiverisの音符品質スコアを小節へ対応付けられませんでした。原譜と旋律を確認してください。',
        details: { reason: error instanceof Error ? error.message : 'unknown' },
      });
    }
    if (musicXmlArtifacts.length > 1) {
      diagnostics.push({
        severity: 'warning',
        code: 'multiple-musicxml-candidates',
        message: '複数のMusicXML候補が出力されました。レビュー時に対象を選択してください。',
      });
    }
    const metronomeWarningLocations = parseAudiverisMetronomeExportWarnings(commandLogs.join('\n'));
    if (metronomeWarningLocations.length > 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'omr-metronome-export-warning',
        message: `Audiverisがメトロノーム記号をMusicXMLへ出力できませんでした（${metronomeWarningLocations.length}件）。テンポ表記をレビューしてください。`,
        details: {
          count: metronomeWarningLocations.length,
          locations: metronomeWarningLocations,
        },
      });
    }
    artifacts = {
      musicXml: musicXmlArtifacts,
      textLayerChordCandidates: relativeFile(stageDirectory, textLayerPath),
    };
    await writeArtifact(stageDirectory, 'logs/engine.log', `${commandLogs.join('\n')}\n`);
    artifacts.log = 'logs/engine.log';
    manifest = createJobManifest({ jobId, input, config, status: 'succeeded', preflight, engine, artifacts, diagnostics, commands });
  } catch (error) {
    diagnostics = [...diagnostics, failureDiagnostic(error)];
    await writeArtifact(stageDirectory, 'logs/engine.log', `${commandLogs.join('\n')}\n`);
    artifacts = { ...artifacts, log: 'logs/engine.log' };
    manifest = createJobManifest({ jobId, input, config, status: 'failed', preflight, engine, artifacts, diagnostics, commands });
  } finally {
    await writeArtifact(stageDirectory, 'job.json', `${JSON.stringify(manifest, null, 2)}\n`);
    await rm(workspace, { recursive: true, force: true });
  }
  await rename(stageDirectory, jobDirectory);
  return { ...manifest, jobDirectory };
};
