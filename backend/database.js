let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e1) {
  try {
    const BetterSqlite3 = require('better-sqlite3');
    DatabaseSync = function(dbPath) {
      return new BetterSqlite3(dbPath);
    };
  } catch (e2) {
    console.warn('SQLite module fallback warning:', e1.message);
  }
}
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

let dbDir = path.join(__dirname, '../database');
let dbPath = path.join(dbDir, 'pharmacy.db');

if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const tmpPath = path.join('/tmp', 'pharmacy.db');
  try {
    if (!fs.existsSync(tmpPath) && fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, tmpPath);
    }
    dbPath = tmpPath;
  } catch (e) {
    console.warn('Vercel DB copy warning:', e.message);
  }
} else {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

const db = new DatabaseSync(dbPath);

// SQLite Engine Tuning
try {
  if (process.env.VERCEL) {
    db.exec('PRAGMA journal_mode = MEMORY;');
  } else {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA cache_size = -64000;');
  db.exec('PRAGMA temp_store = MEMORY;');
} catch (e) {
  console.warn('SQLite PRAGMA tuning warning:', e.message);
}

function initDb() {
  // 1. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL, -- 'Admin / Billing Manager' or 'Billing Worker'
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Medicines Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      generic_name TEXT NOT NULL,
      category TEXT NOT NULL,
      manufacturer TEXT,
      batch_number TEXT NOT NULL,
      expiry_date TEXT NOT NULL, -- YYYY-MM-DD
      purchase_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      current_stock INTEGER NOT NULL DEFAULT 0,
      minimum_stock INTEGER NOT NULL DEFAULT 10,
      gst_percent REAL DEFAULT 12.0,
      barcode TEXT UNIQUE,
      units_per_strip INTEGER DEFAULT 10,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    db.exec('ALTER TABLE medicines ADD COLUMN units_per_strip INTEGER DEFAULT 10;');
  } catch (e) {
    // Column already exists or table freshly created
  }

  // 3. Sales Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      subtotal REAL NOT NULL,
      discount_type TEXT DEFAULT 'fixed', -- 'percent' or 'fixed'
      discount_value REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      grand_total REAL NOT NULL,
      payment_method TEXT NOT NULL, -- 'Cash', 'UPI', 'Card'
      amount_received REAL,
      change_amount REAL DEFAULT 0,
      worker_id INTEGER,
      worker_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Sale Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      medicine_id INTEGER NOT NULL,
      medicine_name TEXT NOT NULL,
      generic_name TEXT,
      batch_number TEXT,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );
  `);

  // 5. Stock Movements Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      medicine_name TEXT NOT NULL,
      previous_quantity INTEGER NOT NULL,
      change_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      reason TEXT NOT NULL, -- 'Customer Sale', 'Restock', 'Stock Audit', 'Excel Import'
      user_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );
  `);

  // 6. Patients Table (from OP system)
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token INTEGER NOT NULL,
      patient_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT DEFAULT 'Male',
      mobile TEXT NOT NULL,
      symptoms TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 7. Prescriptions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_token INTEGER NOT NULL,
      patient_mobile TEXT,
      doctor_name TEXT,
      status TEXT DEFAULT 'Pending', -- 'Pending' or 'Billed'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 7b. Consultations Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS consultations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_id INTEGER,
      patient_token INTEGER NOT NULL,
      patient_name TEXT,
      patient_mobile TEXT,
      doctor_id INTEGER,
      age INTEGER,
      symptoms TEXT,
      doctor_comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE SET NULL
    );
  `);

  // 8. Prescription Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS prescription_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prescription_id INTEGER NOT NULL,
      medicine_id INTEGER NOT NULL,
      medicine_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      instructions TEXT,
      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );
  `);
  try { db.exec("ALTER TABLE prescription_items ADD COLUMN days INTEGER DEFAULT 1;"); } catch(e) {}
  try { db.exec("ALTER TABLE prescription_items ADD COLUMN timing TEXT DEFAULT '';"); } catch(e) {}


  // 9. Audit Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      role TEXT,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      record_type TEXT,
      record_id TEXT,
      description TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 10. Vendors Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      gst_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 11. Vendor Purchases Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_number TEXT UNIQUE NOT NULL,
      vendor_id INTEGER NOT NULL,
      vendor_name TEXT NOT NULL,
      invoice_number TEXT,
      purchase_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      payment_status TEXT DEFAULT 'Paid',
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    );
  `);

  // 12. Vendor Purchase Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      medicine_id INTEGER NOT NULL,
      medicine_name TEXT NOT NULL,
      batch_number TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      purchase_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES vendor_purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );
  `);

  // 13. Purchase Returns Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT UNIQUE NOT NULL,
      vendor_id INTEGER,
      vendor_name TEXT NOT NULL,
      purchase_number TEXT,
      return_date TEXT NOT NULL,
      return_reason TEXT NOT NULL,
      total_refund_amount REAL NOT NULL,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 14. Purchase Return Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      medicine_id INTEGER NOT NULL,
      medicine_name TEXT NOT NULL,
      batch_number TEXT,
      expiry_date TEXT,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_refund REAL NOT NULL,
      FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );
  `);

  // 15. Expired Disposals Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS expired_disposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      disposal_number TEXT UNIQUE NOT NULL,
      medicine_id INTEGER NOT NULL,
      medicine_name TEXT NOT NULL,
      batch_number TEXT,
      expiry_date TEXT,
      quantity INTEGER NOT NULL,
      loss_amount REAL NOT NULL,
      reason TEXT NOT NULL,
      user_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Helper for safe schema migration (adding new columns if absent)
  function addColumnIfNotExists(table, columnDef) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
    } catch (err) {
      // Ignore error if column already exists
    }
  }

  // Schema Migrations for users, prescriptions, consultations, and sales
  addColumnIfNotExists('users', 'mobile_number TEXT');
  addColumnIfNotExists('users', 'last_login_at DATETIME');
  addColumnIfNotExists('users', 'created_by TEXT');
  addColumnIfNotExists('users', 'updated_at DATETIME');
  addColumnIfNotExists('users', 'plain_password TEXT');

  addColumnIfNotExists('prescriptions', 'patient_id INTEGER');
  addColumnIfNotExists('prescriptions', 'doctor_id INTEGER');
  addColumnIfNotExists('prescriptions', 'complaints TEXT');
  addColumnIfNotExists('prescriptions', 'diagnosis TEXT');
  addColumnIfNotExists('prescriptions', 'submission_status TEXT DEFAULT "Submitted"');

  addColumnIfNotExists('consultations', 'doctor_id INTEGER');

  addColumnIfNotExists('patients', 'gender TEXT DEFAULT "Male"');
  addColumnIfNotExists('vendor_purchases', 'bill_image TEXT');
  addColumnIfNotExists('medicines', 'vendor_id INTEGER');
  addColumnIfNotExists('medicines', 'vendor_name TEXT');

  addColumnIfNotExists('sales', 'consultation_id INTEGER');
  addColumnIfNotExists('sales', 'doctor_id INTEGER');
  addColumnIfNotExists('sales', 'doctor_name TEXT');
  addColumnIfNotExists('sales', 'consultation_charges REAL DEFAULT 0');
  addColumnIfNotExists('sales', 'medicine_charges REAL DEFAULT 0');
  addColumnIfNotExists('sales', 'other_charges REAL DEFAULT 0');
  addColumnIfNotExists('sales', 'checkout_status TEXT DEFAULT "Completed"');

  // Advanced Speed Optimization Indexes (created after tables exist)
  db.exec('CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines(barcode);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_medicines_search ON medicines(name, generic_name, category);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_medicines_stock ON medicines(current_stock, minimum_stock);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sales_consultation ON sales(consultation_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_med ON sale_items(medicine_id, sale_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stock_movements_med ON stock_movements(medicine_id);');

  db.exec('CREATE INDEX IF NOT EXISTS idx_patients_token ON patients(token);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(patient_name);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_prescriptions_token ON prescriptions(patient_token);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_prescriptions_mobile ON prescriptions(patient_mobile);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);');

  seedData();
}

function seedInitialMedicines() {
  const count = db.prepare('SELECT COUNT(*) as count FROM medicines').get();
  if (count && count.count > 0) return;

  const insertMed = db.prepare(`
    INSERT INTO medicines (name, generic_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, current_stock, minimum_stock, units_per_strip, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialMeds = [
    ['Paracetamol 500mg', 'Paracetamol', 'Tablet', 'Cipla', 'PCM2026A', '2028-12-31', 1.5, 2.5, 500, 50, 10, 'Analgesic and antipyretic'],
    ['Dolo 650mg', 'Paracetamol 650mg', 'Tablet', 'Micro Labs', 'DOLO2026B', '2028-10-31', 2.0, 3.5, 400, 40, 15, 'Pain relief and fever control'],
    ['Amoxicillin 500mg', 'Amoxicillin', 'Capsule', 'Sun Pharma', 'AMX2026C', '2027-08-31', 5.0, 8.0, 300, 30, 10, 'Antibiotic'],
    ['Cetirizine 10mg', 'Cetirizine HCl', 'Tablet', 'Dr. Reddy', 'CET2026D', '2028-05-31', 1.0, 2.0, 600, 50, 10, 'Antihistamine for allergies'],
    ['Pantoprazole 40mg', 'Pantoprazole Sodium', 'Tablet', 'Alkem', 'PAN2026E', '2027-11-30', 4.0, 7.0, 350, 35, 10, 'Proton pump inhibitor for acidity'],
    ['Azithromycin 500mg', 'Azithromycin', 'Tablet', 'Zydus', 'AZI2026F', '2027-06-30', 12.0, 18.0, 200, 20, 3, 'Broad spectrum antibiotic'],
    ['Ibuprofen 400mg', 'Ibuprofen', 'Tablet', 'Abbott', 'IBU2026G', '2028-04-30', 2.5, 4.0, 250, 25, 10, 'NSAID for pain and inflammation'],
    ['Omeprazole 20mg', 'Omeprazole', 'Capsule', 'Lupin', 'OME2026H', '2027-09-30', 3.0, 5.5, 300, 30, 10, 'Antacid capsule'],
    ['Calcium + Vitamin D3', 'Calcium Carbonate & Cholecalciferol', 'Tablet', 'Torrent', 'CAL2026I', '2028-01-31', 6.0, 10.0, 400, 40, 15, 'Bone and calcium supplement'],
    ['ORS Sachet', 'Oral Rehydration Salts', 'Powder', 'FDC', 'ORS2026J', '2028-12-31', 10.0, 15.0, 500, 50, 1, 'Rehydration powder']
  ];

  for (const m of initialMeds) {
    insertMed.run(...m);
  }
  console.log('✅ Seeded initial essential medicines list');
}

