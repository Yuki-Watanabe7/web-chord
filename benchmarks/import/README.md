# 楽譜インポート評価ベンチマーク

Issue #36で定めた、PDF／OMR／MusicXML変換の比較用データです。原PDFを採点時に直接読むのではなく、手作業で確認した正解データ（ground truth）と変換器の出力JSONを比較します。これにより、著作権保護されたPDFをCIへ置かなくても回帰テストを実行できます。

## ファイル構成

```text
benchmarks/import/
  manifest.json             # 原本の由来・ハッシュ・評価区間・変換器version
  manifest.schema.json      # manifestのJSON Schema
  fixture.schema.json       # 正解／候補データ共通のJSON Schema
  fixtures/                 # 手作業で転記した正解データ
  candidates/               # 変換器ごとの出力
  evaluate.mjs              # 採点処理
```

`chord-symbols.fixture.json` は、3曲のバージョン管理済み代表区間に現れる原表記を一覧化した台帳です。保護された原譜そのものは含めず、追加のコード記法は `parserCoverage` と `src/domain/music/chordSymbol.test.ts` で回帰確認します。

内部表記の`PPQ`（四分音符あたりのtick数）は480です。各ノートとコードの`onsetTick`は小節先頭からの相対位置、`durationTicks`は長さです。主旋律の音高はMIDIノート番号、タイは`none`／`start`／`continue`／`stop`で記録します。弱起は小節の`pickupTicks`、反復・番括弧・Segno・D.S.・Coda・To Coda・Fineは`structure.navigation`、実際に演奏する小節列は`structure.playbackOrder`で表します。

`regression-probe-v1`は実在するOMR変換器の精度を示すものではありません。「世界がひとつになるまで」1小節目を原譜と一致させ、他の区間には誤った音符、tick、調、タイなどを意図的に残しています。評価処理が項目別・小節別に誤りを出せることを固定するテスト入力です。

`audiveris-5.11.0-real-omr-v1`は、3つのSHA-256確認済み原PDFを実際にAudiverisで処理した代表区間です。初回受入は[`real-omr-qualification.md`](real-omr-qualification.md)、音符品質警告を加えた再測定は[`omr-note-quality-qualification.md`](omr-note-quality-qualification.md)、Automaticの分割候補の結合検証とその時点の候補hashは[`omr-split-merge-qualification.md`](omr-split-merge-qualification.md)、D.S.／Codaと全曲演奏順は[`omr-navigation-qualification.md`](omr-navigation-qualification.md)を参照してください。全曲MusicXMLや原PDFは含みません。

### Issue #49: 1小節目の照合と候補修正

`manifest.json`に記録したSHA-256 `268470b174d8583517be09f073b20a833025bde1925aa2e61e1fe349cda2b114` の原PDFをローカルでレンダリングし、1ページ目・1段目・1小節目を目視で照合しました。上段のコード表記は小節の前半が `F`、後半が `C/E` です。ト音記号の旋律は A4, A4, B4, C5, D5, C5, G4, G4（MIDI 69, 69, 71, 72, 74, 72, 67, 67）で、長さは四分・16分×4・8分・四分・8分です。これに従って正解fixtureの音高を訂正しました。コードの位置と長さ、旋律の開始位置と長さは原譜と一致していたため維持しました。

同じ `regression-probe-v1` の候補JSONでは、`C` を `C/E` に訂正し、旋律音高、7音目の開始位置・長さ、欠けていた8音目を上記の原譜に合わせました。解消したベース音の警告も削除しました。他の2区間に残した意図的な誤りは、評価器の回帰確認に使います。この修正で得られる点数は**合成候補データと正解データの一致率**であり、実際のOMRの自動変換精度を示しません。実変換器の精度評価には、その出力を別の候補セットとして記録する必要があります。原PDFやその画像はリポジトリへ追加しません。

## 原PDFのローカル配置

次のファイルを`sample/pdf/`へ配置します。`sample/`は`.gitignore`で除外されているため、原PDFはGit管理されません。

| ファイル | ページ | SHA-256 |
| --- | ---: | --- |
| `世界がひとつになるまで.pdf` | 2 | `268470b174d8583517be09f073b20a833025bde1925aa2e61e1fe349cda2b114` |
| `カリスマックス.pdf` | 5 | `768c67d7be7c2f44607e571d019af14017df999383963e2d28ceee338876bfd5` |
| `Automatic.pdf` | 5 | `b927162911cfd804178baffac255d290251a8dc7b4c8e2a078c2184f5d2b052c` |

ファイル名、由来、再配布条件の機械可読な記録は`manifest.json`を正とします。ローカル原本が揃っている環境では、次のコマンドで配置とハッシュを確認できます。この確認は任意であり、CIでは実行しません。

```sh
npm run benchmark:verify-sources
```

## 正解データの更新

1. 原譜のページ、段、小節番号を確認する。
2. `fixtures/`に小節情報、コード、主旋律、構造変更、演奏順を記録する。
3. `manifest.json`の`evaluationSegments`からfixtureを参照し、対象区間と難所タグを更新する。
4. `npm test`でschema相当の必須項目と回帰結果を確認する。
5. 原PDFを変更した場合だけ、SHA-256と由来を更新する。PDF自体はコミットしない。

## 変換結果の評価

候補データは`candidates/<変換器ID>/<scoreId>.<segmentId>.json`へ置き、`manifest.json`の`candidateSets`に変換器名、version、設定を記録します。同じ候補JSON、変換器version、許容tickなら、日時を含まない同一結果が生成されます。

人が読むMarkdownレポート:

```sh
npm run benchmark:import
```

機械処理用JSONレポート:

```sh
npm run benchmark:import -- --format json --output /tmp/import-benchmark.json
```

別の候補セットを評価する場合:

```sh
npm run benchmark:import -- --candidate <candidate-set-id>
```

実OMR候補の採点:

```sh
npm run benchmark:import -- --candidate audiveris-5.11.0-real-omr-v1
```

原PDFから手で転記した全曲の演奏順と、実OMR候補の固定スナップショットとの比較:

```sh
npm run benchmark:omr-navigation
```

この比較はカリスマックスとAutomaticの反復・D.S.・Codaを含む小節列全体を対象にします。`full-playback-order.json`には譜面小節番号の順序のみを保存し、全曲の音符・MusicXML・PDFは保存しません。

レポートには次が含まれます。

- コード: root／bass／qualityの正規化一致、原表記、onset、duration
- 主旋律: pitch precision／recall／F1、onset、duration、tie
- 構造: 拍子・調・テンポ変更、反復／D.S.／Coda等の記号、展開後の小節順
- 運用: 警告のうち実誤りを指した割合、採点誤りのうち警告が覆う割合、修正が必要な小節数
- 詳細: 曲ID、小節、項目、期待値、実値ごとの誤り一覧

onsetとdurationの許容値は`manifest.json`の`tolerances`で管理します。現在はそれぞれ30 tickです。
