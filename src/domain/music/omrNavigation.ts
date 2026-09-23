import { createEmptySong, MAX_TOTAL_MEASURES } from './timeline';
import { getKeyAtTick, getTempoAtTick, getTimeSignatureAtTick, validateSongTiming } from './timing';
import { combineOmrCandidateDrafts, planOmrCandidateMerge } from './omrJobMerge';
import type { ImportDraft } from './importDraft';
import type { OmrJobArtifact, OmrNavigationMark, OmrSourceSlot } from './omrJobImport';
import type { Song } from './types';

export interface OmrNavigationIssue { code: string; message: string }
export interface OmrNavigationPlan {
  ready: boolean;
  baselineOrder: number[];
  proposedOrder: number[];
  issues: OmrNavigationIssue[];
}

const slotKey = ({ pdfPage, pageId, systemIndex, stackIndex }: OmrSourceSlot) =>
  `${pdfPage}:${pageId}:${systemIndex}:${stackIndex}`;

/** Source measure numbers here are 1-based physical PDF slots, not MusicXML bar numbers. */
export const formatOmrSourceOrder = (order: number[]): string => {
  const blocks: string[] = [];
  for (let index = 0; index < order.length;) {
    let end = index;
    while (end + 1 < order.length && order[end + 1] === order[end] + 1) end += 1;
    blocks.push(index === end ? String(order[index] + 1) : `${order[index] + 1}-${order[end] + 1}`);
    index = end + 1;
  }
  return blocks.join(', ');
};

export const parseOmrSourceOrder = (text: string, sourceCount: number): number[] => {
  const values: number[] = [];
  const tokens = text.split(/[\s,、]+/).filter(Boolean);
  if (tokens.length === 0) throw new Error('演奏する譜面小節の番号を入力してください。');
  for (const token of tokens) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(token);
    if (!match) throw new Error(`「${token}」は小節番号または 5-12 の形式で入力してください。`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > sourceCount) throw new Error(`「${token}」は1～${sourceCount}の昇順で指定してください。`);
    if (values.length + end - start + 1 > MAX_TOTAL_MEASURES) throw new Error(`演奏順は${MAX_TOTAL_MEASURES}小節以内にしてください。`);
    for (let number = start; number <= end; number += 1) values.push(number - 1);
  }
  return values;
};

