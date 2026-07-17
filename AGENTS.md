# AGENTS.md

このファイルはリポジトリ全体に適用する。Ambient Lapisを実装・検証するAIエージェントは、作業開始前に本書と参照文書を読むこと。

## 1. プロジェクトの目的

Ambient Lapisは、Nature Remo Lapisの温度・湿度と、Nature Remoが認識しているエアコン設定を継続収集し、SQLiteへ保存してNext.jsのダッシュボードで表示する個人用セルフホストアプリケーションである。

初期版では、安定した収集、正直な状態表現、長期履歴、上質な閲覧体験を優先する。機能数を増やすことより、仕様どおりの挙動、テスト可能性、保守性、秘密情報の保護を重視する。

## 2. 作業開始時に読むもの

次の順序で確認する。

1. ユーザーの現在の依頼
2. この`AGENTS.md`
3. `docs/system-design.md` — 初期版の実装基準、API、DB、UI、運用、試験仕様
4. `docs/requirements.md` — 目的、必須要件、対象外、完成条件
5. `docs/technical-research.md` — 技術選定の背景と未決事項
6. `secrets/nature-remo-poc.md` — ローカル実機PoCの非公開メモ。存在する場合だけ読む

`docs/system-design.md`を初期版の仕様上の正本とする。実装上の発見で設計変更が必要になった場合は、コードだけを変更せず、同じ作業で該当ドキュメントも更新する。

実機PoCメモは個人情報を含むローカル資料であり、公開仕様ではない。そこから得た事実を公開文書やfixtureへ反映する場合は必ず匿名化する。

### 2.1 プロジェクトローカルAgent Skills

公式ソースから導入したSkillは`.agents/skills/`、出所と整合性情報は`skills-lock.json`にある。該当する作業では、使用前に対象Skillの`SKILL.md`を最後まで読む。

| Skill | 用途 | 使用条件 |
| --- | --- | --- |
| `next-dev-loop` | Next.js変更後のdev server・browser・runtime検証 | Next.jsアプリと`next dev`が利用可能になった時点から使用する |
| `next-cache-components-adoption` | Cache Components導入 | Next.js 16.3以降へ更新し、ユーザーが導入を依頼した場合だけ使用する |
| `next-cache-components-optimizer` | Cache Componentsのstatic shell / navigation最適化 | `cacheComponents: true`を採用済みの場合だけ使用する |
| `next-partial-prefetching-adoption` | Partial Prefetching導入 | 対応Next.jsへ更新し、ユーザーが導入を依頼した場合だけ使用する |
| `shadcn` | shadcn/uiの導入、利用、更新、デバッグ | shadcn/uiを採用するか、`components.json`が存在する場合に使用する |

Skillがインストール済みであることを、ライブラリや実験的機能の採用理由にしない。現行設計はNext.js 16.2.10を基準としているため、16.3以降を要求するSkillは明示的なバージョン更新まで待機する。shadcn/uiも採用未確定であり、ユーザーの合意なく初期化しない。

## 3. 言語とコミュニケーション

- ユーザーへの説明、運用文書、設計文書は原則として日本語で書く。
- コード識別子、APIフィールド、ログイベント名は英語にする。
- 推測と実測を区別する。未検証のNature API挙動を確定事項として書かない。
- 作業完了時は、変更内容、実行したテスト・ビルド、その結果、残る未検証事項を簡潔に報告する。
- テストやビルドを実行していない場合は、その事実と理由を明記する。

## 4. 秘密情報・個人情報

### 4.1 読み取り許可

リポジトリ所有者は、Ambient Lapisの実装・デバッグ・検証に必要な範囲で、次のローカルファイルをAIエージェントが読むことを許可している。

- `.env`
- `secrets/nature_remo_token`
- `secrets/nature-remo-poc.md`
- その他`secrets/`配下に明示的に置かれたAmbient Lapis用ファイル

この許可は、必要な情報を内部的に利用するためのものであり、内容をチャット、ログ、テスト出力、Git管理ファイルへ転載する許可ではない。

### 4.2 絶対に行わないこと

- APIトークンを表示、要約、引用、ログ出力しない。
- Authorizationヘッダーを出力しない。
- 実トークンを`.env.example`、ソースコード、Dockerfile、Compose、fixture、snapshot、ドキュメントへ書かない。
- 実際のdevice ID、appliance ID、名前、MACアドレス、シリアル番号、ユーザー情報を追跡対象のfixtureや公開文書へ入れない。
- `NEXT_PUBLIC_`変数、ブラウザbundle、HTML、クライアント向けAPIへトークンを渡さない。
- Nature APIの生レスポンス全体を保存・出力しない。必要なフィールドだけを抽出する。
- `.env`、`secrets/`、`data/`、`backups/`のGit除外を解除しない。

