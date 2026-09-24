const express = require('express');
const path = require('path');
const { router: authRouter, requireAuthPage } = require('./src/routes/auth');
const adminRouter = require('./src/routes/admin');
const { setupCookieParser } = require('./src/middleware/cookieParser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
setupCookieParser(app);

// Static files
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Page routes
const pageRoutes = {
  '/': 'index.html',
  '/styles.css': 'styles.css',
  '/signup': 'pages/signup.html',
  '/login': 'pages/login.html',
  '/verify': 'pages/verify.html',
  '/forgot': 'pages/forgot.html',
  '/reset-password': 'pages/reset.html',
};

Object.entries(pageRoutes).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, file)));
});

// API routes
app.use('/api', authRouter);
app.use('/api', adminRouter);

// Protected page routes
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
