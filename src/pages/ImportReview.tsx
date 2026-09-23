import { useEffect, useMemo, useRef, useState } from 'react';
import styled from '@emotion/styled';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  addImportDraftKeySignature,
  addImportDraftTempo,
  confirmImportDraftToSong,
  getImportIssueKey,
  getUnresolvedImportDraftIssues,
  moveImportDraftLinearMeasure,
  selectImportDraftMelody,
  setImportDraftIssueResolved,
  toggleImportDraftMelodyExcluded,
  updateImportDraftChange,
  updateImportDraftChordStructure,
  updateImportDraftChordSymbol,
  updateImportDraftChordTiming,
  updateImportDraftMelodyNote,
  validateImportDraft,
} from '../domain/music/importDraft';
import { noteNameToChordPitch } from '../domain/music/chordSymbol';
import { NOTE_NAMES } from '../domain/music/chords';
import { parseMusicXmlFileToImportDraft } from '../domain/music/musicXmlImport';
import { parseOmrCandidateToImportDraft, parseOmrJobArtifact } from '../domain/music/omrJobImport';
import { combineOmrCandidateDrafts, planOmrCandidateMerge } from '../domain/music/omrJobMerge';
import { createSongPlaybackSynths, playSong } from '../services/playback';
import { saveSong } from '../services/songStorage';
import type {
  ImportCandidate,
  ImportDraft,
  ImportIssue,
  ImportedChord,
  ImportedKeySignature,
  ImportedMelodyNote,
  ImportedTempo,
  ImportedTimeSignature,
} from '../domain/music/importDraft';
import type { ChordDegree, ChordKind, NoteName, Song } from '../domain/music/types';
import type { SongPlaybackSynths } from '../services/playback';
import type { OmrJobArtifact } from '../domain/music/omrJobImport';

const Page = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  display: grid;
  gap: 16px;
`;

const Header = styled.header`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const Heading = styled.div`
  display: grid;
  gap: 5px;

  h1 {
    margin: 0;
    color: #1f2937;
    font-size: 1.5rem;
  }

  p {
    margin: 0;
    color: #4b5563;
  }
`;

const Panel = styled.section`
  padding: 16px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #fff;
`;

const Notice = styled.p<{ $tone?: 'warning' | 'error' | 'success' }>`
  margin: 0;
  padding: 10px 12px;
  border-radius: 6px;
  color: ${({ $tone }) => $tone === 'error' ? '#991b1b' : $tone === 'success' ? '#166534' : '#92400e'};
  background: ${({ $tone }) => $tone === 'error' ? '#fef2f2' : $tone === 'success' ? '#f0fdf4' : '#fffbeb'};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

const FileInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const Metadata = styled.dl`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 12px;
  margin: 0;
  color: #374151;
  font-size: 0.9rem;

  dt { font-weight: 700; }
  dd { margin: 0; overflow-wrap: anywhere; }
`;

const ReviewGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 0.85fr) minmax(420px, 1.15fr);
  gap: 16px;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const SourcePane = styled(Panel)`
  position: sticky;
  top: 12px;
  display: grid;
  gap: 12px;

  @media (max-width: 900px) {
    position: static;
  }
`;

const PdfFrame = styled.iframe`
  width: 100%;
  min-height: 560px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
`;

const Placeholder = styled.div`
  padding: 20px;
  border: 1px dashed #9ca3af;
  border-radius: 6px;
  color: #4b5563;
  line-height: 1.6;
`;

const MeasureControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  select, input {
    min-height: 34px;
    padding: 5px 7px;
    border: 1px solid #9ca3af;
    border-radius: 4px;
    background: #fff;
  }
`;

const ReviewPane = styled.div`
  display: grid;
  gap: 12px;
`;

const Card = styled.article`
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;

  h2, h3, p { margin: 0; }
  h2 { color: #1f2937; font-size: 1.1rem; }
  h3 { color: #374151; font-size: 1rem; }
`;

const CandidateHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const Badge = styled.span<{ $tone?: 'warning' | 'edited' | 'error' | 'muted' }>`
  display: inline-block;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.78rem;
  color: ${({ $tone }) => $tone === 'warning' ? '#92400e' : $tone === 'error' ? '#991b1b' : $tone === 'edited' ? '#1d4ed8' : '#374151'};
  background: ${({ $tone }) => $tone === 'warning' ? '#fef3c7' : $tone === 'error' ? '#fee2e2' : $tone === 'edited' ? '#dbeafe' : '#e5e7eb'};
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 620px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  color: #374151;
  font-size: 0.82rem;

  input, select, textarea {
    min-width: 0;
    padding: 6px 7px;
    border: 1px solid #9ca3af;
    border-radius: 4px;
    color: #111827;
    background: #fff;
    font: inherit;
  }
`;

const WideField = styled(Field)`
  grid-column: 1 / -1;
`;

const SourceValue = styled.div`
  padding: 8px 10px;
  border-radius: 4px;
  background: #f3f4f6;
  color: #374151;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
`;

const IssueList = styled.ul`
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const IssueItem = styled.li<{ $severity: 'warning' | 'error' }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px;
  border-left: 4px solid ${({ $severity }) => $severity === 'error' ? '#dc2626' : '#f59e0b'};
  background: ${({ $severity }) => $severity === 'error' ? '#fef2f2' : '#fffbeb'};
  color: #374151;
  font-size: 0.9rem;
`;

const Summary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Code = styled.code`
  padding: 1px 4px;
  border-radius: 3px;
  background: #f3f4f6;
`;

interface ReviewState {
  draft?: ImportDraft;
  pdf?: { file: File; fileName: string; size: number };
}

const cloneDraft = (draft: ImportDraft): ImportDraft => JSON.parse(JSON.stringify(draft)) as ImportDraft;
const candidateMeasureKey = (candidate: ImportCandidate<{ startTick: number } | { tick: number }>) =>
  `${candidate.source.measureIndex}:${candidate.source.occurrence ?? 0}`;
