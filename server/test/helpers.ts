import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/connection.js';

let server: Server; let base = '';

export async function startServer() {
  const app = createApp();
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
  return base;
}
export function stopServer() { server?.close(); }
export const baseUrl = () => base;

export class Client {
  cookie = '';
  async req(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { 'x-eduos-client': 'test', ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const [pair] = c.split(';');
      if (pair.startsWith('eduos_session=')) this.cookie = pair.split('=')[1] ? pair : '';
    }
    const text = await res.text();
    let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
  put = (p: string, b?: unknown) => this.req('PUT', p, b);
  patch = (p: string, b?: unknown) => this.req('PATCH', p, b);
  del = (p: string) => this.req('DELETE', p);
}

let n = 0;
export async function registerSchool(name: string) {
  const c = new Client();
  const email = `admin${++n}-${Date.now()}@${name.toLowerCase().replace(/\W/g, '')}.test`;
  const reg = await c.post('/api/auth/register', {
    school: { name, address: '1 Test Road, Lagos', email: `info-${n}@${name.toLowerCase().replace(/\W/g, '')}.test`, phone: '08012345678', type: 'private' },
    admin: { firstName: 'Ada', lastName: 'Admin', email, password: 'Str0ngPassw0rd!' },
  });
  if (reg.status !== 201) throw new Error(`register failed ${reg.status} ${JSON.stringify(reg.body)}`);
  const token = new URL(reg.body.verifyUrl).searchParams.get('token')!;
  await c.post('/api/auth/verify-email', { token });
  const login = await c.post('/api/auth/login', { email, password: 'Str0ngPassw0rd!' });
  if (login.status !== 200) throw new Error(`login failed ${JSON.stringify(login.body)}`);
  const me = await c.get('/api/auth/me');
  return { client: c, email, schoolId: me.body.school.id as number };
}

/** Sets up a school with session, class, subject, teacher (logged in), student, parent (logged in). */
export async function seedSchool(name: string) {
  const s = await registerSchool(name);
  const c = s.client;
  const session = await c.post('/api/academics/sessions', { name: '2026/2027' });
  const cur = await c.get('/api/academics/current');
  const termId = cur.body.term.id as number;
  const cls = await c.post('/api/classes', { level: 'SS1', arm: 'A' });
  const subj = await c.post('/api/subjects', { name: 'Mathematics', code: 'MTH' });
  const teacher = await c.post('/api/teachers', { firstName: 'Tunde', lastName: 'Teacher', email: `t-${Date.now()}-${n}@${name.replace(/\W/g, '')}.test`, phone: '0801' });
  await c.post(`/api/classes/${cls.body.id}/subjects`, { subjectId: subj.body.id, teacherId: teacher.body.id });
  const student = await c.post('/api/students', { firstName: 'Sade', lastName: 'Student', gender: 'female', classArmId: cls.body.id, email: `s-${Date.now()}-${n}@${name.replace(/\W/g, '')}.test`, createAccount: true });
  const parent = await c.post('/api/parents', { firstName: 'Papa', lastName: 'Parent', email: `p-${Date.now()}-${n}@${name.replace(/\W/g, '')}.test`, createAccount: true, studentIds: [student.body.id] });
  const activate = async (inviteUrl: string, email: string) => {
    const cl = new Client();
    const token = new URL(inviteUrl).searchParams.get('token')!;
    const r = await cl.post('/api/auth/accept-invite', { token, password: 'Str0ngPassw0rd!' });
    if (r.status !== 200) throw new Error('invite failed ' + JSON.stringify(r.body));
    const l = await cl.post('/api/auth/login', { email, password: 'Str0ngPassw0rd!' });
    if (l.status !== 200) throw new Error('login failed ' + JSON.stringify(l.body));
    return cl;
  };
  const teacherEmail = (getDb().prepare('SELECT email FROM teachers WHERE id = ?').get(teacher.body.id) as any).email;
  const studentEmail = (getDb().prepare('SELECT u.email FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?').get(student.body.id) as any).email;
  const parentEmail = (getDb().prepare('SELECT email FROM parents WHERE id = ?').get(parent.body.id) as any).email;
  return {
    ...s, admin: c, sessionId: session.body.id, termId, classId: cls.body.id as number, subjectId: subj.body.id as number,
    teacherId: teacher.body.id as number, studentId: student.body.id as number, parentId: parent.body.id as number,
    teacher: await activate(teacher.body.inviteUrl, teacherEmail), student: await activate(student.body.inviteUrl, studentEmail), parent: await activate(parent.body.inviteUrl, parentEmail),
  };
}
