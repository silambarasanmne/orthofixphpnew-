const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken, requireRole } = require('./auth');
const { logAudit } = require('../middleware/audit');

// POST /api/prescriptions - Create or Update prescription/consultation
router.post('/', authenticateToken, requireRole('Doctor', 'Medical Manager', 'Admin'), (req, res) => {
  try {
    const { patient_token, patient_mobile, patient_name, age, symptoms, complaints, diagnosis, doctor_comment, items } = req.body;

    if (!patient_token) {
      return res.status(400).json({ success: false, message: 'Patient token is required.' });
    }

    if (!doctor_comment || !doctor_comment.trim()) {
      return res.status(400).json({ success: false, message: 'Doctor note is mandatory.' });
    }

    const safeItems = Array.isArray(items) ? items : [];

    const doctorId = req.user ? req.user.id : null;
    const doctorName = req.user ? req.user.full_name : 'Dr. Specialist';

    // Check for existing pending prescription for the same token to update instead of erroring out
    const existingPending = db.prepare("SELECT id FROM prescriptions WHERE patient_token = ? AND status = 'Pending'").get(patient_token);

    let prescriptionId = null;

    if (existingPending) {
      // UPDATE existing pending prescription & consultation
      prescriptionId = existingPending.id;

      db.prepare(`
        UPDATE prescriptions 
        SET doctor_id = ?, doctor_name = ?, complaints = ?, diagnosis = ?, submission_status = 'Submitted'
        WHERE id = ?
      `).run(
        doctorId,
        doctorName,
        complaints || symptoms || '',
        diagnosis || '',
        prescriptionId
      );

      // Update consultation record if exists, or insert if missing
      const existingConsultation = db.prepare('SELECT id FROM consultations WHERE prescription_id = ?').get(prescriptionId);
      if (existingConsultation) {
        db.prepare(`
          UPDATE consultations
          SET patient_name = ?, patient_mobile = ?, doctor_id = ?, age = ?, symptoms = ?, doctor_comment = ?
          WHERE prescription_id = ?
        `).run(
          patient_name || '',
          patient_mobile || '',
          doctorId,
          parseInt(age) || 0,
          symptoms || complaints || '',
          doctor_comment.trim(),
          prescriptionId
        );
      } else {
        db.prepare(`
          INSERT INTO consultations (prescription_id, patient_token, patient_name, patient_mobile, doctor_id, age, symptoms, doctor_comment)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          prescriptionId,
          patient_token,
          patient_name || '',
          patient_mobile || '',
          doctorId,
          parseInt(age) || 0,
          symptoms || complaints || '',
          doctor_comment.trim()
        );
      }

      // Clear existing items to be replaced with new items
      db.prepare('DELETE FROM prescription_items WHERE prescription_id = ?').run(prescriptionId);

    } else {
      // 1. Insert New Prescription Record with Doctor Details
      const pResult = db.prepare(`
        INSERT INTO prescriptions (patient_token, patient_mobile, doctor_id, doctor_name, complaints, diagnosis, submission_status, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Submitted', 'Pending')
      `).run(
        patient_token,
        patient_mobile || '',
        doctorId,
        doctorName,
        complaints || symptoms || '',
        diagnosis || ''
      );
      prescriptionId = pResult.lastInsertRowid;

      // 1.5. Insert Consultation Record
      db.prepare(`
        INSERT INTO consultations (prescription_id, patient_token, patient_name, patient_mobile, doctor_id, age, symptoms, doctor_comment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        prescriptionId,
        patient_token,
        patient_name || '',
        patient_mobile || '',
        doctorId,
        parseInt(age) || 0,
        symptoms || complaints || '',
        doctor_comment.trim()
      );
    }

    // 2. Insert Prescription Items if any
    if (safeItems.length > 0) {
      const insertItem = db.prepare(`
        INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, quantity, instructions, days, timing)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      let fallbackMed = db.prepare('SELECT id FROM medicines ORDER BY id ASC LIMIT 1').get();
      if (!fallbackMed) {
        const info = db.prepare(`
          INSERT INTO medicines (name, generic_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, current_stock, minimum_stock)
          VALUES ('General Medicine', 'General', 'Tablet', 'General', 'GEN2026', '2030-12-31', 0, 0, 9999, 10)
        `).run();
        fallbackMed = { id: info.lastInsertRowid };
      }
      const fallbackMedId = fallbackMed.id;

      for (const item of safeItems) {
        let validMedId = null;
        if (item.medicine_id) {
          const medExists = db.prepare('SELECT id FROM medicines WHERE id = ?').get(item.medicine_id);
          if (medExists) validMedId = item.medicine_id;
        }
        if (!validMedId && item.medicine_name) {
          const cleanName = item.medicine_name.trim();
          const medByName = db.prepare('SELECT id FROM medicines WHERE name LIKE ? OR generic_name LIKE ?').get(`%${cleanName}%`, `%${cleanName}%`);
          if (medByName) validMedId = medByName.id;
        }

        insertItem.run(
          prescriptionId,
          validMedId || fallbackMedId,
          item.medicine_name || 'General Medicine',
          item.quantity || 1,
          item.instructions || '',
          item.days || 1,
          item.timing || ''
        );
      }
    }

    logAudit(req, req.user, 'CONSULTATION_SUBMIT', 'DOCTOR', 'Prescription', prescriptionId, `Doctor '${doctorName}' saved consultation for token #${patient_token}`);

    return res.json({ success: true, message: 'Prescription & Consultation saved successfully.', prescription_id: prescriptionId });
  } catch (error) {
    console.error('Prescription POST error:', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Failed to save prescription: ' + error.message });
  }
});

// GET /api/prescriptions/today - Fetch all pending prescriptions/consultations for today
router.get('/today', authenticateToken, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch today's pending prescriptions along with consultation/patient info
    const stmt = db.prepare(`
      SELECT p.*, c.patient_name, c.age, c.symptoms, c.doctor_comment
      FROM prescriptions p
      LEFT JOIN consultations c ON p.id = c.prescription_id
      WHERE date(p.created_at) = ? AND p.status = 'Pending'
      ORDER BY p.id DESC
    `);
    
    const prescriptions = stmt.all(today);
    
    return res.json({
      success: true,
      prescriptions
    });
  } catch (error) {
    console.error('Prescriptions /today fetch error:', error);
    return res.status(500).json({ success: false, message: "Failed to fetch today's prescriptions." });
  }
});

// GET /api/prescriptions/patient/:identifier - Fetch pending prescription by token or mobile
router.get('/patient/:identifier', authenticateToken, (req, res) => {
  try {
    const identifier = req.params.identifier;
    
    // Find the pending prescription for the patient
    const stmt = db.prepare(`
      SELECT p.*, c.doctor_comment, COALESCE(c.patient_name, pat.patient_name) as patient_name, COALESCE(c.patient_mobile, pat.mobile, p.patient_mobile) as mobile
      FROM prescriptions p
      LEFT JOIN consultations c ON p.id = c.prescription_id
      LEFT JOIN patients pat ON p.patient_token = pat.token
      WHERE (p.patient_token = ? OR p.patient_mobile = ? OR pat.mobile = ? OR c.patient_mobile = ?) AND p.status = 'Pending'
      ORDER BY p.id DESC
      LIMIT 1
    `);
    
    const prescription = stmt.get(identifier, identifier, identifier, identifier);

    if (!prescription) {
      return res.json({ success: false, message: 'No pending prescription found for this patient.' });
    }

    // Fetch the prescription items
    const itemsStmt = db.prepare('SELECT * FROM prescription_items WHERE prescription_id = ?');
    const items = itemsStmt.all(prescription.id);

    return res.json({
      success: true,
      prescription: {
        ...prescription,
        items
      }
    });
  } catch (error) {
    console.error('Prescription fetch error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch prescription.' });
  }
});

// GET /api/prescriptions/all - Fetch all prescriptions & consultations for Super Admin reporting
router.get('/all', authenticateToken, (req, res) => {
  try {
    const { status, doctor_name, search, start_date, end_date } = req.query;
    let sql = `
      SELECT p.*, 
             COALESCE(c.patient_name, pat.patient_name) AS patient_name, 
             COALESCE(c.age, pat.age) AS age, 
             COALESCE(c.patient_mobile, pat.mobile, p.patient_mobile) AS mobile, 
             COALESCE(c.symptoms, pat.symptoms) AS symptoms, 
             c.doctor_comment
      FROM prescriptions p
      LEFT JOIN consultations c ON p.id = c.prescription_id
      LEFT JOIN patients pat ON p.patient_token = pat.token
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      sql += ` AND p.status = ?`;
      params.push(status);
    }

    if (doctor_name && doctor_name.trim() !== '') {
      sql += ` AND p.doctor_name LIKE ?`;
      params.push(`%${doctor_name.trim()}%`);
    }

    if (search && search.trim() !== '') {
      const q = `%${search.trim()}%`;
      sql += ` AND (p.patient_token LIKE ? OR c.patient_name LIKE ? OR pat.patient_name LIKE ? OR p.doctor_name LIKE ? OR c.symptoms LIKE ?)`;
      params.push(q, q, q, q, q);
    }

    if (start_date) {
      sql += ` AND date(p.created_at) >= date(?)`;
      params.push(start_date);
    }

    if (end_date) {
      sql += ` AND date(p.created_at) <= date(?)`;
      params.push(end_date);
    }

    sql += ` ORDER BY p.id DESC`;

    const stmt = db.prepare(sql);
    const prescriptions = stmt.all(...params);

    return res.json({
      success: true,
      prescriptions
    });
  } catch (error) {
    console.error('Fetch all prescriptions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch doctor consultations.' });
  }
});

module.exports = router;

