const { google } = require('googleapis');
const config = require('../config');

/**
 * 統合Google Sheetsサービス
 * 宿泊施設向けの分析結果をスプレッドシートに出力
 */
class SheetsService {
  constructor() {
    this.auth = new google.auth.GoogleAuth({
      keyFile: config.sheets.credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    this.spreadsheetId = config.sheets.spreadsheetId;
  }

  async clearSheet(sheetName) {
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
      });
    } catch (error) {
      console.error(`Error clearing sheet ${sheetName}:`, error);
      throw error;
    }
  }

  async writeToSheet(sheetName, data, headers = null) {
    try {
      const values = headers ? [headers, ...data] : data;
      
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });
      
      console.log(`Data written to sheet: ${sheetName}`);
    } catch (error) {
      console.error(`Error writing to sheet ${sheetName}:`, error);
      throw error;
    }
  }

  async createSheetIfNotExists(sheetName) {
    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      
      const sheetExists = spreadsheet.data.sheets.some(
        sheet => sheet.properties.title === sheetName
      );
      
      if (!sheetExists) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            }],
          },
        });
        console.log(`Created new sheet: ${sheetName}`);
      }
    } catch (error) {
      console.error(`Error creating sheet ${sheetName}:`, error);
      throw error;
    }
  }

  formatMultiDatasetCVRData(cvrData, cvrNoAdsData) {
    const headers = [
      '期間', 'データセット', 'アクティブユーザー数', 'コンバージョン数', 'CVR', 
      'CVR（広告流入除く）', '説明'
    ];
    
    const dataByPeriodAndDataset = {};
    
    // CVRデータを整理
    cvrData.forEach(row => {
      const key = `${row.period}_${row.dataset_name}`;
      dataByPeriodAndDataset[key] = {
        period: row.period,
        dataset_name: row.dataset_name,
        dataset_description: row.dataset_description,
        active_users: row.active_users,
        purchase_users: row.purchase_users,
        cvr: row.cvr
      };
    });
    
    // CVR（広告流入除く）データを追加
    cvrNoAdsData.forEach(row => {
      const key = `${row.period}_${row.dataset_name}`;
      if (dataByPeriodAndDataset[key]) {
        dataByPeriodAndDataset[key].cvr_no_ads = row.cvr_no_ads;
      }
    });
    
    const rows = Object.values(dataByPeriodAndDataset).map(row => [
      row.period,
      row.dataset_name,
      row.active_users,
      row.purchase_users,
      (row.cvr * 100).toFixed(2) + '%',
      row.cvr_no_ads ? (row.cvr_no_ads * 100).toFixed(2) + '%' : '',
      row.dataset_description
    ]);
    
    return { headers, rows };
  }

  formatMultiDatasetFunnelData(funnelData) {
    const headers = [
      '期間', 'データセット', '初回訪問', 'プラン選択', '予約内容入力', '個人情報入力', '予約完了',
      'HP→プラン選択率', 'プラン選択→予約内容率', '予約内容→個人情報率', '個人情報→完了率', '説明'
    ];
    
    const rows = funnelData.map(row => [
      row.period,
      row.dataset_name,
      row.first_visit_users,
      row.plan_selection_users,
      row.booking_input_users,
      row.personal_info_users,
      row.completion_users,
      (row.hp_to_plan_rate * 100).toFixed(2) + '%',
      (row.plan_to_booking_rate * 100).toFixed(2) + '%',
      (row.booking_to_personal_rate * 100).toFixed(2) + '%',
      (row.personal_to_completion_rate * 100).toFixed(2) + '%',
      row.dataset_description
    ]);
    
    return { headers, rows };
  }

  formatMultiDatasetTrafficData(trafficData) {
    const headers = [
      '期間', 'データセット', '流入元', 'ユーザー数', 'コンバージョン数', 'CVR', '割合', '説明'
    ];
    
    const rows = trafficData.map(row => [
      row.period,
      row.dataset_name,
      row.source_medium,
      row.total_users,
      row.purchase_users,
      (row.cvr_by_source * 100).toFixed(2) + '%',
      (row.user_percentage * 100).toFixed(2) + '%',
      row.dataset_description
    ]);
    
    return { headers, rows };
  }

  formatMultiDatasetDemographicsData(demographicsData) {
    const headers = [
      '期間', 'データセット', '属性タイプ', '属性値', 'ユーザー数', 'コンバージョン数', 'CVR', '割合', '説明'
    ];
    
    const rows = demographicsData.map(row => [
      row.period,
      row.dataset_name,
      row.demographic_type,
      row.demographic_value,
      row.total_users,
      row.purchase_users,
      (row.cvr * 100).toFixed(2) + '%',
      (row.percentage * 100).toFixed(2) + '%',
      row.dataset_description
    ]);
    
    return { headers, rows };
  }

  formatComparisonSummary(summary) {
    const headers = [
      'データセット', '最新CVR', '最新ユーザー数', '最新コンバージョン数', 'ファネル完了率'
    ];
    
    const rows = Object.entries(summary).map(([datasetName, data]) => [
      datasetName,
      (data.latest_cvr * 100).toFixed(2) + '%',
      data.latest_users,
      data.latest_conversions,
      (data.funnel_completion_rate * 100).toFixed(2) + '%'
    ]);
    
    // CVRでソート（降順）
    rows.sort((a, b) => {
      const cvrA = parseFloat(a[1].replace('%', ''));
      const cvrB = parseFloat(b[1].replace('%', ''));
      return cvrB - cvrA;
    });
    
    return { headers, rows };
  }

  async updateMultiDatasetSheets(comparisonData) {
    try {
      const sheets = [
        {
          name: 'CVR比較（全データセット）',
          data: this.formatMultiDatasetCVRData(comparisonData.cvr, [])
        },
        {
          name: 'ファネル比較（全データセット）',
          data: this.formatMultiDatasetFunnelData(comparisonData.funnel)
        },
        {
          name: '流入元比較（全データセット）',
          data: this.formatMultiDatasetTrafficData(comparisonData.traffic)
        },
        {
          name: 'ユーザー属性比較（全データセット）',
          data: this.formatMultiDatasetDemographicsData(comparisonData.demographics)
        },
        {
          name: 'データセット比較サマリー',
          data: this.formatComparisonSummary(comparisonData.summary)
        }
      ];

      for (const sheet of sheets) {
        await this.createSheetIfNotExists(sheet.name);
        await this.clearSheet(sheet.name);
        await this.writeToSheet(sheet.name, sheet.data.rows, sheet.data.headers);
      }

      // データセット別の個別シートも作成
      if (config.multiDatasetMode) {
        await this.createIndividualDatasetSheets(comparisonData);
      }

      console.log('All multi-dataset sheets updated successfully');
    } catch (error) {
      console.error('Error updating multi-dataset sheets:', error);
      throw error;
    }
  }

  async createIndividualDatasetSheets(comparisonData) {
    const datasets = [...new Set(comparisonData.cvr.map(row => row.dataset_name))];
    
    for (const datasetName of datasets) {
      try {
        // 各データセットのデータを抽出
        const datasetCVR = comparisonData.cvr.filter(row => row.dataset_name === datasetName);
        const datasetFunnel = comparisonData.funnel.filter(row => row.dataset_name === datasetName);
        const datasetTraffic = comparisonData.traffic.filter(row => row.dataset_name === datasetName);
        const datasetDemographics = comparisonData.demographics.filter(row => row.dataset_name === datasetName);

        // 個別シート用のフォーマット（データセット名の列を除く）
        const cvrHeaders = ['期間', 'アクティブユーザー数', 'コンバージョン数', 'CVR'];
        const cvrRows = datasetCVR.map(row => [
          row.period,
          row.active_users,
          row.purchase_users,
          (row.cvr * 100).toFixed(2) + '%'
        ]);

        const funnelHeaders = [
          '期間', '初回訪問', 'プラン選択', '予約内容入力', '個人情報入力', '予約完了',
          'HP→プラン選択率', 'プラン選択→予約内容率', '予約内容→個人情報率', '個人情報→完了率'
        ];
        const funnelRows = datasetFunnel.map(row => [
          row.period,
          row.first_visit_users,
          row.plan_selection_users,
          row.booking_input_users,
          row.personal_info_users,
          row.completion_users,
          (row.hp_to_plan_rate * 100).toFixed(2) + '%',
          (row.plan_to_booking_rate * 100).toFixed(2) + '%',
          (row.booking_to_personal_rate * 100).toFixed(2) + '%',
          (row.personal_to_completion_rate * 100).toFixed(2) + '%'
        ]);

        // 個別シートを作成
        const sheetName = `${datasetName}_CVR`;
        await this.createSheetIfNotExists(sheetName);
        await this.clearSheet(sheetName);
        await this.writeToSheet(sheetName, cvrRows, cvrHeaders);

        const funnelSheetName = `${datasetName}_ファネル`;
        await this.createSheetIfNotExists(funnelSheetName);
        await this.clearSheet(funnelSheetName);
        await this.writeToSheet(funnelSheetName, funnelRows, funnelHeaders);

        console.log(`Individual sheets created for dataset: ${datasetName}`);
      } catch (error) {
        console.error(`Error creating individual sheets for ${datasetName}:`, error);
      }
    }
  }

  async createDatasetListSheet() {
    const datasets = config.datasets;
    const headers = ['データセット名', 'BigQueryデータセット', 'テーブルプレフィックス', '説明', '有効'];
    const rows = datasets.map(ds => [
      ds.name,
      ds.dataset,
      ds.tablePrefix,
      ds.description,
      ds.enabled ? '有効' : '無効'
    ]);

    await this.createSheetIfNotExists('データセット一覧');
    await this.clearSheet('データセット一覧');
    await this.writeToSheet('データセット一覧', rows, headers);
  }
}

module.exports = SheetsService;