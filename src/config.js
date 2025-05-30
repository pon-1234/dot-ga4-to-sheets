require('dotenv').config();
const fs = require('fs');
const path = require('path');

function loadDatasets() {
  // Check for inline JSON config first
  if (process.env.DATASETS_CONFIG) {
    try {
      return JSON.parse(process.env.DATASETS_CONFIG);
    } catch (error) {
      console.error('Error parsing DATASETS_CONFIG:', error);
      throw error;
    }
  }
  
  // Check for config file
  const configFile = process.env.DATASETS_CONFIG_FILE || './config/datasets.json';
  if (fs.existsSync(configFile)) {
    try {
      const configData = fs.readFileSync(configFile, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.error('Error reading datasets config file:', error);
      throw error;
    }
  }
  
  // Fallback to single dataset configuration
  if (process.env.BIGQUERY_DATASET) {
    return [{
      name: 'Default',
      dataset: process.env.BIGQUERY_DATASET,
      tablePrefix: process.env.BIGQUERY_TABLE_PREFIX || 'events_',
      description: 'Default GA4 dataset',
      enabled: true
    }];
  }
  
  throw new Error('No dataset configuration found. Please set DATASETS_CONFIG, DATASETS_CONFIG_FILE, or BIGQUERY_DATASET');
}

module.exports = {
  project: {
    id: process.env.PROJECT_ID,
  },
  datasets: loadDatasets(),
  multiDatasetMode: process.env.MULTI_DATASET_MODE === 'true',
  comparisonMode: process.env.COMPARISON_MODE === 'true',
  // Backward compatibility
  bigquery: {
    dataset: process.env.BIGQUERY_DATASET,
    tablePrefix: process.env.BIGQUERY_TABLE_PREFIX || 'events_',
  },
  sheets: {
    spreadsheetId: process.env.SPREADSHEET_ID,
    credentialsPath: process.env.CREDENTIALS_PATH || './credentials/service-account.json',
  },
  dateRange: {
    start: process.env.START_DATE,
    end: process.env.END_DATE,
  },
};