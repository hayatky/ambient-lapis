# Ambient Lapis 技術調査・構成メモ

更新日: 2026-07-18
調査基準日: 2026-07-17〜2026-07-18

## 1. 目的

LAN内に設置したNature Remo Lapisから、自室の温度・湿度とエアコンの動作状況を継続的に収集・保存し、Next.jsで見やすく美しいダッシュボードとして表示する。

想定する実行環境は次のいずれか。

- Synology NAS (Intel CPU) のContainer Manager上のDocker Compose
- Hyper-V上のUbuntu ServerのDocker Compose

温度・湿度・エアコン状態は既定5分間隔で取得し、SQLiteへ保存する。収集間隔は環境変数`POLL_INTERVAL`で変更可能とする。

## 2. 現時点の結論

推奨構成は次のとおり。

```text
Nature Remo Cloud API
        ↓ 既定5分ごと
Go Collector / Internal API
        ↓
      SQLite
        ↑
Next.js Dashboard
        ↑
     Browser
```

- Nature Remo Cloud APIを使用する。
- Goの常駐サービスが収集、SQLite、内部参照APIを一括して所有する。
- Next.jsはダッシュボード表示に集中し、Goサービスの内部HTTP APIからデータを取得する。
- SQLiteファイルはGoコンテナだけにマウントし、Next.jsコンテナとは共有しない。
- 第一候補のホストは、常時稼働しやすいSynology NASとする。
- Synologyの性能・CPUアーキテクチャ・Compose互換性に問題がある場合はHyper-V上のUbuntu Serverを使用する。

## 3. Nature Remoから取得できる情報

### 3.1 温度・湿度

Cloud APIの次のエンドポイントを使用する。

```http
GET https://api.nature.global/1/devices
Authorization: Bearer {TOKEN}
```

主な取得フィールドは次のとおり。

- `newest_events.te.val`: 温度（℃）
- `newest_events.te.created_at`: 温度の計測時刻
- `newest_events.hu.val`: 相対湿度（%）
- `newest_events.hu.created_at`: 湿度の計測時刻
- `online`: Remoのオンライン状態
- `firmware_version`: ファームウェア
- `temperature_offset`: 温度校正値
- `humidity_offset`: 湿度校正値
- デバイス名、デバイスID、更新日時など

温度と湿度の`created_at`は別々なので、DBにも個別に保存する。

Lapis本体の環境センサーは温度・湿度のみ。次の値は直接取得できない。

- 照度
- 人感
- CO2
- VOC
- PM2.5
- 騒音
- 気圧

### 3.2 温湿度から算出できる情報

ダッシュボード側で次の指標を算出できる。

- 絶対湿度
- 露点温度
- 不快指数
- 室内向け推定WBGT
- 熱中症危険度
- 結露リスク
- インフルエンザ注意指標

Nature HomeもLapisの温湿度から絶対湿度や室内向けWBGTを算出している。

### 3.3 エアコン状態

Cloud APIの次のエンドポイントを使用する。

```http
GET https://api.nature.global/1/appliances
Authorization: Bearer {TOKEN}
```

`type`が`AC`の家電について、`settings`から次の情報を取得できる。

- `settings.button`
  - `power-off`: 停止
  - 空文字: 運転中
- `settings.mode`: 冷房、暖房、除湿、送風、自動など
- `settings.temp`: 設定温度
- `settings.temp_unit`: `c`、`f`など
- `settings.vol`: 風量
- `settings.dir`: 上下風向
- `settings.dirh`: 左右風向
- `settings.extra`: 機種固有設定
- `settings.updated_at`: 状態更新時刻

2026-07-13から、エアコン付属リモコンの赤外線信号をLapisが受信し、Nature Home上の状態へ同期する機能が提供されている。

ただし、これはエアコン本体との双方向通信ではない。画面では「実機状態」ではなく「Nature Remo認識状態」と表記する。

実機とずれる可能性がある例:

- 付属リモコンの赤外線がLapisまで届かなかった。
- Lapisが信号を解釈できなかった。
- エアコン内部のタイマーで停止した。
- 別のスマートリモコンから操作した。
- 停電やブレーカー操作があった。
- Lapisは信号を受信したが、エアコン本体には信号が届かなかった。

