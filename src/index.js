require('dotenv').config();

const BigQueryService = require('./services/bigquery');
const SheetsService = require('./services/sheets');
const DateUtils = require('./utils/date-utils');
const config = require('./config');

/**
 * 宿泊施設向けGA4分析プロセッサ
 * 複数の宿泊施設のGA4データを分析し、Google Sheetsに出力
 */
class AccommodationAnalyticsProcessor {
  constructor() {
    this.bigqueryService = new BigQueryService();
    this.sheetsService = new SheetsService();
  }

  async processAccommodationAnalytics(months = 12, period = 'month') {
    console.log(`Processing accommodation analytics for ${config.datasets.length} properties...`);
    console.log(`Properties being analyzed:`);
    config.datasets.forEach(ds => {
      console.log(`  - ${ds.name}: ${ds.dataset} (${ds.enabled ? 'enabled' : 'disabled'})`);
    });

    const dateRange = DateUtils.getReportingRange(months);
    
    try {
      const analysisData = await this.fetchAccommodationData(
        dateRange.start, 
        dateRange.end, 
        period
      );

      await this.updateAccommodationSheets(analysisData);
      await this.createAccommodationSummary(analysisData);

      console.log('Accommodation analytics processing completed successfully');
      return analysisData;
    } catch (error) {
      console.error('Error processing accommodation analytics:', error);
      throw error;
    }
  }

  async fetchAccommodationData(startDate, endDate, period) {
    console.log(`Fetching accommodation data from ${startDate} to ${endDate} for ${period} period`);
    
    try {
      const [
        basicCVR,
        cvrNoAds,
        bookingFunnel,
        trafficAnalysis,
        userDemographics
      ] = await Promise.all([
        this.bigqueryService.getMultiDatasetCVR(startDate, endDate, period),
        this.bigqueryService.getMultiDatasetCVRExcludingAds(startDate, endDate, period),
        this.bigqueryService.getMultiDatasetFunnelAnalysis(startDate, endDate, period),
        this.bigqueryService.getMultiDatasetTrafficSources(startDate, endDate, period),
        this.bigqueryService.getMultiDatasetUserDemographics(startDate, endDate, period)
      ]);

      // CVR変化率を計算
      const cvrChangeRates = this.calculateChangeRates(basicCVR);
      const cvrNoAdsChangeRates = this.calculateChangeRates(cvrNoAds);

      return {
        cvr_analysis: {
          basic: basicCVR,
          no_ads: cvrNoAds,
          change_rates: cvrChangeRates,
          no_ads_change_rates: cvrNoAdsChangeRates
        },
        booking_funnel: bookingFunnel,
        traffic_analysis: trafficAnalysis,
        user_demographics: userDemographics
      };
    } catch (error) {
      console.error('Error fetching accommodation data:', error);
      throw error;
    }
  }

  calculateChangeRates(cvrData) {
    const result = [];
    const dataByDataset = {};

    // データセット別にグループ化
    cvrData.forEach(row => {
      if (!dataByDataset[row.dataset_name]) {
        dataByDataset[row.dataset_name] = [];
      }
      dataByDataset[row.dataset_name].push(row);
    });

    // 各データセットで変化率を計算
    Object.entries(dataByDataset).forEach(([datasetName, rows]) => {
      const sortedRows = rows.sort((a, b) => a.period.localeCompare(b.period));
      
      sortedRows.forEach((current, index) => {
        const previous = sortedRows[index - 1];
        let changeRate = null;
        let changeRatePercentage = null;

        if (previous) {
          const currentValue = current.cvr || current.cvr_no_ads;
          const previousValue = previous.cvr || previous.cvr_no_ads;
          
          if (previousValue && currentValue) {
            changeRate = currentValue / previousValue;
            changeRatePercentage = ((changeRate - 1) * 100).toFixed(2) + '%';
          }
        }

        result.push({
          ...current,
          change_rate: changeRate,
          change_rate_percentage: changeRatePercentage
        });
      });
    });

    return result;
  }

