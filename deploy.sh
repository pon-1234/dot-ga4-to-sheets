#!/bin/bash

# GA4 to Sheets Cloud Functions Deployment Script

set -e

# Check if required environment variables are set
if [ -z "$PROJECT_ID" ] || [ -z "$BIGQUERY_DATASET" ] || [ -z "$SPREADSHEET_ID" ]; then
    echo "Error: Please set the following environment variables:"
    echo "  PROJECT_ID=your-gcp-project-id"
    echo "  BIGQUERY_DATASET=your-ga4-dataset-id"
    echo "  SPREADSHEET_ID=your-google-sheets-id"
    exit 1
fi

echo "Deploying GA4 to Sheets Cloud Functions..."
echo "Project ID: $PROJECT_ID"
echo "BigQuery Dataset: $BIGQUERY_DATASET"
echo "Spreadsheet ID: $SPREADSHEET_ID"

# Set the GCP project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable bigquery.googleapis.com
gcloud services enable sheets.googleapis.com

# Deploy monthly update function
echo "Deploying monthly update function..."
gcloud functions deploy ga4-to-sheets-monthly \
    --runtime nodejs18 \
    --trigger-http \
    --allow-unauthenticated \
    --entry-point monthlyUpdate \
    --memory 512MB \
    --timeout 540s \
    --set-env-vars PROJECT_ID=$PROJECT_ID,BIGQUERY_DATASET=$BIGQUERY_DATASET,BIGQUERY_TABLE_PREFIX=events_,SPREADSHEET_ID=$SPREADSHEET_ID,CREDENTIALS_PATH=/tmp/service-account.json

# Deploy quarterly update function
echo "Deploying quarterly update function..."
gcloud functions deploy ga4-to-sheets-quarterly \
    --runtime nodejs18 \
    --trigger-http \
    --allow-unauthenticated \
    --entry-point quarterlyUpdate \
    --memory 512MB \
    --timeout 540s \
    --set-env-vars PROJECT_ID=$PROJECT_ID,BIGQUERY_DATASET=$BIGQUERY_DATASET,BIGQUERY_TABLE_PREFIX=events_,SPREADSHEET_ID=$SPREADSHEET_ID,CREDENTIALS_PATH=/tmp/service-account.json

# Create Cloud Scheduler jobs
echo "Creating Cloud Scheduler jobs..."

# Monthly scheduler
gcloud scheduler jobs create http ga4-to-sheets-monthly-schedule \
    --schedule="0 9 1 * *" \
    --time-zone="Asia/Tokyo" \
    --uri="https://$(gcloud config get-value project)-$(gcloud config get-value functions/region).cloudfunctions.net/ga4-to-sheets-monthly" \
    --http-method=POST \
    --headers="Content-Type=application/json"

# Quarterly scheduler
gcloud scheduler jobs create http ga4-to-sheets-quarterly-schedule \
    --schedule="0 10 1 1,4,7,10 *" \
    --time-zone="Asia/Tokyo" \
    --uri="https://$(gcloud config get-value project)-$(gcloud config get-value functions/region).cloudfunctions.net/ga4-to-sheets-quarterly" \
    --http-method=POST \
    --headers="Content-Type=application/json"

echo "Deployment completed successfully!"
echo ""
echo "Monthly function URL: https://$(gcloud config get-value project)-$(gcloud config get-value functions/region).cloudfunctions.net/ga4-to-sheets-monthly"
echo "Quarterly function URL: https://$(gcloud config get-value project)-$(gcloud config get-value functions/region).cloudfunctions.net/ga4-to-sheets-quarterly"
echo ""
echo "Scheduler jobs created:"
echo "  - ga4-to-sheets-monthly-schedule: Runs on 1st day of each month at 9:00 AM JST"
echo "  - ga4-to-sheets-quarterly-schedule: Runs on 1st day of quarters at 10:00 AM JST"