/**
 * エラーハンドリングユーティリティ
 * 統一されたエラー処理とログ出力を提供
 */

class ErrorHandler {
  static handleBigQueryError(error, datasetName = 'Unknown') {
    console.error(`🔥 BigQuery Error for dataset ${datasetName}:`);
    
    if (error.message.includes('does not match any table')) {
      console.error(`   ❌ GA4 events テーブルが見つかりません`);
      console.error(`   💡 GA4データがBigQueryにエクスポートされているか確認してください`);
      console.error(`   💡 データエクスポートには24-48時間かかる場合があります`);
    } else if (error.message.includes('permission')) {
      console.error(`   ❌ BigQuery権限エラー`);
      console.error(`   💡 サービスアカウントに適切な権限が付与されているか確認してください`);
    } else if (error.message.includes('credentials')) {
      console.error(`   ❌ 認証エラー`);
      console.error(`   💡 サービスアカウントキーファイルが正しく配置されているか確認してください`);
    } else {
      console.error(`   ❌ ${error.message}`);
    }
    
    return {
      type: 'bigquery_error',
      dataset: datasetName,
      message: error.message,
      handled: true
    };
  }

  static handleSheetsError(error, sheetName = 'Unknown') {
    console.error(`🔥 Google Sheets Error for sheet ${sheetName}:`);
    
    if (error.message.includes('permission')) {
      console.error(`   ❌ Google Sheets権限エラー`);
      console.error(`   💡 サービスアカウントがスプレッドシートの編集権限を持っているか確認してください`);
    } else if (error.message.includes('not found')) {
      console.error(`   ❌ スプレッドシートが見つかりません`);
      console.error(`   💡 SPREADSHEET_IDが正しく設定されているか確認してください`);
    } else {
      console.error(`   ❌ ${error.message}`);
    }
    
    return {
      type: 'sheets_error',
      sheet: sheetName,
      message: error.message,
      handled: true
    };
  }

  static handleConfigError(error) {
    console.error(`🔥 Configuration Error:`);
    console.error(`   ❌ ${error.message}`);
    console.error(`   💡 .envファイルとconfig/datasets.jsonを確認してください`);
    
    return {
      type: 'config_error',
      message: error.message,
      handled: true
    };
  }

  static logProgress(message, stage = 'INFO') {
    const timestamp = new Date().toISOString();
    const stageEmoji = {
      'INFO': 'ℹ️',
      'SUCCESS': '✅',
      'WARNING': '⚠️',
      'ERROR': '❌',
      'PROCESSING': '🔄'
    };
    
    console.log(`${stageEmoji[stage] || 'ℹ️'} [${timestamp}] ${message}`);
  }

  static async withRetry(operation, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        this.logProgress(`Attempt ${attempt} failed, retrying in ${delay}ms...`, 'WARNING');
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }
}

module.exports = ErrorHandler;