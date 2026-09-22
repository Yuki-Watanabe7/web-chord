import { describe, expect, it } from 'vitest';
import {
  chordSymbolToDefinition,
  formatStructuredChordSymbolInKey,
  getChordSymbolNotes,
  parseChordSymbol,
  serializeChordSymbol,
  transposeChordSymbol,
} from './chordSymbol';

describe('parseChordSymbol', () => {
  it('keeps the exact score text while normalizing ASCII and music accidental glyphs', () => {
    const ascii = parseChordSymbol('F#m7b5/A#');
    const music = parseChordSymbol('F♯m7♭5/A♯');

    expect(ascii.raw).toBe('F#m7b5/A#');
    expect(music.raw).toBe('F♯m7♭5/A♯');
    expect(ascii.normalized).toBe(music.normalized);
    expect(ascii).toMatchObject({
      root: { step: 'F', alter: 1 },
      kind: 'half-diminished',
      extension: 7,
      bass: { step: 'A', alter: 1 },
      warnings: [],
    });
  });

  it.each([
    ['C', 'major', undefined],
    ['Cm', 'minor', undefined],
    ['Cdim', 'diminished', undefined],
    ['Caug', 'augmented', undefined],
    ['C6', 'major', 6],
    ['C7', 'dominant', 7],
    ['Cmaj7', 'major', 7],
    ['Cm7', 'minor', 7],
    ['Csus2', 'suspended-second', undefined],
    ['Csus4', 'suspended-fourth', undefined],
    ['Cm7b5', 'half-diminished', 7],
  ] as const)('parses %s into its core kind and extension', (raw, kind, extension) => {
    expect(parseChordSymbol(raw)).toMatchObject({ raw, kind, extension, warnings: [] });
  });

  it('keeps additions, alterations, omissions, and a slash bass as separate degrees', () => {
    const parsed = parseChordSymbol('C7(♭5,♭9,#9,omit3)/E');

    expect(parsed).toMatchObject({
      kind: 'dominant',
      extension: 7,
      bass: { step: 'E', alter: 0 },
      degrees: [
        { value: 5, alter: -1, type: 'alter' },
        { value: 9, alter: -1, type: 'alter' },
        { value: 9, alter: 1, type: 'alter' },
        { value: 3, alter: 0, type: 'subtract' },
      ],
      warnings: [],
    });
    expect(getChordSymbolNotes(parsed)).toEqual(['C', 'A#', 'F#', 'C#', 'D#']);
    expect(getChordSymbolNotes(parseChordSymbol('Cadd9'))).toEqual(['C', 'E', 'G', 'D']);
  });

  it('models no-chord and unknown symbols without substituting a different chord', () => {
    const noChord = parseChordSymbol('N.C.');
    const unknown = parseChordSymbol('C7alt');

    expect(noChord).toMatchObject({ kind: 'none', raw: 'N.C.', warnings: [] });
    expect(getChordSymbolNotes(noChord)).toEqual([]);
    expect(unknown).toMatchObject({ kind: 'other', raw: 'C7alt' });
    expect(unknown.warnings[0]?.code).toBe('ambiguous-symbol');
    expect(getChordSymbolNotes(unknown)).toEqual([]);
    expect(serializeChordSymbol(unknown)).toBe('C7alt');
  });
});

describe('structured chord notation integration', () => {
  it('keeps the source spelling for JSON while using the song key for display', () => {
    const parsed = parseChordSymbol('C#m7/G#');

    expect(serializeChordSymbol(parsed)).toBe('C#m7/G#');
    expect(formatStructuredChordSymbolInKey(parsed, { tonic: 'F', mode: 'minor' })).toBe('D♭m7/A♭');
  });

  it('transposes root and bass but preserves extension and degree information', () => {
    const original = parseChordSymbol('F#m7♭5(add9)/A#');
    const transposed = transposeChordSymbol(original, 2);

    expect(transposed).toMatchObject({
      root: { step: 'G', alter: 1 },
      bass: { step: 'C', alter: 0 },
      kind: 'half-diminished',
      extension: 7,
      degrees: [{ value: 9, alter: 0, type: 'add' }],
    });
    expect(transposed.raw).toBe('G#m7b5add9/C');
  });

  it('creates an editor-compatible definition without losing structured data', () => {
    const symbol = parseChordSymbol('B♭sus4(add9)/F');
    const definition = chordSymbolToDefinition(symbol);

    expect(definition).toMatchObject({
      root: 'A#',
      type: 'major',
      bass: 'F',
      chordSymbol: symbol,
      notes: ['A#', 'D#', 'F', 'C'],
    });
  });
});
