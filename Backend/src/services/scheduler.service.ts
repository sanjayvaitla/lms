import { schedule } from 'node-cron';
import { notifyPendingInstallments, notifyWeeklyAssignments } from './whatsapp-notifications.service';

export function startScheduler(): void {
  // 1st of every month at 9:00 AM IST (03:30 UTC)
  schedule('30 3 1 * *', async () => {
    console.log('[scheduler] Monthly pending installments notification running...');
    await notifyPendingInstallments().catch(console.error);
  });

  // Every Monday at 9:00 AM IST (03:30 UTC)
  schedule('30 3 * * 1', async () => {
    console.log('[scheduler] Weekly assignment reminder running...');
    await notifyWeeklyAssignments().catch(console.error);
  });

  console.log('[scheduler] WhatsApp notification scheduler started');
  console.log('  • Monthly installment reminders: 1st of each month at 9 AM IST');
  console.log('  • Weekly assignment reminders:   every Monday at 9 AM IST');
}
