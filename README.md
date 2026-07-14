# web-chord

初心者やカジュアルな作曲向けの、コード進行から曲のアイデアを作るためのシンプルなMIDI作成ツールです。

GarageBandのような本格DAWを置き換えるのではなく、まずコードを並べ、コードに合うメロディを置き、再生して、MIDIとして書き出すところに絞っています。

## Features

- 曲一覧ページ
- 曲エディタページ
- コードパレット
- 拍単位のコード挿入
- コードの削除と長さ変更
- 小節をまたぐコード表示
- メジャーガイド付きタイムライン
- BPM設定
- 拍子設定: `2/4`, `3/4`, `4/4`, `5/4`, `6/8`
- タイムラインの折り返し小節数設定
- ピアノロール形式のメロディ編集
- メロディノートの追加、選択、削除、長さ変更
- 現在のコードトーンのハイライト
- メロディノートのクリック時プレビュー
- コードとメロディの同時再生
- `localStorage` による保存と読み込み
- JSONによる単曲書き出し・全曲バックアップ・読み込み
- 旧グリッド形式の保存データからイベント形式への移行
- MIDI書き出し

## Current Workflow

1. 曲一覧から新規作成、または保存済みの曲を開く
2. コードパレットからコードを選ぶ
3. タイムラインの拍をクリックしてコードを配置する
4. コードブロックの `+`, `-`, `x` で長さ変更や削除を行う
5. メロディ欄のセルをクリックしてノートを追加する
6. ノートを選択して長さ変更や削除を行う
7. 再生でコードとメロディを確認する
8. 保存、JSON書き出し、またはMIDI書き出しを行う

## 保存とJSONバックアップ

通常の「保存」では、楽曲はこのブラウザの `localStorage` に保存されます。ブラウザのサイトデータを削除した場合や別の端末・ブラウザを使う場合、この保存データは引き継がれません。

曲一覧の「JSONバックアップ」では、保存済みの全楽曲を1つの `.json` ファイルとして保存できます。「JSONを読み込む」からそのファイルを読み込むと、楽曲一覧へ追加されます。同じIDの曲がある場合も既存曲は上書きせず、「（インポート）」を付けた複製として追加します。エディタの「JSON書き出し」は、編集中の1曲だけを保存します。

JSONはweb-chordで後から編集を再開するための完全な楽曲データです。MIDIはDAWなどで再生・編集するための演奏データであり、web-chordへ読み戻す用途には使えません。

## MIDI Export

MIDI書き出しでは、現在の `Song` モデルをそのまま標準MIDIファイルへ変換します。

- `Song.bpm` をテンポイベントへ反映
- `Song.timeSignature` を拍子イベントへ反映
- `ChordEvent[]` を `Chords` トラックへ出力
- `MelodyNote[]` を `Melody` トラックへ出力

書き出しファイル名は曲名をもとにした `.mid` ファイルになります。

## Tech Stack

- Vite
- React
- TypeScript
- Emotion
- React Router
- Tone.js
- localStorage

## Project Structure

```text
src/
  components/editor/
    ChordPalette.tsx
    SongControls.tsx
    TimelineGrid.tsx
    TransportControls.tsx
  domain/music/
    chords.ts
    migration.ts
    timeline.ts
    types.ts
  pages/
    Editor.tsx
    SongList.tsx
  services/
    midiExport.ts
    playback.ts
    songFile.ts
    songStorage.ts
```

## Domain Model

曲データはUIグリッドではなく、拍位置ベースのイベントモデルで扱います。

```ts
export interface ChordEvent {
  id: string;
  root: NoteName;
  quality: ChordQuality;
  startBeat: number;
  durationBeats: number;
}

export interface MelodyNote {
  id: string;
  pitch: NoteName;
  octave: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  timeSignature: {
    beatsPerMeasure: number;
    beatUnit: number;
  };
  totalMeasures: number;
  chords: ChordEvent[];
  melodyNotes: MelodyNote[];
  createdAt: string;
  updatedAt: string;
}
```

## Development

依存関係をインストールします。

```sh
npm install
```

開発サーバーを起動します。

```sh
npm run dev
```

lintを実行します。

```sh
npm run lint
```

本番ビルドを確認します。

```sh
npm run build
```

ビルド済みアプリをプレビューします。

```sh
npm run preview
```

## Product Direction

今後も本格DAWの機能を広げすぎず、コード編集、メロディ編集、再生、保存、MIDI書き出しを中心に育てます。

音楽理論の補助は、ユーザーが知識を暗記しなくても使える形でUIに埋め込む方針です。現在はコードトーンのハイライトまで実装済みで、スケールトーンやおすすめノートの提示は次の改善候補です。
