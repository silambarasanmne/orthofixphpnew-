const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('./auth');
const { logAudit } = require('../middleware/audit');

const VALID_ROLES = [
  'Super Admin',
  'Admin / Billing Manager',
  'Billing Manager',
  'Medical Manager',
  'Doctor',
  'OP Worker',
  'Billing Worker',
  'Medical Billing Worker'
];

// GET /api/users - List all users (Admin only)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, username, full_name, email, mobile_number, role, is_active, plain_password, last_login_at, created_by, created_at, updated_at FROM users ORDER BY id ASC');
    const users = stmt.all();
    return res.json({ success: true, users });
  } catch (error) {
    console.error('Fetch users error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

// POST /api/users - Create new user account (Admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { username, password, full_name, email, mobile_number, role } = req.body;

    if (!username || !password || !full_name) {
      return res.status(400).json({ success: false, message: 'Username, password, and full name are required.' });
    }

    const trimmedUsername = username.trim();
    const checkUser = db.prepare('SELECT id FROM users WHERE username = ?');
    if (checkUser.get(trimmedUsername)) {
      return res.status(400).json({ success: false, message: `Username "${trimmedUsername}" already exists.` });
    }

    const assignedRole = VALID_ROLES.includes(role) ? role : 'Billing Worker';
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    const nowIso = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO users (username, password, plain_password, full_name, email, mobile_number, role, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);

    const result = insertStmt.run(
      trimmedUsername,
      hashedPassword,
      password,
      full_name.trim(),
      email ? email.trim() : '',
      mobile_number ? mobile_number.trim() : '',
      assignedRole,
      req.user ? req.user.username : 'admin',
      nowIso,
      nowIso
    );

    const newId = result.lastInsertRowid;
    logAudit(req, req.user, 'USER_CREATE', 'USERS', 'User', newId, `Admin created user '${trimmedUsername}' with role '${assignedRole}'`);

    return res.json({
      success: true,
      message: 'User created successfully.',
      user_id: newId
    });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
});

// PUT /api/users/:id - Edit user details (Admin only)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = req.params.id;
    const { full_name, email, mobile_number, role } = req.body;

    const userStmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const existing = userStmt.get(userId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const assignedRole = VALID_ROLES.includes(role) ? role : existing.role;
    const nowIso = new Date().toISOString();

    const updateStmt = db.prepare(`
      UPDATE users SET full_name = ?, email = ?, mobile_number = ?, role = ?, updated_at = ? WHERE id = ?
    `);

    updateStmt.run(
      full_name ? full_name.trim() : existing.full_name,
      email !== undefined ? email.trim() : existing.email,
      mobile_number !== undefined ? mobile_number.trim() : existing.mobile_number,
      assignedRole,
      nowIso,
      userId
    );

    logAudit(req, req.user, 'USER_UPDATE', 'USERS', 'User', userId, `Admin updated user details for '${existing.username}'`);

    return res.json({ success: true, message: 'User updated successfully.' });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});

// PATCH /api/users/:id/status - Toggle active/deactive (Admin only)
router.patch('/:id/status', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = req.params.id;
    const { is_active } = req.body;

    if (parseInt(userId, 10) === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
    }

    const existing = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    const statusVal = is_active ? 1 : 0;
    const nowIso = new Date().toISOString();

    db.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?').run(statusVal, nowIso, userId);

    const actionName = statusVal ? 'USER_ACTIVATE' : 'USER_DEACTIVATE';
    logAudit(req, req.user, actionName, 'USERS', 'User', userId, `Admin set user status to ${statusVal ? 'Active' : 'Inactive'} for '${existing ? existing.username : userId}'`);

    return res.json({ 
      success: true, 
      message: `User status changed to ${statusVal ? 'Active' : 'Inactive'}.` 
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update user status.' });
  }
});

// POST /api/users/:id/reset-password - Reset user password (Admin only)
router.post('/:id/reset-password', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = req.params.id;
    const { new_password } = req.body;

    if (!new_password || new_password.trim() === '') {
      return res.status(400).json({ success: false, message: 'New password is required.' });
    }

    const existing = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(new_password, salt);
    const nowIso = new Date().toISOString();

    db.prepare('UPDATE users SET password = ?, plain_password = ?, updated_at = ? WHERE id = ?').run(hashedPassword, new_password, nowIso, userId);

    logAudit(req, req.user, 'PASSWORD_RESET', 'USERS', 'User', userId, `Admin reset password for user '${existing ? existing.username : userId}'`);

    return res.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});

// DELETE /api/users/:id - Delete user account (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const userId = req.params.id;

    if (parseInt(userId, 10) === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your logged-in Super Admin account.' });
    }

    const existing = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    logAudit(req, req.user, 'USER_DELETE', 'USERS', 'User', userId, `Admin deleted user account '${existing.username}'`);

    return res.json({ success: true, message: `User account '${existing.username}' deleted successfully.` });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete user.' });
  }
});

module.exports = router;