const linearMeasureKey = (measure: ImportDraft['score']['linearMeasures'][number]) =>
  `${measure.sourceMeasureIndex}:${measure.occurrence}`;
const sourceLabel = (issue: ImportIssue) => issue.source
  ? `${issue.source.partName ?? issue.source.partId}・小節 ${issue.source.measureNumber}${issue.source.occurrence ? `（${issue.source.occurrence}回目）` : ''}`
  : '曲全体';
const degreesText = (degrees: ChordDegree[]) => degrees.map((degree) =>
  `${degree.type}:${degree.alter}:${degree.value}`).join(', ');
const parseDegreesText = (value: string): ChordDegree[] | null => {
  if (!value.trim()) return [];
  const parsed = value.split(',').map((part) => {
    const match = /^\s*(add|alter|subtract)\s*:\s*(-?\d+)\s*:\s*(\d+)\s*$/.exec(part);
    if (!match) return null;
    return { type: match[1], alter: Number(match[2]), value: Number(match[3]) } as ChordDegree;
  });
  return parsed.every((degree) => degree !== null) ? parsed as ChordDegree[] : null;
};
const isLowConfidence = (candidate: ImportCandidate<unknown>) =>
  candidate.confidence !== undefined && candidate.confidence < 0.8;
const byteSize = (value: number) => `${(value / (1024 * 1024)).toFixed(1)} MiB`;

