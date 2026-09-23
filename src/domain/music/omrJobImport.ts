import type { ImportDraft, ImportIssue } from './importDraft';
import { parseMusicXmlToImportDraft } from './musicXmlImport';

export interface OmrSourceSlot {
  pdfPage: number;
  pageId: string;
  systemIndex: number;
  stackIndex: number;
}

export interface OmrJobCandidate {
  path: string;
  sha256: string;
  sourceOutput: string;
  sourceMeasures?: Array<OmrSourceSlot & { measureIndex: number }>;
  reviewSignals?: Array<{ measureIndex: number; minGrade: number; lowNoteCount: number }>;
}

export interface OmrNavigationMark {
  kind: 'segno' | 'dalSegno' | 'toCoda' | 'coda';
  sourceMeasureIndex: number;
  targetMeasureIndex?: number;
  evidence?: 'manual-pdf-review' | 'user-review';
}

export interface OmrJobArtifact {
  contractVersion: 1;
  jobId: string;
  status: 'succeeded';
  input: { fileName: string; sha256: string };
  preflight?: { pages: number };
  engine: { version: string };
  artifacts: { musicXml: OmrJobCandidate[]; sourceLayout?: OmrSourceSlot[]; navigationHints?: OmrNavigationMark[] };
  diagnostics: Array<{
    severity: 'warning' | 'error';
    code: string;
    message: string;
    details?: { locations?: Array<{ page?: number; sheet?: number }> };
  }>;
}

const sha256Pattern = /^[a-f0-9]{64}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isSourceSlot = (value: unknown): value is OmrSourceSlot => isRecord(value) &&
  Number.isInteger(value.pdfPage) && Number(value.pdfPage) > 0 &&
  typeof value.pageId === 'string' && value.pageId.length > 0 &&
  Number.isInteger(value.systemIndex) && Number(value.systemIndex) >= 0 &&
  Number.isInteger(value.stackIndex) && Number(value.stackIndex) >= 0;
const isNavigationHint = (value: unknown, sourceCount: number): value is OmrNavigationMark => isRecord(value) &&
  ['segno', 'dalSegno', 'toCoda', 'coda'].includes(String(value.kind)) &&
  Number.isInteger(value.sourceMeasureIndex) && Number(value.sourceMeasureIndex) >= 0 &&
  Number(value.sourceMeasureIndex) < sourceCount &&
  (value.targetMeasureIndex === undefined || Number.isInteger(value.targetMeasureIndex) &&
    Number(value.targetMeasureIndex) >= 0 && Number(value.targetMeasureIndex) < sourceCount) &&
  value.evidence === 'manual-pdf-review';

