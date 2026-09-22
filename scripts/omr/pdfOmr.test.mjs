import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractChordCandidates, extractTextLayer, parseAudiverisMetronomeExportWarnings, parsePdfInfo, readMacOsBundleVersion, runPdfOmrJob } from './pdfOmr.mjs';

const createPngHeader = (width, height) => {
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
};

const createStoredZip = (entries) => {
  let offset = 0;
  const localRecords = [];
  const centralRecords = [];
  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name);
    const contentBuffer = Buffer.from(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(contentBuffer.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localRecords.push(localHeader, nameBuffer, contentBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(contentBuffer.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralRecords.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + contentBuffer.length;
  }
  const centralDirectory = Buffer.concat(centralRecords);
  const endOfDirectory = Buffer.alloc(22);
  endOfDirectory.writeUInt32LE(0x06054b50, 0);
  endOfDirectory.writeUInt16LE(entries.length, 8);
  endOfDirectory.writeUInt16LE(entries.length, 10);
  endOfDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfDirectory.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, centralDirectory, endOfDirectory]);
};

const createRunner = ({ failEngine = false, outputFormat = 'xml', engineLog = '' } = {}) => async (command, args) => {
  if (command === 'pdfinfo') {
    return { command, args, exitCode: 0, stdout: 'Pages:          1\nPage size:      612 x 792 pts (letter)\nEncrypted:      no\nPDF version:     1.7\n', stderr: '', durationMs: 1 };
  }
  if (command === 'pdftotext') {
    await writeFile(args[2], '<doc><page><word xMin="10" yMin="20" xMax="40" yMax="32">Cmaj7</word></page></doc>');
    return { command, args, exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
  }
  if (command === 'pdfimages') {
    return { command, args, exitCode: 0, stdout: 'page   num  type   width height color\n', stderr: '', durationMs: 1 };
  }
  if (command === 'pdftoppm') {
    await writeFile(`${args[4]}-1.png`, createPngHeader(2550, 3300));
    return { command, args, exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
  }
  if (command === 'audiveris' && args[0] === '-help') {
    return { command, args, exitCode: 0, stdout: 'Audiveris: 5.4.0\n', stderr: '', durationMs: 1 };
  }
  if (command === 'audiveris') {
    if (failEngine) return { command, args, exitCode: 1, stdout: '', stderr: 'recognition failed', durationMs: 1 };
    const outputIndex = args.indexOf('-output');
    const outputDirectory = args[outputIndex + 1];
    if (outputFormat === 'mxl') {
      await writeFile(path.join(outputDirectory, 'score.mxl'), createStoredZip([
        ['META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'],
        ['score.xml', '<?xml version="1.0"?><score-partwise version="4.0"/>'],
      ]));
    } else {
      await writeFile(path.join(outputDirectory, 'score.musicxml'), '<?xml version="1.0"?><score-partwise version="4.0"/>');
    }
    return { command, args, exitCode: 0, stdout: 'exported', stderr: engineLog, durationMs: 1 };
  }
  throw new Error(`Unexpected command: ${command}`);
};

test('parses PDF metadata and keeps text-layer chord locations', () => {
  assert.deepEqual(parsePdfInfo('Pages: 2\nPage size: 595.2 x 841.8 pts (A4)\nEncrypted: no\nPDF version: 1.6\n'), {
    pages: 2,
    pageSizePoints: { width: 595.2, height: 841.8 },
    encrypted: false,
    pdfVersion: '1.6',
  });
  const words = extractTextLayer('<doc><page><word xMin="1" yMin="2" xMax="3" yMax="4">F♯m7</word><word>A</word></page></doc>');
  assert.deepEqual(extractChordCandidates(words), [{
    value: 'F♯m7',
    page: 1,
    boundingBox: { xMin: 1, yMin: 2, xMax: 3, yMax: 4 },
    source: 'pdf-text-layer',
    coordinateSpace: { origin: 'top-left', unit: 'pdf-points' },
  }, {
    value: 'A',
    page: 1,
    boundingBox: undefined,
    source: 'pdf-text-layer',
    coordinateSpace: { origin: 'top-left', unit: 'pdf-points' },
  }]);
});

test('reads the declared version from a macOS Audiveris app bundle', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'web-chord-omr-test-'));
  try {
    const executable = path.join(directory, 'Audiveris.app', 'Contents', 'MacOS', 'Audiveris');
    await mkdir(path.dirname(executable), { recursive: true });
    await writeFile(path.join(directory, 'Audiveris.app', 'Contents', 'Info.plist'), `<?xml version="1.0"?>
<plist><dict><key>CFBundleShortVersionString</key><string>5.11.0</string></dict></plist>`);
    assert.equal(await readMacOsBundleVersion(executable), '5.11.0');
    assert.equal(await readMacOsBundleVersion('audiveris'), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('parses known Audiveris metronome export warnings from a log fixture', async () => {
  const log = await readFile(new URL('./fixtures/audiveris-metronome-export-warning.fixture', import.meta.url), 'utf8');
  assert.deepEqual(parseAudiverisMetronomeExportWarnings(log), [
    { page: 2 },
    { page: 2 },
    { page: 4 },
    { page: 4 },
  ]);
  assert.deepEqual(parseAudiverisMetronomeExportWarnings('WARN Error visiting DynamicsInter in Page#1'), []);
});

test('creates a source-free, reproducible OMR artifact on success', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'web-chord-omr-test-'));
  try {
    const inputPath = path.join(directory, 'score.pdf');
    const outputDirectory = path.join(directory, 'artifacts');
    await writeFile(inputPath, '%PDF-1.7\nminimal test input');
    const job = await runPdfOmrJob({ inputPath, outputDir: outputDirectory, commandRunner: createRunner() });

    assert.equal(job.status, 'succeeded');
    assert.equal(job.engine.version, '5.4.0');
    assert.equal(job.engine.versionSource, 'engine-cli');
    assert.deepEqual(job.preflight.renderedPages, [{ page: 1, width: 2550, height: 3300 }]);
    assert.equal(job.artifacts.musicXml.length, 1);
    assert.equal(job.artifacts.textLayerChordCandidates, 'text-layer/chord-candidates.json');
    const jobManifest = JSON.parse(await readFile(path.join(job.jobDirectory, 'job.json'), 'utf8'));
    assert.equal(jobManifest.input.sha256, job.input.sha256);
    assert.equal(jobManifest.artifacts.musicXml[0].path, 'musicxml/candidate-1.musicxml');
    assert.equal((await readFile(path.join(job.jobDirectory, 'text-layer/chord-candidates.json'), 'utf8')).includes('Cmaj7'), true);
    assert.equal((await readFile(path.join(job.jobDirectory, 'logs/engine.log'), 'utf8')).includes(inputPath), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('converts Audiveris MXL output to reviewable MusicXML', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'web-chord-omr-test-'));
  try {
    const inputPath = path.join(directory, 'score.pdf');
    await writeFile(inputPath, '%PDF-1.7\nminimal test input');
    const job = await runPdfOmrJob({ inputPath, outputDir: path.join(directory, 'artifacts'), commandRunner: createRunner({ outputFormat: 'mxl' }) });

    assert.equal(job.status, 'succeeded');
    assert.equal((await readFile(path.join(job.jobDirectory, 'musicxml/candidate-1.musicxml'), 'utf8')).includes('<score-partwise'), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('persists metronome export warnings without discarding MusicXML candidates', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'web-chord-omr-test-'));
  try {
    const inputPath = path.join(directory, 'automatic.pdf');
    const engineLog = await readFile(new URL('./fixtures/audiveris-metronome-export-warning.fixture', import.meta.url), 'utf8');
    await writeFile(inputPath, '%PDF-1.7\nminimal test input');
    const job = await runPdfOmrJob({
      inputPath,
      outputDir: path.join(directory, 'artifacts'),
      commandRunner: createRunner({ engineLog }),
    });

    assert.equal(job.status, 'succeeded');
    assert.equal(job.artifacts.musicXml.length, 1);
    assert.deepEqual(job.diagnostics, [{
      severity: 'warning',
      code: 'omr-metronome-export-warning',
      message: 'Audiverisがメトロノーム記号をMusicXMLへ出力できませんでした（4件）。テンポ表記をレビューしてください。',
      details: {
        count: 4,
        locations: [{ page: 2 }, { page: 2 }, { page: 4 }, { page: 4 }],
      },
    }]);
    const jobManifest = JSON.parse(await readFile(path.join(job.jobDirectory, 'job.json'), 'utf8'));
    assert.deepEqual(jobManifest.diagnostics, job.diagnostics);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('returns a persisted diagnostic when OMR fails', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'web-chord-omr-test-'));
  try {
    const inputPath = path.join(directory, 'automatic.pdf');
    await writeFile(inputPath, '%PDF-1.7\nminimal test input');
    const job = await runPdfOmrJob({ inputPath, outputDir: path.join(directory, 'artifacts'), commandRunner: createRunner({ failEngine: true }) });

    assert.equal(job.status, 'failed');
    assert.equal(job.diagnostics.at(-1).code, 'command-failed');
    const jobManifest = JSON.parse(await readFile(path.join(job.jobDirectory, 'job.json'), 'utf8'));
    assert.equal(jobManifest.status, 'failed');
    assert.equal(jobManifest.artifacts.log, 'logs/engine.log');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects malformed and oversized input before invoking external tools', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'web-chord-omr-test-'));
  try {
    const malformedPath = path.join(directory, 'not-a-pdf.pdf');
    const oversizedPath = path.join(directory, 'too-large.pdf');
    const oversizedRenderPath = path.join(directory, 'too-many-pixels.pdf');
    await writeFile(malformedPath, 'not a pdf');
    await writeFile(oversizedPath, '%PDF-1.7\nmore than ten bytes');
    await writeFile(oversizedRenderPath, '%PDF-1.7\nminimal test input');

    await assert.rejects(
      runPdfOmrJob({ inputPath: malformedPath, outputDir: path.join(directory, 'artifacts'), commandRunner: createRunner() }),
      { code: 'invalid-pdf' },
    );
    await assert.rejects(
      runPdfOmrJob({ inputPath: oversizedPath, outputDir: path.join(directory, 'artifacts'), maxInputBytes: 10, commandRunner: createRunner() }),
      { code: 'input-too-large' },
    );
    const renderLimitJob = await runPdfOmrJob({
      inputPath: oversizedRenderPath,
      outputDir: path.join(directory, 'artifacts'),
      maxRenderedPixels: 10,
      commandRunner: createRunner(),
    });
    assert.equal(renderLimitJob.status, 'failed');
    assert.equal(renderLimitJob.diagnostics.at(-1).code, 'render-size-too-large');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
