# GA4 to Sheets Automation

BigQueryに保存されたGA4データをGoogle Sheetsに自動反映するシステムです。

## 機能

### 分析指標
- **CVR関連**: CVR、CVR（広告流入除く）、変化率
- **ファネル分析**: HP → 予約サイト → 予約内容 → 個人情報 → 完了の各遷移率
- **ユーザー分析**: 総ユーザー数、ページビュー、流入元別分析
- **属性分析**: 年齢、性別、デバイス、地域別のユーザー数とCVR

### 集計期間
- 月次集計
- 四半期集計

### マルチデータセット対応 🆕
- **複数GA4データセットの一括分析**: 最大21件のデータセットを同時分析
- **データセット間比較**: CVR、ファネル、流入元などの横断比較
- **個別データセットシート**: 各データセットの詳細分析シート
- **統合ダッシュボード**: 全データセットのサマリーと推奨事項

## セットアップ

### 1. 環境設定

```bash
# 依存関係をインストール
npm install

# 環境変数ファイルを作成
cp .env.example .env
```

### 2. 環境変数の設定

`.env`ファイルを編集してください：

```bash
# Google Cloud Project設定
PROJECT_ID=your-gcp-project-id

# 単一データセット設定（後方互換性）
BIGQUERY_DATASET=your-ga4-dataset-id
BIGQUERY_TABLE_PREFIX=events_

# マルチデータセット設定
DATASETS_CONFIG_FILE=./config/datasets.json
MULTI_DATASET_MODE=true
COMPARISON_MODE=true

# Google Sheets設定
SPREADSHEET_ID=your-google-sheets-id
CREDENTIALS_PATH=./credentials/service-account.json
```

### 2.1. マルチデータセット設定

`config/datasets.json`を編集して21件のデータセットを設定：

```json
[
  {
    "name": "Main Website",
    "dataset": "analytics_123456789",
    "tablePrefix": "events_",
    "description": "メインウェブサイトのGA4データ",
    "enabled": true
  },
  {
    "name": "Mobile App",
    "dataset": "analytics_987654321", 
    "tablePrefix": "events_",
    "description": "モバイルアプリのGA4データ",
    "enabled": true
  }
]
```

### 3. サービスアカウントの設定

1. Google Cloud Consoleでサービスアカウントを作成
2. 以下の権限を付与：
   - BigQuery データ閲覧者
   - BigQuery ジョブユーザー
   - Google Sheets API (編集権限)
3. JSONキーをダウンロードし、`credentials/service-account.json`として保存

### 4. Google Sheetsの準備

1. Google Sheetsを作成
2. サービスアカウントのメールアドレスに編集権限を付与
3. スプレッドシートIDを`.env`に設定

## 使用方法

### ローカル実行

#### 単一データセット処理
```bash
# 月次データ処理
npm start monthly

# 四半期データ処理
npm start quarterly
```

#### マルチデータセット処理 🆕
```bash
# 全データセット分析
npm run multi all

# 月次集計
npm run multi monthly

# 四半期集計
npm run multi quarterly

# サマリーレポート生成
npm run multi summary

# 特定データセットのみ処理
npm run multi specific "Main Website" "Mobile App"
```

### GCP Cloud Functionsにデプロイ

```bash
# 環境変数を設定
export PROJECT_ID=your-gcp-project-id
export BIGQUERY_DATASET=your-ga4-dataset-id
export SPREADSHEET_ID=your-google-sheets-id

# デプロイ実行
./deploy.sh
```

## 出力シート

### 単一データセット用シート
1. **CVR指標**: CVR、CVR（広告流入除く）、変化率
2. **ファネル分析**: 各ステップの遷移率
3. **ページビュー**: TOP20ページの閲覧数
4. **流入元分析**: 流入元別ユーザー数とCVR
5. **ユーザー属性**: 年齢、性別、デバイス、地域別分析
6. **総ユーザー数**: 期間別アクティブユーザー数

### マルチデータセット用シート 🆕
1. **CVR比較（全データセット）**: 全データセットのCVR一覧
2. **ファネル比較（全データセット）**: データセット間のファネル比較
3. **流入元比較（全データセット）**: データセット別流入元分析
4. **ユーザー属性比較（全データセット）**: データセット横断の属性分析
5. **データセット比較サマリー**: パフォーマンスランキング
6. **分析サマリー**: 推奨事項とトレンド分析
7. **データセット一覧**: 設定済みデータセット一覧
8. **個別データセットシート**: 各データセット専用の詳細シート（例：`Main Website_CVR`）

## スケジュール実行

Cloud Schedulerで以下のスケジュールで自動実行されます：

- **月次更新**: 毎月1日 9:00 AM (JST)
- **四半期更新**: 四半期初月1日 10:00 AM (JST)

## トラブルシューティング

### よくある問題

1. **BigQuery権限エラー**
   - サービスアカウントにBigQuery権限が付与されているか確認
   - データセット名とテーブルプレフィックスが正しいか確認
   - **マルチデータセット**: 全21件のデータセットに対するアクセス権限を確認

2. **Google Sheets権限エラー**
   - サービスアカウントがスプレッドシートの編集権限を持っているか確認
   - スプレッドシートIDが正しいか確認

3. **GA4イベント名エラー**
   - カスタムイベント名（「プラン選択」など）が実際のGA4設定と一致しているか確認
   - 必要に応じてクエリ内のイベント名を修正

4. **マルチデータセット設定エラー** 🆕
   - `config/datasets.json`の JSON 形式が正しいか確認
   - データセット名の重複がないか確認
   - 無効化したいデータセットは `"enabled": false` に設定

### ログの確認

```bash
# Cloud Functionsのログ確認
gcloud functions logs read ga4-to-sheets-monthly --limit 50
gcloud functions logs read ga4-to-sheets-quarterly --limit 50
```

## プロジェクト構造

```
src/
├── config.js              # 設定管理
├── index.js               # メイン処理
├── services/
│   ├── bigquery.js        # BigQuery接続
│   └── sheets.js          # Google Sheets API
├── queries/
│   ├── cvr-metrics.js     # CVR関連クエリ
│   ├── funnel-metrics.js  # ファネル分析クエリ
│   └── user-analytics.js  # ユーザー分析クエリ
└── utils/
    └── date-utils.js      # 日付処理ユーティリティ
```