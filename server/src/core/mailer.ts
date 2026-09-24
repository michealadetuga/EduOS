import fs from 'node:fs';
import path from 'node:path';
import { env, ROOT } from '../config/env.js';

export interface Mail { to: string; subject: string; text: string }

interface MailProvider { send(m: Mail): Promise<void> }

/** Development provider: writes mail to ./outbox so links can be inspected locally. */
const outboxProvider: MailProvider = {
  async send(m) {
    const dir = path.join(ROOT, 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `${stamp}_${m.to.replace(/[^a-z0-9@.]/gi, '_')}.txt`), `TO: ${m.to}\nSUBJECT: ${m.subject}\n\n${m.text}\n`);
    if (!env.isTest) console.log(`[mail] ${m.subject} -> ${m.to} (outbox/)`);
  },
};

/** Resend-compatible HTTP provider (set EMAIL_PROVIDER=resend, EMAIL_API_KEY). */
const resendProvider: MailProvider = {
  async send(m) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text }),
    });
    if (!r.ok) throw new Error(`Email provider error ${r.status}`);
  },
};

export const mailer: MailProvider = env.EMAIL_PROVIDER === 'resend' ? resendProvider : outboxProvider;
