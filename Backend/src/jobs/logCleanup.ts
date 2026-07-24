import cron from 'node-cron';
import { Op } from 'sequelize';
import moment from 'moment-timezone';
import { ActivityLog } from '../models/ActivityLog';

export function initLogCleanupJob() {
  // Run every day at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('[Cron] Running activity log cleanup job...');
      const threeMonthsAgo = moment().subtract(3, 'months').toDate();
      
      const deletedCount = await ActivityLog.destroy({
        where: {
          createdAt: {
            [Op.lt]: threeMonthsAgo,
          },
        },
      });

      console.log(`[Cron] Deleted ${deletedCount} old activity logs.`);
    } catch (error) {
      console.error('[Cron] Error during activity log cleanup:', error);
    }
  });
}
