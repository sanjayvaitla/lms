import axios from 'axios';
import crypto from 'crypto';

export class GithubService {
  /**
   * Exchanges an OAuth code for an access token
   */
  static async getOAuthAccessToken(code: string): Promise<string | null> {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is missing from environment variables');
      return null;
    }

    try {
      const response = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: clientId,
          client_secret: clientSecret,
          code,
        },
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      return response.data.access_token || null;
    } catch (error) {
      console.error('Error fetching GitHub access token:', error);
      return null;
    }
  }

  /**
   * Fetches the authenticated user's profile
   */
  static async getUserProfile(accessToken: string) {
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      return response.data; // Returns { id, login (username), avatar_url, etc }
    } catch (error) {
      console.error('Error fetching GitHub user profile:', error);
      throw new Error('Could not fetch GitHub user profile');
    }
  }

  /**
   * Forks a template repository into the user's account
   * @param templateOwner The organization or user that owns the template repo
   * @param templateRepo The name of the template repo
   * @param userAccessToken The OAuth token of the student
   */
  static async forkRepository(templateOwner: string, templateRepo: string, userAccessToken: string) {
    try {
      const response = await axios.post(
        `https://api.github.com/repos/${templateOwner}/${templateRepo}/forks`,
        {},
        {
          headers: {
            Authorization: `Bearer ${userAccessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );
      return response.data; // Contains info about the newly created fork (e.g. html_url, full_name)
    } catch (error) {
      console.error('Error forking repository:', error);
      throw new Error('Failed to fork GitHub repository. Please ensure you have granted access.');
    }
  }

  /**
   * Verifies that a webhook payload actually came from GitHub
   * @param payload The raw request body string
   * @param signature The x-hub-signature-256 header value
   */
  static verifyWebhookSignature(payload: string, signature: string): boolean {
    const secret = process.env.INTERN_WEBHOOK_SECRET
      ?? process.env.GITHUB_WEBHOOK_SECRET
      ?? '';
    if (!secret) {
      console.warn('INTERN_WEBHOOK_SECRET not set, cannot verify webhook signature.');
      return false;
    }

    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    
    try {
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    } catch (e) {
        return false;
    }
  }
}