function ImportReview() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as ReviewState;
  const [draft, setDraft] = useState<ImportDraft | null>(() => state.draft ? cloneDraft(state.draft) : null);
  const [originalDraft, setOriginalDraft] = useState<ImportDraft | null>(() => state.draft ? cloneDraft(state.draft) : null);
  const [selectedMeasure, setSelectedMeasure] = useState(0);
  const [warningOnly, setWarningOnly] = useState(false);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ tone: 'warning' | 'error' | 'success'; text: string } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [synth, setSynth] = useState<SongPlaybackSynths | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const jobInputRef = useRef<HTMLInputElement>(null);
  const [omrJob, setOmrJob] = useState<OmrJobArtifact | null>(null);
  const [candidateDrafts, setCandidateDrafts] = useState<Record<string, ImportDraft>>({});
  const [originalCandidateDrafts, setOriginalCandidateDrafts] = useState<Record<string, ImportDraft>>({});
  const [activeCandidatePath, setActiveCandidatePath] = useState<string | null>(null);
  const [coverageConfirmed, setCoverageConfirmed] = useState(false);

  useEffect(() => {
    const nextSynth = createSongPlaybackSynths();
    setSynth(nextSynth);
    return () => nextSynth.dispose();
  }, []);

  useEffect(() => {
    if (!state.pdf?.file) return;
    const url = URL.createObjectURL(state.pdf.file);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [state.pdf?.file]);

  const validation = useMemo(() => draft ? validateImportDraft(draft) : null, [draft]);
  const unresolvedIssues = useMemo(() => draft ? getUnresolvedImportDraftIssues(draft) : [], [draft]);
  const unresolvedWarnings = unresolvedIssues.filter((issue) => issue.severity === 'warning');
  const errors = validation?.issues.filter((issue) => issue.severity === 'error') ?? [];
  const measures = draft?.score.linearMeasures ?? [];
  const currentMeasure = measures[selectedMeasure];
  const currentSourceSlot = omrJob?.artifacts.musicXml.find((candidate) => candidate.path === activeCandidatePath)
    ?.sourceMeasures?.find((source) => source.measureIndex === currentMeasure?.sourceMeasureIndex);
  const isMultiCandidateJob = Boolean(omrJob && omrJob.artifacts.musicXml.length > 1);
  const mergePlan = useMemo(() => omrJob && omrJob.artifacts.musicXml.length > 1
    ? planOmrCandidateMerge(omrJob, candidateDrafts) : null, [omrJob, candidateDrafts]);

  const candidateIsInCurrentMeasure = <T extends { startTick: number } | { tick: number }>(candidate: ImportCandidate<T>) => {
    if (!currentMeasure) return false;
    if (candidateMeasureKey(candidate) === linearMeasureKey(currentMeasure)) return true;
    const tick = 'startTick' in candidate.normalized ? candidate.normalized.startTick : candidate.normalized.tick;
    return tick >= currentMeasure.startTick && tick < currentMeasure.startTick + currentMeasure.durationTicks;
  };
  const issueIsInCurrentMeasure = (issue: ImportIssue) => Boolean(currentMeasure && issue.source &&
    issue.source.measureIndex === currentMeasure.sourceMeasureIndex &&
    (issue.source.occurrence === undefined || issue.source.occurrence === currentMeasure.occurrence));
  const measureNeedsReview = (measure: ImportDraft['score']['linearMeasures'][number], index: number) => {
    if (!draft) return false;
    const hasIssue = validation?.issues.some((issue) => !issue.source ? index === 0 :
      issue.source.measureIndex === measure.sourceMeasureIndex &&
      (issue.source.occurrence === undefined || issue.source.occurrence === measure.occurrence));
    const hasCandidateWarning = [
      ...draft.candidates.melodyNotes,
      ...draft.candidates.chords,
      ...draft.candidates.keySignatures,
      ...draft.candidates.timeSignatures,
      ...draft.candidates.tempos,
    ].some((candidate) => candidateMeasureKey(candidate as ImportCandidate<{ startTick: number } | { tick: number }>) === linearMeasureKey(measure) && (
      isLowConfidence(candidate) || ('chordSymbol' in candidate.normalized && candidate.normalized.chordSymbol.warnings.length > 0)
    ));
    return Boolean(hasIssue || hasCandidateWarning);
  };
  const navigableMeasures = measures.filter((measure, index) => !warningOnly || measureNeedsReview(measure, index));

  const replaceDraft = (next: ImportDraft) => {
    setDraft(next);
    if (activeCandidatePath) setCandidateDrafts((previous) => ({ ...previous, [activeCandidatePath]: next }));
    setActionMessage(null);
  };

  const handleMusicXmlFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setIsParsing(true);
    setActionMessage(null);
    try {
      if (!omrJob && files.length !== 1) throw new Error('MusicXML単体の読み込みでは1ファイルを選択してください。');
      const parsed = await Promise.all(files.map((file) => omrJob
        ? parseOmrCandidateToImportDraft(omrJob, file)
        : parseMusicXmlFileToImportDraft(file)));
      const paths = files.map((file) => `musicxml/${file.name}`);
      const copies = Object.fromEntries(parsed.map((item, index) => [paths[index], cloneDraft(item)]));
      if (omrJob) {
        setCandidateDrafts((previous) => ({ ...previous, ...copies }));
        setOriginalCandidateDrafts((previous) => ({ ...previous, ...Object.fromEntries(parsed.map((item, index) => [paths[index], cloneDraft(item)])) }));
        setActiveCandidatePath(paths[0]);
        setPdfPage(omrJob.artifacts.musicXml.find((candidate) => candidate.path === paths[0])?.sourceMeasures?.[0]?.pdfPage ?? 1);
        setCoverageConfirmed(false);
      } else {
        setActiveCandidatePath(null);
      }
      setDraft(copies[paths[0]]);
      setOriginalDraft(cloneDraft(parsed[0]));
      setSelectedMeasure(0);
      setWarningOnly(false);
      setActionMessage({ tone: 'success', text: files.length === 1
        ? `「${files[0].name}」をレビュー用の下書きとして読み込みました。Songにはまだ保存していません。`
        : `${files.length}件のMusicXMLをレビュー用に読み込みました。Songにはまだ保存していません。` });
    } catch (error) {
      setActionMessage({ tone: 'error', text: error instanceof Error ? error.message : 'MusicXMLを読み取れませんでした。' });
    } finally {
      setIsParsing(false);
    }
  };

  const handleOmrJobFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!file) return;
    try {
      const job = parseOmrJobArtifact(await file.text());
      if (state.pdf) {
        const pdfBytes = await state.pdf.file.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', pdfBytes);
        const pdfSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        if (pdfSha256 !== job.input.sha256) {
          throw new Error('表示中の原PDFのSHA-256が job.json と一致しません。');
        }
      }
      setOmrJob(job);
      setDraft(null);
      setOriginalDraft(null);
      setCandidateDrafts({});
      setOriginalCandidateDrafts({});
      setActiveCandidatePath(null);
      setCoverageConfirmed(false);
      setSelectedMeasure(0);
      setActionMessage({ tone: 'success', text: `OMRジョブ「${job.jobId}」を読み込みました。${job.artifacts.musicXml.length > 1 ? '結合するすべての' : '候補'}MusicXMLを選択してください。` });
    } catch (error) {
      setOmrJob(null);
      setDraft(null);
      setOriginalDraft(null);
      setCandidateDrafts({});
      setOriginalCandidateDrafts({});
      setActiveCandidatePath(null);
      setCoverageConfirmed(false);
      setActionMessage({ tone: 'error', text: error instanceof Error ? error.message : 'job.jsonを読み取れませんでした。' });
    }
  };

  const songForReview = (): Song | null => {
    if (!draft) return null;
    if (omrJob && isMultiCandidateJob) {
      if (!coverageConfirmed) {
        setActionMessage({ tone: 'error', text: '候補のPDF上の順番と範囲を確認してから結合してください。' });
        return null;
      }
      const merged = combineOmrCandidateDrafts(omrJob, candidateDrafts);
      if (!merged.ok) {
        setActionMessage({ tone: 'error', text: merged.plan.issues[0]?.message ?? '候補を結合できませんでした。' });
        return null;
      }
      return merged.song;
    }
    const result = confirmImportDraftToSong(draft);
    if (!result.ok) {
      setActionMessage({ tone: 'error', text: '未解決のエラーがあるため、Songへ確定できません。エラーの対象を修正してください。' });
      return null;
    }
    return result.song;
  };

  const handlePreview = async () => {
    if (!draft || !synth) return;
    const song = songForReview();
    if (!song) return;
    setIsPlaying(true);
    setActionMessage({ tone: 'success', text: '下書きを一時的なSongに変換して再生しています。まだ保存していません。' });
    try {
      await playSong(song, synth);
    } finally {
      setIsPlaying(false);
    }
  };

  const handleConfirm = () => {
    if (!draft) return;
    const song = songForReview();
    if (!song) return;
    try {
      const saved = saveSong(song);
      navigate(`/editor/${saved.id}`);
    } catch {
      setActionMessage({ tone: 'error', text: 'Songを端末へ保存できませんでした。ブラウザの空き容量やサイトデータの設定を確認してください。' });
    }
  };

  const handleRestore = () => {
    if (!originalDraft) return;
    if (!window.confirm('このレビューで行った修正と確認済みマークをすべて戻します。よろしいですか？')) return;
    setDraft(cloneDraft(originalDraft));
    if (activeCandidatePath) setCandidateDrafts((previous) => ({ ...previous, [activeCandidatePath]: cloneDraft(originalDraft) }));
    setSelectedMeasure(0);
    setWarningOnly(false);
    setActionMessage({ tone: 'success', text: '原認識値に戻しました。Songには保存していません。' });
  };

  const setMeasureByIndex = (index: number) => {
    const next = Math.max(0, Math.min(measures.length - 1, index));
    setSelectedMeasure(next);
    const page = omrJob?.artifacts.musicXml.find((candidate) => candidate.path === activeCandidatePath)
      ?.sourceMeasures?.find((source) => source.measureIndex === measures[next]?.sourceMeasureIndex)?.pdfPage;
    if (page) setPdfPage(page);
  };

  return (
    <Page>
      <Header>
        <Heading>
          <h1>楽譜インポートの確認・修正</h1>
          <p>認識結果を小節ごとに確認し、問題のある箇所だけ直してから Song に確定します。</p>
        </Heading>
        <Actions>
          <button type="button" onClick={() => navigate('/')}>一覧へ戻る</button>
          <button type="button" onClick={() => jobInputRef.current?.click()} disabled={isParsing}>OMRジョブを選択</button>
          <FileInput
            ref={jobInputRef}
            type="file"
            accept=".json,application/json"
            aria-label="OMRジョブのjob.jsonを選択"
            onChange={handleOmrJobFile}
          />
          <button type="button" onClick={() => importInputRef.current?.click()} disabled={isParsing}>
            {isParsing ? 'MusicXMLを読み込み中…' : 'MusicXMLを選択'}
          </button>
          <FileInput
            ref={importInputRef}
            type="file"
            multiple={isMultiCandidateJob}
            accept=".musicxml,.xml,application/vnd.recordare.musicxml+xml,application/xml,text/xml"
            aria-label="レビューするMusicXMLファイルを選択"
            onChange={handleMusicXmlFile}
          />
          {draft && <button type="button" onClick={handleRestore}>原認識値に戻す</button>}
        </Actions>
      </Header>

      {actionMessage && <Notice role={actionMessage.tone === 'error' ? 'alert' : 'status'} $tone={actionMessage.tone}>{actionMessage.text}</Notice>}

      {omrJob && (
        <Panel>
          <Heading>
            <h1>OMRジョブの候補</h1>
            <p>{omrJob.input.fileName} / Audiveris {omrJob.engine.version} / 候補 {omrJob.artifacts.musicXml.length}件</p>
          </Heading>
          <p>{isMultiCandidateJob ? 'すべての候補MusicXMLを選択してください。複数ファイルをまとめて選べます。' : '下の候補から確認するMusicXMLを選択してください。'}読み込み時にSHA-256を照合します。</p>
          <ul>
            {omrJob.artifacts.musicXml.map((candidate) => (
              <li key={candidate.path}>
                {candidate.path}（{candidate.sourceOutput}、SHA-256: {candidate.sha256}）
                {candidateDrafts[candidate.path] && <button type="button" onClick={() => {
                  setActiveCandidatePath(candidate.path);
                  setDraft(cloneDraft(candidateDrafts[candidate.path]));
                  setOriginalDraft(cloneDraft(originalCandidateDrafts[candidate.path]));
                  setSelectedMeasure(0);
                  setWarningOnly(false);
                  setPdfPage(candidate.sourceMeasures?.[0]?.pdfPage ?? 1);
                }} disabled={activeCandidatePath === candidate.path}>この候補を確認</button>}
                {' '}{candidateDrafts[candidate.path] ? `読み込み済み・演奏順${candidateDrafts[candidate.path].score.linearMeasures.length}小節` : '未読み込み'}
              </li>
            ))}
          </ul>
          {mergePlan && <Card>
            <h2>候補を1曲に結合</h2>
            <p>原PDF上の位置で並べ、重複・欠落がない場合に全候補を結合します。小節番号が候補ごとに1へ戻っても、PDF上の位置で判定します。</p>
            {mergePlan.segments.length > 0 && <ol>{mergePlan.segments.map((segment) =>
              <li key={segment.path}>{segment.path}: PDF {segment.first.pdfPage}ページ・譜面領域{segment.first.pageId}からPDF {segment.last.pdfPage}ページ・譜面領域{segment.last.pageId}（譜面{segment.sourceMeasureCount}小節、演奏順{segment.playbackMeasureCount}小節）</li>)}</ol>}
            {mergePlan.issues.length > 0 && <IssueList>{mergePlan.issues.map((issue, index) =>
              <IssueItem key={`${issue.code}:${index}`} $severity="error"><span>{issue.message}</span></IssueItem>)}</IssueList>}
            {mergePlan.ready && <label><input type="checkbox" checked={coverageConfirmed} onChange={(event) => setCoverageConfirmed(event.target.checked)} /> 原PDFの順番と候補の範囲を確認した</label>}
          </Card>}
          {omrJob.diagnostics.length > 0 && <IssueList>
            {omrJob.diagnostics.map((diagnostic) => <IssueItem key={diagnostic.code} $severity={diagnostic.severity}>
              <span><Badge $tone={diagnostic.severity === 'error' ? 'error' : 'warning'}>{diagnostic.code}</Badge> {diagnostic.message}</span>
            </IssueItem>)}
          </IssueList>}
        </Panel>
      )}

      {!draft && (
        <Panel>
          <Heading>
            <h1>まず変換結果を選択してください</h1>
            <p>MusicXMLなら上の「MusicXMLを選択」から直接レビューを始められます。</p>
          </Heading>
          {state.pdf ? (
            <>
              <Notice $tone="warning">「{state.pdf.fileName}」（{byteSize(state.pdf.size)}）はブラウザのメモリでプレビュー中です。原PDFは保存・送信しません。</Notice>
              <p>PDFの認識はローカルの OMR コマンドで行います。元のファイルのあるターミナルで <Code>npm run omr:pdf -- --input "score.pdf"</Code> を実行し、先に <Code>job.json</Code>、次に <Code>candidate-*.musicxml</Code> をすべて選択してください。ページ数・暗号化・サイズなどの完全な事前確認も、そのコマンドが実施します。</p>
            </>
          ) : (
            <Placeholder>PDFから始める場合は、一覧画面の「PDFを確認する」から原譜を選びます。ブラウザ内では重いOMR処理を行わず、ローカル処理で生成したMusicXMLだけをレビューします。</Placeholder>
          )}
        </Panel>
      )}

      {draft && currentMeasure && (
        <>
          <Panel>
            <CandidateHeader>
              <Metadata>
                <dt>入力</dt><dd>{draft.source.fileName}</dd>
                <dt>MusicXML</dt><dd>{draft.source.musicXmlVersion ?? '不明'} / PPQ {draft.ticksPerQuarter}</dd>
                <dt>生成元</dt><dd>{draft.source.generators.join(', ') || '記録なし'}{draft.source.omrEngine ? ` / OMR: ${draft.source.omrEngine}` : ''}</dd>
                {draft.source.omrJob && <><dt>OMR候補</dt><dd>{draft.source.omrJob.jobId} / {draft.source.omrJob.candidatePath}（全{draft.source.omrJob.candidateCount}候補）</dd></>}
                <dt>処理範囲</dt><dd>{draft.score.parts.length}パート、演奏順 {draft.score.linearMeasures.length}小節</dd>
              </Metadata>
              <Summary aria-live="polite">
                <Badge $tone={errors.length ? 'error' : 'edited'}>未解決エラー {errors.length}</Badge>
                <Badge $tone={unresolvedWarnings.length ? 'warning' : 'edited'}>要確認の警告 {unresolvedWarnings.length}</Badge>
                <Badge $tone="muted">確定 {validation?.valid ? '可能' : '不可'}</Badge>
              </Summary>
            </CandidateHeader>
          </Panel>

          <ReviewGrid>
            <SourcePane>
              <CandidateHeader>
                <h2>原譜・出典</h2>
                {state.pdf && <Field>PDFページ
                  <input type="number" min="1" value={pdfPage} onChange={(event) => setPdfPage(Math.max(1, Number(event.target.value) || 1))} />
                </Field>}
              </CandidateHeader>
              {state.pdf && pdfUrl ? (
                <PdfFrame title={`${state.pdf.fileName} のページ ${pdfPage}`} src={`${pdfUrl}#page=${pdfPage}`} />
              ) : (
                <Placeholder>
                  原PDFは添付されていません。PDFも一覧画面の「楽譜を読み込む」から選択すると、この欄で並べて確認できます。<br />
                  現在の出典は小節 {currentMeasure.sourceMeasureNumber}、演奏順 {selectedMeasure + 1} 番目（{currentMeasure.occurrence}回目）です。
                </Placeholder>
              )}
              <Metadata>
                <dt>小節</dt><dd>譜面上 {currentMeasure.sourceMeasureNumber} / 演奏順 {selectedMeasure + 1} / {currentMeasure.occurrence}回目</dd>
                {currentSourceSlot && <><dt>PDF位置</dt><dd>{currentSourceSlot.pdfPage}ページ・譜面領域{currentSourceSlot.pageId}・{currentSourceSlot.systemIndex + 1}段目・{currentSourceSlot.stackIndex + 1}小節目</dd></>}
                <dt>時間</dt><dd>{currentMeasure.startTick}–{currentMeasure.startTick + currentMeasure.durationTicks} tick</dd>
                <dt>構造</dt><dd>{(() => {
                  const source = draft.score.sourceMeasures.find((item) => item.partId === draft.score.parts[0]?.id && item.measureIndex === currentMeasure.sourceMeasureIndex);
                  if (!source) return '記録なし';
                  const flags = [source.repeat.forward ? '反復開始' : '', source.repeat.backwardTimes ? `反復終了 ×${source.repeat.backwardTimes}` : '', source.directions.segno ? 'Segno' : '', source.directions.coda ? 'Coda' : '', source.directions.dacapo ? 'D.C.' : '', source.directions.dalsegno ? 'D.S.' : '', source.directions.tocoda ? 'To Coda' : '', source.directions.fine ? 'Fine' : ''].filter(Boolean);
                  return flags.join(' / ') || '通常';
                })()}</dd>
              </Metadata>
              <Actions>
                <button type="button" disabled={selectedMeasure === 0} onClick={() => replaceDraft(moveImportDraftLinearMeasure(draft, selectedMeasure, selectedMeasure - 1))}>演奏順を前へ</button>
                <button type="button" disabled={selectedMeasure === measures.length - 1} onClick={() => replaceDraft(moveImportDraftLinearMeasure(draft, selectedMeasure, selectedMeasure + 1))}>演奏順を後ろへ</button>
              </Actions>
              <small>演奏順の移動は、反復を展開した小節とそのイベントの時刻を一緒に並べ替えます。反復記号そのものは変更しません。</small>
            </SourcePane>

            <ReviewPane>
              <Card>
                <CandidateHeader>
                  <h2>小節を選ぶ</h2>
                  <label><input type="checkbox" checked={warningOnly} onChange={(event) => {
                    setWarningOnly(event.target.checked);
                    if (event.target.checked && !measureNeedsReview(currentMeasure, selectedMeasure)) {
                      const first = measures.findIndex((measure, index) => measureNeedsReview(measure, index));
                      if (first >= 0) setMeasureByIndex(first);
                    }
                  }} /> 警告・低信頼度のみ</label>
                </CandidateHeader>
                <MeasureControls>
                  <button type="button" disabled={selectedMeasure === 0} onClick={() => setMeasureByIndex(selectedMeasure - 1)}>前の小節</button>
                  <select value={selectedMeasure} onChange={(event) => setMeasureByIndex(Number(event.target.value))} aria-label="レビューする小節">
                    {navigableMeasures.map((measure) => {
                      const index = measures.indexOf(measure);
                      return <option key={`${index}:${linearMeasureKey(measure)}`} value={index}>演奏順 {index + 1}: 小節 {measure.sourceMeasureNumber}（{measure.occurrence}回目）</option>;
                    })}
                  </select>
                  <button type="button" disabled={selectedMeasure === measures.length - 1} onClick={() => setMeasureByIndex(selectedMeasure + 1)}>次の小節</button>
                </MeasureControls>
              </Card>

              {validation && validation.issues.filter(issueIsInCurrentMeasure).length > 0 && (
                <IssueCards
                  issues={validation.issues.filter(issueIsInCurrentMeasure)}
                  unresolvedIssues={unresolvedIssues}
                  onSetResolved={(issue, resolved) => replaceDraft(setImportDraftIssueResolved(draft, issue, resolved))}
                />
              )}

              <MelodySelector draft={draft} onChange={(selected) => replaceDraft(selectImportDraftMelody(draft, selected))} />

              <ChordCandidates
                candidates={draft.candidates.chords.filter(candidateIsInCurrentMeasure)}
                onRawChange={(id, raw) => replaceDraft(updateImportDraftChordSymbol(draft, id, raw))}
                onTimingChange={(id, timing) => replaceDraft(updateImportDraftChordTiming(draft, id, timing))}
                onStructureChange={(id, symbol) => replaceDraft(updateImportDraftChordStructure(draft, id, symbol))}
                onStructureError={(message) => setActionMessage({ tone: 'error', text: message })}
              />

              <MelodyCandidates
                candidates={draft.candidates.melodyNotes.filter((candidate) => candidateIsInCurrentMeasure(candidate) &&
                  candidate.source.partId === draft.melodySelection.selected?.partId &&
                  candidate.source.staff === draft.melodySelection.selected?.staff &&
                  candidate.source.voice === draft.melodySelection.selected?.voice)}
                onChange={(id, normalized) => replaceDraft(updateImportDraftMelodyNote(draft, id, normalized))}
                onToggleExcluded={(id) => replaceDraft(toggleImportDraftMelodyExcluded(draft, id))}
              />

              <ChangeCandidates
                keyCandidates={draft.candidates.keySignatures.filter(candidateIsInCurrentMeasure)}
                timeCandidates={draft.candidates.timeSignatures.filter(candidateIsInCurrentMeasure)}
                tempoCandidates={draft.candidates.tempos.filter(candidateIsInCurrentMeasure)}
                onKeyChange={(id, normalized) => replaceDraft(updateImportDraftChange(draft, 'keySignatures', id, normalized))}
                onTimeChange={(id, normalized) => replaceDraft(updateImportDraftChange(draft, 'timeSignatures', id, normalized))}
                onTempoChange={(id, normalized) => replaceDraft(updateImportDraftChange(draft, 'tempos', id, normalized))}
                onAddKey={() => replaceDraft(addImportDraftKeySignature(draft, selectedMeasure))}
                onAddTempo={() => replaceDraft(addImportDraftTempo(draft, selectedMeasure))}
              />

              {validation && validation.issues.filter((issue) => !issue.source).length > 0 && (
                <Card>
                  <h2>曲全体の確認事項</h2>
                  <IssueCards
                    issues={validation.issues.filter((issue) => !issue.source)}
                    unresolvedIssues={unresolvedIssues}
                    onSetResolved={(issue, resolved) => replaceDraft(setImportDraftIssueResolved(draft, issue, resolved))}
                  />
                </Card>
              )}
            </ReviewPane>
          </ReviewGrid>

          <Panel>
            <CandidateHeader>
              <div>
                <h2>確定前の確認</h2>
                <p>プレビューは一時的な Song を再生するだけです。確定すると、この端末の保存済み楽曲へ追加して編集画面を開きます。</p>
              </div>
              <Actions>
                <button type="button" disabled={!validation?.valid || isPlaying || isMultiCandidateJob && (!mergePlan?.ready || !coverageConfirmed)} onClick={() => void handlePreview()}>{isPlaying ? '再生中…' : isMultiCandidateJob ? '結合したSongをプレビュー' : 'Songとしてプレビュー'}</button>
                <button type="button" disabled={!validation?.valid || isMultiCandidateJob && (!mergePlan?.ready || !coverageConfirmed)} onClick={handleConfirm}>{isMultiCandidateJob ? '全候補を1曲として保存' : 'Songへ確定して保存'}</button>
              </Actions>
            </CandidateHeader>
            {!validation?.valid && <Notice $tone="error">未解決エラー {errors.length} 件があるため、プレビューと確定はできません。警告は確認済みにできますが、エラーは対象データを修正する必要があります。</Notice>}
          </Panel>
        </>
      )}
    </Page>
  );
}

