import { api } from './api';
import { useQuery } from './hooks';

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number }
export const useCurrent = () => useQuery(() => api.get<{ session: any; term: any; terms: any[] }>('/api/academics/current'), []);
export const useClasses = (all = false) => useQuery(() => api.get<any[]>(`/api/classes${all ? '?all=1' : ''}`), [all]);
export const useSubjects = () => useQuery(() => api.get<any[]>('/api/subjects?status=active'), []);
export const useTeachers = () => useQuery(() => api.get<Paged<any>>('/api/teachers?pageSize=100'), []);
export const className = (c: { level?: string; arm?: string } | null | undefined) => (c?.level ? `${c.level} ${c.arm ?? ''}`.trim() : '—');
export const fullName = (r: { first_name?: string; last_name?: string }) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