コンプレッサーの実運転や消費電力を正確に確認するには、ECHONET Lite対応エアコン、Nature Remo E、または別の適切な電力計測機器が必要。

## 4. Cloud APIの利用条件

- 個人アクセストークンは`home.nature.global`から発行する。
- BearerトークンはGoサービスだけに保持する。
- Next.jsやブラウザ、`NEXT_PUBLIC_`環境変数へ公開しない。
- API上限は5分間に30リクエスト。
- 上限超過時はHTTP 429となる。
- センサーの過去履歴を取得するAPIはないため、運用開始前の履歴は復元できない。
- センサー自体の更新間隔は公式には明記されていない。

既定5分ごとに次の2リクエストを実行する。

```text
GET /1/devices
GET /1/appliances
```

1日あたりの概算:

```text
288回の収集 × 2リクエスト = 576リクエスト/日
```

5分間30リクエストの上限に対して十分余裕がある。

現時点ではCloud API自体の従量課金や有料APIプランの記載は確認できない。ただし、将来も無料であることが保証されているわけではないため、API仕様と利用規約の変更は追跡対象とする。

## 5. LAN内Local APIとMatter

Nature公式Developer Pageでは、Lapisの公式Local API対応は依然として将来対応とされている。従来機向けの`/messages`を温湿度収集に使用しない。

LapisはMatter 1.2対応で、Matter経由でApple Homeへ温度・湿度を公開できる。独自Matter ControllerによるLAN内収集は技術的には可能性が高いが、次の実機検証が必要。

- Lapisが公開するendpointとcluster構成
- 属性のreporting頻度
- 追加fabricのcommissioning手順
- mDNS、IPv6、UDP multicastのLAN環境
- Controller鍵・証明書の永続化
- Lapisとmatter.jsの相互運用性

今回の初期実装はCloud APIを採用し、将来のMatter移行は収集アダプターの差し替えとして扱う。

## 6. Next.js内で定期処理を行わない理由

セルフホストした`next start`はアクセスがなくてもNode.jsサーバーとして動き続ける。そのため、`instrumentation.ts`や`setInterval()`で5分おきの処理を実行すること自体は可能。

ただし、長期ログ収集には次の問題がある。

- 複数のNext.jsインスタンスが同じジョブを開始する可能性がある。
- ローリング更新中に二重収集する可能性がある。
- UI更新と収集処理の障害範囲が同じになる。
- 開発時の再読み込みで多重登録対策が必要になる。
- Next.jsの`register()`はジョブスケジューラーではない。

このため、収集は独立したGo常駐サービスへ分離する。

## 7. Goサービスの責務

Goサービスは次を担当する。

- 既定5分間隔の逐次収集（`POLL_INTERVAL`で変更可能）
- Nature Remo Cloud APIクライアント
- 応答の検証と対象デバイス・家電の抽出
- SQLiteマイグレーション
- SQLiteへの保存
- ダッシュボード用集計
- Next.js向け内部REST API
- healthcheck、readiness check
- バックアップ作成
- Graceful shutdown

### 7.1 スケジュール

想定動作:

1. 起動直後に1回取得する。
2. 以降は`POLL_INTERVAL`の間隔で取得する。未設定時は5分とする。
3. 1回の取得が完了してから次を待ち、処理を重複させない。
4. APIエラーでもプロセスは終了せず、次回またはバックオフ後に再試行する。

エラー処理:

- HTTPタイムアウト: 約15秒
- HTTP 429: `X-Rate-Limit-Reset`を尊重
- HTTP 5xx: 指数バックオフ
- 不正JSON・スキーマ変更: エラーを残し、既存DBを壊さない
- 最終成功から`STALE_AFTER`超: ダッシュボードに警告。未設定時は`max(10m, 2 × POLL_INTERVAL)`を使用する
- センサーの`created_at`が長時間更新されない: 値が古いと表示

### 7.2 Goの技術候補

- 標準`net/http`
- 標準`database/sql`
- SQLiteドライバー: `modernc.org/sqlite`を第一候補
  - CGO不要
  - `linux/amd64`と`linux/arm64`のイメージを作りやすい
