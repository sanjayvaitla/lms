import { Request, Response } from 'express';
import { Grievance } from '../models/Grievance';
import { User } from '../models/User';

export async function createGrievance(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    const { subject, description } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ error: 'Subject and description are required' });
    }

    const grievance = await Grievance.create({
      studentId: userId,
      subject,
      description,
      status: 'OPEN',
    });

    return res.status(201).json({ message: 'Grievance submitted successfully', grievance });
  } catch (error: any) {
    console.error('Error creating grievance:', error);
    return res.status(500).json({ error: 'Failed to create grievance' });
  }
}

export async function getMyGrievances(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    const grievances = await Grievance.findAll({
      where: { studentId: userId },
      order: [['created_at', 'DESC']],
    });

    return res.json(grievances);
  } catch (error: any) {
    console.error('Error fetching my grievances:', error);
    return res.status(500).json({ error: 'Failed to fetch my grievances' });
  }
}

export async function getAllGrievances(req: Request, res: Response) {
  try {
    const grievances = await Grievance.findAll({
      include: [
        { model: User, as: 'student', attributes: ['id', 'name', 'email'] }
      ],
      order: [['created_at', 'DESC']],
    });

    return res.json(grievances);
  } catch (error: any) {
    console.error('Error fetching all grievances:', error);
    return res.status(500).json({ error: 'Failed to fetch grievances' });
  }
}

export async function updateGrievanceStatus(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const grievance = await Grievance.findByPk(id);
    if (!grievance) {
      return res.status(404).json({ error: 'Grievance not found' });
    }

    grievance.status = status;
    await grievance.save();

    return res.json({ message: 'Grievance status updated', grievance });
  } catch (error: any) {
    console.error('Error updating grievance status:', error);
    return res.status(500).json({ error: 'Failed to update grievance status' });
  }
}

export async function deleteGrievance(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const grievance = await Grievance.findByPk(id);
    if (!grievance) {
      return res.status(404).json({ error: 'Grievance not found' });
    }
    await grievance.destroy();
    return res.json({ message: 'Grievance deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting grievance:', error);
    return res.status(500).json({ error: 'Failed to delete grievance' });
  }
}
