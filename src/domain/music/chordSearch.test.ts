import { describe, expect, it } from 'vitest';
import { chordMatchesQuery, normalizeChordQuery } from './chordSearch';
import { chords } from '../../data/chords';
import type { ChordDefinition } from './types';

const cSharpMajor7: ChordDefinition = { root: 'C#', type: 'major7', notes: ['C#', 'F', 'G#', 'C'] };

describe('normalizeChordQuery', () => {
  it('normalizes flat root spellings to their canonical sharp form', () => {
    expect(normalizeChordQuery('Db')).toBe('c#');
    expect(normalizeChordQuery('D♭')).toBe('c#');
    expect(normalizeChordQuery('Eb')).toBe('d#');
    expect(normalizeChordQuery('E♭')).toBe('d#');
    expect(normalizeChordQuery('Gb')).toBe('f#');
    expect(normalizeChordQuery('G♭')).toBe('f#');
    expect(normalizeChordQuery('Ab')).toBe('g#');
    expect(normalizeChordQuery('A♭')).toBe('g#');
    expect(normalizeChordQuery('Bb')).toBe('a#');
    expect(normalizeChordQuery('B♭')).toBe('a#');
  });

  it('normalizes sharp accidental symbol variants', () => {
    expect(normalizeChordQuery('C#')).toBe('c#');
    expect(normalizeChordQuery('C♯')).toBe('c#');
  });

  it('keeps a trailing quality shorthand intact while normalizing the root', () => {
    expect(normalizeChordQuery('Dbmaj7')).toBe('c#maj7');
    expect(normalizeChordQuery('D♭maj7')).toBe('c#maj7');
    expect(normalizeChordQuery('C#maj7')).toBe('c#maj7');
    expect(normalizeChordQuery('C♯maj7')).toBe('c#maj7');
    expect(normalizeChordQuery('Bbm7')).toBe('a#m7');
  });

  it('leaves natural-root queries and quality words unaffected', () => {
    expect(normalizeChordQuery('dim')).toBe('dim');
    expect(normalizeChordQuery('aug')).toBe('aug');
    expect(normalizeChordQuery('B7')).toBe('b7');
  });
});

describe('chordMatchesQuery', () => {
  it('matches a chord by its flat-spelled root the same as its sharp-spelled root', () => {
    expect(chordMatchesQuery(cSharpMajor7, 'C#')).toBe(true);
    expect(chordMatchesQuery(cSharpMajor7, 'Db')).toBe(true);
    expect(chordMatchesQuery(cSharpMajor7, 'D♭')).toBe(true);
    expect(chordMatchesQuery(cSharpMajor7, 'C♯')).toBe(true);
  });

  it('matches shorthand root+quality input regardless of enharmonic spelling', () => {
    expect(chordMatchesQuery(cSharpMajor7, 'Dbmaj7')).toBe(true);
    expect(chordMatchesQuery(cSharpMajor7, 'D♭maj7')).toBe(true);
    expect(chordMatchesQuery(cSharpMajor7, 'C#maj7')).toBe(true);
  });

  it('does not match a different quality on the same enharmonic root', () => {
    expect(chordMatchesQuery(cSharpMajor7, 'Dbm7')).toBe(false);
    expect(chordMatchesQuery(cSharpMajor7, 'Db7')).toBe(false);
  });

  it('does not match an unrelated root', () => {
    expect(chordMatchesQuery(cSharpMajor7, 'Eb')).toBe(false);
  });

  it('treats an empty query as matching everything', () => {
    expect(chordMatchesQuery(cSharpMajor7, '')).toBe(true);
    expect(chordMatchesQuery(cSharpMajor7, '   ')).toBe(true);
  });
});

describe('chordMatchesQuery against the full chord list (no duplication)', () => {
  const search = (query: string) => chords.filter((chord) => chordMatchesQuery(chord, query));

  it('returns the identical set of chords for enharmonic root spellings', () => {
    const sharpResults = search('C#');
    const flatResults = search('Db');
    const unicodeFlatResults = search('D♭');

    // flat/unicode-flat spellings must surface exactly the same matches as the
    // canonical sharp spelling, with no enharmonic duplicates on top
    expect(flatResults).toEqual(sharpResults);
    expect(unicodeFlatResults).toEqual(sharpResults);

    const rootChords = sharpResults.filter((chord) => chord.root === 'C#');
    expect(rootChords).toHaveLength(7);
  });

  it('returns exactly one chord for a flat-spelled shorthand query', () => {
    const results = search('Dbmaj7');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ root: 'C#', type: 'major7' });
  });
});
