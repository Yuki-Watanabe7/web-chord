import { confirmImportDraftToSong, validateImportDraft } from './importDraft';
import { createEmptySong, MAX_TOTAL_MEASURES } from './timeline';
import type { ImportDraft } from './importDraft';
import type { OmrJobArtifact, OmrSourceSlot } from './omrJobImport';
import type { Song } from './types';

export interface OmrMergeIssue {
  code: string;
  message: string;
  pdfPage?: number;
}

export interface OmrMergeSegment {
  path: string;
  first: OmrSourceSlot;
  last: OmrSourceSlot;
  sourceMeasureCount: number;
  playbackMeasureCount: number;
}

export interface OmrMergePlan {
  ready: boolean;
  segments: OmrMergeSegment[];
  issues: OmrMergeIssue[];
}

const slotKey = ({ pdfPage, pageId, systemIndex, stackIndex }: OmrSourceSlot) =>
  `${pdfPage}:${pageId}:${systemIndex}:${stackIndex}`;
const slotLabel = ({ pdfPage, pageId, systemIndex, stackIndex }: OmrSourceSlot) =>
  `PDF ${pdfPage}ページ・譜面領域${pageId}・${systemIndex + 1}段目・${stackIndex + 1}小節目`;

/** Checks that every physical OMR measure is represented exactly once and in score order. */
export const planOmrCandidateMerge = (job: OmrJobArtifact, drafts: Record<string, ImportDraft>): OmrMergePlan => {
  const issues: OmrMergeIssue[] = [];
  const layout = job.artifacts.sourceLayout;
  if (!layout?.length) {
    return { ready: false, segments: [], issues: [{
      code: 'source-layout-unavailable',
      message: 'このジョブにはPDF上の小節位置がありません。新しいOMRジョブを作成して候補を読み込んでください。',
    }] };
  }
  const positions = new Map<string, number>();
  layout.forEach((slot, index) => {
    const key = slotKey(slot);
    if (positions.has(key)) issues.push({
      code: 'duplicate-source-layout', pdfPage: slot.pdfPage,
      message: `${slotLabel(slot)}の位置がジョブ内で重複しています。原譜と認識結果を確認してください。`,
    });
    else positions.set(key, index);
    const previous = layout[index - 1];
    if (previous) {
      const firstPageId = Number(previous.pageId);
      const secondPageId = Number(slot.pageId);
      const pageIdOrder = Number.isInteger(firstPageId) && Number.isInteger(secondPageId)
        ? secondPageId - firstPageId : slot.pageId.localeCompare(previous.pageId);
      if (slot.pdfPage < previous.pdfPage || slot.pdfPage === previous.pdfPage && (
        pageIdOrder < 0 || pageIdOrder === 0 && (
          slot.systemIndex < previous.systemIndex || slot.systemIndex === previous.systemIndex && slot.stackIndex <= previous.stackIndex
        )
      )) issues.push({ code: 'source-layout-order', pdfPage: slot.pdfPage,
        message: `${slotLabel(slot)}がジョブ内で譜面順に並んでいません。原譜と認識結果を確認してください。` });
    }
  });
  for (let page = 1; page <= (job.preflight?.pages ?? 0); page += 1) {
    if (!layout.some((slot) => slot.pdfPage === page)) issues.push({
      code: 'page-without-measures', pdfPage: page,
      message: `PDF ${page}ページの譜面小節を認識できていません。原譜を確認してください。`,
    });
  }

  const missingFiles = job.artifacts.musicXml.filter((candidate) => !drafts[candidate.path]);
  if (missingFiles.length > 0) {
    missingFiles.forEach((candidate) => issues.push({
      code: 'candidate-not-loaded',
      message: `${candidate.path}を読み込んでください。候補を省いたまま1曲へ確定できません。`,
    }));
    return { ready: false, segments: [], issues };
  }

  const owners = new Map<string, { path: string; measureNumber: string }>();
  const segments: Array<OmrMergeSegment & { firstPosition: number }> = [];
  for (const candidate of job.artifacts.musicXml) {
    const draft = drafts[candidate.path];
    const sources = candidate.sourceMeasures;
    const firstPart = draft.score.parts[0];
    if (draft.source.omrJob?.jobId !== job.jobId || draft.source.omrJob.pdfSha256 !== job.input.sha256 ||
      draft.source.omrJob.candidateSha256 !== candidate.sha256 ||
      draft.source.omrJob.candidatePath !== candidate.path) {
      issues.push({ code: 'candidate-identity-mismatch', message: `${candidate.path}のジョブまたはSHA-256が一致しません。` });
      continue;
    }
    if (!sources?.length || !firstPart || sources.length !== firstPart.measureCount) {
      issues.push({ code: 'source-measure-mismatch', message: `${candidate.path}のPDF上の小節位置とMusicXMLの小節数が一致しません。` });
      continue;
    }
    validateImportDraft(draft).issues.filter((issue) => issue.severity === 'error').forEach((issue) => {
      const slot = sources.find((source) => source.measureIndex === issue.source?.measureIndex);
      issues.push({ code: issue.code, pdfPage: slot?.pdfPage,
        message: `${candidate.path}${slot ? `の${slotLabel(slot)}` : ''}: ${issue.message}` });
    });
    const numbers = new Map(draft.score.sourceMeasures.filter((measure) => measure.partId === firstPart.id)
      .map((measure) => [measure.measureIndex, measure.measureNumber]));
    const indices: number[] = [];
    for (const [index, source] of sources.entries()) {
      const position = positions.get(slotKey(source));
      const measureNumber = numbers.get(index) ?? String(index + 1);
      if (source.measureIndex !== index || position === undefined) {
        issues.push({ code: 'unknown-source-measure', pdfPage: source.pdfPage,
          message: `${candidate.path}の小節 ${measureNumber}（${slotLabel(source)}）を原PDFの位置に対応付けられません。` });
        continue;
      }
      indices.push(position);
      const previous = owners.get(slotKey(source));
      if (previous) issues.push({ code: 'overlapping-candidates', pdfPage: source.pdfPage,
        message: `${slotLabel(source)}が${previous.path}の小節 ${previous.measureNumber}と${candidate.path}の小節 ${measureNumber}で重複しています。` });
      else owners.set(slotKey(source), { path: candidate.path, measureNumber });
    }
    if (indices.some((position, index) => index > 0 && position !== indices[index - 1] + 1)) {
      const source = sources[indices.findIndex((position, index) => index > 0 && position !== indices[index - 1] + 1)];
      issues.push({ code: 'candidate-order-ambiguous', pdfPage: source.pdfPage,
        message: `${candidate.path}の小節 ${numbers.get(source.measureIndex) ?? source.measureIndex + 1}（${slotLabel(source)}）がPDFの譜面順に続いていません。` });
    }
    if (indices.length > 0) segments.push({
      path: candidate.path,
      first: sources[0], last: sources[sources.length - 1],
      firstPosition: indices[0],
      sourceMeasureCount: sources.length,
      playbackMeasureCount: draft.score.linearMeasures.length,
    });
  }
  layout.forEach((slot) => {
    if (!owners.has(slotKey(slot))) issues.push({ code: 'missing-source-measure', pdfPage: slot.pdfPage,
      message: `${slotLabel(slot)}がどのMusicXML候補にもありません。原譜と候補を確認してください。` });
  });
  const resolutions = new Set(segments.map((segment) => drafts[segment.path].ticksPerQuarter));
  if (resolutions.size > 1) issues.push({ code: 'mixed-tick-resolution', message: '候補間で四分音符のtick数が異なるため、時刻を安全に結合できません。' });
  if (segments.reduce((total, segment) => total + segment.playbackMeasureCount, 0) > MAX_TOTAL_MEASURES) issues.push({
    code: 'too-many-measures', message: `結合後の小節数が上限（${MAX_TOTAL_MEASURES}）を超えています。`,
  });
  segments.sort((left, right) => left.firstPosition - right.firstPosition);
  segments.forEach((segment, segmentIndex) => {
    const draft = drafts[segment.path];
    const partId = draft.score.parts[0]?.id;
    const sourceMeasures = draft.score.sourceMeasures.filter((measure) => measure.partId === partId);
    let openRepeat = 0;
    let openEnding = 0;
    sourceMeasures.forEach((measure) => {
      if (measure.repeat.forward) openRepeat += 1;
      if (measure.repeat.backwardTimes) {
        if (openRepeat > 0) openRepeat -= 1;
        else if (segmentIndex > 0) issues.push({ code: 'cross-candidate-repeat', pdfPage: segment.first.pdfPage,
          message: `${segment.path}の小節 ${measure.measureNumber}は反復開始が候補内にありません。前の候補とのつながりを確認してください。` });
      }
      measure.endings.forEach((ending) => {
        if (ending.type === 'start') openEnding += 1;
        if (ending.type === 'stop' || ending.type === 'discontinue') openEnding = Math.max(0, openEnding - 1);
      });
    });
    if (segmentIndex < segments.length - 1 && (openRepeat > 0 || openEnding > 0)) issues.push({
      code: 'cross-candidate-repeat', pdfPage: segment.last.pdfPage,
      message: `${segment.path}の最後（${slotLabel(segment.last)}）で反復または番括弧が次の候補へ続く可能性があります。`,
    });
  });
  return { ready: issues.length === 0, segments: segments.map(({ path, first, last, sourceMeasureCount, playbackMeasureCount }) =>
    ({ path, first, last, sourceMeasureCount, playbackMeasureCount })), issues };
};

