<?php
/**
 * api/db.php - Database Connection & Table Schema Auto-Initializer
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

function getDB(): PDO {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dbDir = __DIR__ . '/../database';
    if (!is_dir($dbDir)) {
        mkdir($dbDir, 0755, true);
    }

    $dbPath = $dbDir . '/pharmacy.db';

    try {
        $pdo = new PDO("sqlite:" . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        // Enable Foreign Keys and WAL Mode for performance & data safety
        $pdo->exec("PRAGMA foreign_keys = ON;");
        $pdo->exec("PRAGMA journal_mode = WAL;");

        // Execute table initialization
        initDatabaseTables($pdo);

        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'message' => 'Database Connection Failed: ' . $e->getMessage()
        ]);
        exit;
    }
}

function initDatabaseTables(PDO $pdo): void {
    // 1. Users Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            email TEXT,
            mobile_number TEXT,
            role TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            last_login_at DATETIME,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 2. Vendors Table
    $pdo->exec("
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
    ");

    // 3. Medicines Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS medicines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            generic_name TEXT NOT NULL,
            vendor_id INTEGER,
            vendor_name TEXT,
            category TEXT NOT NULL,
            manufacturer TEXT,
            batch_number TEXT NOT NULL,
            expiry_date TEXT NOT NULL,
            purchase_price REAL NOT NULL,
            selling_price REAL NOT NULL,
            units_per_strip INTEGER DEFAULT 10,
            current_stock INTEGER NOT NULL DEFAULT 0,
            minimum_stock INTEGER NOT NULL DEFAULT 10,
            gst_percent REAL DEFAULT 12.0,
            barcode TEXT UNIQUE,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 4. Patients Table
    $pdo->exec("
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
    ");

    // 5. Prescriptions Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS prescriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            patient_token INTEGER NOT NULL,
            patient_mobile TEXT,
            doctor_id INTEGER,
            doctor_name TEXT,
            complaints TEXT,
            diagnosis TEXT,
            submission_status TEXT DEFAULT 'Submitted',
            status TEXT DEFAULT 'Pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 6. Consultations Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS consultations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prescription_id INTEGER,
            patient_token INTEGER NOT NULL,
            patient_name TEXT,
            patient_mobile TEXT,
            age INTEGER,
            symptoms TEXT,
            doctor_id INTEGER,
            doctor_comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE SET NULL
        );
    ");

    // 7. Prescription Items Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS prescription_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prescription_id INTEGER NOT NULL,
            medicine_id INTEGER NOT NULL,
            medicine_name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            instructions TEXT,
            FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE
        );
    ");

    // 8. Sales Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT UNIQUE NOT NULL,
            consultation_id INTEGER,
            doctor_id INTEGER,
            doctor_name TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            customer_address TEXT,
            subtotal REAL NOT NULL,
            discount_type TEXT DEFAULT 'fixed',
            discount_value REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            consultation_charges REAL DEFAULT 0,
            medicine_charges REAL DEFAULT 0,
            other_charges REAL DEFAULT 0,
            grand_total REAL NOT NULL,
            payment_method TEXT NOT NULL,
            amount_received REAL,
            change_amount REAL DEFAULT 0,
            checkout_status TEXT DEFAULT 'Completed',
            worker_id INTEGER,
            worker_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 9. Sale Items Table
    $pdo->exec("
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
            FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
        );
    ");

    // 10. Stock Movements Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS stock_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_id INTEGER NOT NULL,
            medicine_name TEXT NOT NULL,
            previous_quantity INTEGER NOT NULL,
            change_quantity INTEGER NOT NULL,
            new_quantity INTEGER NOT NULL,
            reason TEXT NOT NULL,
            user_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 11. Vendor Purchases Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS vendor_purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_number TEXT UNIQUE NOT NULL,
            vendor_id INTEGER NOT NULL,
            vendor_name TEXT NOT NULL,
            invoice_number TEXT,
            purchase_date TEXT NOT NULL,
            total_amount REAL NOT NULL DEFAULT 0,
            payment_status TEXT DEFAULT 'Paid',
            bill_image TEXT,
            notes TEXT,
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 12. Vendor Purchase Items Table
    $pdo->exec("
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
            FOREIGN KEY (purchase_id) REFERENCES vendor_purchases(id) ON DELETE CASCADE
        );
    ");

    // 13. Purchase Returns Table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS purchase_returns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            return_number TEXT UNIQUE NOT NULL,
            vendor_id INTEGER NOT NULL,
            vendor_name TEXT NOT NULL,
            purchase_number TEXT,
            return_date TEXT NOT NULL,
            return_reason TEXT NOT NULL,
            total_refund_amount REAL NOT NULL DEFAULT 0,
            notes TEXT,
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 14. Purchase Return Items Table
    $pdo->exec("
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
            FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE
        );
    ");

    // 15. Expired Disposals Table
    $pdo->exec("
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
    ");

    // 16. Audit Logs Table
    $pdo->exec("
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
    ");

    // Ensure Default Users Exist (using bcrypt hashes compatible with PHP password_hash and Node.js bcrypt)
    seedDefaultUsers($pdo);
}

function seedDefaultUsers(PDO $pdo): void {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE username = ?");
    
    // Default User Accounts Config
    $defaultUsers = [
        [
            'username' => 'admin',
            'password' => 'Admin@123',
            'full_name' => 'Admin / Billing Manager',
            'email' => 'admin@orthofix.com',
            'role' => 'Admin / Billing Manager'
        ],
        [
            'username' => 'worker',
            'password' => 'Worker@123',
            'full_name' => 'Billing Worker',
            'email' => 'worker@orthofix.com',
            'role' => 'Billing Worker'
        ],
        [
            'username' => 'doctor',
            'password' => 'Doctor@123',
            'full_name' => 'Dr. Ortho Specialist',
            'email' => 'doctor@orthofix.com',
            'role' => 'Doctor'
        ],
        [
            'username' => 'superadmin',
            'password' => 'Admin@123',
            'full_name' => 'Super Administrator',
            'email' => 'superadmin@orthofix.com',
            'role' => 'Super Admin'
        ],
        [
            'username' => 'receptionist',
            'password' => 'Worker@123',
            'full_name' => 'OP Receptionist Worker',
            'email' => 'op@orthofix.com',
            'role' => 'OP Worker'
        ]
    ];

    $insert = $pdo->prepare("
        INSERT INTO users (username, password, full_name, email, role, is_active, created_by)
        VALUES (?, ?, ?, ?, ?, 1, 'System Auto-Seed')
    ");

    foreach ($defaultUsers as $u) {
        $stmt->execute([$u['username']]);
        if ((int)$stmt->fetchColumn() === 0) {
            $hashed = password_hash($u['password'], PASSWORD_BCRYPT);
            $insert->execute([
                $u['username'],
                $hashed,
                $u['full_name'],
                $u['email'],
                $u['role']
            ]);
        }
    }
}
