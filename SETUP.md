# セットアップガイド

## 1. 依存関係のインストール

```bash
npm install
```

## 2. Google Cloud設定

### GCPプロジェクトの確認
```bash
gcloud config get-value project
# 結果: dot-ga4-to-sheets
```

### 必要なAPIの有効化
```bash
gcloud services enable bigquery.googleapis.com
gcloud services enable sheets.googleapis.com
```

## 3. サービスアカウントの作成

### GCP Consoleで作成
1. **IAM > サービスアカウント** に移動
2. **サービスアカウントを作成** をクリック
3. 名前: `ga4-to-sheets-service`
4. 以下の権限を付与：
   - `BigQuery データ閲覧者`
   - `BigQuery ジョブユーザー`

### JSONキーの生成
1. 作成したサービスアカウントをクリック
2. **キー** タブ > **キーを追加** > **新しいキーを作成**
3. **JSON** を選択してダウンロード
4. ファイルを `credentials/service-account.json` として保存

## 4. Google Sheets設定

### 新しいスプレッドシート作成
1. [Google Sheets](https://sheets.google.com) で新しいスプレッドシート作成
2. URLから SPREADSHEET_ID を取得
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

### サービスアカウントに権限付与
1. スプレッドシートの **共有** をクリック
2. サービスアカウントのメールアドレスを追加
3. **編集者** 権限を付与

## 5. GA4データセットの確認

### BigQueryでデータセット一覧を確認
```bash
bq ls
```

### 特定のデータセットのテーブル確認
```bash
bq ls analytics_123456789
```

### GA4テーブルの確認
```bash
bq show analytics_123456789.events_20241201
```

## 6. 設定ファイルの更新

### .env ファイル
```bash
PROJECT_ID=dot-ga4-to-sheets
SPREADSHEET_ID=実際のスプレッドシートID
MULTI_DATASET_MODE=true
COMPARISON_MODE=true
```

### config/datasets.json
21件のデータセットを実際の値に更新：

```json
[
  {
    "name": "Dataset 1",
    "dataset": "analytics_実際の値1",
    "tablePrefix": "events_",
    "description": "データセット1の説明",
    "enabled": true
  },
  {
    "name": "Dataset 2", 
    "dataset": "analytics_実際の値2",
    "tablePrefix": "events_",
    "description": "データセット2の説明",
    "enabled": true
  }
  // ... 残り19件
]
```

## 7. テスト実行

### 設定確認
```bash
npm run multi summary
```

### 単一データセットテスト
```bash
npm run multi specific "Dataset 1"
```

### 全データセット処理
```bash
npm run multi all
```

## 8. 必要なファイル構成

```
dot-ga4-to-sheets/
├── .env                          # 環境変数（作成済み）
├── config/
│   └── datasets.json            # 21件のデータセット設定
├── credentials/
│   └── service-account.json     # サービスアカウントキー
└── src/                         # ソースコード（作成済み）
```

## 9. トラブルシューティング

### 権限エラーの場合
- サービスアカウントにBigQuery権限があるか確認
- スプレッドシートの共有設定を確認
- 全21件のデータセットへのアクセス権限を確認

### データが取得できない場合
- データセット名が正確か確認
- テーブルプレフィックスが正しいか確認
- GA4データが存在する期間か確認