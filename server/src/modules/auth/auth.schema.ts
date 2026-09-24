import { z } from 'zod';

export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
export const name = z.string().trim().min(1, 'Required').max(80);

export const registerSchema = z.object({
  school: z.object({
    name: z.string().trim().min(2, 'School name is required').max(120),
    address: z.string().trim().min(3, 'Address is required').max(240),
    email: email,
    phone: z.string().trim().min(7, 'Phone number is required').max(20),
    type: z.enum(['private', 'public', 'mission', 'international', 'other']),
  }),
  admin: z.object({ firstName: name, lastName: name, email, password }),
});

export const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required').max(128) });
export const tokenSchema = z.object({ token: z.string().min(16).max(256) });
export const emailSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(16).max(256), password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
export const acceptInviteSchema = z.object({ token: z.string().min(16).max(256), password });
