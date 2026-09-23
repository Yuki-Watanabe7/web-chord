# PDFからMusicXMLを作るローカルOMRジョブ

`web-chord`のブラウザアプリは、PDFを直接解析しません。代わりにこのリポジトリのローカルCLIがPDFを事前確認し、楽譜向けの認識エンジンであるAudiverisを実行して、次段階の`ImportDraft`へ渡せるMusicXML候補を作ります。

この分離により、重い認識処理・PDFの一時データ・エンジン固有の設定をブラウザの曲データや`localStorage`から切り離します。認識結果は自動確定せず、必ずレビュー対象です。

## 必要な実行環境

ローカルアダプターには以下が必要です。

- Node.js 22以上
- Poppler: `pdfinfo`、`pdfimages`、`pdftotext`、`pdftoppm`
- Audiverisを起動する`audiveris`コマンド。別のパスの場合は`--audiveris-bin`で指定します。

Audiverisの公式CLIは`-batch -export -save -output <dir> -- <input>`でMusicXMLと一時的なOMRプロジェクトを出力できます。[公式CLI説明](https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/)を参照してください。

Dockerアダプターを使う場合は、上のPoppler一式はホスト側に必要で、Audiverisを含む信頼できるイメージとDockerが必要です。コンテナはネットワークなし、読み取り専用ルート、作業用`/tmp`だけを一時書き込み可能として起動します。イメージはこのリポジトリでは配布・自動取得しません。

## 実行

原PDFは`sample/pdf/`のようなGit管理外の場所に置きます。最小のローカル実行は次の1コマンドです。

```sh
npm run omr:pdf -- --input "sample/pdf/score.pdf"
```

別のAudiveris実行ファイルを使う例です。

```sh
npm run omr:pdf -- --input "sample/pdf/score.pdf" --audiveris-bin /opt/audiveris/bin/Audiveris
```

Dockerイメージを明示的に指定する例です。

```sh
npm run omr:pdf -- --input "sample/pdf/score.pdf" --engine docker --docker-image registry.example/audiveris@sha256:YOUR_PINNED_DIGEST
```

既定では、複数ページをひとつの楽譜として扱えるよう、Audiverisには一時コピーした元PDFを渡します。PDFを300 DPIのPNGにした結果は、ページ数・ピクセルサイズを検証するために常に作成しますが、保存しません。ページごとの認識を試す必要があるアダプターでは、`--input-mode rendered-pages`を指定します。すべてのオプションは`npm run omr:pdf -- --help`で確認できます。

同じ入力・設定・エンジン指定は同じジョブIDになります。既存成果物を壊さないため、同じジョブを再実行する場合は`--output`に別の空ディレクトリを指定します。

## ジョブ成果物と受け渡し契約

既定の出力先はGit管理外の`artifacts/omr/<job-id>/`です。[`schemas/omr-job-v1.schema.json`](../schemas/omr-job-v1.schema.json)に従う`job.json`（contract version 1）が以下をひとつに紐付けます。

- 入力ファイル名、サイズ、SHA-256、PDF version
- ページ数、ページサイズ、暗号化有無、文字層・埋め込み画像の判定、レンダリングDPIとPNG寸法
- 実行アダプター、Audiveris version（取得元を`engine.versionSource`に記録。macOSアプリは`Info.plist`、Dockerは固定image IDへフォールバック）、タイムアウト、実行したコマンドの結果
- `musicxml/candidate-*.musicxml`と各SHA-256
- 候補ごとの`reviewSignals`。Audiverisの一時`.omr`プロジェクトから、最初の論理パートで音符品質スコアが0.8未満だった小節を記録する
- `logs/engine.log`
- `text-layer/chord-candidates.json`

`text-layer/chord-candidates.json`には、PDF文字層から得られたコードらしい文字列だけを、ページ番号とPDFポイント座標で保存します。全文や歌詞は保存しません。この位置情報は、次のレビュー段階でMusicXMLの小節候補と照合するための補助情報です。

