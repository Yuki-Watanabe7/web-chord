import { describe, expect, it } from 'vitest';
import { formatTimelineChordLabel } from './chordLabels';
import type { SongKey } from './types';

const cMajorKey = { tonic: 'C', mode: 'major' } satisfies SongKey;

describe('formatTimelineChordLabel', () => {
  it('uses a compact symbol for a one-beat major chord', () => {
    expect(
      formatTimelineChordLabel(
        { root: 'C', quality: 'major' },
        'symbol',
        cMajorKey,
        1,
      ),
    ).toEqual({
      full: 'C major',
      visible: { primary: 'C' },
    });
  });

  it('keeps sharp-side roots readable in a one-beat chord', () => {
    expect(
      formatTimelineChordLabel(
        { root: 'C#', quality: 'major' },
        'symbol',
        cMajorKey,
        1,
      ),
    ).toEqual({
      full: 'C♯ major',
      visible: { primary: 'C♯' },
    });
  });

  it('keeps quality suffixes in one-beat chord symbols', () => {
    expect(
      formatTimelineChordLabel(
        { root: 'C', quality: 'minor7' },
        'symbol',
        cMajorKey,
        1,
      ),
    ).toEqual({
      full: 'C minor7',
      visible: { primary: 'Cm7' },
    });
  });

  it('splits one-beat slash chords across two display lines', () => {
    expect(
      formatTimelineChordLabel(
        { root: 'C#', quality: 'major7', bass: 'G#' },
        'symbol',
        cMajorKey,
        1,
      ),
    ).toEqual({
      full: 'C♯ major7/G♯',
      visible: { primary: 'C♯maj7', secondary: '/G♯' },
    });
  });

  it('keeps roman numerals readable in one-beat display', () => {
    expect(
      formatTimelineChordLabel(
        { root: 'G', quality: 'major7' },
        'roman',
        cMajorKey,
        1,
      ),
    ).toEqual({
      full: 'Vmaj7',
      visible: { primary: 'Vmaj7' },
    });
  });

  it('splits roman-numeral slash chords across two display lines', () => {
    expect(
      formatTimelineChordLabel(
        { root: 'G', quality: 'major7', bass: 'G' },
        'roman',
        cMajorKey,
        1,
      ),
    ).toEqual({
      full: 'Vmaj7/G',
      visible: { primary: 'Vmaj7', secondary: '/G' },
    });
  });

  it('keeps the full label for chords wider than one beat', () => {
    expect(
      formatTimelineChordLabel(
        { root: 'C#', quality: 'major7', bass: 'G#' },
        'symbol',
        cMajorKey,
        2,
      ),
    ).toEqual({
      full: 'C♯ major7/G♯',
      visible: { primary: 'C♯ major7/G♯' },
    });
  });

  it('uses flat spellings for F minor symbol labels', () => {
    const fMinorKey = { tonic: 'F', mode: 'minor' } satisfies SongKey;

    expect(
      formatTimelineChordLabel(
        { root: 'C#', quality: 'major7', bass: 'G#' },
        'symbol',
        fMinorKey,
        1,
      ),
    ).toEqual({
      full: 'D♭ major7/A♭',
      visible: { primary: 'D♭maj7', secondary: '/A♭' },
    });
  });

  it('uses flat spellings for roman slash-bass labels', () => {
    const fMinorKey = { tonic: 'F', mode: 'minor' } satisfies SongKey;

    expect(
      formatTimelineChordLabel(
        { root: 'A#', quality: 'minor7', bass: 'A#' },
        'roman',
        fMinorKey,
        1,
      ),
    ).toEqual({
      full: 'iv7/B♭',
      visible: { primary: 'iv7', secondary: '/B♭' },
    });
  });
});
