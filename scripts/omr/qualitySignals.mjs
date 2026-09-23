/** Reads Audiveris 5.11.0 head-chord grades from a saved .omr project.
 * Grades are review hints, not probabilities that a note is correct.
 * The project (which contains page images) must stay temporary.
 */
export const LOW_HEAD_CHORD_GRADE = 0.8;

const blocks = (xml, name) => [...xml.matchAll(new RegExp(`<${name}(?=\\s|>)([^>]*)>([\\s\\S]*?)<\\/${name}>`, 'g'))]
  .map((match) => ({ attributes: match[1], body: match[2] }));
const attributes = (value) => Object.fromEntries([...value.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
  .map((match) => [match[1], match[2] ?? match[3] ?? '']));
const references = (xml, name) => [...xml.matchAll(new RegExp(`<${name}(?=\\s|>)([^>]*)\\/>`, 'g'))]
  .map((match) => attributes(match[1]));
const openingTags = (xml, name) => [...xml.matchAll(new RegExp(`<${name}(?=\\s|>)([^>]*)>`, 'g'))]
  .map((match) => attributes(match[1]));
const tagText = (xml, name) => xml.match(new RegExp(`<${name}>([^<]*)<\\/${name}>`))?.[1]?.trim() ?? '';

const pageSlots = (page, pdfPage) => blocks(page.body, 'system').flatMap((system, systemIndex) =>
  openingTags(system.body, 'stack').flatMap((stack, stackIndex) => stack.special === 'CAUTIONARY' ? [] : [{
    pdfPage,
    pageId: attributes(page.attributes).id,
    systemIndex,
    stackIndex,
  }]));

/** Returns the physical score layout and each exported score's source measure mapping. */
export const extractOmrScoreMetadata = (bookXml, sheetXmlByNumber, pageCount) => {
  const scores = blocks(bookXml, 'score');
  if (scores.length === 0) throw new Error('Audiveris project has no scores');
  const sheets = new Map(Array.from({ length: pageCount }, (_, index) => {
    const number = index + 1;
    return [number, sheetXmlByNumber(number)];
  }));
  const sourceLayout = [...sheets].flatMap(([number, xml]) =>
    blocks(xml, 'page').flatMap((page) => pageSlots(page, number)));
  if (sourceLayout.length === 0) throw new Error('Audiveris project has no source measures');
  const scoreMetadata = scores.map(({ body: scoreXml }) => {
    const logicalPartId = attributes(blocks(scoreXml, 'logical-part')[0]?.attributes ?? '').id;
    if (!logicalPartId) throw new Error('Audiveris score has no logical part');
    const sourceMeasures = [];
    const signals = [];
    for (const pageRef of references(scoreXml, 'page')) {
      const pdfPage = Number(pageRef['sheet-number']);
      const sheetXml = sheets.get(pdfPage);
      if (!sheetXml) throw new Error('Audiveris score references an unknown PDF page');
      const page = blocks(sheetXml, 'page').find((item) => attributes(item.attributes).id === pageRef['sheet-page-id']);
      if (!page) throw new Error('Audiveris score page is missing');
      for (const [systemIndex, system] of blocks(page.body, 'system').entries()) {
        const stacks = openingTags(system.body, 'stack');
        const stackCount = stacks.length;
        const part = blocks(system.body, 'part').find((item) => attributes(item.attributes).id === logicalPartId);
        const measures = part ? blocks(part.body, 'measure') : [];
        if (part && measures.length !== stackCount) throw new Error('Audiveris part measure count differs from score stacks');
        const grades = new Map([...system.body.matchAll(/<head-chord\b([^>]*)>/g)].map((match) => {
          const value = attributes(match[1]);
          return [value.id, Number(value.grade)];
        }));
        for (const [offset, stack] of stacks.entries()) {
          if (stack.special === 'CAUTIONARY') continue;
          const measureIndex = sourceMeasures.length;
          sourceMeasures.push({
            measureIndex,
            pdfPage,
            pageId: attributes(page.attributes).id,
            systemIndex,
            stackIndex: offset,
          });
          const ids = tagText(measures[offset]?.body ?? '', 'head-chords').split(/\s+/).filter(Boolean);
          const values = ids.map((id) => grades.get(id)).filter((grade) => Number.isFinite(grade));
          const low = values.filter((grade) => grade < LOW_HEAD_CHORD_GRADE);
          if (low.length > 0) signals.push({
            measureIndex,
            minGrade: Math.min(...low),
            lowNoteCount: low.length,
          });
        }
      }
    }
    return { measureCount: sourceMeasures.length, sourceMeasures, signals };
  });
  return { sourceLayout, scores: scoreMetadata };
};
