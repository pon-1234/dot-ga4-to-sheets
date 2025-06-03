const { BigQuery } = require('@google-cloud/bigquery');
const config = require('../config');

/**
 * 統合BigQueryサービス
 * 宿泊施設向けGA4データの分析を提供
 */
class BigQueryService {
  constructor() {
    // Cloud FunctionsではkeyFilenameを使わず、ADC（Application Default Credentials）を使用
    const options = {
      projectId: config.project.id,
    };
    
    // ローカル実行時のみkeyFilenameを使用
    if (process.env.NODE_ENV !== 'production' && config.sheets.credentialsPath && require('fs').existsSync(config.sheets.credentialsPath)) {
      options.keyFilename = config.sheets.credentialsPath;
    }
    
    this.bigquery = new BigQuery(options);
    this.datasets = config.datasets.filter(ds => ds.enabled);
  }

  getTableName(dataset, date) {
    const formattedDate = date.replace(/-/g, '');
    return `${dataset.tablePrefix}${formattedDate}`;
  }

  buildDateCondition(startDate, endDate) {
    return `
      _TABLE_SUFFIX BETWEEN '${startDate.replace(/-/g, '')}' 
      AND '${endDate.replace(/-/g, '')}'
    `;
  }

  async executeQuery(query) {
    try {
      console.log('Executing query:', query.substring(0, 200) + '...');
      const [rows] = await this.bigquery.query({
        query,
        useLegacySql: false,
      });
      return rows;
    } catch (error) {
      console.error('BigQuery error:', error);
      throw error;
    }
  }

  async executeForDataset(dataset, queryBuilder, startDate, endDate, period = 'month') {
    const query = queryBuilder(dataset, startDate, endDate, period);
    const results = await this.executeQuery(query);
    
    return results.map(row => ({
      ...row,
      dataset_name: dataset.name,
      dataset_description: dataset.description
    }));
  }

  async executeForAllDatasets(queryBuilder, startDate, endDate, period = 'month') {
    const results = [];
    
    for (const dataset of this.datasets) {
      try {
        console.log(`Processing dataset: ${dataset.name}`);
        const datasetResults = await this.executeForDataset(dataset, queryBuilder, startDate, endDate, period);
        results.push(...datasetResults);
      } catch (error) {
        console.error(`Error processing dataset ${dataset.name}:`, error);
        // Continue with other datasets
      }
    }
    
    return results;
  }

  async getMultiDatasetCVR(startDate, endDate, period = 'month') {
    const queryBuilder = (dataset, startDate, endDate, period) => {
      const dateFormat = period === 'quarter' ? 
        'CONCAT(EXTRACT(YEAR FROM PARSE_DATE("%Y%m%d", event_date)), "-Q", CAST(CEIL(EXTRACT(MONTH FROM PARSE_DATE("%Y%m%d", event_date))/3.0) AS INT64))' :
        'FORMAT_DATE("%Y-%m", PARSE_DATE("%Y%m%d", event_date))';
      
      return `
        WITH user_stats AS (
          SELECT 
            ${dateFormat} AS period,
            COUNT(DISTINCT user_pseudo_id) AS active_users,
            COUNT(DISTINCT CASE WHEN event_name = 'purchase' THEN user_pseudo_id END) AS purchase_users
          FROM \`${config.project.id}.${dataset.dataset}.events_*\`
          WHERE ${this.buildDateCondition(startDate, endDate)}
          GROUP BY period
        )
        SELECT 
          period,
          active_users,
          purchase_users,
          SAFE_DIVIDE(purchase_users, active_users) AS cvr
        FROM user_stats
        ORDER BY period
      `;
    };

    return this.executeForAllDatasets(queryBuilder, startDate, endDate, period);
  }