/** Concatenates reviewed Song events, preserving explicit key, meter and tempo changes at each boundary. */
export const combineOmrCandidateDrafts = (
  job: OmrJobArtifact,
  drafts: Record<string, ImportDraft>,
): { ok: true; song: Song; plan: OmrMergePlan } | { ok: false; plan: OmrMergePlan } => {
  const plan = planOmrCandidateMerge(job, drafts);
  if (!plan.ready) return { ok: false, plan };
  const confirmed = plan.segments.map((segment) => ({ segment, result: confirmImportDraftToSong(drafts[segment.path]) }));
  const invalid = confirmed.filter((entry) => !entry.result.ok);
  if (invalid.length > 0) return { ok: false, plan: { ...plan, ready: false, issues: invalid.flatMap(({ segment, result }) =>
    result.validation.issues.filter((issue) => issue.severity === 'error').map((issue) => ({
      code: issue.code, message: `${segment.path}: ${issue.message}`,
    }))) } };
  const songs = confirmed.map((entry) => ({ segment: entry.segment, song: (entry.result as Extract<typeof entry.result, { ok: true }>).song }));
  const first = songs[0].song;
  let offset = 0;
  const measures: Song['measures'] = [];
  const chords: Song['chords'] = [];
  const melodyNotes: Song['melodyNotes'] = [];
  const timeSignatureEvents = [{ tick: 0, timeSignature: first.timeSignature }];
  const keySignatureEvents = [{ tick: 0, key: first.key }];
  const tempoEvents = [{ tick: 0, bpm: first.bpm }];
  for (const { segment, song } of songs) {
    const draft = drafts[segment.path];
    measures.push(...song.measures.map((measure) => ({ ...measure, startTick: measure.startTick + offset })));
    chords.push(...song.chords.map((chord) => ({ ...chord, id: `${segment.path}:${chord.id}`, startTick: chord.startTick + offset,
      tie: chord.tie ? { ...chord.tie, id: `${segment.path}:${chord.tie.id}` } : undefined })));
    melodyNotes.push(...song.melodyNotes.map((note) => ({ ...note, id: `${segment.path}:${note.id}`, startTick: note.startTick + offset,
      tie: note.tie ? { ...note.tie, id: `${segment.path}:${note.tie.id}` } : undefined })));
    timeSignatureEvents.push(...draft.candidates.timeSignatures.map(({ normalized }) => ({ tick: normalized.tick + offset, timeSignature: normalized.timeSignature })));
    keySignatureEvents.push(...draft.candidates.keySignatures.map(({ normalized }) => ({ tick: normalized.tick + offset, key: normalized.key })));
    tempoEvents.push(...draft.candidates.tempos.map(({ normalized }) => ({ tick: normalized.tick + offset, bpm: normalized.bpm })));
    const finalMeasure = song.measures[song.measures.length - 1];
    offset += finalMeasure.startTick + finalMeasure.durationTicks;
  }
  const byTick = <T extends { tick: number }>(events: T[]) => [...new Map(events.map((event) => [event.tick, event])).values()]
    .sort((left, right) => left.tick - right.tick);
  const song = createEmptySong({
    title: job.input.fileName.replace(/\.pdf$/i, '') || '読み込み曲',
    ticksPerQuarter: first.ticksPerQuarter,
    pickupTicks: first.pickupTicks,
    measures,
    chords,
    melodyNotes,
    timeSignatureEvents: byTick(timeSignatureEvents),
    keySignatureEvents: byTick(keySignatureEvents),
    tempoEvents: byTick(tempoEvents),
  });
  return { ok: true, song, plan };
};