function IssueCards({
  issues,
  unresolvedIssues,
  onSetResolved,
}: {
  issues: ImportIssue[];
  unresolvedIssues: ImportIssue[];
  onSetResolved: (issue: ImportIssue, resolved: boolean) => void;
}) {
  const unresolvedKeys = new Set(unresolvedIssues.map(getImportIssueKey));
  return (
    <IssueList>
      {issues.map((issue) => {
        const unresolved = unresolvedKeys.has(getImportIssueKey(issue));
        return (
          <IssueItem key={getImportIssueKey(issue)} $severity={issue.severity}>
            <span><Badge $tone={issue.severity === 'error' ? 'error' : 'warning'}>{issue.code}</Badge> {issue.message} <small>（{sourceLabel(issue)}）</small></span>
            {issue.severity === 'warning' && <button type="button" onClick={() => onSetResolved(issue, unresolved)}>{unresolved ? '確認済みにする' : '確認を取り消す'}</button>}
          </IssueItem>
        );
      })}
    </IssueList>
  );
}

function MelodySelector({ draft, onChange }: {
  draft: ImportDraft;
  onChange: (selected: NonNullable<ImportDraft['melodySelection']['selected']>) => void;
}) {
  const selected = draft.melodySelection.selected;
  return (
    <Card>
      <CandidateHeader>
        <h2>主旋律の候補</h2>
        <Badge $tone={draft.melodySelection.status === 'edited' ? 'edited' : 'muted'}>{draft.melodySelection.status}</Badge>
      </CandidateHeader>
      <Field>主旋律に使うパート / staff / voice
        <select
          value={selected ? `${selected.partId}:${selected.staff}:${selected.voice}` : ''}
          onChange={(event) => {
            const candidate = draft.melodySelection.alternatives.find((item) => `${item.partId}:${item.staff}:${item.voice}` === event.target.value);
            if (candidate) onChange(candidate);
          }}
        >
          {!selected && <option value="">選択してください</option>}
          {draft.melodySelection.alternatives.map((candidate) => (
            <option key={`${candidate.partId}:${candidate.staff}:${candidate.voice}`} value={`${candidate.partId}:${candidate.staff}:${candidate.voice}`}>
              {candidate.partName} / staff {candidate.staff} / voice {candidate.voice}（{candidate.noteCount}音・信頼度 {Math.round(candidate.confidence * 100)}%）
            </option>
          ))}
        </select>
      </Field>
    </Card>
  );
}

