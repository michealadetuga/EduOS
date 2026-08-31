const express = require('express');
const path = require('path');
const { router: authRouter, requireAuthPage } = require('./src/routes/auth');
const adminRouter = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'signup.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'login.html')));
app.get('/verify', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'verify.html')));
app.get('/forgot', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'forgot.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'pages', 'reset.html')));

app.use('/api', authRouter);
app.use('/api', adminRouter);

app.get('/dashboard', requireAuthPage, (req, res, next) => {
  if (req.user.role !== 'school_admin') return res.redirect('/portal');
  res.sendFile(path.join(__dirname, 'pages', 'admin.html'));
});

app.get('/portal', requireAuthPage, (req, res) =>
  res.sendFile(path.join(__dirname, 'pages', 'portal.html'))
);

app.listen(PORT, () => {
  console.log(`EduOS running at http://localhost:${PORT}`);
});
