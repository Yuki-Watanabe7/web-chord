import {
  chordPitchToNoteName,
  formatChordPitch,
  normalizeChordSymbolText,
} from './chordSymbol';
import { pitchClassToNoteName, normalizePitchClass } from './pitchClass';
import { resolveTicksPerQuarterForMusicXml } from './timing';
import { DEFAULT_TICKS_PER_QUARTER, type ChordExtension, type ChordKind, type ChordPitch, type ChordStep, type ChordSymbol, type NoteName, type SongKey, type TimeSignature } from './types';
import type {
  ImportCandidate,
  ImportDraft,
  ImportIssue,
  ImportLinearMeasure,
  ImportReviewStatus,
  ImportScorePart,
  ImportScoreMeasureStructure,
  ImportSourceLocation,
  ImportedChord,
  ImportedKeySignature,
  ImportedMelodyNote,
  ImportedTempo,
  ImportedTimeSignature,
  MelodyCandidateGroup,
} from './importDraft';
import { IMPORT_DRAFT_VERSION } from './importDraft';

export interface MusicXmlImportOptions {
  fileName?: string;
}

interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

interface PartDefinition {
  id: string;
  name: string;
  index: number;
}

interface TieMarker {
  type: 'start' | 'continue' | 'stop';
}

interface ParsedNote {
  measureIndex: number;
  offsetTicks: number;
  durationTicks: number;
  pitch: NoteName;
  octave: number;
  raw: string;
  staff: number;
  voice: string;
  isGrace: boolean;
  tie?: TieMarker;
  timeModification?: { actualNotes: number; normalNotes: number };
}

interface ParsedHarmony {
  measureIndex: number;
  offsetTicks: number;
  raw: string;
  chord: Omit<ImportedChord, 'startTick' | 'durationTicks'>;
  staff: number;
  voice: string;
}

interface ParsedChange<T> {
  measureIndex: number;
  offsetTicks: number;
  raw: string;
  value: T;
  element: string;
}

interface EndingMarker {
  type: string;
  numbers: number[];
}

interface MeasureDirections {
  segno?: string;
  coda?: string;
  dacapo: boolean;
  dalsegno?: string;
  tocoda?: string;
  fine: boolean;
}

interface ParsedMeasure {
  index: number;
  number: string;
  durationTicks: number;
  forwardRepeat: boolean;
  backwardRepeatTimes?: number;
  endings: EndingMarker[];
  directions: MeasureDirections;
}

interface ParsedPart {
  definition: PartDefinition;
  measures: ParsedMeasure[];
  notes: ParsedNote[];
  harmonies: ParsedHarmony[];
  keySignatures: ParsedChange<SongKey>[];
  timeSignatures: ParsedChange<TimeSignature>[];
  tempos: ParsedChange<number>[];
}

interface ExpandedMeasure extends ImportLinearMeasure {
  sourceMeasureIndex: number;
}

interface ExpandedNote extends ParsedNote {
  startTick: number;
  source: ImportSourceLocation;
  id: string;
}

interface ExpandedHarmony extends ParsedHarmony {
  startTick: number;
  endTick: number;
  source: ImportSourceLocation;
  id: string;
  partIndex: number;
}

const DEFAULT_SIGNATURE: TimeSignature = { beatsPerMeasure: 4, beatUnit: 4 };

const localName = (value: string) => {
  const parts = value.split(':');
  return (parts[parts.length - 1] ?? value).toLowerCase();
};

