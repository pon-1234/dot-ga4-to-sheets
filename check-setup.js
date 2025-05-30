require('dotenv').config();
const fs = require('fs');
const { BigQuery } = require('@google-cloud/bigquery');
const { google } = require('googleapis');

async function checkSetup() {
  console.log('🔍 設定チェックを開始します...\n');

  // 1. 環境変数チェック
  console.log('1. 環境変数チェック:');
  console.log(`   PROJECT_ID: ${process.env.PROJECT_ID || '❌ 未設定'}`);
  console.log(`   SPREADSHEET_ID: ${process.env.SPREADSHEET_ID || '❌ 未設定'}`);
  console.log(`   MULTI_DATASET_MODE: ${process.env.MULTI_DATASET_MODE || '❌ 未設定'}`);

  // 2. サービスアカウントファイルチェック
  console.log('\n2. サービスアカウントファイルチェック:');
  const credentialsPath = process.env.CREDENTIALS_PATH || './credentials/service-account.json';
  if (fs.existsSync(credentialsPath)) {
    console.log(`   ✅ ${credentialsPath} が存在します`);
    try {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      console.log(`   サービスアカウント: ${credentials.client_email}`);
    } catch (error) {
      console.log(`   ❌ JSONファイルの形式が無効です: ${error.message}`);
    }
  } else {
    console.log(`   ❌ ${credentialsPath} が見つかりません`);
  }

  // 3. データセット設定チェック
  console.log('\n3. データセット設定チェック:');
  try {
    const config = require('./src/config');
    console.log(`   ✅ ${config.datasets.length} 件のデータセットが設定されています:`);
    config.datasets.forEach((ds, index) => {
      console.log(`     ${index + 1}. ${ds.name} (${ds.dataset}) - ${ds.enabled ? '有効' : '無効'}`);
    });
  } catch (error) {
    console.log(`   ❌ データセット設定エラー: ${error.message}`);
  }

  // 4. BigQuery接続テスト
  console.log('\n4. BigQuery接続テスト:');
  try {
    const bigquery = new BigQuery({
      projectId: process.env.PROJECT_ID,
      keyFilename: credentialsPath
    });
    
    const [datasets] = await bigquery.getDatasets();
    console.log(`   ✅ BigQuery接続成功 (${datasets.length} データセット確認)`);
  } catch (error) {
    console.log(`   ❌ BigQuery接続エラー: ${error.message}`);
  }

  // 5. Google Sheets接続テスト
  console.log('\n5. Google Sheets接続テスト:');
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID
    });
    
    console.log(`   ✅ Google Sheets接続成功`);
    console.log(`   スプレッドシート名: ${response.data.properties.title}`);
  } catch (error) {
    console.log(`   ❌ Google Sheets接続エラー: ${error.message}`);
    if (error.message.includes('permission')) {
      console.log(`   💡 サービスアカウントにスプレッドシートの編集権限を付与してください`);
    }
  }

  console.log('\n🎉 設定チェック完了！');
}

checkSetup().catch(console.error);