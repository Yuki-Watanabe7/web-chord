/** A compact score exercising pickup, repeat endings, harmony, ties, tuplets, and changes. */
export const musicXmlImportFixture = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <identification><encoding><software>Audiveris 5.4 OMR</software></encoding></identification>
  <part-list>
    <score-part id="P1"><part-name>Accompaniment</part-name></score-part>
    <score-part id="P2"><part-name>Melody</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="0" implicit="yes">
      <attributes><divisions>3</divisions><key><fifths>0</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><sound tempo="108"/></direction>
      <harmony><root><root-step>C</root-step></root><kind>dominant</kind><degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree></harmony>
      <note><rest/><duration>3</duration><voice>1</voice><staff>1</staff></note>
    </measure>
    <measure number="1">
      <barline location="left"><repeat direction="forward"/></barline>
      <harmony><root><root-step>F</root-step></root><kind>major</kind></harmony>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>3</duration><voice>1</voice><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>3</duration><voice>1</voice><staff>1</staff></note>
      <forward><duration>9</duration></forward>
    </measure>
    <measure number="2">
      <barline location="left"><ending number="1" type="start"/></barline>
      <harmony><root><root-step>G</root-step></root><kind>major</kind></harmony>
      <note><rest/><duration>12</duration><voice>1</voice><staff>1</staff></note>
      <barline location="right"><ending number="1" type="stop"/><repeat direction="backward" times="2"/></barline>
    </measure>
    <measure number="3">
      <barline location="left"><ending number="2" type="start"/></barline>
      <attributes><key><fifths>-1</fifths><mode>minor</mode></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <direction><sound tempo="96"/></direction>
      <harmony><kind>none</kind></harmony>
      <note><rest/><duration>9</duration><voice>1</voice><staff>1</staff></note>
      <barline location="right"><ending number="2" type="stop"/></barline>
    </measure>
  </part>
  <part id="P2">
    <measure number="0" implicit="yes">
      <attributes><divisions>3</divisions><key><fifths>0</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><tie type="start"/><voice>1</voice><staff>1</staff></note>
    </measure>
    <measure number="1">
      <barline location="left"><repeat direction="forward"/></barline>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>12</duration><tie type="stop"/><voice>1</voice><staff>1</staff></note>
    </measure>
    <measure number="2">
      <barline location="left"><ending number="1" type="start"/></barline>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><voice>1</voice><staff>1</staff></note>
      <forward><duration>11</duration></forward>
      <barline location="right"><ending number="1" type="stop"/><repeat direction="backward" times="2"/></barline>
    </measure>
    <measure number="3">
      <barline location="left"><ending number="2" type="start"/></barline>
      <attributes><key><fifths>-1</fifths><mode>minor</mode></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <note><grace/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>9</duration><voice>1</voice><staff>1</staff></note>
      <barline location="right"><ending number="2" type="stop"/></barline>
    </measure>
  </part>
</score-partwise>`;