const decodeXml = (value: string) => value
  .replace(/&(?:apos|#39);/g, "'")
  .replace(/&(?:quot|#34);/g, '"')
  .replace(/&(?:amp|#38);/g, '&')
  .replace(/&(?:lt|#60);/g, '<')
  .replace(/&(?:gt|#62);/g, '>')
  .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));

/** A deliberately small, dependency-free XML reader for MusicXML's tree-shaped score data. */
const parseXml = (xml: string): XmlNode => {
  const root: XmlNode = { name: '__root__', attributes: {}, children: [], text: '' };
  const stack = [root];
  const tags = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/?[^>]+>/g;
  let cursor = 0;

  const appendText = (value: string) => {
    const current = stack[stack.length - 1];
    if (value.length > 0 && current) current.text += decodeXml(value);
  };

  for (const match of xml.matchAll(tags)) {
    appendText(xml.slice(cursor, match.index));
    cursor = (match.index ?? 0) + match[0].length;
    const token = match[0];

    if (token.startsWith('<!--') || token.startsWith('<?') || token.startsWith('<!DOCTYPE')) continue;
    if (token.startsWith('<![CDATA[')) {
      appendText(token.slice(9, -3));
      continue;
    }
    if (token.startsWith('</')) {
      const closingName = localName(token.slice(2, -1).trim());
      const current = stack[stack.length - 1];
      if (!current || current.name !== closingName) {
        throw new Error(`XMLの閉じタグ ${closingName} が対応していません。`);
      }
      stack.pop();
      continue;
    }
    if (token.startsWith('<!')) continue;

    const selfClosing = /\/\s*>$/.test(token);
    const body = token.slice(1, selfClosing ? -2 : -1).trim();
    const nameMatch = /^([^\s/>]+)/.exec(body);
    if (!nameMatch) throw new Error('XML要素名を読み取れません。');
    const attributes: Record<string, string> = {};
    const attributeText = body.slice(nameMatch[0].length);
    const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const attribute of attributeText.matchAll(attributePattern)) {
      attributes[localName(attribute[1])] = decodeXml(attribute[2] ?? attribute[3] ?? '');
    }
    const node: XmlNode = { name: localName(nameMatch[1]), attributes, children: [], text: '' };
    stack[stack.length - 1]?.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  appendText(xml.slice(cursor));

  if (stack.length !== 1) throw new Error('XMLの開始タグが閉じられていません。');
  if (root.children.length !== 1) throw new Error('MusicXMLのルート要素を特定できません。');
  return root.children[0];
};

const children = (node: XmlNode, name: string) => node.children.filter((child) => child.name === name);
const child = (node: XmlNode, name: string) => children(node, name)[0];
const descendants = (node: XmlNode, name: string): XmlNode[] => node.children.flatMap((item) => [
  ...(item.name === name ? [item] : []),
  ...descendants(item, name),
]);
const text = (node: XmlNode | undefined): string => node
  ? `${node.text}${node.children.map((item) => text(item)).join('')}`.trim()
  : '';
const childText = (node: XmlNode, name: string) => text(child(node, name));
const integer = (value: string | undefined) => {
  const result = Number(value);
  return Number.isInteger(result) ? result : undefined;
};
const positiveInteger = (value: string | undefined) => {
  const result = integer(value);
  return result && result > 0 ? result : undefined;
};
const compareText = (first: string, second: string) => first === second ? 0 : first < second ? -1 : 1;
const compareVoice = (first: string, second: string) => {
  const firstNumber = Number(first);
  const secondNumber = Number(second);
  return Number.isInteger(firstNumber) && Number.isInteger(secondNumber)
    ? firstNumber - secondNumber || compareText(first, second)
    : compareText(first, second);
};

const hashText = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const sourceLocation = (
  part: PartDefinition,
  measure: ParsedMeasure | undefined,
  element: string,
  extra: Pick<ImportSourceLocation, 'staff' | 'voice' | 'occurrence'> = {},
): ImportSourceLocation => ({
  partId: part.id,
  partName: part.name,
  measureIndex: measure?.index ?? 0,
  measureNumber: measure?.number ?? String((measure?.index ?? 0) + 1),
  element,
  ...extra,
});

const pushIssue = (issues: ImportIssue[], severity: ImportIssue['severity'], code: string, message: string, source?: ImportSourceLocation) => {
  issues.push({ severity, code, message, source });
};

const fifthsToKey = (fifths: number, mode: string): SongKey => {
  const minor = mode.toLowerCase() === 'minor';
  return {
    tonic: pitchClassToNoteName(normalizePitchClass(fifths * 7 + (minor ? 9 : 0))),
    mode: minor ? 'minor' : 'major',
  };
};

const alterText = (alter: number) => alter < 0 ? '♭'.repeat(-alter) : alter > 0 ? '♯'.repeat(alter) : '';
const isChordStep = (value: string): value is ChordStep => ['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(value);
const asChordPitch = (stepValue: string, alterValue: number, issues: ImportIssue[], source: ImportSourceLocation): ChordPitch | undefined => {
  const step = stepValue.toUpperCase();
  if (!isChordStep(step)) {
    pushIssue(issues, 'warning', 'invalid-pitch-step', '音名のstepを読み取れませんでした。', source);
    return undefined;
  }
  if (!Number.isInteger(alterValue) || alterValue < -2 || alterValue > 2) {
    pushIssue(issues, 'warning', 'unsupported-accidental', '二重変化記号を超えるalterは正規化できませんでした。', source);
    return undefined;
  }
  return { step, alter: alterValue as ChordPitch['alter'] };
};

const musicXmlKind = (value: string): Pick<ChordSymbol, 'kind' | 'extension'> | null => {
  switch (value.trim().toLowerCase()) {
    case 'major': return { kind: 'major' };
    case 'minor': return { kind: 'minor' };
    case 'augmented': return { kind: 'augmented' };
    case 'diminished': return { kind: 'diminished' };
    case 'dominant': return { kind: 'dominant', extension: 7 };
    case 'major-sixth': return { kind: 'major', extension: 6 };
    case 'minor-sixth': return { kind: 'minor', extension: 6 };
    case 'major-seventh': return { kind: 'major', extension: 7 };
    case 'minor-seventh': return { kind: 'minor', extension: 7 };
    case 'dominant-ninth': return { kind: 'dominant', extension: 9 };
    case 'major-ninth': return { kind: 'major', extension: 9 };
    case 'minor-ninth': return { kind: 'minor', extension: 9 };
    case 'dominant-11th': return { kind: 'dominant', extension: 11 };
    case 'major-11th': return { kind: 'major', extension: 11 };
    case 'minor-11th': return { kind: 'minor', extension: 11 };
    case 'dominant-13th': return { kind: 'dominant', extension: 13 };
    case 'major-13th': return { kind: 'major', extension: 13 };
    case 'minor-13th': return { kind: 'minor', extension: 13 };
    case 'suspended-second': return { kind: 'suspended-second' };
    case 'suspended-fourth': return { kind: 'suspended-fourth' };
    case 'half-diminished': return { kind: 'half-diminished', extension: 7 };
    case 'none': return { kind: 'none' };
    default: return null;
  }
};

const defaultSuffix = (kind: ChordKind, extension: ChordExtension | undefined) => {
  if (kind === 'none') return 'N.C.';
  if (kind === 'half-diminished') return 'm7♭5';
  if (kind === 'suspended-second') return extension ? `${extension}sus2` : 'sus2';
  if (kind === 'suspended-fourth') return extension ? `${extension}sus4` : 'sus4';
  if (kind === 'dominant') return String(extension ?? 7);
  if (kind === 'major') return extension === 6 ? '6' : extension ? `maj${extension}` : '';
  if (kind === 'minor') return extension ? `m${extension}` : 'm';
  if (kind === 'diminished') return extension ? `dim${extension}` : 'dim';
  return extension ? `aug${extension}` : 'aug';
};

const parseTie = (note: XmlNode): TieMarker | undefined => {
  const types = [
    ...children(note, 'tie').map((item) => item.attributes.type),
    ...descendants(child(note, 'notations') ?? note, 'tied').map((item) => item.attributes.type),
  ].map((value) => value?.toLowerCase());
  const starts = types.includes('start');
  const stops = types.includes('stop');
  if (starts && stops) return { type: 'continue' };
  if (starts) return { type: 'start' };
  if (stops) return { type: 'stop' };
  return undefined;
};

const parseDirections = (measureNode: XmlNode): MeasureDirections => {
  const result: MeasureDirections = { dacapo: false, fine: false };
  children(measureNode, 'direction').forEach((direction) => {
    const sound = descendants(direction, 'sound')[0];
    const directionWords = descendants(direction, 'words').map((item) => text(item)).join(' ').replace(/\s+/g, ' ').trim();
    const lowerWords = directionWords.toLowerCase();
    const segno = descendants(direction, 'segno')[0];
    const coda = descendants(direction, 'coda')[0];
    if (segno) result.segno = segno.attributes.id || sound?.attributes.segno || 'default';
    if (coda) result.coda = coda.attributes.id || sound?.attributes.coda || 'default';
    if (sound?.attributes.dacapo === 'yes' || /\bd\.?c\.?\b/.test(lowerWords)) result.dacapo = true;
    if (sound?.attributes.dalsegno || /\bd\.?s\.?\b/.test(lowerWords)) result.dalsegno = sound?.attributes.dalsegno || 'default';
    if (sound?.attributes.tocoda || /to\s+coda/i.test(directionWords)) result.tocoda = sound?.attributes.tocoda || 'default';
    if (sound?.attributes.fine === 'yes' || /^fine$/i.test(directionWords)) result.fine = true;
  });
  return result;
};

const parseEndings = (measureNode: XmlNode): EndingMarker[] => descendants(measureNode, 'ending').map((ending) => ({
  type: ending.attributes.type?.toLowerCase() ?? '',
  numbers: (ending.attributes.number ?? '').split(/[\s,]+/).flatMap((value) => {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(value);
    if (range) return Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, index) => Number(range[1]) + index);
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? [parsed] : [];
  }),
}));

const parseRepeat = (measureNode: XmlNode) => {
  let forwardRepeat = false;
  let backwardRepeatTimes: number | undefined;
  descendants(measureNode, 'barline').forEach((barline) => {
    const repeat = child(barline, 'repeat');
    const direction = repeat?.attributes.direction?.toLowerCase();
    if (direction === 'forward') forwardRepeat = true;
    if (direction === 'backward') backwardRepeatTimes = Math.max(2, positiveInteger(repeat?.attributes.times) ?? 2);
  });
  return { forwardRepeat, backwardRepeatTimes };
};

const parsePart = (
  node: XmlNode,
  definition: PartDefinition,
  ticksPerQuarter: number,
  issues: ImportIssue[],
): ParsedPart => {
  let divisions = 1;
  let signature = DEFAULT_SIGNATURE;
  const measures: ParsedMeasure[] = [];
  const notes: ParsedNote[] = [];
  const harmonies: ParsedHarmony[] = [];
  const keySignatures: ParsedChange<SongKey>[] = [];
  const timeSignatures: ParsedChange<TimeSignature>[] = [];
  const tempos: ParsedChange<number>[] = [];

  children(node, 'measure').forEach((measureNode, measureIndex) => {
    let cursorTicks = 0;
    let maxCursorTicks = 0;
    let previousNoteStart = 0;
    const number = measureNode.attributes.number ?? String(measureIndex + 1);
    const provisional: ParsedMeasure = {
      index: measureIndex,
      number,
      durationTicks: 0,
      ...parseRepeat(measureNode),
      endings: parseEndings(measureNode),
      directions: parseDirections(measureNode),
    };
    const location = (element: string, staff?: number, voice?: string) => sourceLocation(definition, provisional, element, { staff, voice });
    const durationToTicks = (duration: string | undefined, element: string, optional = false) => {
      const value = integer(duration);
      if (value === undefined || value < 0) {
        if (optional && (duration === undefined || duration.trim() === '')) return 0;
        pushIssue(issues, 'warning', 'invalid-duration', 'durationを整数として読み取れませんでした。', location(element));
        return 0;
      }
      if (ticksPerQuarter % divisions !== 0) {
        pushIssue(issues, 'error', 'unrepresentable-duration', 'divisionsを正規tickへ正確に変換できません。', location(element));
        return 0;
      }
      return value * (ticksPerQuarter / divisions);
    };

    measureNode.children.forEach((element) => {
      if (element.name === 'attributes') {
        const nextDivisions = positiveInteger(childText(element, 'divisions'));
        if (nextDivisions) divisions = nextDivisions;
        else if (child(element, 'divisions')) pushIssue(issues, 'warning', 'invalid-divisions', 'divisionsは正の整数ではありません。', location('divisions'));

        const timeNode = child(element, 'time');
        if (timeNode) {
          const beats = positiveInteger(childText(timeNode, 'beats'));
          const beatUnit = positiveInteger(childText(timeNode, 'beat-type'));
          if (beats && beatUnit) {
            signature = { beatsPerMeasure: beats, beatUnit };
            timeSignatures.push({ measureIndex, offsetTicks: cursorTicks, raw: `${beats}/${beatUnit}`, value: signature, element: 'time' });
          } else {
            pushIssue(issues, 'warning', 'invalid-time-signature', '拍子記号を読み取れませんでした。', location('time'));
          }
        }

        const keyNode = child(element, 'key');
        if (keyNode) {
          const fifths = integer(childText(keyNode, 'fifths'));
          if (fifths === undefined) pushIssue(issues, 'warning', 'invalid-key-signature', '調号のfifthsを読み取れませんでした。', location('key'));
          else {
            const key = fifthsToKey(fifths, childText(keyNode, 'mode'));
            keySignatures.push({ measureIndex, offsetTicks: cursorTicks, raw: `${fifths} ${key.mode}`, value: key, element: 'key' });
          }
        }
        return;
      }

      if (element.name === 'backup' || element.name === 'forward') {
        const duration = durationToTicks(childText(element, 'duration'), element.name);
        cursorTicks = element.name === 'backup' ? Math.max(0, cursorTicks - duration) : cursorTicks + duration;
        maxCursorTicks = Math.max(maxCursorTicks, cursorTicks);
        return;
      }

      if (element.name === 'direction') {
        const directionOffset = durationToTicks(childText(element, 'offset'), 'direction', true);
        const offset = cursorTicks + directionOffset;
        const sound = descendants(element, 'sound')[0];
        const metronome = descendants(element, 'metronome')[0];
        const tempoText = sound?.attributes.tempo ?? childText(metronome ?? element, 'per-minute');
        const bpm = Number(tempoText);
        if (Number.isFinite(bpm) && bpm > 0) tempos.push({ measureIndex, offsetTicks: offset, raw: tempoText, value: bpm, element: 'direction' });
        else if (sound?.attributes.tempo || metronome) pushIssue(issues, 'warning', 'invalid-tempo', 'テンポを読み取れませんでした。', location('direction'));
        return;
      }

      if (element.name === 'harmony') {
        const harmonyOffset = durationToTicks(childText(element, 'offset'), 'harmony', true);
        const staff = positiveInteger(childText(element, 'staff')) ?? 1;
        const voice = childText(element, 'voice') || '1';
        const harmonyLocation = location('harmony', staff, voice);
        const rootNode = child(element, 'root');
        const root = rootNode ? asChordPitch(childText(rootNode, 'root-step'), integer(childText(rootNode, 'root-alter')) ?? 0, issues, harmonyLocation) : undefined;
        const kindNode = child(element, 'kind');
        const mappedKind = musicXmlKind(text(kindNode));
        const bassNode = child(element, 'bass');
        const bass = bassNode ? asChordPitch(childText(bassNode, 'bass-step'), integer(childText(bassNode, 'bass-alter')) ?? 0, issues, harmonyLocation) : undefined;
        const degrees = children(element, 'degree').flatMap((degree) => {
          const value = positiveInteger(childText(degree, 'degree-value'));
          const type = childText(degree, 'degree-type').toLowerCase();
          if (!value || !['add', 'alter', 'subtract'].includes(type)) {
            pushIssue(issues, 'warning', 'unsupported-harmony-degree', 'コードのdegreeを読み取れませんでした。', harmonyLocation);
            return [];
          }
          return [{ value, alter: integer(childText(degree, 'degree-alter')) ?? 0, type: type as 'add' | 'alter' | 'subtract' }];
        });
        const kind: ChordKind = mappedKind?.kind ?? 'other';
        const extension = mappedKind?.extension;
        const rootText = root ? formatChordPitch(root) : '';
        const shownKind = kindNode?.attributes.text?.trim();
        const raw = shownKind && /^[A-Ga-g]/.test(shownKind)
          ? shownKind
          : kind === 'none' ? 'N.C.' : `${rootText}${shownKind || defaultSuffix(kind, extension)}${bass ? `/${formatChordPitch(bass)}` : ''}`;
        if (!root && kind !== 'none') pushIssue(issues, 'warning', 'missing-harmony-root', 'harmonyのrootがないため、原表記のみを保持します。', harmonyLocation);
        if (!mappedKind) pushIssue(issues, 'warning', 'unsupported-harmony-kind', `harmony kind「${text(kindNode)}」は正規化できませんでした。`, harmonyLocation);
        const chordSymbol: ChordSymbol = {
          raw,
          normalized: normalizeChordSymbolText(raw),
          root,
          bass,
          kind,
          extension,
          degrees,
          warnings: mappedKind && root ? [] : [{ code: 'unsupported-token', message: 'MusicXMLのharmonyを完全には解釈できませんでした。' }],
        };
        const legacy = chordPitchToNoteName(root) ?? 'C';
        harmonies.push({
          measureIndex,
          offsetTicks: cursorTicks + harmonyOffset,
          raw,
          chord: { root: legacy, quality: kind === 'minor' && extension === 7 ? 'minor7' : kind === 'dominant' ? 'dominant7' : kind === 'major' && extension === 7 ? 'major7' : kind === 'diminished' || kind === 'half-diminished' ? 'diminished' : kind === 'augmented' ? 'augmented' : kind === 'minor' ? 'minor' : 'major', bass: chordPitchToNoteName(bass), chordSymbol },
          staff,
          voice,
        });
        return;
      }

      if (element.name !== 'note') return;
      const staff = positiveInteger(childText(element, 'staff')) ?? 1;
      const voice = childText(element, 'voice') || '1';
      const isChordTone = Boolean(child(element, 'chord'));
      const isGrace = Boolean(child(element, 'grace'));
      const durationTicks = isGrace ? 0 : durationToTicks(childText(element, 'duration'), 'note');
      const start = isChordTone ? previousNoteStart : cursorTicks;
      if (!isChordTone) {
        previousNoteStart = start;
        if (!isGrace) cursorTicks += durationTicks;
      }
      maxCursorTicks = Math.max(maxCursorTicks, cursorTicks, start + durationTicks);
      if (child(element, 'rest')) return;
      const pitchNode = child(element, 'pitch');
      if (!pitchNode) {
        pushIssue(issues, 'warning', 'unsupported-note', 'pitchを持たない音符は主旋律候補から除外しました。', location('note', staff, voice));
        return;
      }
      const step = childText(pitchNode, 'step').toUpperCase();
      const alter = integer(childText(pitchNode, 'alter')) ?? 0;
      const octave = integer(childText(pitchNode, 'octave'));
      const pitch = asChordPitch(step, alter, issues, location('note', staff, voice));
      if (!pitch || octave === undefined) {
        pushIssue(issues, 'warning', 'invalid-note-pitch', '音高またはoctaveを読み取れませんでした。', location('note', staff, voice));
        return;
      }
      const modification = child(element, 'time-modification');
      const actualNotes = modification ? positiveInteger(childText(modification, 'actual-notes')) : undefined;
      const normalNotes = modification ? positiveInteger(childText(modification, 'normal-notes')) : undefined;
      notes.push({
        measureIndex,
        offsetTicks: start,
        durationTicks,
        pitch: chordPitchToNoteName(pitch)!,
        octave,
        raw: `${pitch.step}${alterText(pitch.alter)}${octave}`,
        staff,
        voice,
        isGrace,
        tie: parseTie(element),
        timeModification: actualNotes && normalNotes ? { actualNotes, normalNotes } : undefined,
      });
    });

    const expectedTicks = ticksPerQuarter * 4 * signature.beatsPerMeasure / signature.beatUnit;
    const pickup = measureIndex === 0 && measureNode.attributes.implicit?.toLowerCase() === 'yes' && maxCursorTicks > 0 && maxCursorTicks < expectedTicks;
    provisional.durationTicks = pickup ? maxCursorTicks : Math.max(expectedTicks, maxCursorTicks);
    if (!pickup && maxCursorTicks > 0 && maxCursorTicks < expectedTicks && measureNode.attributes.implicit?.toLowerCase() === 'yes') {
      pushIssue(issues, 'warning', 'unexpected-partial-measure', '弱起以外の不完全小節は拍子の長さへ展開しました。', location('measure'));
    }
    if (maxCursorTicks > expectedTicks) {
      pushIssue(issues, 'warning', 'measure-exceeds-time-signature', '小節内のduration合計が現在の拍子を超えています。', location('measure'));
    }
    measures.push(provisional);
  });

  return { definition, measures, notes, harmonies, keySignatures, timeSignatures, tempos };
};

const endingRanges = (measures: ParsedMeasure[]) => {
  const open = new Map<number, number>();
  const ranges: Array<{ start: number; end: number; numbers: number[] }> = [];
  measures.forEach((measure) => measure.endings.forEach((ending) => {
    ending.numbers.forEach((number) => {
      if (ending.type === 'start') open.set(number, measure.index);
      if (ending.type === 'stop' || ending.type === 'discontinue') {
        const start = open.get(number) ?? measure.index;
        ranges.push({ start, end: measure.index, numbers: [number] });
        open.delete(number);
      }
    });
  }));
  return ranges;
};

const includesEndingPass = (numbers: number[], pass: number) => numbers.includes(pass);
const nearestRepeatStart = (measures: ParsedMeasure[], index: number) => {
  for (let cursor = index; cursor >= 0; cursor -= 1) if (measures[cursor]?.forwardRepeat) return cursor;
  return 0;
};

/** Expands ordinary repeats, volta endings, D.C., D.S., Segno, Coda, and Fine into a bounded linear order. */
const expandPlaybackOrder = (measures: ParsedMeasure[], issues: ImportIssue[]) => {
  const order: number[] = [];
  const rangesByStart = new Map<number, { start: number; end: number; numbers: number[] }>();
  endingRanges(measures).forEach((range) => rangesByStart.set(range.start, range));
  const segnos = new Map<string, number>();
  const codas = new Map<string, number>();
  measures.forEach((measure) => {
    if (measure.directions.segno) segnos.set(measure.directions.segno, measure.index);
    if (measure.directions.coda) codas.set(measure.directions.coda, measure.index);
  });
  const repeatPass = new Map<number, number>();
  const backwardPass = new Map<number, number>();
  let index = 0;
  let didJump = false;
  let dacapoUsed = false;
  let dalsegnoUsed = false;
  let tocodaUsed = false;
  const maxSteps = Math.max(64, measures.length * 16);

  while (index >= 0 && index < measures.length && order.length < maxSteps) {
    const measure = measures[index]!;
    const repeatStart = nearestRepeatStart(measures, index);
    const range = rangesByStart.get(index);
    if (range && !includesEndingPass(range.numbers, repeatPass.get(repeatStart) ?? 1)) {
      index = range.end + 1;
      continue;
    }
    order.push(index);

    if (measure.directions.dacapo && !dacapoUsed) {
      dacapoUsed = true;
      didJump = true;
      index = 0;
      continue;
    }
    if (measure.directions.dalsegno && !dalsegnoUsed) {
      const target = segnos.get(measure.directions.dalsegno) ?? segnos.get('default');
      if (target === undefined) {
        pushIssue(issues, 'warning', 'missing-segno-target', 'D.S.のSegno位置を見つけられませんでした。', undefined);
      } else {
        dalsegnoUsed = true;
        didJump = true;
        index = target;
        continue;
      }
    }
    if (measure.directions.tocoda && didJump && !tocodaUsed) {
      const target = codas.get(measure.directions.tocoda) ?? codas.get('default');
      if (target === undefined) {
        pushIssue(issues, 'warning', 'missing-coda-target', 'To CodaのCoda位置を見つけられませんでした。', undefined);
      } else {
        tocodaUsed = true;
        index = target;
        continue;
      }
    }
    if (measure.directions.fine && didJump) break;

    if (measure.backwardRepeatTimes) {
      const pass = backwardPass.get(index) ?? 1;
      if (pass < measure.backwardRepeatTimes) {
        backwardPass.set(index, pass + 1);
        repeatPass.set(repeatStart, (repeatPass.get(repeatStart) ?? 1) + 1);
        index = repeatStart;
        continue;
      }
    }
    index += 1;
  }

  if (order.length >= maxSteps) {
    pushIssue(issues, 'error', 'playback-expansion-limit', '反復展開が上限に達しました。循環する反復記号を確認してください。', undefined);
  }
  return order;
};

const buildLinearMeasures = (reference: ParsedPart, issues: ImportIssue[]) => {
  const order = expandPlaybackOrder(reference.measures, issues);
  const occurrences = new Map<number, number>();
  let startTick = 0;
  return order.flatMap((sourceMeasureIndex, index): ExpandedMeasure[] => {
    const source = reference.measures[sourceMeasureIndex];
    if (!source) return [];
    const occurrence = (occurrences.get(sourceMeasureIndex) ?? 0) + 1;
    occurrences.set(sourceMeasureIndex, occurrence);
    const expanded: ExpandedMeasure = {
      index,
      sourceMeasureIndex,
      sourceMeasureNumber: source.number,
      occurrence,
      startTick,
      durationTicks: source.durationTicks,
    };
    startTick += source.durationTicks;
    return [expanded];
  });
};

const groupMelodyCandidates = (
  notes: Array<ImportCandidate<ImportedMelodyNote>>,
  partDefinitions: PartDefinition[],
) => {
  const groups = new Map<string, MelodyCandidateGroup>();
  notes.forEach((candidate) => {
    const { partId, partName = '', staff = 1, voice = '1' } = candidate.source;
    const id = `${partId}:${staff}:${voice}`;
    const existing = groups.get(id);
    if (existing) existing.noteCount += 1;
    else groups.set(id, { partId, partName, staff, voice, noteCount: 1, confidence: 0 });
  });
  const partIndex = new Map(partDefinitions.map((part) => [part.id, part.index]));
  return [...groups.values()].map((group) => ({
    ...group,
    confidence: Math.min(0.99, 0.55 + Math.min(group.noteCount, 24) / 80 + (/melody|vocal|voice|soprano/i.test(group.partName) ? 0.15 : 0)),
  })).sort((first, second) => {
    const firstNamed = /melody|vocal|voice|soprano/i.test(first.partName) ? 1 : 0;
    const secondNamed = /melody|vocal|voice|soprano/i.test(second.partName) ? 1 : 0;
    return secondNamed - firstNamed || second.noteCount - first.noteCount || first.staff - second.staff ||
      compareVoice(first.voice, second.voice) ||
      (partIndex.get(first.partId) ?? 0) - (partIndex.get(second.partId) ?? 0);
  });
};

const withTies = (notes: ExpandedNote[], issues: ImportIssue[]) => {
  const active = new Map<string, string>();
  return [...notes].sort((first, second) =>
    compareText(first.source.partId, second.source.partId) || first.staff - second.staff || compareVoice(first.voice, second.voice) || first.startTick - second.startTick || compareText(first.id, second.id),
  ).map((note): ImportCandidate<ImportedMelodyNote> => {
    const key = `${note.source.partId}:${note.staff}:${note.voice}:${note.pitch}:${note.octave}`;
    let tie: ImportedMelodyNote['tie'];
    if (note.tie?.type === 'start') {
      const id = `tie:${key}:${note.startTick}`;
      active.set(key, id);
      tie = { id, type: 'start' };
    } else if (note.tie?.type === 'continue') {
      const id = active.get(key);
      if (!id) pushIssue(issues, 'warning', 'unpaired-tie', '開始位置がないtieを検出しました。', note.source);
      else tie = { id, type: 'continue' };
    } else if (note.tie?.type === 'stop') {
      const id = active.get(key);
      if (!id) pushIssue(issues, 'warning', 'unpaired-tie', '開始位置がないtieを検出しました。', note.source);
      else {
        tie = { id, type: 'stop' };
        active.delete(key);
      }
    }
    return {
      id: note.id,
      normalized: {
        pitch: note.pitch,
        octave: note.octave,
        startTick: note.startTick,
        durationTicks: note.durationTicks,
        velocity: 0.8,
        tie,
        isGrace: note.isGrace,
        timeModification: note.timeModification,
      },
      raw: note.raw,
      source: note.source,
      reviewStatus: 'unselected',
    };
  });
};

const failedDraft = (xml: string, fileName: string, issue: ImportIssue): ImportDraft => ({
  version: IMPORT_DRAFT_VERSION,
  source: { fileName, hash: hashText(xml), generators: [] },
  ticksPerQuarter: DEFAULT_TICKS_PER_QUARTER,
  score: { parts: [], sourceMeasures: [], linearMeasures: [] },
  candidates: { melodyNotes: [], chords: [], keySignatures: [], timeSignatures: [], tempos: [] },
  melodySelection: { alternatives: [], status: 'unselected' },
  issues: [issue],
});

/**
 * Converts a MusicXML document into a deterministic review draft. It never
 * writes localStorage and never creates a Song; use confirmImportDraftToSong
 * only after showing validateImportDraft's result to the user.
 */
export const parseMusicXmlToImportDraft = (xml: string, options: MusicXmlImportOptions = {}): ImportDraft => {
  const fileName = options.fileName ?? 'score.musicxml';
  let root: XmlNode;
  try {
    root = parseXml(xml);
  } catch (error) {
    return failedDraft(xml, fileName, {
      severity: 'error',
      code: 'invalid-xml',
      message: error instanceof Error ? `MusicXMLを解析できません: ${error.message}` : 'MusicXMLを解析できません。',
    });
  }
  if (root.name !== 'score-partwise') {
    return failedDraft(xml, fileName, {
      severity: 'error',
      code: 'unsupported-score-layout',
      message: 'score-partwise形式のMusicXMLのみ対応しています。',
    });
  }

  const issues: ImportIssue[] = [];
  const partList = child(root, 'part-list');
  const definitions = children(partList ?? root, 'score-part').map((part, index): PartDefinition => ({
    id: part.attributes.id || `part-${index + 1}`,
    name: childText(part, 'part-name') || `Part ${index + 1}`,
    index,
  }));
  const parts = children(root, 'part').map((part, index) => {
    const id = part.attributes.id || `part-${index + 1}`;
    return { node: part, definition: definitions.find((definition) => definition.id === id) ?? { id, name: `Part ${index + 1}`, index } };
  });
  const divisions = descendants(root, 'divisions').flatMap((node) => {
    const value = positiveInteger(text(node));
    return value ? [value] : [];
  });
  let ticksPerQuarter = DEFAULT_TICKS_PER_QUARTER;
  try {
    ticksPerQuarter = resolveTicksPerQuarterForMusicXml(divisions.length > 0 ? divisions : [1]);
  } catch {
    pushIssue(issues, 'error', 'invalid-divisions', 'MusicXMLのdivisionsをtickへ変換できません。');
  }
  const parsedParts = parts.map((part) => parsePart(part.node, part.definition, ticksPerQuarter, issues));
  const reference = parsedParts[0];
  if (!reference) {
    return failedDraft(xml, fileName, { severity: 'error', code: 'no-parts', message: 'MusicXMLにpartがありません。' });
  }
  const linearMeasures = buildLinearMeasures(reference, issues);
  const measuresBySource = new Map<number, ExpandedMeasure[]>();
  linearMeasures.forEach((measure) => {
    const matching = measuresBySource.get(measure.sourceMeasureIndex) ?? [];
    matching.push(measure);
    measuresBySource.set(measure.sourceMeasureIndex, matching);
  });

  const expandedNotes: ExpandedNote[] = [];
  const expandedHarmonies: ExpandedHarmony[] = [];
  parsedParts.forEach((part) => {
    part.notes.forEach((note, noteIndex) => (measuresBySource.get(note.measureIndex) ?? []).forEach((measure) => {
      const sourceMeasure = part.measures[note.measureIndex];
      if (!sourceMeasure) return;
      expandedNotes.push({
        ...note,
        startTick: measure.startTick + note.offsetTicks,
        source: sourceLocation(part.definition, sourceMeasure, 'note', { staff: note.staff, voice: note.voice, occurrence: measure.occurrence }),
        id: `melody:${part.definition.id}:${note.measureIndex}:${measure.occurrence}:${note.offsetTicks}:${noteIndex}`,
      });
    }));
    part.harmonies.forEach((harmony, harmonyIndex) => (measuresBySource.get(harmony.measureIndex) ?? []).forEach((measure) => {
      const sourceMeasure = part.measures[harmony.measureIndex];
      if (!sourceMeasure) return;
      expandedHarmonies.push({
        ...harmony,
        startTick: measure.startTick + harmony.offsetTicks,
        endTick: measure.startTick + measure.durationTicks,
        source: sourceLocation(part.definition, sourceMeasure, 'harmony', { staff: harmony.staff, voice: harmony.voice, occurrence: measure.occurrence }),
        id: `chord:${part.definition.id}:${harmony.measureIndex}:${measure.occurrence}:${harmony.offsetTicks}:${harmonyIndex}`,
        partIndex: part.definition.index,
      });
    }));
  });
  const melodyNotes = withTies(expandedNotes, issues);
  const melodyGroups = groupMelodyCandidates(melodyNotes, parts.map((part) => part.definition));
  const selectedMelody = melodyGroups[0];
  if (melodyGroups.length > 1) {
    pushIssue(issues, 'warning', 'multiple-melody-candidates', '複数の主旋律候補を検出しました。最も確からしい候補を自動選択しています。');
  }
  const reviewedMelodyNotes = melodyNotes.map((candidate) => ({
    ...candidate,
    confidence: melodyGroups.find((group) => group.partId === candidate.source.partId && group.staff === candidate.source.staff && group.voice === candidate.source.voice)?.confidence,
    reviewStatus: candidate.source.partId === selectedMelody?.partId && candidate.source.staff === selectedMelody.staff && candidate.source.voice === selectedMelody.voice
      ? 'auto-selected' as ImportReviewStatus
      : 'unselected' as ImportReviewStatus,
  }));

  const chords = [...expandedHarmonies].sort((first, second) => first.startTick - second.startTick || first.partIndex - second.partIndex || compareText(first.id, second.id))
    .map((harmony, index, all): ImportCandidate<ImportedChord> => {
      const next = all.slice(index + 1).find((item) => item.partIndex === harmony.partIndex && item.startTick > harmony.startTick && item.startTick < harmony.endTick);
      return {
        id: harmony.id,
        normalized: { ...harmony.chord, startTick: harmony.startTick, durationTicks: Math.max(0, (next?.startTick ?? harmony.endTick) - harmony.startTick) },
        raw: harmony.raw,
        source: harmony.source,
        reviewStatus: 'auto-selected',
      };
    });
  const chordByTick = new Map<number, ImportCandidate<ImportedChord>>();
  const reviewedChords = chords.map((candidate) => {
    const existing = chordByTick.get(candidate.normalized.startTick);
    if (!existing) {
      chordByTick.set(candidate.normalized.startTick, candidate);
      return candidate;
    }
    pushIssue(issues, 'warning', 'multiple-chord-candidates', '同じtickに複数のコード候補があります。先頭の候補を自動選択しました。', candidate.source);
    return { ...candidate, reviewStatus: 'unselected' as ImportReviewStatus };
  });

  const makeChanges = <T, U>(
    changes: ParsedChange<T>[],
    element: string,
    create: (change: ParsedChange<T>, tick: number) => U,
  ): Array<ImportCandidate<U>> => changes.flatMap((change, changeIndex) => (measuresBySource.get(change.measureIndex) ?? []).map((measure): ImportCandidate<U> => ({
    id: `${element}:${change.measureIndex}:${measure.occurrence}:${change.offsetTicks}:${changeIndex}`,
    normalized: create(change, measure.startTick + change.offsetTicks),
    raw: change.raw,
    source: sourceLocation(reference.definition, reference.measures[change.measureIndex], change.element, { occurrence: measure.occurrence }),
    reviewStatus: 'auto-selected',
  })));
  const timeSignatures = makeChanges<TimeSignature, ImportedTimeSignature>(reference.timeSignatures, 'time', (change, tick) => ({ tick, timeSignature: change.value }));
  const keySignatures = makeChanges<SongKey, ImportedKeySignature>(reference.keySignatures, 'key', (change, tick) => ({ tick, key: change.value }));
  const tempos = makeChanges<number, ImportedTempo>(reference.tempos, 'tempo', (change, tick) => ({ tick, bpm: change.value }));
  const generators = descendants(root, 'software').map((node) => text(node)).filter(Boolean);
  const omrEngine = generators.find((generator) => /audiveris|omr|smartscore|photoscore/i.test(generator));
  const scoreParts: ImportScorePart[] = parsedParts.map((part) => ({
    id: part.definition.id,
    name: part.definition.name,
    measureCount: part.measures.length,
    staves: [...new Map(part.notes.map((note) => [note.staff, new Set<string>() as Set<string>])).entries()].map(([staff, voices]) => {
      part.notes.filter((note) => note.staff === staff).forEach((note) => voices.add(note.voice));
      return { staff, voices: [...voices].sort(compareVoice) };
    }).sort((first, second) => first.staff - second.staff),
  }));
  const sourceMeasures: ImportScoreMeasureStructure[] = parsedParts.flatMap((part) => part.measures.map((measure) => ({
    partId: part.definition.id,
    measureIndex: measure.index,
    measureNumber: measure.number,
    durationTicks: measure.durationTicks,
    repeat: { forward: measure.forwardRepeat, backwardTimes: measure.backwardRepeatTimes },
    endings: measure.endings.map((ending) => ({ type: ending.type, numbers: [...ending.numbers] })),
    directions: { ...measure.directions },
  })));

  return {
    version: IMPORT_DRAFT_VERSION,
    source: { fileName, hash: hashText(xml), musicXmlVersion: root.attributes.version, generators, omrEngine },
    ticksPerQuarter,
    score: { parts: scoreParts, sourceMeasures, linearMeasures },
    candidates: { melodyNotes: reviewedMelodyNotes, chords: reviewedChords, keySignatures, timeSignatures, tempos },
    melodySelection: {
      selected: selectedMelody ? { partId: selectedMelody.partId, staff: selectedMelody.staff, voice: selectedMelody.voice } : undefined,
      alternatives: melodyGroups,
      status: selectedMelody ? 'auto-selected' : 'unselected',
    },
    issues,
  };
};

/** Browser adapter for a user-selected .musicxml/.xml file. It only reads the supplied file. */
export const parseMusicXmlFileToImportDraft = async (
  file: Pick<File, 'name' | 'text'>,
): Promise<ImportDraft> => parseMusicXmlToImportDraft(await file.text(), { fileName: file.name });