  async getMultiDatasetCVRExcludingAds(startDate, endDate, period = 'month') {
    const queryBuilder = (dataset, startDate, endDate, period) => {
      const dateFormat = period === 'quarter' ? 
        'CONCAT(EXTRACT(YEAR FROM PARSE_DATE("%Y%m%d", event_date)), "-Q", CAST(CEIL(EXTRACT(MONTH FROM PARSE_DATE("%Y%m%d", event_date))/3.0) AS INT64))' :
        'FORMAT_DATE("%Y-%m", PARSE_DATE("%Y%m%d", event_date))';
      
      return `
        WITH user_first_medium AS (
          SELECT 
            user_pseudo_id,
            FIRST_VALUE(
              (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'medium')
            ) OVER (
              PARTITION BY user_pseudo_id 
              ORDER BY event_timestamp ASC 
              ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
            ) AS first_medium
          FROM \`${config.project.id}.${dataset.dataset}.events_*\`
          WHERE ${this.buildDateCondition(startDate, endDate)}
            AND event_name IN ('first_visit', 'first_open')
        ),
        user_stats AS (
          SELECT 
            ${dateFormat} AS period,
            COUNT(DISTINCT e.user_pseudo_id) AS active_users_no_ads,
            COUNT(DISTINCT CASE WHEN e.event_name = 'purchase' THEN e.user_pseudo_id END) AS purchase_users_no_ads
          FROM \`${config.project.id}.${dataset.dataset}.events_*\` e
          LEFT JOIN user_first_medium ufm ON e.user_pseudo_id = ufm.user_pseudo_id
          WHERE ${this.buildDateCondition(startDate, endDate)}
            AND (ufm.first_medium IS NULL OR ufm.first_medium NOT LIKE '%cpm%')
          GROUP BY period
        )
        SELECT 
          period,
          active_users_no_ads,
          purchase_users_no_ads,
          SAFE_DIVIDE(purchase_users_no_ads, active_users_no_ads) AS cvr_no_ads
        FROM user_stats
        ORDER BY period
      `;
    };

    return this.executeForAllDatasets(queryBuilder, startDate, endDate, period);
  }

  async getMultiDatasetFunnelAnalysis(startDate, endDate, period = 'month') {
    const queryBuilder = (dataset, startDate, endDate, period) => {
      const dateFormat = period === 'quarter' ? 
        'CONCAT(EXTRACT(YEAR FROM PARSE_DATE("%Y%m%d", event_date)), "-Q", CAST(CEIL(EXTRACT(MONTH FROM PARSE_DATE("%Y%m%d", event_date))/3.0) AS INT64))' :
        'FORMAT_DATE("%Y-%m", PARSE_DATE("%Y%m%d", event_date))';
      
      return `
        WITH funnel_events AS (
          SELECT 
            ${dateFormat} AS period,
            user_pseudo_id,
            event_name,
            event_timestamp
          FROM \`${config.project.id}.${dataset.dataset}.events_*\`
          WHERE ${this.buildDateCondition(startDate, endDate)}
            AND event_name IN (
              'first_visit', 'first_open',
              'プラン選択', 'view_item',
              '予約内容入力', 'begin_checkout',
              '個人情報入力', 'add_payment_info',
              '予約完了', 'purchase'
            )
        ),
        funnel_stages AS (
          SELECT 
            period,
            user_pseudo_id,
            MAX(CASE WHEN event_name IN ('first_visit', 'first_open') THEN 1 ELSE 0 END) AS stage_1_first_visit,
            MAX(CASE WHEN event_name IN ('プラン選択', 'view_item') THEN 1 ELSE 0 END) AS stage_2_plan_selection,
            MAX(CASE WHEN event_name IN ('予約内容入力', 'begin_checkout') THEN 1 ELSE 0 END) AS stage_3_booking_input,
            MAX(CASE WHEN event_name IN ('個人情報入力', 'add_payment_info') THEN 1 ELSE 0 END) AS stage_4_personal_info,
            MAX(CASE WHEN event_name IN ('予約完了', 'purchase') THEN 1 ELSE 0 END) AS stage_5_completion
          FROM funnel_events
          GROUP BY period, user_pseudo_id
        ),
        funnel_summary AS (
          SELECT 
            period,
            SUM(stage_1_first_visit) AS first_visit_users,
            SUM(stage_2_plan_selection) AS plan_selection_users,
            SUM(stage_3_booking_input) AS booking_input_users,
            SUM(stage_4_personal_info) AS personal_info_users,
            SUM(stage_5_completion) AS completion_users
          FROM funnel_stages
          GROUP BY period
        )
        SELECT 
          period,
          first_visit_users,
          plan_selection_users,
          booking_input_users,
          personal_info_users,
          completion_users,
          SAFE_DIVIDE(plan_selection_users, first_visit_users) AS hp_to_plan_rate,
          SAFE_DIVIDE(booking_input_users, plan_selection_users) AS plan_to_booking_rate,
          SAFE_DIVIDE(personal_info_users, booking_input_users) AS booking_to_personal_rate,
          SAFE_DIVIDE(completion_users, personal_info_users) AS personal_to_completion_rate
        FROM funnel_summary
        ORDER BY period
      `;
    };

    return this.executeForAllDatasets(queryBuilder, startDate, endDate, period);
  }