  formatAccommodationCVRData(cvrAnalysis) {
    const headers = [
      '期間', '施設名', 'アクティブユーザー数', 'コンバージョン数', 'CVR', 
      'CVR（広告流入除く）', 'CVR変化率', 'CVR（広告流入除く）変化率', '説明'
    ];
    
    const dataByPeriodAndProperty = {};
    
    // 基本CVRデータを整理
    cvrAnalysis.basic.forEach(row => {
      const key = `${row.period}_${row.dataset_name}`;
      dataByPeriodAndProperty[key] = {
        period: row.period,
        dataset_name: row.dataset_name,
        dataset_description: row.dataset_description,
        active_users: row.active_users,
        purchase_users: row.purchase_users,
        cvr: row.cvr
      };
    });
    
    // CVR（広告流入除く）データを追加
    cvrAnalysis.no_ads.forEach(row => {
      const key = `${row.period}_${row.dataset_name}`;
      if (dataByPeriodAndProperty[key]) {
        dataByPeriodAndProperty[key].cvr_no_ads = row.cvr_no_ads;
      }
    });

    // 変化率データを追加
    cvrAnalysis.change_rates.forEach(row => {
      const key = `${row.period}_${row.dataset_name}`;
      if (dataByPeriodAndProperty[key]) {
        dataByPeriodAndProperty[key].cvr_change_rate = row.change_rate_percentage;
      }
    });

    cvrAnalysis.no_ads_change_rates.forEach(row => {
      const key = `${row.period}_${row.dataset_name}`;
      if (dataByPeriodAndProperty[key]) {
        dataByPeriodAndProperty[key].cvr_no_ads_change_rate = row.change_rate_percentage;
      }
    });
    
    const rows = Object.values(dataByPeriodAndProperty).map(row => [
      row.period,
      row.dataset_name,
      row.active_users || 0,
      row.purchase_users || 0,
      row.cvr ? (row.cvr * 100).toFixed(2) + '%' : '0.00%',
      row.cvr_no_ads ? (row.cvr_no_ads * 100).toFixed(2) + '%' : '',
      row.cvr_change_rate || '',
      row.cvr_no_ads_change_rate || '',
      row.dataset_description
    ]);
    
    return { headers, rows };
  }

  formatBookingFunnelData(funnelData) {
    const headers = [
      '期間', '施設名', 'HP訪問者', 'プラン選択', '予約内容入力', '個人情報入力', '予約完了',
      'HP→プラン選択率', 'プラン選択→予約内容率', '予約内容→個人情報率', '個人情報→完了率',
      '全体CVR', '説明'
    ];
    
    const rows = funnelData.map(row => [
      row.period,
      row.dataset_name,
      row.hp_visitors || 0,
      row.plan_selectors || 0,
      row.booking_detail_enterers || 0,
      row.personal_info_enterers || 0,
      row.booking_completers || 0,
      row.hp_to_plan_rate ? (row.hp_to_plan_rate * 100).toFixed(2) + '%' : '0.00%',
      row.plan_to_booking_rate ? (row.plan_to_booking_rate * 100).toFixed(2) + '%' : '0.00%',
      row.booking_to_personal_rate ? (row.booking_to_personal_rate * 100).toFixed(2) + '%' : '0.00%',
      row.personal_to_completion_rate ? (row.personal_to_completion_rate * 100).toFixed(2) + '%' : '0.00%',
      row.overall_conversion_rate ? (row.overall_conversion_rate * 100).toFixed(2) + '%' : '0.00%',
      row.dataset_description
    ]);
    
    return { headers, rows };
  }

  formatTrafficSourceData(trafficData) {
    const headers = [
      '期間', '施設名', '流入元', 'ユーザー数', 'コンバージョン数', 'CVR', '割合', '説明'
    ];
    
    const rows = trafficData.map(row => [
      row.period,
      row.dataset_name,
      row.source_medium,
      row.total_users || 0,
      row.purchase_users || 0,
      row.cvr_by_source ? (row.cvr_by_source * 100).toFixed(2) + '%' : '0.00%',
      row.user_percentage ? (row.user_percentage * 100).toFixed(2) + '%' : '0.00%',
      row.dataset_description
    ]);
    
    return { headers, rows };
  }

  formatDemographicsData(demographicsData) {
    const headers = [
      '期間', '施設名', '属性タイプ', '属性値', 'ユーザー数', 'コンバージョン数', 'CVR', '割合', '説明'
    ];
    
    const rows = demographicsData.map(row => [
      row.period,
      row.dataset_name,
      row.demographic_type,
      row.demographic_value,
      row.total_users || 0,
      row.booking_users || 0,
      row.cvr ? (row.cvr * 100).toFixed(2) + '%' : '0.00%',
      row.percentage ? (row.percentage * 100).toFixed(2) + '%' : '0.00%',
      row.dataset_description
    ]);
    
    return { headers, rows };
  }

