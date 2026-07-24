import { Request, Response } from 'express';

/**
 * GitHub OAuth login is disabled.
 * It previously could create synthetic *@github.com accounts, overwrite
 * github_username without uniqueness checks, and put JWTs in redirect URLs.
 * Students set github_username on My Profile; assignment forks are manual or
 * token-scoped to that username — not via social login.
 */
export class GithubAuthController {
  static async githubAuth(_req: Request, res: Response) {
    res.status(501).json({
      success: false,
      code: 'GITHUB_LOGIN_DISABLED',
      message: 'GitHub login is disabled. Use email/password. Set your GitHub username on My Profile for assignments.',
    });
  }

  static async githubCallback(_req: Request, res: Response) {
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/login?error=github_login_disabled`);
  }
}
