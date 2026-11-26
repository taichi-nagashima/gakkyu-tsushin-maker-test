# HOME 学級通信メーカー

小学校・中学校などの学級通信を、ブラウザ上で手軽に作成・編集・出力できる Web アプリケーションです。
ビルドツールや外部ライブラリへの依存を一切持たない **外部依存ゼロ** 構成で設計されており、Web サーバー上（GitHub Pages 等）だけでなく、ローカルにダウンロードした `index.html` を **`file://` で直接開いて** そのまま利用することも可能です。

---

## 主な機能

- **マルチフォーマット出力（Word / PNG / 印刷）**
  - A4 横（297mm × 210mm）レイアウトに最適化された紙面をそのまま印刷できるほか、`.docx`（Word 形式）および高解像度 `.png` 画像としてダウンロードできます。
- **AI 下書き補助**
  - 行事や季節の話題、伝えたいポイントをもとに記事の下書き作成を補助します。
- **自動文字サイズ調整**
  - 記事の文字量に応じて A4 紙面に収まるよう文字サイズを自動調整し、レイアウト崩れを防ぎます。
- **写真管理**
  - 最大 4 枚までの写真取り込みに対応。取り込み時に自動でリサイズ・JPEG 圧縮（長辺 1000px / 品質 0.85）を行い、IndexedDB（`HomePhotoStore`）へ分離保存して軽量に管理します。
- **クラウド同期（Supabase 対応）**
  - 端末のローカル保存に加え、Supabase を連携することで複数端末間での号データ同期が可能です。

---

## ファイル構成

| ファイル名 | 役割・概要 |
| --- | --- |
| `index.html` | アプリケーションのエントリポイント。UI マークアップ、キャッシュバスター用メタタグ、各スクリプトの読み込みを行います。 |
| `styles.css` | アプリ全体の UI スタイルおよび A4 横紙面プレビュー・印刷用スタイルを定義します。 |
| `layout-config.js` | HTML / Canvas / DOCX で共有する A4 紙面サイズ、写真圧縮設定、記事フォントサイズ基準値、テーマカラー等の定数モジュール（`window.HomeLayoutConfig`）。 |
| `photo-store.js` | 写真データを IndexedDB（`home_newsletter_photos_v1` / `photos` ストア）へ分離保存・復元するラッパーモジュール（`window.HomePhotoStore`）。 |
| `holidays.js` | 日本の祝日判定やカレンダー・時間割表示に関するデータ・補助ロジックを提供します。 |
| `app.js` | アプリケーションのメインロジック（状態管理、UI イベント制御、自動文字サイズ調整、AI 下書き補助、ローカル保存・Supabase クラウド同期など）。 |
| `docx-builder.js` | 外部ライブラリを使用せず、ブラウザ上で A4 横レイアウトの Word 文書（`.docx` / ZIP）を直接生成するモジュール。 |
| `png-exporter.js` | A4 紙面データを Canvas に描画し、高解像度 PNG 画像（`pngScale: 2`）として書き出すモジュール。 |

---

## 初期設定方法

初回起動後、まずは画面右上の **「設定」** から以下の基本情報を入力してください。

1. **学校名**（例：`〇〇市立〇〇小学校`）
2. **クラス名**（例：`〇年〇組`）
3. **発行者名**（担任名など）
4. **基本時間割**（曜日ごとの標準的な時間割）

※ これらの設定はブラウザ内に保存され、新規号を作成する際の初期値として自動的に反映されます。

---

## Supabase 連携のセットアップ手順

クラウド同期機能を利用する場合は、Supabase プロジェクトを作成し、以下のテーブルと RLS（Row Level Security）ポリシーを設定してください。

### 1. `newsletter_issues` テーブル作成 SQL 例

```sql
create table if not exists public.newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  issue_key text not null,
  title text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, issue_key)
);

create index if not exists idx_newsletter_issues_user_updated
  on public.newsletter_issues (user_id, updated_at desc);
```

### 2. ユーザー単位の RLS（Row Level Security）ポリシー例

ログインした本人のデータのみを参照・作成・更新・削除できるよう RLS を有効化します。

```sql
alter table public.newsletter_issues enable row level security;

create policy "Users can view their own issues"
  on public.newsletter_issues
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own issues"
  on public.newsletter_issues
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own issues"
  on public.newsletter_issues
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own issues"
  on public.newsletter_issues
  for delete
  using (auth.uid() = user_id);
```

### 3. 将来的に写真を Supabase Storage へ分離する際の推奨バケット設定

現在、写真は `photo-store.js` によりローカルの IndexedDB へ分離保存されますが、将来的にクラウド上でも写真バイナリを分離管理する場合は、以下のような **Private バケット** 構成を推奨します。

- **バケット名**: `newsletter-photos`
- **公開設定**: Private（`public: false`、署名付き URL または認証済みリクエストで取得）
- **ファイルサイズ上限**: 2MB〜5MB 程度（圧縮後 JPEG のため 1MB 未満で十分運用可能）
- **許可 MIME タイプ**: `image/jpeg`, `image/png`, `image/webp`
- **オブジェクトパス規約**: `{user_id}/{issue_key}/{photo_id}.jpg`
- **Storage RLS ポリシー例**:
  - `(storage.foldername(name))[1] = auth.uid()::text` を条件とし、自身の `user_id` フォルダ配下のみ `SELECT` / `INSERT` / `UPDATE` / `DELETE` を許可する。

---

## 更新・デプロイ手順

### 1. キャッシュバスター `APP_VERSION` の更新ルール

ブラウザキャッシュによる古いアセットの読み込みを防ぐため、CSS や JS ファイルを更新した際は **`index.html` と `app.js` のバージョン表記を必ず揃えて更新** してください。

1. バージョン文字列は **`YYYYMMDDNN`** 形式（例: `2026112501`）を使用します。同じ日に複数回更新する場合は末尾の連番（`01`, `02`, ...）をインクリメントします。
2. `index.html` 内の以下を新しいバージョンに更新します：
   - `<meta name="asset-version" content="YYYYMMDDNN" />`
   - 読み込んでいる CSS / JS のクエリパラメータ（`?v=YYYYMMDDNN`）
3. `app.js` 内の `APP_VERSION` 定数を同じ値（`'YYYYMMDDNN'`）に更新します。

### 2. GitHub Pages 反映確認

1. 変更を `main` ブランチへコミット・プッシュします。
2. GitHub リポジトリの **Actions** タブ（または **Settings > Pages**）でデプロイ完了を確認します。
3. 公開 URL にアクセスし、スーパーリロード（`Ctrl+Shift+R` / `Cmd+Shift+R`）後にブラウザの開発者ツールやアプリ内のバージョン表示で最新の `APP_VERSION` が反映されていることを確認します。
