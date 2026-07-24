import { z } from 'zod';

const profileFields = {
  phoneNumber:     z.string().max(20).optional().nullable(),
  dateOfBirth:     z.string().optional().nullable(),
  address:         z.string().max(500).optional().nullable(),
  occupation:      z.string().max(100).optional().nullable(),
  qualification:   z.string().max(200).optional().nullable(),
  graduationYear:  z.string().max(20).optional().nullable(),
  classPreference: z.string().max(50).optional().nullable(),
  leadSource:      z.string().max(100).optional().nullable(),
  githubUsername:  z.string().max(39).optional().nullable()
    .refine(
      (v) => v == null || v === '' || /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(String(v).replace(/^@/, '')),
      'Invalid GitHub username format',
    ),
};

export const createLearnerSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters').max(100),
  email:    z.string().email('Invalid email address'),
  password: z.string().min(6).optional(),
  ...profileFields,
});

export const updateLearnerSchema = createLearnerSchema.partial();

export type CreateLearnerInput = z.infer<typeof createLearnerSchema>;
export type UpdateLearnerInput = z.infer<typeof updateLearnerSchema>;
