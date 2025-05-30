class DateUtils {
  static getCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  static getCurrentQuarter() {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    return `${year}-Q${quarter}`;
  }

  static getLastMonth() {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = String(lastMonth.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  static getLastQuarter() {
    const now = new Date();
    const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
    let lastQuarter = currentQuarter - 1;
    let year = now.getFullYear();
    
    if (lastQuarter === 0) {
      lastQuarter = 4;
      year -= 1;
    }
    
    return `${year}-Q${lastQuarter}`;
  }

  static getMonthDateRange(yearMonth) {
    const [year, month] = yearMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(parseInt(year), parseInt(month), 0);
    const lastDay = String(endDate.getDate()).padStart(2, '0');
    return {
      start: startDate,
      end: `${year}-${month}-${lastDay}`
    };
  }

  static getQuarterDateRange(yearQuarter) {
    const [year, quarter] = yearQuarter.split('-Q');
    const quarterNum = parseInt(quarter);
    
    const startMonth = (quarterNum - 1) * 3 + 1;
    const endMonth = quarterNum * 3;
    
    const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
    const endDate = new Date(parseInt(year), endMonth, 0);
    const lastDay = String(endDate.getDate()).padStart(2, '0');
    const endDateStr = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
    
    return {
      start: startDate,
      end: endDateStr
    };
  }

  static getDateRangeForPeriod(period, type = 'current') {
    if (period === 'month') {
      const month = type === 'current' ? this.getCurrentMonth() : this.getLastMonth();
      return this.getMonthDateRange(month);
    } else if (period === 'quarter') {
      const quarter = type === 'current' ? this.getCurrentQuarter() : this.getLastQuarter();
      return this.getQuarterDateRange(quarter);
    }
    
    throw new Error(`Unsupported period: ${period}`);
  }

  static getReportingRange(months = 12) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    
    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  }
}

module.exports = DateUtils;