公開fixtureでは、UUID、名前、時刻、機器情報を架空値へ置換する。実レスポンスの型やNULLの有無は維持してよいが、個人を識別できる値を残さない。

### 4.3 ローカル設定

- 実トークンは`secrets/nature_remo_token`に保存し、権限`0600`を維持する。
- 実IDと個人環境のパスは`.env`に保存する。
- `.env.example`には説明用のplaceholderだけを置く。
- Goサービスは`NATURE_REMO_TOKEN_FILE`を優先的な本番入力として扱う。
- `NATURE_REMO_TOKEN`の直接指定はローカル開発だけに限定し、token fileとの同時指定はエラーにする。

## 5. Nature Cloud APIの利用

### 5.1 許可範囲

リポジトリ所有者は、実装・デバッグ・実機PoCのために、保存済みトークンを使用してNature Remo Cloud APIへ実際のリクエストを送ることを許可している。

通常許可されるのは次の読み取りリクエストである。

- `GET /1/devices`
- `GET /1/appliances`

環境のサンドボックスやネットワーク承認が別途必要な場合は、その仕組みに従う。トークンをコマンド文字列へ直接埋め込まず、ファイルから標準入力またはアプリケーション内部で読み取る。

エアコン操作、signal送信、設定変更、削除など状態を変えるAPIは、ユーザーがその操作を明示的に依頼しない限り呼び出さない。

### 5.2 レート制限

実測した上限は5分間に30リクエストである。API応答の次のヘッダーを尊重する。

- `X-Rate-Limit-Limit`
- `X-Rate-Limit-Remaining`
- `X-Rate-Limit-Reset`

遵守事項:

- 通常の実装は既定5分ごとに`devices`と`appliances`を各1回だけ呼ぶ。間隔は`POLL_INTERVAL`に従う。
- 手動確認は原則として1検証サイクルにつき各エンドポイント1回にまとめる。
- 同じ情報を得るための無意味な繰り返しリクエストをしない。
- 連続PoCの既定間隔は5分とし、短縮する場合も1分未満にしない。
- `remaining <= 10`になったら、緊急性がない限り`reset`まで追加呼び出しを止める。
- HTTP 429では即時再試行しない。`reset`まで待ち、待機に上限を設ける。
- 5xxや通信エラーでも無制限に再試行しない。設計書どおりの回数とバックオフを使う。
- live APIを単体テスト、通常の結合テスト、CIから呼ばない。

### 5.3 Live検証と自動テストの分離

- 自動テストは`httptest.Server`などのローカルfakeと匿名化fixtureを使う。
- live APIテストは明示的なopt-in、例えば`LIVE_NATURE_API=1`がある場合だけ実行する。
- liveテストには通常の`go test ./...`から除外できるbuild tagまたは明示コマンドを用意する。
- liveテストの出力には値の概要と成功・失敗だけを出し、IDや生レスポンスを出さない。
- CIにはNature Remo tokenを登録しない。

### 5.4 未確定の実機挙動

`newest_events.te.created_at`と`newest_events.hu.created_at`が一定周期で更新されるのか、値が変わった場合だけ更新されるのかは未確定である。追加PoCが完了するまで、`created_at`が10分以上古いことだけを理由にセンサー停止と断定しない。

エアコン状態は実機からの双方向取得ではない。UI、API、ログ、文書では必ず「Nature Remo認識状態」と扱い、「実機状態」と断定しない。

## 6. アーキテクチャ上の境界

- GoサービスがNature API、収集スケジュール、SQLite、集計、内部API、バックアップを所有する。
- Next.jsは表示とBrowser向けBFFを所有し、Nature APIやSQLiteへ直接アクセスしない。
- ブラウザはGoサービスへ直接アクセスしない。
- Goの8080番ポートはCompose内部だけ、Next.jsの3000番ポートだけをLANへ公開する。
- SQLiteファイルを開くのはGoサービスだけとする。
- SQLiteをSMB、CIFS、NFSなどのネットワークファイルシステム上へ置かない。
- 収集処理をNext.jsのライフサイクルやページアクセスへ依存させない。
- 初期版では単一Lapis、単一エアコン、単一利用者、LAN内認証なしを維持する。
- 派生指標、CSV、通知、VPN、Matter、エアコン操作は初期版へ無断で追加しない。

