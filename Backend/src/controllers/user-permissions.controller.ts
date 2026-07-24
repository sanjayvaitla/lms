import { Request, Response } from 'express';
import * as svc from '../services/user-permissions.service';
import db from '../lib/db';

export async function getMyPermissions(req: Request, res: Response) {
  const permissions = await svc.getUserPermissions(req.user!.userId, req.user!.role);
  res.json({ success: true, data: permissions });
}

export async function getAllPermissions(req: Request, res: Response) {
  const permissions = await svc.getAllUserPermissions();
  res.json({ success: true, data: permissions });
}

export async function getUserPermissions(req: Request, res: Response) {
  const userId = String(req.params.userId);
  const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
  
  if (!rows.length) {
    return res.status(404).json({ success: false, message: 'User not found', code: 'NOT_FOUND' });
  }
  
  const permissions = await svc.getUserPermissions(userId, rows[0].role);
  res.json({ success: true, data: permissions });
}

export async function updatePermissions(req: Request, res: Response) {
  const userId = String(req.params.userId);
  const updates = req.body;
  
  const permissions = await svc.updateUserPermissions(userId, updates, req.user!.userId);
  
  res.json({ 
    success: true, 
    data: permissions, 
    message: 'Permissions updated successfully' 
  });
}
