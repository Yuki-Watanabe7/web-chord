#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const fixture = JSON.parse(await readFile(new URL('../benchmarks/import/full-playback-order.json', import.meta.url), 'utf8'));

const expand = (text, sourceCount) => {
  const order = [];
  for (const token of text.split(/[\s,]+/).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(token);
    if (!match) throw new Error(`Invalid source-measure range: ${token}`);
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (first < 1 || last < first || last > sourceCount) throw new Error(`Out-of-range source measure: ${token}`);
    for (let measure = first; measure <= last; measure += 1) order.push(measure);
  }
  return order;
};

const editDistance = (left, right) => {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const next = [row];
    for (let column = 1; column <= right.length; column += 1) {
      next[column] = Math.min(
        previous[column] + 1,
        next[column - 1] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = next;
  }
  return previous[right.length];
};

const results = fixture.scores.map((score) => {
  const expected = expand(score.groundTruthOrder, score.sourceMeasureCount);
  const candidate = expand(score.candidateOrder, score.sourceMeasureCount);
  const proposal = expand(score.navigationProposal, score.sourceMeasureCount);
  const compare = (actual) => ({
    measures: actual.length,
    editDistance: editDistance(actual, expected),
    accuracy: Number(((1 - editDistance(actual, expected) / Math.max(actual.length, expected.length)) * 100).toFixed(1)),
    exact: actual.length === expected.length && actual.every((measure, index) => measure === expected[index]),
  });
  return { id: score.id, expectedMeasures: expected.length, candidate: compare(candidate), proposal: compare(proposal) };
});

if (process.argv.includes('--format=json')) {
  process.stdout.write(`${JSON.stringify({ scores: results }, null, 2)}\n`);
} else {
  process.stdout.write('| 楽譜 | 原譜の演奏小節 | MusicXML候補 | 候補の順序一致率 | 記号補完後 | 補完後の順序一致率 |\n');
  process.stdout.write('| --- | ---: | ---: | ---: | ---: | ---: |\n');
  for (const result of results) {
    process.stdout.write(`| ${result.id} | ${result.expectedMeasures} | ${result.candidate.measures} | ${result.candidate.accuracy}% | ${result.proposal.measures} | ${result.proposal.accuracy}% |\n`);
  }
}