  async getMultiDatasetTrafficSources(startDate, endDate, period = 'month') {
    const queryBuilder = (dataset, startDate, endDate, period) => {
      const dateFormat = period === 'quarter' ? 
        'CONCAT(EXTRACT(YEAR FROM PARSE_DATE("%Y%m%d", event_date)), "-Q", CAST(CEIL(EXTRACT(MONTH FROM PARSE_DATE("%Y%m%d", event_date))/3.0) AS INT64))' :
        'FORMAT_DATE("%Y-%m", PARSE_DATE("%Y%m%d", event_date))';
      
      return `
        WITH user_first_source AS (
          SELECT 
            user_pseudo_id,
            FIRST_VALUE(
              COALESCE(
                (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source'),
                traffic_source.source
              )
            ) OVER (
              PARTITION BY user_pseudo_id 
              ORDER BY event_timestamp ASC 
              ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
            ) AS first_source,
            FIRST_VALUE(
              COALESCE(
                (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'medium'),
                traffic_source.medium
              )
            ) OVER (
              PARTITION BY user_pseudo_id 
              ORDER BY event_timestamp ASC 
              ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
            ) AS first_medium
          FROM \`${config.project.id}.${dataset.dataset}.events_*\`
          WHERE ${this.buildDateCondition(startDate, endDate)}
        ),
        source_stats AS (
          SELECT 
            ${dateFormat} AS period,
            CONCAT(COALESCE(ufs.first_source, '(direct)'), ' / ', COALESCE(ufs.first_medium, '(none)')) AS source_medium,
            COUNT(DISTINCT e.user_pseudo_id) AS total_users,
            COUNT(DISTINCT CASE WHEN e.event_name = 'purchase' THEN e.user_pseudo_id END) AS purchase_users
          FROM \`${config.project.id}.${dataset.dataset}.events_*\` e
          LEFT JOIN user_first_source ufs ON e.user_pseudo_id = ufs.user_pseudo_id
          WHERE ${this.buildDateCondition(startDate, endDate)}
          GROUP BY period, source_medium
        )
        SELECT 
          period,
          source_medium,
          total_users,
          purchase_users,
          SAFE_DIVIDE(purchase_users, total_users) AS cvr_by_source,
          SAFE_DIVIDE(total_users, SUM(total_users) OVER (PARTITION BY period)) AS user_percentage
        FROM source_stats
        ORDER BY period DESC, total_users DESC
      `;
    };

    return this.executeForAllDatasets(queryBuilder, startDate, endDate, period);
  }