- SQLマイグレーションはバイナリへembedする
- 設定は環境変数またはsecret fileから読み込む

## 8. SQLite設計案

5分間隔では1台あたり年間約105,120回の収集となる。温湿度とエアコン状態を保存しても、数十〜100MB/年程度の想定であり、SQLiteで十分。

### 8.1 環境サンプル

```sql
CREATE TABLE environment_samples (
    id                       INTEGER PRIMARY KEY,
    device_id                TEXT NOT NULL,
    fetched_at               INTEGER NOT NULL,
    device_online            INTEGER,
    temperature_c            REAL,
    temperature_observed_at  INTEGER,
    humidity_pct             REAL,
    humidity_observed_at     INTEGER,

    UNIQUE (device_id, fetched_at)
);

CREATE INDEX idx_environment_samples_time
    ON environment_samples(device_id, fetched_at);
```

### 8.2 エアコン状態

```sql
CREATE TABLE aircon_samples (
    id                   INTEGER PRIMARY KEY,
    appliance_id         TEXT NOT NULL,
    fetched_at           INTEGER NOT NULL,
    settings_updated_at  INTEGER,
    power_state          TEXT NOT NULL
                         CHECK (power_state IN ('on', 'off', 'unknown')),
    mode                 TEXT,
    target_temperature_c REAL,
    volume               TEXT,
    direction_vertical   TEXT,
    direction_horizontal TEXT,

    UNIQUE (appliance_id, fetched_at)
);

CREATE INDEX idx_aircon_samples_time
    ON aircon_samples(appliance_id, fetched_at);
```

DB内の時刻はUTCのUnix millisecondsで統一し、画面でAsia/Tokyoへ変換する。

### 8.3 SQLite設定

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

SQLiteファイルはDockerホスト自身のローカルファイルシステム上へ置く。SMB、CIFS、NFSなどのネットワークファイルシステム上へ直接置かない。

GoサービスだけがDBファイルを開く構成にし、Next.jsとはファイル共有しない。

## 9. Go内部API案

```http
GET /healthz
GET /readyz

GET /api/v1/status
GET /api/v1/current
GET /api/v1/environment/series
GET /api/v1/aircon/series
GET /api/v1/daily-summary
```

時系列API例:

```text
/api/v1/environment/series
  ?from=...
  &to=...
  &resolution=raw|15m|1h|1d
```

期間に応じてSQLite側で集計し、年間データをブラウザへそのまま送らない。

集計候補:

- 温度・湿度の平均、最小、最大
- エアコンON時間率
- モード別運転時間
- 設定温度の変化
- ON/OFF状態遷移
- データ欠損時間
- Remoオフライン時間

## 10. Next.jsの責務

- App Routerを使用する。
- Goの内部APIはServer ComponentsまたはRoute Handlerから呼び出す。
- 現在値ページは動的レンダリングまたは`no-store`で取得する。
- ブラウザを開いている間だけ、30〜60秒程度で現在表示を更新する。
- 履歴グラフは期間と解像度を指定して取得する。
- Nature APIトークンにはアクセスしない。
- SQLiteファイルにはアクセスしない。

UIの表示候補:

- 現在温度・湿度
- 絶対湿度、露点、不快指数、推定WBGT
- 直近24時間・7日・30日のグラフ
- 快適範囲の背景帯
- 日次の最高・最低・平均
- エアコンのRemo認識状態
- モード、設定温度、風量、最終更新時刻
- エアコンON区間を温湿度グラフ上へ重ねる
- オフライン・データ古延の警告

グラフライブラリはApache EChartsを有力候補とする。長期間データ、ズーム、複数系列、状態帯の表現に向いている。最終決定はUI設計時に行う。

## 11. Docker Compose案