/** Builds a reviewable proposal by inserting one D.S. return and one To Coda jump into the OMR route. */
export const planOmrNavigation = (
  job: OmrJobArtifact,
  drafts: Record<string, ImportDraft>,
  marks: OmrNavigationMark[],
): OmrNavigationPlan => {
  const merge = planOmrCandidateMerge(job, drafts);
  const layout = job.artifacts.sourceLayout ?? [];
  const issues: OmrNavigationIssue[] = merge.issues.map(({ code, message }) => ({ code, message }));
  if (!merge.ready) return { ready: false, baselineOrder: [], proposedOrder: [], issues };
  const positions = new Map(layout.map((slot, index) => [slotKey(slot), index]));
  const recordedDirections = new Map<number, ImportDraft['score']['sourceMeasures'][number]['directions']>();
  const baselineOrder = merge.segments.flatMap((segment) => {
    const candidate = job.artifacts.musicXml.find((item) => item.path === segment.path)!;
    const byLocalIndex = new Map(candidate.sourceMeasures!.map((slot) => [slot.measureIndex, positions.get(slotKey(slot))]));
    const firstPart = drafts[segment.path].score.parts[0]?.id;
    drafts[segment.path].score.sourceMeasures.filter((measure) => measure.partId === firstPart).forEach((measure) => {
      const source = byLocalIndex.get(measure.measureIndex);
      if (source !== undefined) recordedDirections.set(source, measure.directions);
    });
    return drafts[segment.path].score.linearMeasures.map((measure) => byLocalIndex.get(measure.sourceMeasureIndex)!);
  });
  for (const mark of marks) {
    if (!Number.isInteger(mark.sourceMeasureIndex) || mark.sourceMeasureIndex < 0 || mark.sourceMeasureIndex >= layout.length ||
      mark.targetMeasureIndex !== undefined && (!Number.isInteger(mark.targetMeasureIndex) || mark.targetMeasureIndex < 0 || mark.targetMeasureIndex >= layout.length)) {
      issues.push({ code: 'invalid-navigation-location', message: '進行記号の小節またはジャンプ先が原PDFの範囲外です。' });
    }
  }
  if (issues.length > 0) return { ready: false, baselineOrder, proposedOrder: [], issues };
  const dalSegnos = marks.filter((mark) => mark.kind === 'dalSegno');
  const toCodas = marks.filter((mark) => mark.kind === 'toCoda');
  if (marks.some((mark) => mark.kind === 'dalSegno' && recordedDirections.get(mark.sourceMeasureIndex)?.dalsegno ||
    mark.kind === 'toCoda' && recordedDirections.get(mark.sourceMeasureIndex)?.tocoda)) issues.push({
    code: 'navigation-already-in-musicxml',
    message: 'MusicXMLにD.S.またはTo Codaが既にあります。二重に展開せず、原PDFの全曲順を直接入力して確認してください。',
  });
  if (dalSegnos.length > 1 || toCodas.length > 1) issues.push({
    code: 'multiple-navigation-jumps', message: '複数のD.S.またはTo Codaがあります。原譜の全演奏順を直接入力して確認してください。',
  });
  if (dalSegnos.length !== toCodas.length) issues.push({
    code: 'incomplete-navigation', message: 'D.S.とTo Codaの両方の位置とジャンプ先を指定してください。',
  });
  if (issues.length > 0) return { ready: false, baselineOrder, proposedOrder: [], issues };
  if (dalSegnos.length === 0) return { ready: true, baselineOrder, proposedOrder: baselineOrder, issues };

  const dalSegno = dalSegnos[0];
  const toCoda = toCodas[0];
  if (dalSegno.targetMeasureIndex === undefined || toCoda.targetMeasureIndex === undefined ||
    !marks.some((mark) => mark.kind === 'segno' && mark.sourceMeasureIndex === dalSegno.targetMeasureIndex) ||
    !marks.some((mark) => mark.kind === 'coda' && mark.sourceMeasureIndex === toCoda.targetMeasureIndex)) {
    issues.push({ code: 'missing-navigation-target', message: 'D.S.のジャンプ先にSegno、To Codaのジャンプ先にCodaを指定してください。' });
    return { ready: false, baselineOrder, proposedOrder: [], issues };
  }
  const dalSegnoPosition = baselineOrder.indexOf(dalSegno.sourceMeasureIndex);
  const segnoPosition = baselineOrder.indexOf(dalSegno.targetMeasureIndex);
  const toCodaPosition = baselineOrder.indexOf(toCoda.sourceMeasureIndex, segnoPosition);
  const codaPosition = baselineOrder.indexOf(toCoda.targetMeasureIndex, dalSegnoPosition + 1);
  if (segnoPosition < 0 || dalSegnoPosition <= segnoPosition || toCodaPosition < segnoPosition ||
    toCodaPosition > dalSegnoPosition || codaPosition < 0) {
    issues.push({ code: 'navigation-order-ambiguous', message: 'Segno、D.S.、To Coda、Codaの演奏順を原PDFへ対応付けられません。位置を修正してください。' });
    return { ready: false, baselineOrder, proposedOrder: [], issues };
  }
  const proposedOrder = [
    ...baselineOrder.slice(0, dalSegnoPosition + 1),
    ...baselineOrder.slice(segnoPosition, toCodaPosition + 1),
    ...baselineOrder.slice(codaPosition),
  ];
  if (proposedOrder.length > MAX_TOTAL_MEASURES) issues.push({
    code: 'too-many-measures', message: `演奏順が上限（${MAX_TOTAL_MEASURES}小節）を超えています。`,
  });
  return { ready: issues.length === 0, baselineOrder, proposedOrder, issues };
};