/** Parses the source-free job contract before any candidate is trusted. */
export const parseOmrJobArtifact = (json: string): OmrJobArtifact => {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value) || value.contractVersion !== 1 || value.status !== 'succeeded' ||
    typeof value.jobId !== 'string' || !/^omr-[a-f0-9]{20}$/.test(value.jobId) ||
    !isRecord(value.input) || typeof value.input.fileName !== 'string' ||
    typeof value.input.sha256 !== 'string' || !sha256Pattern.test(value.input.sha256) ||
    (value.preflight !== undefined && (!isRecord(value.preflight) ||
      !Number.isInteger(value.preflight.pages) || Number(value.preflight.pages) < 1)) ||
    !isRecord(value.engine) || typeof value.engine.version !== 'string' ||
    !isRecord(value.artifacts) || !Array.isArray(value.artifacts.musicXml) ||
    value.artifacts.musicXml.length === 0 || !Array.isArray(value.diagnostics)) {
    throw new Error('成功したOMRジョブの job.json を選択してください。');
  }
  const candidates = value.artifacts.musicXml;
  const sourceLayout = value.artifacts.sourceLayout;
  if (!candidates.every((candidate) => isRecord(candidate) &&
    typeof candidate.path === 'string' && /^musicxml\/candidate-[1-9][0-9]*\.musicxml$/.test(candidate.path) &&
    typeof candidate.sha256 === 'string' && sha256Pattern.test(candidate.sha256) &&
    typeof candidate.sourceOutput === 'string' &&
    (candidate.sourceMeasures === undefined || Array.isArray(candidate.sourceMeasures) &&
      candidate.sourceMeasures.every((source: unknown) => isSourceSlot(source) && isRecord(source) &&
        Number.isInteger(source.measureIndex) && Number(source.measureIndex) >= 0)) &&
    (candidate.reviewSignals === undefined || Array.isArray(candidate.reviewSignals) &&
      candidate.reviewSignals.every((signal: unknown) => isRecord(signal) &&
        Number.isInteger(signal.measureIndex) && Number(signal.measureIndex) >= 0 &&
        typeof signal.minGrade === 'number' && signal.minGrade >= 0 && signal.minGrade <= 1 &&
        Number.isInteger(signal.lowNoteCount) && Number(signal.lowNoteCount) > 0))) ||
    (sourceLayout !== undefined && (!Array.isArray(sourceLayout) ||
      !sourceLayout.every(isSourceSlot))) ||
    (value.artifacts.navigationHints !== undefined && (!Array.isArray(value.artifacts.navigationHints) ||
      !Array.isArray(sourceLayout) ||
      !value.artifacts.navigationHints.every((hint: unknown) => isNavigationHint(hint, sourceLayout.length)))) ||
    !value.diagnostics.every((diagnostic) => isRecord(diagnostic) &&
      ['warning', 'error'].includes(String(diagnostic.severity)) &&
      typeof diagnostic.code === 'string' && typeof diagnostic.message === 'string')) {
    throw new Error('OMRジョブの候補または診断の形式が正しくありません。');
  }
  return value as unknown as OmrJobArtifact;
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const diagnosticIssue = (diagnostic: OmrJobArtifact['diagnostics'][number]): ImportIssue => {
  const pages = [...new Set((diagnostic.details?.locations ?? [])
    .map((location) => location.page ?? location.sheet)
    .filter((page): page is number => typeof page === 'number' && Number.isInteger(page) && page > 0))];
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: pages.length ? `${diagnostic.message}（PDF ${pages.join('、')}ページ）` : diagnostic.message,
  };
};

/** Checks the selected XML bytes against job.json and retains job warnings in the review draft. */
export const parseOmrCandidateToImportDraft = async (
  job: OmrJobArtifact,
  file: Pick<File, 'name' | 'text'>,
): Promise<ImportDraft> => {
  const candidate = job.artifacts.musicXml.find((item) => item.path === `musicxml/${file.name}`);
  if (!candidate) throw new Error('選択したMusicXMLはこのOMRジョブの候補ではありません。');
  const xml = await file.text();
  if (await sha256(xml) !== candidate.sha256) {
    throw new Error('MusicXMLのSHA-256が job.json と一致しません。');
  }
  const draft = parseMusicXmlToImportDraft(xml, { fileName: file.name });
  const melodyPart = draft.melodySelection.selected?.partId;
  const firstPart = draft.score.parts[0]?.id;
  const qualityIssues: ImportIssue[] = melodyPart && melodyPart === firstPart
    ? (candidate.reviewSignals ?? []).map((signal) => {
      const measure = draft.score.sourceMeasures.find((item) =>
        item.partId === firstPart && item.measureIndex === signal.measureIndex);
      if (!measure) throw new Error('OMRジョブの音符品質情報がMusicXMLの小節と一致しません。');
      return {
        severity: 'warning',
        code: 'low-omr-note-grade',
        message: `Audiverisの音符品質スコアが低い箇所があります（最低 ${signal.minGrade.toFixed(2)}、${signal.lowNoteCount}音）。原譜とこの小節の旋律を照合してください。`,
        source: {
          partId: firstPart,
          partName: draft.score.parts[0].name,
          measureIndex: signal.measureIndex,
          measureNumber: measure.measureNumber,
          element: 'note',
        },
      } as ImportIssue;
    }) : [];
  return {
    ...draft,
    source: {
      ...draft.source,
      omrEngine: job.engine.version,
      omrJob: {
        jobId: job.jobId,
        pdfFileName: job.input.fileName,
        pdfSha256: job.input.sha256,
        engineVersion: job.engine.version,
        candidatePath: candidate.path,
        candidateSha256: candidate.sha256,
        candidateCount: job.artifacts.musicXml.length,
      },
    },
    issues: [...draft.issues, ...job.diagnostics.map(diagnosticIssue), ...qualityIssues],
  };
};
