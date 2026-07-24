import cron from 'node-cron';
import { Op } from 'sequelize';
import { ActivityLog } from '../models/ActivityLog';
import { DailyAnalytics } from '../models/DailyAnalytics';
import sequelize from '../lib/sequelize';

// Run every day at 2:00 AM
export const startAnalyticsJob = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('[CRON] Starting Daily Analytics Rollup...');
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Aggregate Page Views
      const pageViews = await ActivityLog.findAll({
        attributes: [
          'resourceType',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: {
          actionType: 'PAGE_VIEW',
          createdAt: {
            [Op.gte]: yesterday,
            [Op.lt]: today
          },
          resourceType: { [Op.ne]: null }
        },
        group: ['resourceType']
      });

      const pageViewData: Record<string, number> = {};
      pageViews.forEach((record: any) => {
        pageViewData[record.resourceType] = parseInt(record.dataValues.count, 10);
      });

      await DailyAnalytics.create({
        date: yesterday,
        metricType: 'PAGE_VIEW_TOTALS',
        data: pageViewData
      });

      // Cleanup logs older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const deleted = await ActivityLog.destroy({
        where: {
          createdAt: {
            [Op.lt]: thirtyDaysAgo
          }
        }
      });

      console.log(`[CRON] Analytics Rollup Complete. Deleted ${deleted} old logs.`);
    } catch (error) {
      console.error('[CRON] Error running Daily Analytics Rollup:', error);
    }
  });
};