/** Replays reviewed events in an explicitly approved source-score order. */
export const confirmOmrNavigationToSong = (
  job: OmrJobArtifact,
  drafts: Record<string, ImportDraft>,
  order: number[],
): { ok: true; song: Song } | { ok: false; issues: OmrNavigationIssue[] } => {
  const plan = planOmrNavigation(job, drafts, []);
  if (!plan.ready) return { ok: false, issues: plan.issues };
  if (!order.length || order.length > MAX_TOTAL_MEASURES || order.some((source) =>
    !Number.isInteger(source) || source < 0 || source >= (job.artifacts.sourceLayout?.length ?? 0))) {
    return { ok: false, issues: [{ code: 'invalid-playback-order', message: '演奏順に原PDFの範囲外の小節があります。' }] };
  }
  const merged = combineOmrCandidateDrafts(job, drafts);
  if (!merged.ok) return { ok: false, issues: merged.plan.issues.map(({ code, message }) => ({ code, message })) };
  const original = merged.song;
  const templates = new Map<number, number[]>();
  plan.baselineOrder.forEach((source, index) => templates.set(source, [...templates.get(source) ?? [], index]));
  const uses = new Map<number, number>();
  const measures: Song['measures'] = [];
  const chords: Song['chords'] = [];
  const melodyNotes: Song['melodyNotes'] = [];
  const timeSignatureEvents: Song['timeSignatureEvents'] = [];
  const keySignatureEvents: Song['keySignatureEvents'] = [];
  const tempoEvents: Song['tempoEvents'] = [];
  let nextTick = 0;
  let run = 0;
  for (const [index, source] of order.entries()) {
    const alternatives = templates.get(source);
    if (!alternatives?.length) return { ok: false, issues: [{
      code: 'source-measure-not-played', message: `譜面${source + 1}小節目はMusicXMLの候補からSongへ展開できていません。`,
    }] };
    const used = uses.get(source) ?? 0;
    uses.set(source, used + 1);
    const originalMeasure = original.measures[alternatives[Math.min(used, alternatives.length - 1)]];
    const oldStart = originalMeasure.startTick;
    const oldEnd = oldStart + originalMeasure.durationTicks;
    if (index > 0 && source !== order[index - 1] + 1) run += 1;
    measures.push({ startTick: nextTick, durationTicks: originalMeasure.durationTicks });
    const inMeasure = <T extends { startTick: number }>(event: T) => event.startTick >= oldStart && event.startTick < oldEnd;
    chords.push(...original.chords.filter(inMeasure).map((event) => ({
      ...event, id: `${event.id}:navigation:${index}`, startTick: nextTick + event.startTick - oldStart,
      tie: event.tie ? { ...event.tie, id: `${event.tie.id}:navigation-run:${run}` } : undefined,
    })));
    melodyNotes.push(...original.melodyNotes.filter(inMeasure).map((event) => ({
      ...event, id: `${event.id}:navigation:${index}`, startTick: nextTick + event.startTick - oldStart,
      tie: event.tie ? { ...event.tie, id: `${event.tie.id}:navigation-run:${run}` } : undefined,
    })));
    timeSignatureEvents.push({ tick: nextTick, timeSignature: getTimeSignatureAtTick(original, oldStart) });
    keySignatureEvents.push({ tick: nextTick, key: getKeyAtTick(original, oldStart) });
    tempoEvents.push({ tick: nextTick, bpm: getTempoAtTick(original, oldStart) });
    timeSignatureEvents.push(...original.timeSignatureEvents.filter((event) => event.tick > oldStart && event.tick < oldEnd)
      .map((event) => ({ ...event, tick: nextTick + event.tick - oldStart })));
    keySignatureEvents.push(...original.keySignatureEvents.filter((event) => event.tick > oldStart && event.tick < oldEnd)
      .map((event) => ({ ...event, tick: nextTick + event.tick - oldStart })));
    tempoEvents.push(...original.tempoEvents.filter((event) => event.tick > oldStart && event.tick < oldEnd)
      .map((event) => ({ ...event, tick: nextTick + event.tick - oldStart })));
    nextTick += originalMeasure.durationTicks;
  }
  const dedupe = <T extends { tick: number }>(events: T[]) => [...new Map(events.map((event) => [event.tick, event])).values()]
    .sort((left, right) => left.tick - right.tick);
  const song = createEmptySong({
    ...original,
    pickupTicks: order[0] === plan.baselineOrder[0] ? original.pickupTicks : 0,
    measures,
    chords,
    melodyNotes,
    timeSignatureEvents: dedupe(timeSignatureEvents),
    keySignatureEvents: dedupe(keySignatureEvents),
    tempoEvents: dedupe(tempoEvents),
  });
  const errors = validateSongTiming(song).filter((warning) => warning.code === 'event-outside-song');
  if (errors.length) return { ok: false, issues: errors.map((warning) => ({ code: warning.code, message: warning.message })) };
  return { ok: true, song };
};