`reviewSignals`の値はAudiveris内部の`head-chord grade`であり、音符が正しい確率ではありません。最初の論理パートが主旋律として選択されたとき、低い小節は`low-omr-note-grade`警告として確認画面の「警告・低信頼度のみ」に表示します。警告はその小節の原譜照合を促し、音符を自動で除外・修正しません。高いスコアでも音高や休符の誤認識はあり得ます。`.omr`プロジェクトにはページ画像が含まれるため、スコアを抽出した後に一時領域ごと削除し、ジョブ成果物へは保存しません。候補との小節対応が取れない場合は`omr-note-quality-unavailable`を記録します。

OMRが複数のMusicXMLを出した場合は、`job.json`の`artifacts.musicXml`に全候補を残し、`multiple-musicxml-candidates`警告を返します。Audiverisがメトロノーム記号をMusicXMLへ出力できない既知の警告をログに出した場合も、候補を捨てず、`diagnostics`に次の warning を追加します。これはテンポ表記を後続のレビューで確認するための契約であり、ImportDraftやレビューUIはログ全文を解析せずにこの値を表示・確認します。

```json
{
  "severity": "warning",
  "code": "omr-metronome-export-warning",
  "message": "Audiverisがメトロノーム記号をMusicXMLへ出力できませんでした（4件）。テンポ表記をレビューしてください。",
  "details": {
    "count": 4,
    "locations": [{ "page": 2 }, { "page": 2 }, { "page": 4 }, { "page": 4 }]
  }
}
```

`details.count`は検出件数、`details.locations`は各警告でログから取得できた`page`／`sheet`番号です。番号をログから取得できない場合、対応する location は空のオブジェクトになります。未知のAudiverisログ形式はこの warning に変換せず、従来どおり`logs/engine.log`へ保存します。OMR失敗時も`job.json`とログを残して`status: "failed"`と機械可読な理由を返します。無言で停止することはありません。

確認画面で原PDFを選んだ後、成果物の `job.json`、続いて `musicxml/candidate-*.musicxml` を選択します。画面は原PDFとjobに記録されたPDFのSHA-256、さらにMusicXMLと候補のSHA-256を照合し、候補一覧・OMR診断を表示します。OMR警告は `ImportDraft` の確認事項として保持され、Song確定前に確認できます。MusicXMLだけを直接選んだ場合はjob診断とPDF出典を紐付けられません。

## 入力安全性と保持方針

- PDFヘッダー、暗号化、ページ数、サイズを処理前に確認します。
- 既定の上限は32 MiB、20ページ、画像化後の総画素数250 Mi、150〜600 DPI、各外部コマンド10分です。`--max-bytes`、`--max-pages`、`--max-rendered-pixels`、`--timeout-ms`で明示的に変更できます。
- 外部コマンドはシェルを通さず引数配列で起動します。タイムアウト時は終了シグナルを送ります。
- 原PDF、抽出した全文、レンダリングPNG、Audiverisの作業ディレクトリはOSの一時領域で処理し、成功・失敗を問わず削除します。成果物ディレクトリへ原PDFや一時画像をコピーしません。
- 暗号化PDF、破損PDF、依存コマンド不足、ページ・サイズ上限超過、画像化失敗、OMR失敗は、理由を返して停止します。

## ライセンスと配布・ホスティング

Audiveris本体はAGPL-3.0です（[公式リポジトリ](https://github.com/Audiveris/audiveris)）。このリポジトリはAudiverisバイナリやDockerイメージを同梱せず、ローカルにインストール済みの実行ファイルまたは利用者が選んだイメージを呼び出すだけです。

将来、Audiverisを含むイメージを配布したり、ネットワーク越しのOMRサービスとしてホスティングしたりする場合は、AGPL-3.0のソース提供義務を含む条件を、配布物・サービスごとに法務確認したうえで満たしてください。原譜の著作権・利用許諾も別途必要です。原PDFや認識ジョブ成果物を公開ストレージへ送る実装は、このCLIには含まれません。