## 7. 推奨リポジトリ構成

実装開始時は次の構成を使用する。既存実装がある場合は、その構成を無断で大規模変更しない。

```text
backend/
  cmd/ambient-lapis/
  internal/
    backup/
    collector/
    config/
    httpapi/
    nature/
    store/
      migrations/
web/
  src/
    app/
    components/
    lib/
  e2e/
compose.yaml
docs/
```

- Goのパッケージは責務ごとに小さく分け、`internal`境界を使う。
- SQLマイグレーションは`backend/internal/store/migrations/`へ置き、Goバイナリへembedする。
- Next.jsは`src/app`のApp Routerを使う。
- API DTOとUI表示モデルの変換を`web/src/lib/`へ置き、コンポーネント内で生JSONを解釈しない。
- 共通化は実際に複数箇所で必要になってから行い、早すぎる抽象化を避ける。

## 8. 実装品質

### 8.1 共通原則

- 最小の縦切りで実装し、取得、正規化、保存、API、表示を段階的につなぐ。
- エラーを握りつぶさず、利用者向け状態と運用ログへ適切に変換する。
- NULL、不明、欠損、部分成功を通常のドメイン状態として扱う。
- 値を推測で補わない。欠損を0、現在時刻、直前値へ変換しない。
- 時刻はDBでUTC Unix milliseconds、APIでUTC RFC 3339、画面でAsia/Tokyoとする。
- 新しい依存関係は必要性を説明できる場合だけ追加し、標準ライブラリや既存依存で十分なら増やさない。
- 依存バージョンとロックファイルを固定する。
- 公開API、DB、設定、運用挙動を変えたら設計書と`.env.example`も確認する。

### 8.2 Go

- `context.Context`をI/O境界へ渡し、timeoutとキャンセルを伝播させる。
- HTTP client、clock、Nature adapter、storeを差し替え可能にし、テストで実ネットワークや実時刻へ依存しない。
- エラーは分類可能な形でwrapし、ログとHTTPレスポンスの責務を分ける。
- SQLはプレースホルダーを使用し、入力からSQL文字列を組み立てない。
- 収集の部分成功を保持し、一方のAPI失敗で他方の成功をロールバックしない。
- `gofmt`を必ず適用する。
- 競合、goroutine leak、ticker / timerの停止、Graceful Shutdownをテストする。

### 8.3 Next.js / TypeScript

- TypeScriptのstrict modeを有効にする。
- `any`、非検証のtype assertion、無差別なnon-null assertionを避ける。
- Server ComponentとClient Componentの境界を明示し、EChartsなどブラウザ依存処理だけをClient Componentへ置く。
- 現在値と状態は`no-store`、履歴は設計書の短いcache方針を守る。
- loading、empty、partial error、stopped、offline、stale、unknown、gapを個別に実装・テストする。
- 色だけに依存せず、キーボード、タッチ、`prefers-reduced-motion`、WCAG AA相当を確認する。
- APIの実値をUIコンポーネントへ直結させず、表示モデルへ変換する。

## 9. テスト方針

### 9.1 変更時の基本ルール

- 挙動を追加・変更する場合、同じ変更に対応するテストを含める。
- バグ修正では、修正前に失敗し修正後に成功する回帰テストを追加する。
- 実装中は変更箇所に近いfocused testを繰り返す。
- 作業完了前に、影響範囲のfull test、静的解析、buildを実行する。
- テストを弱める、skipする、snapshotを無条件更新することで通過させない。
- flaky testを再実行だけで無視せず、原因を調べる。

### 9.2 Backendで必要なテスト

- Nature DTOの正常、NULL、欠損、未知enum、不正時刻
- 明示ID選択とtarget not found
- temperature / humidityの個別時刻
- `button`のon / off / unknown正規化
- `warm`、`blow`、文字列温度、空文字、機種固有`extra`
- 429、5xx、timeout、retry、キャンセル
- success、partial、error、cancelledの収集結果
- SQLiteマイグレーション、制約、再起動、WAL、部分保存
- 集計境界、`STALE_AFTER`境界のgap、Asia/Tokyoの日付境界
- health、readiness、API validation、error envelope
- バックアップ、integrity check、保持世代、リストア

### 9.3 Frontendで必要なテスト

