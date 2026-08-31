const fs = require('fs');
const path = require('path');

const OUTBOX = path.join(__dirname, '..', 'outbox');
if (!fs.existsSync(OUTBOX)) fs.mkdirSync(OUTBOX, { recursive: true });

function send({ to, subject, body }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(OUTBOX, `${stamp}_${to.replace(/[^a-z0-9@.]/gi, '_')}.txt`);
  const content = `TO: ${to}\nSUBJECT: ${subject}\n\n${body}\n`;
  fs.writeFileSync(file, content, 'utf8');
  console.log(`[mailer] ${subject} -> ${to} (saved to outbox/)`);
}

function sendVerificationEmail(email, firstName, verifyUrl) {
  send({
    to: email,
    subject: 'Verify your email - EduOS',
    body: [
      `Hi ${firstName},`,
      '',
      'Welcome to EduOS! Confirm your email address to activate your school account:',
      '',
      verifyUrl,
      '',
      'This link expires in 24 hours.',
    ].join('\n'),
  });
}

function sendPasswordResetEmail(email, firstName, resetUrl) {
  send({
    to: email,
    subject: 'Reset your password - EduOS',
    body: [
      `Hi ${firstName},`,
      '',
      'A password reset was requested for your EduOS account:',
      '',
      resetUrl,
      '',
      'This link expires in 1 hour. If this was not you, ignore this email.',
    ].join('\n'),
  });
}

module.exports = { send, sendVerificationEmail, sendPasswordResetEmail };
