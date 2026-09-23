import { describe, expect, it } from 'vitest';
import { musicXmlImportFixture } from './fixtures/musicXmlImport.fixture';
import { parseOmrCandidateToImportDraft, parseOmrJobArtifact } from './omrJobImport';
import { confirmImportDraftToSong } from './importDraft';

const xmlHash = async () => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(musicXmlImportFixture)))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');
const jobJson = async () => JSON.stringify({
  contractVersion: 1,
  jobId: 'omr-1234567890abcdef1234',
  status: 'succeeded',
  input: { fileName: 'score.pdf', sha256: 'a'.repeat(64) },
  engine: { version: '5.11.0' },
  artifacts: { musicXml: [
    { path: 'musicxml/candidate-1.musicxml', sha256: await xmlHash(), sourceOutput: 'score.mvt1.mxl' },
    { path: 'musicxml/candidate-2.musicxml', sha256: 'b'.repeat(64), sourceOutput: 'score.mvt2.mxl' },
  ] },
  diagnostics: [
    { severity: 'warning', code: 'multiple-musicxml-candidates', message: '複数候補があります。' },
    { severity: 'warning', code: 'omr-metronome-export-warning', message: 'テンポを確認してください。', details: { locations: [{ page: 2 }, { page: 4 }] } },
  ],
});

describe('OMR job to ImportDraft', () => {
  it('verifies candidate bytes and retains source identity and warnings', async () => {
    const job = parseOmrJobArtifact(await jobJson());
    const draft = await parseOmrCandidateToImportDraft(job, {
      name: 'candidate-1.musicxml', text: async () => musicXmlImportFixture,
    });
    expect(draft.source.omrJob).toMatchObject({
      jobId: job.jobId,
      pdfSha256: job.input.sha256,
      candidateSha256: await xmlHash(),
      candidateCount: 2,
    });
    expect(draft.issues.map((issue) => issue.code)).toContain('multiple-musicxml-candidates');
    expect(draft.issues.find((issue) => issue.code === 'omr-metronome-export-warning')?.message)
      .toContain('PDF 2、4ページ');
    const confirmed = confirmImportDraftToSong(draft);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) expect(confirmed.song.title).toBe('score');
  });

  it('rejects a candidate from another job or with changed bytes', async () => {
    const job = parseOmrJobArtifact(await jobJson());
    await expect(parseOmrCandidateToImportDraft(job, {
      name: 'other.musicxml', text: async () => musicXmlImportFixture,
    })).rejects.toThrow('候補ではありません');
    await expect(parseOmrCandidateToImportDraft(job, {
      name: 'candidate-1.musicxml', text: async () => `${musicXmlImportFixture} `,
    })).rejects.toThrow('SHA-256');
  });

  it('rejects failed or malformed jobs', async () => {
    const failedJob = (await jobJson()).replace('"succeeded"', '"failed"');
    expect(() => parseOmrJobArtifact(failedJob)).toThrow('成功した');
    expect(() => parseOmrJobArtifact('{}')).toThrow('成功した');
  });
});
