# Issue #52: 実OMR受入記録（2026-09-23）

この記録はPR #56時点の受入結果を保存する。Issue #53で音符品質警告を追加して再処理した結果と現在の実OMR候補セットについては、[音符品質の再測定](omr-note-quality-qualification.md)を参照する。

Issue #54の再調査では、Automaticの候補2がPDF 1ページ目の2つ目の譜面領域から始まることを確認した。この文書内の「後続ページ」は初回受入時の認識であり、正しい範囲と結合結果は[分割候補の結合検証](omr-split-merge-qualification.md)を参照する。

## 判定範囲

manifest の SHA-256 に一致する原PDFをローカルで処理し、Audiveris 5.11.0 の実出力を `ImportDraft` に変換した。代表区間の採点と全候補の `Song` 変換を確認した。原PDF、レンダリング画像、全曲MusicXML、全曲SongはGitに含めない。`regression-probe-v1` は合成回帰データであり、以下の実測値には使っていない。

Chrome のローカルファイルアクセスを有効にした開発用ブラウザで、3原PDF、各 `job.json`、各代表候補MusicXMLを確認画面に投入した。PDFとジョブの入力SHA-256、および候補XMLとジョブの成果物SHA-256を画面で照合し、3曲とも代表箇所を修正して `Songへ確定して保存` から編集画面へ遷移できた。保存先は開発用ブラウザの `localStorage` であり、サーバーや本番データは変更していない。これは操作経路の確認であって、全小節を校正済みという意味ではない。

## 固定条件と成果物

- Node.js 22.12.0、Poppler 26.09.0（`pdfinfo`、`pdftoppm`）、Audiveris 5.11.0（macOS アプリの `Info.plist` からversionを取得）
- `npm run omr:pdf`、`--engine local --input-mode pdf --dpi 300 --audiveris-bin /Applications/Audiveris.app/Contents/MacOS/Audiveris`
- 上限: 入力32 MiB、20ページ、総画素数262144000、各コマンド600000 ms。各jobの `job.json` に設定と診断を記録
- 3原PDFは `npm run benchmark:verify-sources` でmanifestと一致。ローカルの `artifacts/omr-host/` はGit管理外

| 楽譜 | PDF SHA-256 | job ID | MusicXML候補 SHA-256 |
| --- | --- | --- | --- |
| 世界がひとつになるまで | `268470b174d8583517be09f073b20a833025bde1925aa2e61e1fe349cda2b114` | `omr-4be10aee8cb43fa686cd` | candidate-1 `207ac15d441965816e5f913ee4ef961963e2cc08e84cbd75739f8e254dc8be3e` |
| カリスマックス | `768c67d7be7c2f44607e571d019af14017df999383963e2d28ceee338876bfd5` | `omr-49993bac3d745f8ca3a8` | candidate-1 `5343566cd7fe6fe8cf07158a4ffa31fab83dd0f7b5faaf15ea9a3ea1e177da63` |
| Automatic | `b927162911cfd804178baffac255d290251a8dc7b4c8e2a078c2184f5d2b052c` | `omr-3c64bf54b45780de6eec` | candidate-1 `af6d82f5d2f25da94554d8c33341149d59692ef6f444a4870a6d05f3e094b067`、candidate-2 `4f279f3e38932095b694a69aabac40f177657d11951aea33c1e0e9f3dc33c303` |

`Automatic` は候補1が原PDFの1ページ目・小節3を含むため、代表区間の採点に選んだ。候補2は後続ページの別の64小節で、候補内の小節番号が再び1から始まる。ジョブ診断の `multiple-musicxml-candidates` と、メトロノーム記号4件（PDF 2、2、4、4ページ）は両候補の `ImportDraft` に引き継がれる。全曲を一つの `Song` に結合する手順は現在ない。

## 代表区間の実測値

`node scripts/generate-real-omr-benchmark.mjs` はローカルの `job.json` と各候補のSHA-256を検証し、著作権保護された全曲XMLを保存せず、代表1小節ずつを `audiveris-5.11.0-real-omr-v1` に抽出する。採点は `npm run benchmark:import -- --candidate audiveris-5.11.0-real-omr-v1` で再現できる。音符の開始・長さの許容差は各30 tick。挿入音は音列を対応付けてから採点し、後続の正しい音を連鎖的な誤りに数えない。