function seedData() {
  // Ensure default superadmin account exists
  const salt = bcrypt.genSaltSync(10);
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, password, full_name, email, role, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  insertUser.run('superadmin', bcrypt.hashSync('superadmin', salt), 'Super Administrator', 'superadmin@clinic.com', 'Super Admin');

  // Ensure essential medicines exist
  seedInitialMedicines();
}

function seedHistoricalSales() {
  const insertSale = db.prepare(`
    INSERT OR IGNORE INTO sales 
    (invoice_number, customer_name, customer_phone, customer_address, subtotal, discount_type, discount_value, discount_amount, grand_total, payment_method, amount_received, change_amount, worker_id, worker_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSaleItem = db.prepare(`
    INSERT INTO sale_items (sale_id, medicine_id, medicine_name, generic_name, batch_number, unit_price, quantity, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getMedByName = db.prepare('SELECT id, generic_name, batch_number, selling_price FROM medicines WHERE name = ? LIMIT 1');

  const todayStr = new Date().toISOString().split('T')[0];

  const salesData = [
    { date: `${todayStr} 09:30:00`, inv: 'INV-20260819-0001', cust: 'Ramesh Patel', phone: '9876543210', items: [['Paracetamol 500mg', 2], ['Cetirizine 10mg', 1]], pay: 'Cash', recv: 30, discount: 0, wName: 'Rahul Sharma (Billing Staff)' },
    { date: `${todayStr} 11:15:00`, inv: 'INV-20260819-0002', cust: 'Priya Sharma', phone: '9812345678', items: [['Azithromycin 500mg', 1], ['Pantoprazole 40mg', 2]], pay: 'UPI', recv: 69, discount: 0, wName: 'Anita Roy (Senior Pharmacist)' },
    { date: `${todayStr} 14:45:00`, inv: 'INV-20260819-0003', cust: 'Amit Kumar', phone: '9765432109', items: [['ORS Sachet', 5], ['Vitamin C 500mg', 2]], pay: 'Card', recv: 116, discount: 0, wName: 'Karan Patel (Billing Executive)' },
    { date: `${todayStr} 16:10:00`, inv: 'INV-20260819-0004', cust: 'Deepak Verma', phone: '9833445566', items: [['Dolo 650mg', 2], ['Multivitamin Gold Capsules', 1]], pay: 'UPI', recv: 115, discount: 0, wName: 'Rahul Sharma (Billing Staff)' },
    { date: `${todayStr} 17:45:00`, inv: 'INV-20260819-0005', cust: 'Kavita Menon', phone: '9711223344', items: [['Telmisartan 40mg', 2], ['Calcium Carbonate + Vit D3', 1]], pay: 'Cash', recv: 100, discount: 4, wName: 'Anita Roy (Senior Pharmacist)' },
    { date: '2026-08-18 10:20:00', inv: 'INV-20260818-0001', cust: 'Sunita Verma', phone: '9654321098', items: [['Paracetamol 500mg', 3], ['Pantoprazole 40mg', 1]], pay: 'Cash', recv: 50, discount: 2, wName: 'Karan Patel (Billing Executive)' },
    { date: '2026-08-17 15:30:00', inv: 'INV-20260817-0001', cust: 'Vikram Singh', phone: '9543210987', items: [['Azithromycin 500mg', 2], ['Multivitamin Gold Capsules', 1]], pay: 'UPI', recv: 165, discount: 0, wName: 'Rahul Sharma (Billing Staff)' },
    { date: '2026-08-15 12:00:00', inv: 'INV-20260815-0001', cust: 'Neha Gupta', phone: '9432109876', items: [['ORS Sachet', 10]], pay: 'Cash', recv: 200, discount: 10, wName: 'Anita Roy (Senior Pharmacist)' },
    { date: '2026-07-25 14:15:00', inv: 'INV-20260725-0001', cust: 'Suresh Raina', phone: '9321098765', items: [['Atorvastatin 10mg', 2], ['Telmisartan 40mg', 2]], pay: 'Card', recv: 100, discount: 0, wName: 'Rahul Sharma (Billing Staff)' }
  ];

  for (const s of salesData) {
    let subtotal = 0;
    const resolvedItems = [];
    for (const [medName, qty] of s.items) {
      const med = getMedByName.get(medName);
      if (med) {
        const unitPrice = med.selling_price;
        const totalPrice = unitPrice * qty;
        subtotal += totalPrice;
        resolvedItems.push({
          id: med.id,
          name: medName,
          genericName: med.generic_name,
          batchNumber: med.batch_number,
          unitPrice,
          qty,
          totalPrice
        });
      }
    }

    if (resolvedItems.length === 0) continue;

    const discountAmt = s.discount;
    const grandTotal = subtotal - discountAmt;
    const change = Math.max(0, s.recv - grandTotal);

    const res = insertSale.run(
      s.inv, s.cust, s.phone, '124 Healthcare Avenue, City',
      subtotal, 'fixed', discountAmt, discountAmt, grandTotal,
      s.pay, s.recv, change, 2, s.wName, s.date
    );

    if (res && res.changes > 0) {
      const saleId = res.lastInsertRowid;
      for (const item of resolvedItems) {
        insertSaleItem.run(
          saleId, item.id, item.name, item.genericName, item.batchNumber,
          item.unitPrice, item.qty, item.totalPrice
        );
      }
    }
  }

  console.log('Seeded enriched sample historical sales records');
}

function checkpointDb() {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (err) {
    console.error('WAL Checkpoint Error:', err.message);
  }
}

// Perform Startup Database Health & Integrity Audit
try {
  const integrity = db.prepare('PRAGMA integrity_check;').get();
  if (integrity && integrity.integrity_check === 'ok') {
    console.log('✅ SQLite Database integrity verified: OK (WAL Mode)');
  } else {
    console.warn('⚠️ Database Integrity Notice:', integrity);
  }
} catch (err) {
  console.error('Database Integrity Check Failed:', err.message);
}

// Run WAL Checkpoint on startup to consolidate pending transactions
checkpointDb();

// Register Process Exit Handlers for Clean WAL Flush and Database Unlocking
process.on('SIGINT', () => {
  checkpointDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  checkpointDb();
  process.exit(0);
});

initDb();

module.exports = db;