- API responseのparseと表示モデル変換
- 現在温度、湿度、Nature Remo認識状態
- loading、dataなし、API error、partial、stopped、offline、stale、unknown、gap
- 24時間、7日、30日、任意期間の切替
- ライト / ダークテーマ
- キーボード、タッチ、reduced motion、アクセシビリティ
- モバイル、タブレット、PCの主要レイアウト
- 欠損を接続しないグラフとエアコンON背景帯

## 10. 検証コマンドと完了条件

実装が存在する範囲で次を実行する。コマンドがまだない初期段階では、スキャフォールド時に同等のscriptを追加する。

### 10.1 Backend

```bash
cd backend
go fmt ./...
go test ./...
go test -race ./...
go vet ./...
go build ./cmd/ambient-lapis
```

`gofmt -w .`は変更対象を確認してから実行し、ユーザーの無関係な変更を巻き込まない。通常テストはlive Nature APIを呼んではならない。

### 10.2 Frontend

パッケージマネージャーはlockfileに従う。新規作成時はnpmと`package-lock.json`を使用し、少なくとも次のscriptを用意する。

`npm test`を含む検証scriptはwatch modeに入らず、非対話で終了コードを返すようにする。

```bash
cd web
npm run lint
npm run typecheck
npm test
npm run build
```

UIや導線を変更した場合は、必要に応じて次も実行する。

```bash
cd web
npm run test:e2e
```

### 10.3 リポジトリ共通

```bash
git diff --check
git status --short
```

コードまたはbuild設定を変更した作業は、次の順で検証する。

1. formatter / format check
2. focused test
3. full unit / integration test
4. lint / typecheck / vet
5. production build
6. 必要なE2EまたはCompose smoke test

「テストが通った」だけでbuild成功を代用しない。完了報告前にproduction buildを実施する。docsだけの変更ではアプリbuildを省略してよいが、リンク、コード例、`git diff --check`を確認する。

依存ダウンロードやlive API接続がサンドボックスで失敗した場合は、必要な承認を正規に要求する。検証を回避するために非公式な代替物や無関係なglobal packageを使用しない。

## 11. Gitと変更管理

- 作業開始時と完了時に`git status --short`を確認する。
- ユーザーの既存変更や未追跡ファイルを自分の変更として扱わない。
- 無関係なファイルを編集、整形、stage、commitしない。
- ユーザーの明示依頼なしにcommit、push、PR作成を行わない。
- `git reset --hard`、広範囲の削除、秘密情報を含む履歴操作を行わない。
- `.env.example`を更新する場合、placeholderだけであることを検索で確認する。
- commitや公開前には、token、実ID、MAC、シリアル、個人名がtracked fileへ混入していないことを確認する。

推奨確認:

```bash
git diff --check
git grep -nE 'Authorization: Bearer [A-Za-z0-9._-]{20,}|NATURE_REMO_TOKEN=[A-Za-z0-9._-]{20,}'
git status --short --ignored
```

上記`git grep`は一致がないことを合格条件とする。placeholderや変数名だけを秘密情報と誤判定しないパターンに保つ。

自動secret scannerが導入されたら、それも必須checkへ加える。

## 12. 実装の進め方

初期実装は次の順で、動く縦切りを保ちながら進める。

1. Go設定、secret、Nature client、DTO、health / readiness
2. SQLite migration、1回収集、`status` / `current` API
3. Next.js shell、現在値、エアコン認識状態、主要エラー状態
4. 既定5分収集、時系列、日次集計、ECharts
5. Compose、バックアップ、Graceful Shutdown、運用試験
6. 30〜60分のセンサーPoC、リモコン同期PoC、閾値調整

各段階で、実装、テスト、ドキュメント、検証結果を揃えてから次へ進む。バックエンド全体を完成させるまでUI検証を遅らせず、`current` APIができた時点で最初の画面へ接続する。

## 13. Definition of Done

作業が完了したと言う前に、該当する項目をすべて満たす。

- 依頼された挙動が実装されている。
- 仕様、API、DB、セキュリティ境界に違反していない。
- 新規・変更挙動のテストがある。
- focused testとfull testが通っている。
- lint、typecheck、vetなどの静的確認が通っている。
- production buildが通っている。
- UI変更では必要なE2E・実画面確認を行っている。
- live APIを使った場合、レート制限と秘密情報非露出を確認している。
- `git diff --check`が通っている。
- tracked fileにtokenや個人情報が混入していない。
- 設計や設定が変わった場合、文書と`.env.example`が同期している。
- 完了報告に実行コマンド、結果、未検証事項を記載している。