| 楽譜・小節 | コード正規化 | 旋律音高F1 | 開始・長さ | 要修正小節 | 主な修正 |
| --- | ---: | ---: | ---: | ---: | --- |
| 世界がひとつになるまで・1 | 2/2 = 100% | 8/8 = 100% | 各8/8 = 100% | 1 | MusicXMLで欠落した調C majorとテンポ84を確認・補完 |
| カリスマックス・19 | 2/2 = 100% | 8/8 = 100% | 各8/8 = 100% | 1 | 2♯の調をMusicXMLのmajorから原譜のB minorへ変更、テンポ156を補完 |
| Automatic・3 | 2/2 = 100% | 72.7%（4一致/期待5/候補6） | 各5/6 = 83.3% | 1 | 先頭の余分なC5を除外、最後のG4をA♭4へ変更、調F minorとテンポ96を補完 |

コード・旋律の目標が指定された「世界がひとつになるまで」の代表区間は、コード90%以上・旋律F1 85%以上を満たす。ただし1小節のみの測定で、全曲精度を示さない。3区間合算はコード6/6 = 100%、旋律音高F1 93.0%、開始・長さ各95.5%。小節3の挿入音と誤音は原PDFの1ページ目を見て照合した。代表区間の候補には採点対象と対応付くwarningが0件のため、warning precisionは **N/A**。`Automatic` のjob警告は別ページのテンポ表記を指し、この1小節の精度を保証しない。

構造の採点は3代表区間の拍子と各1小節の演奏順が一致した。一方、調は3/3区間で欠落またはmode不一致、テンポは3/3区間で欠落した。全曲の反復・D.S.・Coda演奏順の正しさは、この短い区間の100%から推論できない。

## 全候補の変換と難所

全MusicXML候補が `ImportDraft` を生成し、`confirmImportDraftToSong` で有効な `Song` を作れた。確定後の小節数は順に65、117、Automatic候補1が8、候補2が78。ブラウザでは世界がひとつになるまでの小節1に調C major・テンポ84を追加、カリスマックスの曲頭をB minor・テンポ156へ修正、Automatic候補1の小節3で余分なC5を除外し、G4をA♭4に修正して調F minor・テンポ96を追加した。それぞれ端末保存と編集画面への遷移を確認した。Automatic候補2は関数による変換のみで、ブラウザ保存していない。

- 世界がひとつになるまで: 42譜面小節から65演奏小節へ展開。反復開始5、1/2番括弧28/29を保持。代表1小節のslash chord `C/E` は一致。MusicXMLには調・テンポが欠落し、小節15のテンポ解析警告がある。弱起、sus4、aug、m7♭5の全箇所について目視・定量確認は未実施。
- カリスマックス: 86譜面小節から117演奏小節へ展開。選択旋律で三連符33音を検出し、小節12、15、16、45、74に存在。小節12と35の拍子超過警告は小節へ結び付く。小節71で3♭への転調候補を検出。Audiveris候補にはD.S.／Codaが方向記号として残らず、その演奏順の一致は未証明。
- Automatic: 2候補へ分割。候補1は8譜面小節、候補2は64譜面小節から78演奏小節。候補1の小節5は拍子超過、小節7はコード候補重複の警告あり。候補2は拍子超過とtie未対応を小節単位で警告する。原PDFに見えるD.S.／Codaは候補で方向記号として保持されず、演奏順は未証明。代表小節3の余分な音と誤音はImportDraft上で警告されない。

未達項目の後続Issue: [無警告の旋律誤認識 #53](https://github.com/Yuki-Watanabe7/web-chord/issues/53)、[分割候補の結合 #54](https://github.com/Yuki-Watanabe7/web-chord/issues/54)、[D.S.／Codaと全曲演奏順 #55](https://github.com/Yuki-Watanabe7/web-chord/issues/55)。

## 再実行と保留条件

```sh
npm run benchmark:verify-sources
npm run omr:pdf -- --input 'sample/pdf/世界がひとつになるまで.pdf' --output artifacts/omr-new --audiveris-bin /Applications/Audiveris.app/Contents/MacOS/Audiveris --dpi 300 --input-mode pdf
npm run omr:pdf -- --input 'sample/pdf/カリスマックス.pdf' --output artifacts/omr-new --audiveris-bin /Applications/Audiveris.app/Contents/MacOS/Audiveris --dpi 300 --input-mode pdf
npm run omr:pdf -- --input 'sample/pdf/Automatic.pdf' --output artifacts/omr-new --audiveris-bin /Applications/Audiveris.app/Contents/MacOS/Audiveris --dpi 300 --input-mode pdf
node scripts/generate-real-omr-benchmark.mjs artifacts/omr-new
npm run benchmark:import -- --candidate audiveris-5.11.0-real-omr-v1
```

再実行では出力先を空のディレクトリにする。候補hashはエンジン環境によって変わり得るため、変更時は再採点と選択根拠の更新が必要。全曲の構造・演奏順とwarning precisionを確定するには、別途対応小節の原譜正解データが必要。開発用ブラウザへ保存した3曲は代表箇所だけを校正した検証用データであり、残る小節の警告確認・原譜照合は完了していない。