  formatTopPagesData(topPagesData) {
    const headers = [
      '期間', '施設名', 'ページパス', 'ページビュー数', 'ユニークユーザー数', '説明'
    ];
    
    const rows = topPagesData.map(row => [
      row.period,
      row.dataset_name,
      row.page_path,
      row.page_views || 0,
      row.unique_users || 0,
      row.dataset_description
    ]);
    
    return { headers, rows };
  }

  async updateAccommodationSheets(analysisData) {
    try {
      const sheets = [
        {
          name: '宿泊施設CVR分析',
          data: this.formatAccommodationCVRData(analysisData.cvr_analysis)
        },
        {
          name: '予約ファネル分析',
          data: this.formatBookingFunnelData(analysisData.booking_funnel)
        },
        {
          name: '流入元分析',
          data: this.formatTrafficSourceData(analysisData.traffic_analysis)
        },
        {
          name: 'ユーザー属性分析',
          data: this.formatDemographicsData(analysisData.user_demographics)
        }
      ];

      for (const sheet of sheets) {
        await this.sheetsService.createSheetIfNotExists(sheet.name);
        await this.sheetsService.clearSheet(sheet.name);
        await this.sheetsService.writeToSheet(sheet.name, sheet.data.rows, sheet.data.headers);
      }

      await this.createPropertyListSheet();

      console.log('All accommodation sheets updated successfully');
    } catch (error) {
      console.error('Error updating accommodation sheets:', error);
      throw error;
    }
  }

  async createPropertyListSheet() {
    const properties = config.datasets;
    const headers = ['施設名', 'BigQueryデータセット', 'テーブルプレフィックス', '説明', '有効'];
    const rows = properties.map(ds => [
      ds.name,
      ds.dataset,
      ds.tablePrefix,
      ds.description,
      ds.enabled ? '有効' : '無効'
    ]);

    await this.sheetsService.createSheetIfNotExists('宿泊施設一覧');
    await this.sheetsService.clearSheet('宿泊施設一覧');
    await this.sheetsService.writeToSheet('宿泊施設一覧', rows, headers);
  }

  async createAccommodationSummary(analysisData) {
    // 各施設の最新パフォーマンスを集計
    const summary = this.generateAccommodationSummary(analysisData);
    
    const headers = ['施設名', '最新CVR', '最新ユーザー数', '最新予約数', '最新月', 'パフォーマンス'];
    const rows = Object.entries(summary).map(([propertyName, data]) => [
      propertyName,
      (data.latest_cvr * 100).toFixed(2) + '%',
      data.latest_users,
      data.latest_conversions,
      data.latest_period,
      data.performance_rank
    ]);

    // CVRでソート（降順）
    rows.sort((a, b) => {
      const cvrA = parseFloat(a[1].replace('%', ''));
      const cvrB = parseFloat(b[1].replace('%', ''));
      return cvrB - cvrA;
    });

    await this.sheetsService.createSheetIfNotExists('宿泊施設パフォーマンスサマリー');
    await this.sheetsService.clearSheet('宿泊施設パフォーマンスサマリー');
    await this.sheetsService.writeToSheet('宿泊施設パフォーマンスサマリー', rows, headers);
  }

  generateAccommodationSummary(analysisData) {
    const summary = {};
    
    // 最新CVRデータを取得
    const latestCVR = analysisData.cvr_analysis.basic.reduce((acc, row) => {
      if (!acc[row.dataset_name] || row.period > acc[row.dataset_name].period) {
        acc[row.dataset_name] = row;
      }
      return acc;
    }, {});

    Object.entries(latestCVR).forEach(([propertyName, data]) => {
      const cvr = data.cvr || 0;
      let performanceRank = 'Average';
      
      if (cvr > 0.05) performanceRank = 'High';
      else if (cvr < 0.02) performanceRank = 'Low';

      summary[propertyName] = {
        latest_cvr: cvr,
        latest_users: data.active_users || 0,
        latest_conversions: data.purchase_users || 0,
        latest_period: data.period,
        performance_rank: performanceRank
      };
    });

    return summary;
  }
}

async function main() {
  const processor = new AccommodationAnalyticsProcessor();
  
  const args = process.argv.slice(2);
  const command = args[0] || 'monthly';
  
  try {
    switch (command) {
      case 'monthly':
        await processor.processAccommodationAnalytics(12, 'month');
        break;
      case 'quarterly':
        await processor.processAccommodationAnalytics(12, 'quarter');
        break;
      case 'all':
        await processor.processAccommodationAnalytics();
        break;
      default:
        console.log('Available commands: monthly, quarterly, all');
        process.exit(1);
    }
  } catch (error) {
    console.error('Accommodation analytics process failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { AccommodationAnalyticsProcessor, main };