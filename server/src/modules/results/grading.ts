import { z } from 'zod';

export const gradingScaleSchema = z.object({
  ca1Max: z.number().min(0).max(100).default(20),
  ca2Max: z.number().min(0).max(100).default(20),
  examMax: z.number().min(0).max(100).default(60),
  bands: z.array(z.object({ min: z.number().min(0).max(100), grade: z.string().min(1).max(3), remark: z.string().max(40) })).min(2).max(10),
}).refine((s) => s.ca1Max + s.ca2Max + s.examMax === 100, { message: 'CA and exam maximums must add up to 100' });
export type GradingScale = z.infer<typeof gradingScaleSchema>;

export const DEFAULT_GRADING_SCALE: GradingScale = {
  ca1Max: 20, ca2Max: 20, examMax: 60,
  bands: [
    { min: 75, grade: 'A1', remark: 'Excellent' }, { min: 70, grade: 'B2', remark: 'Very Good' }, { min: 65, grade: 'B3', remark: 'Good' },
    { min: 60, grade: 'C4', remark: 'Credit' }, { min: 55, grade: 'C5', remark: 'Credit' }, { min: 50, grade: 'C6', remark: 'Credit' },
    { min: 45, grade: 'D7', remark: 'Pass' }, { min: 40, grade: 'E8', remark: 'Pass' }, { min: 0, grade: 'F9', remark: 'Fail' },
  ],
};

export function computeGrade(total: number, scale: GradingScale) {
  const band = [...scale.bands].sort((a, b) => b.min - a.min).find((b) => total >= b.min) ?? scale.bands[scale.bands.length - 1];
  return { grade: band.grade, remark: band.remark };
}
