/**
 * 設定とデータの検証ユーティリティ
 */

class Validator {
  static validateConfig(config) {
    const errors = [];

    // 必須設定の確認
    if (!config.project?.id) {
      errors.push('PROJECT_ID が設定されていません');
    }

    if (!config.sheets?.spreadsheetId) {
      errors.push('SPREADSHEET_ID が設定されていません');
    }

    if (!config.sheets?.credentialsPath) {
      errors.push('CREDENTIALS_PATH が設定されていません');
    }

    // データセット設定の確認
    if (!config.datasets || config.datasets.length === 0) {
      errors.push('datasets が設定されていません');
    } else {
      config.datasets.forEach((dataset, index) => {
        if (!dataset.name) {
          errors.push(`datasets[${index}].name が設定されていません`);
        }
        if (!dataset.dataset) {
          errors.push(`datasets[${index}].dataset が設定されていません`);
        }
        if (!dataset.tablePrefix) {
          errors.push(`datasets[${index}].tablePrefix が設定されていません`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      return { isValid: false, error: '開始日が無効です' };
    }

    if (isNaN(end.getTime())) {
      return { isValid: false, error: '終了日が無効です' };
    }

    if (start >= end) {
      return { isValid: false, error: '開始日は終了日より前である必要があります' };
    }

    const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1年
    if (end - start > maxRangeMs) {
      return { isValid: false, error: '日付範囲は1年以内にしてください' };
    }

    return { isValid: true };
  }

  static validatePeriod(period) {
    const validPeriods = ['month', 'quarter'];
    return {
      isValid: validPeriods.includes(period),
      error: validPeriods.includes(period) ? null : `period は ${validPeriods.join(' または ')} を指定してください`
    };
  }

  static sanitizeDatasetName(name) {
    // データセット名から危険な文字を除去
    return name.replace(/[^a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s]/g, '');
  }

  static validateAnalysisData(data) {
    const errors = [];

    if (!data) {
      errors.push('分析データが存在しません');
      return { isValid: false, errors };
    }

    if (!data.cvr_analysis) {
      errors.push('CVR分析データが存在しません');
    }

    if (!data.booking_funnel) {
      errors.push('ファネル分析データが存在しません');
    }

    if (!data.traffic_analysis) {
      errors.push('流入元分析データが存在しません');
    }

    if (!data.user_demographics) {
      errors.push('ユーザー属性データが存在しません');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = Validator;