```yaml
services:
  remo-api:
    image: ghcr.io/example/remo-api:latest
    restart: unless-stopped
    environment:
      NATURE_REMO_TOKEN_FILE: /run/secrets/nature_remo_token
      DATABASE_PATH: /data/remo.sqlite3
      POLL_INTERVAL: 5m
    secrets:
      - nature_remo_token
    volumes:
      - remo-data:/data
      - ./backups:/backups
    healthcheck:
      test: ["CMD", "/app/remo-api", "healthcheck"]
      interval: 30s
      timeout: 5s
      retries: 3

  web:
    image: ghcr.io/example/remo-dashboard:latest
    restart: unless-stopped
    environment:
      REMO_API_BASE_URL: http://remo-api:8080
    depends_on:
      remo-api:
        condition: service_healthy
    ports:
      - "3000:3000"

volumes:
  remo-data:

secrets:
  nature_remo_token:
    file: ./secrets/nature_remo_token
```

Compose standaloneの`secrets`は暗号化された秘密管理基盤ではないため、ホスト上のsecretファイル権限を制限し、Gitには含めない。

## 12. 配置先の判断

### Synology NASを優先する条件

- NASが常時稼働している。
- Container Managerが利用可能。
- CPUとRAMに余裕がある。
- SQLiteデータとバックアップをNASのローカルストレージへ置ける。

NAS上ではイメージをビルドせず、MacまたはCIでマルチアーキテクチャイメージを作成し、NASはpullして実行するだけにする。

### Hyper-V Ubuntuを選ぶ条件

- SynologyのCPU・RAMが不足する。
- SynologyのCompose互換性に問題がある。
- Ubuntu側に既存のDocker・監視基盤がある。
- 将来、Prometheusや多数のセンサーを統合する。
- 開発・デバッグの自由度を重視する。

最終的には、常時稼働率とバックアップの確実性が高い方を選ぶ。

## 13. バックアップ

WAL動作中のSQLite本体ファイルだけを単純コピーしない。

Goサービスから次のいずれかで整合性のあるバックアップを作成する。

- SQLite Online Backup API
- `VACUUM INTO`

保持案:

- 日次: 14世代
- 週次: 8世代
- 月次: 12世代
- 定期的に別ホストへ複製
- 月1回程度のリストア試験

## 14. 実装前に必要な実機PoC

1. `home.nature.global`で個人アクセストークンを発行する。
2. `GET /1/devices`を呼び、Lapisの実レスポンスを匿名化して確認する。
3. `GET /1/appliances`を呼び、対象エアコンの`settings`を確認する。
4. 付属リモコンでON/OFF、モード、設定温度を変更し、Cloud APIへ反映されるか確認する。
5. 5分間隔を基本として30〜60分取得し、必要な場合だけ1分以上へ短縮して、各`created_at`と`updated_at`の実更新頻度を測る。
6. Lapisが付属リモコンの信号を受信しやすい設置位置か確認する。
7. SynologyのCPUアーキテクチャ、Container Manager、Compose対応状況、ローカル保存先を確認する。

このPoC結果を基に、DBスキーマ、警告閾値、グラフ粒度を確定する。

## 15. 未決事項

- 正式なプロジェクト名
- Synology NASとHyper-V Ubuntuの最終選択
- 対象Lapisのdevice ID
- 対象エアコンのappliance ID
- 実機におけるセンサー更新頻度
- 付属リモコン操作がCloud APIへ反映されるまでの時間
- UIデザインとカラーテーマ
- Apache EChartsの最終採用
- 外部公開の有無と認証方法
- 通知機能の有無
- 将来のMatter対応範囲

## 16. 主要参考資料

- [Nature Developer Page](https://developer.nature.global/en/)
- [Nature Remo Cloud API Swagger](https://swagger.nature.global/)
- [Nature Remo Lapis公式仕様](https://shop.nature.global/products/nature-remo-lapis)
- [エアコン付属リモコンの操作情報がNature Homeアプリに反映されるようになりました](https://nature.global/press/news/27769/)
- [エアコン操作同期機能を利用したい](https://support.nature.global/hc/ja/articles/29267890269209)
- [LapisのMatter対応](https://nature.global/blog/21216/)
- [Next.js instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)
- [Next.js Self-Hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [SQLite Write-Ahead Logging](https://sqlite.org/wal.html)
- [SQLite Backup API](https://www.sqlite.org/backup.html)
- [Docker Compose services](https://docs.docker.com/reference/compose-file/services/)
- [Docker volumes](https://docs.docker.com/engine/storage/volumes/)
- [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite)