  async getMultiDatasetUserDemographics(startDate, endDate, period = 'month') {
    const queryBuilder = (dataset, startDate, endDate, period) => {
      const dateFormat = period === 'quarter' ? 
        'CONCAT(EXTRACT(YEAR FROM PARSE_DATE("%Y%m%d", event_date)), "-Q", CAST(CEIL(EXTRACT(MONTH FROM PARSE_DATE("%Y%m%d", event_date))/3.0) AS INT64))' :
        'FORMAT_DATE("%Y-%m", PARSE_DATE("%Y%m%d", event_date))';
      
      return `
        WITH user_demographics AS (
          SELECT 
            ${dateFormat} AS period,
            user_pseudo_id,
            MAX(CASE WHEN key = 'age' THEN value.string_value END) AS age_group,
            MAX(CASE WHEN key = 'gender' THEN value.string_value END) AS gender,
            MAX(geo.city) AS city,
            MAX(device.category) AS device_category,
            MAX(CASE WHEN event_name = 'purchase' THEN 1 ELSE 0 END) AS has_purchase
          FROM \`${config.project.id}.${dataset.dataset}.events_*\`,
          UNNEST(event_params) AS param
          WHERE ${this.buildDateCondition(startDate, endDate)}
          GROUP BY period, user_pseudo_id
        )
        SELECT 
          period,
          'age' AS demographic_type,
          COALESCE(age_group, 'unknown') AS demographic_value,
          COUNT(DISTINCT user_pseudo_id) AS total_users,
          SUM(has_purchase) AS purchase_users,
          SAFE_DIVIDE(SUM(has_purchase), COUNT(DISTINCT user_pseudo_id)) AS cvr,
          SAFE_DIVIDE(COUNT(DISTINCT user_pseudo_id), SUM(COUNT(DISTINCT user_pseudo_id)) OVER (PARTITION BY period)) AS percentage
        FROM user_demographics
        WHERE age_group IS NOT NULL
        GROUP BY period, age_group
        
        UNION ALL
        
        SELECT 
          period,
          'gender' AS demographic_type,
          COALESCE(gender, 'unknown') AS demographic_value,
          COUNT(DISTINCT user_pseudo_id) AS total_users,
          SUM(has_purchase) AS purchase_users,
          SAFE_DIVIDE(SUM(has_purchase), COUNT(DISTINCT user_pseudo_id)) AS cvr,
          SAFE_DIVIDE(COUNT(DISTINCT user_pseudo_id), SUM(COUNT(DISTINCT user_pseudo_id)) OVER (PARTITION BY period)) AS percentage
        FROM user_demographics
        WHERE gender IS NOT NULL
        GROUP BY period, gender
        
        UNION ALL
        
        SELECT 
          period,
          'device' AS demographic_type,
          COALESCE(device_category, 'unknown') AS demographic_value,
          COUNT(DISTINCT user_pseudo_id) AS total_users,
          SUM(has_purchase) AS purchase_users,
          SAFE_DIVIDE(SUM(has_purchase), COUNT(DISTINCT user_pseudo_id)) AS cvr,
          SAFE_DIVIDE(COUNT(DISTINCT user_pseudo_id), SUM(COUNT(DISTINCT user_pseudo_id)) OVER (PARTITION BY period)) AS percentage
        FROM user_demographics
        WHERE device_category IS NOT NULL
        GROUP BY period, device_category
        
        ORDER BY period DESC, demographic_type, total_users DESC
      `;
    };

    return this.executeForAllDatasets(queryBuilder, startDate, endDate, period);
  }

  async getDatasetComparison(startDate, endDate, period = 'month') {
    console.log('Generating dataset comparison...');
    
    const [
      cvrData,
      funnelData,
      trafficData,
      demographicsData
    ] = await Promise.all([
      this.getMultiDatasetCVR(startDate, endDate, period),
      this.getMultiDatasetFunnelAnalysis(startDate, endDate, period),
      this.getMultiDatasetTrafficSources(startDate, endDate, period),
      this.getMultiDatasetUserDemographics(startDate, endDate, period)
    ]);

    return {
      cvr: cvrData,
      funnel: funnelData,
      traffic: trafficData,
      demographics: demographicsData,
      summary: this.generateComparisonSummary(cvrData, funnelData)
    };
  }

  generateComparisonSummary(cvrData, funnelData) {
    const summary = {};
    
    // CVR比較
    const latestCVR = cvrData.reduce((acc, row) => {
      if (!acc[row.dataset_name] || row.period > acc[row.dataset_name].period) {
        acc[row.dataset_name] = row;
      }
      return acc;
    }, {});

    // ファネル比較
    const latestFunnel = funnelData.reduce((acc, row) => {
      if (!acc[row.dataset_name] || row.period > acc[row.dataset_name].period) {
        acc[row.dataset_name] = row;
      }
      return acc;
    }, {});

    Object.keys(latestCVR).forEach(datasetName => {
      summary[datasetName] = {
        latest_cvr: latestCVR[datasetName]?.cvr || 0,
        latest_users: latestCVR[datasetName]?.active_users || 0,
        latest_conversions: latestCVR[datasetName]?.purchase_users || 0,
        funnel_completion_rate: latestFunnel[datasetName]?.personal_to_completion_rate || 0
      };
    });

    return summary;
  }
}

module.exports = BigQueryService;