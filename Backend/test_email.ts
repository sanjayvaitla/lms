import dotenv from 'dotenv';
dotenv.config();
import { sendEmail } from './src/lib/email';

async function run() {
  try {
    await sendEmail({
      to: 'dummy_vtricks_test@mailinator.com',
      subject: 'Test Forgot Password Email with dotenv first',
      html: '<p>Test</p>'
    });
    console.log('Success sending email');
  } catch (e) {
    console.error('Error sending email:', e);
  }
}
run();
