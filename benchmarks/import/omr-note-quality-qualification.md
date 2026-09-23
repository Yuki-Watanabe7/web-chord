# Issue #53: 音符品質警告の受入記録（2026-09-23）

Issue #52の実OMRで、`Automatic.pdf`の1ページ目・3小節目は旋律に余分なC5と誤ったG4がありながら、小節単位の警告がなかった。この記録は、Audiveris 5.11.0の保存済みプロジェクトにある音符品質スコアを使い、原譜と照合すべき小節として表示する変更の検証結果を残す。音符は自動修正・自動確定しない。

## 方式と限界

OMR実行時に`-save`を指定し、一時的な`.omr`プロジェクトから最初の論理パートの`head-chord grade`を読み取る。スコアが0.8未満の音を含む小節を、各MusicXML候補の`job.json`内`reviewSignals`へ記録する。候補のSHA-256が一致し、確認画面でそのパートが主旋律に選択されている場合、その小節に`low-omr-note-grade`警告を表示する。`.omr`にはページ画像が含まれるため、一時領域からスコアを抽出した後に削除し、Git管理対象の成果物には含めない。

このスコアは正解確率ではない。Automaticの3小節目では余分なC5のスコアが0.63なので小節が警告されるが、最後の誤ったG4のスコアは0.932である。警告は**小節を原譜と照合する入口**であり、誤った音符を個別にすべて特定したことを意味しない。MusicXMLの小節との対応が取れない場合は品質スコアを付けず、`omr-note-quality-unavailable`をジョブ診断に残す。旧ジョブには品質スコアがない。

## 再処理した原本と候補

原PDFのSHA-256はmanifestと一致。Node.js 22.12.0、Poppler 26.09.0、Audiveris 5.11.0、300 DPI、ローカルPDF入力で再処理した。`-save`を加えてもジョブIDは同じで、生成MusicXMLのSHA-256は以前の受入時と変わった。MusicXML内に実行時の一時パスが入るため、SHA-256だけで音楽内容の差は判断しない。代表区間の楽譜内容と採点結果は、警告を除いて以前と同じだった。

| 楽譜 | PDF SHA-256 | job ID | 今回の候補MusicXML SHA-256 | 品質警告がある譜面小節 |
| --- | --- | --- | --- | ---: |
| 世界がひとつになるまで | `268470b174d8583517be09f073b20a833025bde1925aa2e61e1fe349cda2b114` | `omr-4be10aee8cb43fa686cd` | candidate-1 `a85a0dd053220c2f79930a36ee0d7c46b66443b027ed296d02743e1ce5924d8d` | 2 / 42 |
| カリスマックス | `768c67d7be7c2f44607e571d019af14017df999383963e2d28ceee338876bfd5` | `omr-49993bac3d745f8ca3a8` | candidate-1 `200c637ad572910a1409aa1cc1d5459a00976110c17ac6158b5d143718024f26` | 18 / 86 |
| Automatic | `b927162911cfd804178baffac255d290251a8dc7b4c8e2a078c2184f5d2b052c` | `omr-3c64bf54b45780de6eec` | candidate-1 `173aa3c345f338fc82a0195e86eaa9872d3d6294f48013148f64791656f6b64c`、candidate-2 `d9a309844f6c2b6d1bd910ee1de2531684c32d2bdf5354cac22c3c74a1bcf3ef` | 候補1: 1 / 8（3小節目）、候補2: 9 / 64 |

候補1のAutomatic 3小節目は、原譜上の休符をC5として読み取った誤りと、末尾のA♭4をG4として読み取った誤りが残る。警告により原譜を見ながら両方を手で直せる。全候補は引き続き`ImportDraft`から`Song`へ変換でき、演奏順の小節数は順に65、117、Automatic候補1が8、候補2が78。分割候補の結合とD.S.／Codaの演奏順は別Issue #54／#55の範囲である。

## 定量評価と画面確認

Gitに保存する正解データと実OMR候補は各曲の代表1小節、合計3小節に限る。`npm run benchmark:import -- --candidate audiveris-5.11.0-real-omr-v1`で、コード正規化6/6=100%、旋律音高F1 93.0%、開始・長さ各95.5%、修正が必要な小節3を確認した。警告はAutomatic 3小節目の1件だけで、誤りのある小節を指した割合（warning precision）は1/1=100%。8件の採点誤りのうち、警告と項目が一致するもの（warning recall）は旋律の2件で2/8=25%。旋律の誤りだけを母数にしたrecallは2/2=100%。1つの小節警告が2つの旋律誤りを覆っているため、**音符単位の発見率ではない**。他の譜面小節を含む全曲のprecision／recallは未測定で、0.8という閾値の一般化も未検証である。

開発用ChromeでAutomaticの原PDF、ジョブ、候補1 MusicXMLを順に読み込んだ。PDFページ1を表示した状態で「警告・低信頼度のみ」をオンにすると3小節目が選択肢に残り、選択時に「最低 0.63、1音」の警告と、余分なC5および末尾G4の候補が表示された。Songには確定・保存していない。ローカルの開発サーバーは確認後に停止した。

## 再実行

```sh
npm run benchmark:verify-sources
npm run omr:pdf -- --input 'sample/pdf/世界がひとつになるまで.pdf' --output artifacts/omr-new --audiveris-bin /Applications/Audiveris.app/Contents/MacOS/Audiveris --dpi 300 --input-mode pdf
npm run omr:pdf -- --input 'sample/pdf/カリスマックス.pdf' --output artifacts/omr-new --audiveris-bin /Applications/Audiveris.app/Contents/MacOS/Audiveris --dpi 300 --input-mode pdf
npm run omr:pdf -- --input 'sample/pdf/Automatic.pdf' --output artifacts/omr-new --audiveris-bin /Applications/Audiveris.app/Contents/MacOS/Audiveris --dpi 300 --input-mode pdf
node scripts/generate-real-omr-benchmark.mjs artifacts/omr-new
npm run benchmark:import -- --candidate audiveris-5.11.0-real-omr-v1
```

出力先には過去の同一ジョブIDが存在しない空のディレクトリを使う。再生成で候補SHA-256が変わった場合は、候補とジョブを照合し直してから代表区間を更新する。原PDF、ページ画像、`.omr`、全曲MusicXML、全曲SongはGitへ追加しない。
