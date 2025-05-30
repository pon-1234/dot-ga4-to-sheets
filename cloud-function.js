const { AccommodationAnalyticsProcessor } = require('./src/index');

/**
 * Cloud Functions エントリーポイント
 * 宿泊施設GA4分析の自動実行機能
 */

exports.monthlyUpdate = async (req, res) => {
  console.log('🔄 Monthly accommodation analytics triggered');
  
  try {
    const processor = new AccommodationAnalyticsProcessor();
    await processor.processAccommodationAnalytics(12, 'month');
    
    res.status(200).json({
      success: true,
      message: 'Monthly accommodation analytics completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Monthly accommodation analytics failed:', error);
    res.status(500).json({
      success: false,
      message: 'Monthly accommodation analytics failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

exports.quarterlyUpdate = async (req, res) => {
  console.log('🔄 Quarterly accommodation analytics triggered');
  
  try {
    const processor = new AccommodationAnalyticsProcessor();
    await processor.processAccommodationAnalytics(12, 'quarter');
    
    res.status(200).json({
      success: true,
      message: 'Quarterly accommodation analytics completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Quarterly accommodation analytics failed:', error);
    res.status(500).json({
      success: false,
      message: 'Quarterly accommodation analytics failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

exports.scheduledMonthlyUpdate = async (data, context) => {
  console.log('📅 Scheduled monthly accommodation analytics triggered by Cloud Scheduler');
  
  try {
    const processor = new AccommodationAnalyticsProcessor();
    await processor.processAccommodationAnalytics(12, 'month');
    console.log('✅ Scheduled monthly accommodation analytics completed successfully');
  } catch (error) {
    console.error('❌ Scheduled monthly accommodation analytics failed:', error);
    throw error;
  }
};

exports.scheduledQuarterlyUpdate = async (data, context) => {
  console.log('📅 Scheduled quarterly accommodation analytics triggered by Cloud Scheduler');
  
  try {
    const processor = new AccommodationAnalyticsProcessor();
    await processor.processAccommodationAnalytics(12, 'quarter');
    console.log('✅ Scheduled quarterly accommodation analytics completed successfully');
  } catch (error) {
    console.error('❌ Scheduled quarterly accommodation analytics failed:', error);
    throw error;
  }
};