function ChordCandidates({
  candidates,
  onRawChange,
  onTimingChange,
  onStructureChange,
  onStructureError,
}: {
  candidates: Array<ImportCandidate<ImportedChord>>;
  onRawChange: (id: string, raw: string) => void;
  onTimingChange: (id: string, timing: Pick<ImportedChord, 'startTick' | 'durationTicks'>) => void;
  onStructureChange: (id: string, symbol: ImportedChord['chordSymbol']) => void;
  onStructureError: (message: string) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <Card>
      <h2>コード</h2>
      {candidates.map((candidate) => {
        const chord = candidate.normalized;
        const symbol = chord.chordSymbol;
        const updateStructure = (changes: Partial<typeof symbol>) => onStructureChange(candidate.id, { ...symbol, ...changes });
        return (
          <Card key={candidate.id}>
            <CandidateHeader>
              <h3>出典: {candidate.source.partName ?? candidate.source.partId} / 小節 {candidate.source.measureNumber}</h3>
              <Summary>
                <Badge $tone={candidate.reviewStatus === 'edited' ? 'edited' : 'muted'}>{candidate.reviewStatus}</Badge>
                {symbol.warnings.length > 0 && <Badge $tone="warning">構文警告 {symbol.warnings.length}</Badge>}
              </Summary>
            </CandidateHeader>
            <FieldGrid>
              <WideField>原認識値
                <SourceValue>{candidate.raw}</SourceValue>
              </WideField>
              <WideField>現在のコード記号（変更すると構造化値を再解析）
                <input value={candidate.reviewRaw ?? symbol.raw} onChange={(event) => onRawChange(candidate.id, event.target.value)} />
              </WideField>
              <Field>root
                <select value={chord.root} onChange={(event) => updateStructure({ root: noteNameToChordPitch(event.target.value as NoteName) })}>
                  {NOTE_NAMES.map((note) => <option key={note} value={note}>{note}</option>)}
                </select>
              </Field>
              <Field>kind
                <select value={symbol.kind} onChange={(event) => updateStructure({ kind: event.target.value as ChordKind })}>
                  {['major', 'minor', 'diminished', 'augmented', 'dominant', 'suspended-second', 'suspended-fourth', 'half-diminished', 'none', 'other'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </Field>
              <Field>extension
                <select value={symbol.extension ?? ''} onChange={(event) => updateStructure({ extension: event.target.value ? Number(event.target.value) as 6 | 7 | 9 | 11 | 13 : undefined })}>
                  <option value="">なし</option>{[6, 7, 9, 11, 13].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field>bass
                <select value={chord.bass ?? ''} onChange={(event) => updateStructure({ bass: event.target.value ? noteNameToChordPitch(event.target.value as NoteName) : undefined })}>
                  <option value="">なし</option>{NOTE_NAMES.map((note) => <option key={note} value={note}>{note}</option>)}
                </select>
              </Field>
              <Field>開始 tick
                <input type="number" min="0" value={chord.startTick} onChange={(event) => onTimingChange(candidate.id, { ...chord, startTick: Math.max(0, Number(event.target.value) || 0) })} />
              </Field>
              <Field>長さ tick
                <input type="number" min="0" value={chord.durationTicks} onChange={(event) => onTimingChange(candidate.id, { ...chord, durationTicks: Math.max(0, Number(event.target.value) || 0) })} />
              </Field>
              <WideField>degrees（type:alter:value をカンマ区切り。例: add:0:9, alter:-1:5）
                <input
                  key={`${candidate.id}:${degreesText(symbol.degrees)}`}
                  defaultValue={degreesText(symbol.degrees)}
                  onBlur={(event) => {
                    const degrees = parseDegreesText(event.target.value);
                    if (!degrees) onStructureError('degrees は「add:0:9」の形式で入力してください。');
                    else updateStructure({ degrees });
                  }}
                />
              </WideField>
            </FieldGrid>
            {symbol.warnings.length > 0 && <SourceValue>{symbol.warnings.map((warning) => `${warning.code}: ${warning.message}`).join(' / ')}</SourceValue>}
          </Card>
        );
      })}
    </Card>
  );
}

function MelodyCandidates({ candidates, onChange, onToggleExcluded }: {
  candidates: Array<ImportCandidate<ImportedMelodyNote>>;
  onChange: (id: string, normalized: ImportedMelodyNote) => void;
  onToggleExcluded: (id: string) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <Card>
      <h2>主旋律の音符</h2>
      {candidates.map((candidate) => {
        const note = candidate.normalized;
        const set = (changes: Partial<ImportedMelodyNote>) => onChange(candidate.id, { ...note, ...changes });
        return (
          <Card key={candidate.id}>
            <CandidateHeader>
              <h3>原認識: {candidate.raw}</h3>
              <Summary>
                <Badge $tone={candidate.reviewStatus === 'edited' ? 'edited' : 'muted'}>{candidate.reviewStatus}</Badge>
                {isLowConfidence(candidate) && <Badge $tone="warning">信頼度 {Math.round((candidate.confidence ?? 0) * 100)}%</Badge>}
                <button type="button" onClick={() => onToggleExcluded(candidate.id)}>
                  {candidate.reviewStatus === 'excluded' ? 'Songに戻す' : 'この音符をSongから除外'}
                </button>
              </Summary>
            </CandidateHeader>
            <FieldGrid>
              <Field>pitch
                <select value={note.pitch} onChange={(event) => set({ pitch: event.target.value as NoteName })}>{NOTE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}</select>
              </Field>
              <Field>octave
                <input type="number" min="1" max="9" value={note.octave} onChange={(event) => set({ octave: Math.max(1, Math.min(9, Number(event.target.value) || 1)) })} />
              </Field>
              <Field>開始 tick
                <input type="number" min="0" value={note.startTick} onChange={(event) => set({ startTick: Math.max(0, Number(event.target.value) || 0) })} />
              </Field>
              <Field>長さ tick
                <input type="number" min="0" value={note.durationTicks} onChange={(event) => set({ durationTicks: Math.max(0, Number(event.target.value) || 0) })} />
              </Field>
              <Field>velocity
                <input type="number" min="0" max="1" step="0.05" value={note.velocity} onChange={(event) => set({ velocity: Math.max(0, Math.min(1, Number(event.target.value) || 0)) })} />
              </Field>
              <Field>tie
                <select value={note.tie?.type ?? 'none'} onChange={(event) => set({ tie: event.target.value === 'none' ? undefined : { id: note.tie?.id ?? `tie:${candidate.id}`, type: event.target.value as NonNullable<ImportedMelodyNote['tie']>['type'] } })}>
                  <option value="none">なし</option><option value="start">start</option><option value="continue">continue</option><option value="stop">stop</option>
                </select>
              </Field>
              {note.tie && <Field>tie ID
                <input value={note.tie.id} onChange={(event) => set({ tie: { ...note.tie!, id: event.target.value } })} />
              </Field>}
            </FieldGrid>
          </Card>
        );
      })}
    </Card>
  );
}

function ChangeCandidates({
  keyCandidates,
  timeCandidates,
  tempoCandidates,
  onKeyChange,
  onTimeChange,
  onTempoChange,
  onAddKey,
  onAddTempo,
}: {
  keyCandidates: Array<ImportCandidate<ImportedKeySignature>>;
  timeCandidates: Array<ImportCandidate<ImportedTimeSignature>>;
  tempoCandidates: Array<ImportCandidate<ImportedTempo>>;
  onKeyChange: (id: string, normalized: ImportedKeySignature) => void;
  onTimeChange: (id: string, normalized: ImportedTimeSignature) => void;
  onTempoChange: (id: string, normalized: ImportedTempo) => void;
  onAddKey: () => void;
  onAddTempo: () => void;
}) {
  return (
    <Card>
      <h2>調・拍子・テンポ変更</h2>
      <Actions>
        {keyCandidates.length === 0 && <button type="button" onClick={onAddKey}>この小節に調を追加</button>}
        {tempoCandidates.length === 0 && <button type="button" onClick={onAddTempo}>この小節にテンポを追加</button>}
      </Actions>
      {keyCandidates.map((candidate) => <FieldGrid key={candidate.id}>
        <Field>調（原認識: {candidate.raw}）
          <select value={candidate.normalized.key.tonic} onChange={(event) => onKeyChange(candidate.id, { ...candidate.normalized, key: { ...candidate.normalized.key, tonic: event.target.value as NoteName } })}>{NOTE_NAMES.map((note) => <option key={note} value={note}>{note}</option>)}</select>
        </Field>
        <Field>モード
          <select value={candidate.normalized.key.mode} onChange={(event) => onKeyChange(candidate.id, { ...candidate.normalized, key: { ...candidate.normalized.key, mode: event.target.value as ImportedKeySignature['key']['mode'] } })}><option value="major">major</option><option value="minor">minor</option></select>
        </Field>
        <Field>tick
          <input type="number" min="0" value={candidate.normalized.tick} onChange={(event) => onKeyChange(candidate.id, { ...candidate.normalized, tick: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
      </FieldGrid>)}
      {timeCandidates.map((candidate) => <FieldGrid key={candidate.id}>
        <Field>拍子（原認識: {candidate.raw}）
          <input type="number" min="1" value={candidate.normalized.timeSignature.beatsPerMeasure} onChange={(event) => onTimeChange(candidate.id, { ...candidate.normalized, timeSignature: { ...candidate.normalized.timeSignature, beatsPerMeasure: Math.max(1, Number(event.target.value) || 1) } })} />
        </Field>
        <Field>beat unit
          <input type="number" min="1" value={candidate.normalized.timeSignature.beatUnit} onChange={(event) => onTimeChange(candidate.id, { ...candidate.normalized, timeSignature: { ...candidate.normalized.timeSignature, beatUnit: Math.max(1, Number(event.target.value) || 1) } })} />
        </Field>
        <Field>tick
          <input type="number" min="0" value={candidate.normalized.tick} onChange={(event) => onTimeChange(candidate.id, { ...candidate.normalized, tick: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
      </FieldGrid>)}
      {tempoCandidates.map((candidate) => <FieldGrid key={candidate.id}>
        <Field>BPM（原認識: {candidate.raw}）
          <input type="number" min="1" value={candidate.normalized.bpm} onChange={(event) => onTempoChange(candidate.id, { ...candidate.normalized, bpm: Math.max(1, Number(event.target.value) || 1) })} />
        </Field>
        <Field>tick
          <input type="number" min="0" value={candidate.normalized.tick} onChange={(event) => onTempoChange(candidate.id, { ...candidate.normalized, tick: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
      </FieldGrid>)}
    </Card>
  );
}

export default ImportReview;
