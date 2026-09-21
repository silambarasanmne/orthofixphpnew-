# 🌐 BigRock Domain & cPanel Shared Hosting Guide
## ORTHOFIX SPECIALITY CLINIC — POS & Pharmacy Management System (PHP Edition)

This step-by-step guide walks you through hosting your application on **BigRock Linux Shared Hosting (cPanel)** using native **PHP 7.4+ / 8.x** and **SQLite** (No Node.js daemon required!).

---

## 📋 Requirements & Pre-Checks

1. **BigRock Domain Name** (e.g., `orthofixpharmacy.com` or `yourdomain.com`)
2. **BigRock Linux Shared Hosting** with **cPanel** access
3. **PHP Version**: **7.4+** or **8.x** (with `pdo_sqlite`, `openssl`, and `json` enabled — standard on all BigRock Linux cPanel plans)

---

## 🚀 Step-by-Step BigRock Deployment Guide (100% Compatible)

### Step 1: Connect your BigRock Domain (DNS Setup)

1. Log into your **[BigRock Control Panel](https://www.bigrock.in)**.
2. Go to **Domains** ➔ Select your domain name.
3. Verify **Name Servers** point to your BigRock Linux hosting:
   - `dns1.linuxhosting.bigrock.in`
   - `dns2.linuxhosting.bigrock.in`

---

### Step 2: Upload Pre-Built Project ZIP to cPanel

1. Log in to your **BigRock cPanel** (`https://yourdomain.com:2083` or via the BigRock Panel).
2. Open **File Manager** under the *Files* section.
3. Double-click to open `public_html` (or your sub-domain directory).
4. Click **Upload** in the top menu bar.
5. Select and upload **`orthofix-pharmacy-working-project.zip`** from your computer.
6. Once upload reaches 100% (Green bar), return to File Manager.
7. Right-click **`orthofix-pharmacy-working-project.zip`** and click **Extract**.
8. Verify the following files exist directly in `public_html`:
   - `index.html`, `login.html`, `billing.html`, `billing-manager.html`, `dashboard.html`, `medicines.html`, `history.html`, `reports.html`, `users.html`, `doctor.html`, `patients.html`, `superadmin.html`, `register.html`
   - `setup.php`
   - `index.php`
   - `router.php`
   - `.htaccess`
   - `api/` (`index.php`, `db.php`, `jwt.php`, `auth.php`, `medicines.php`, `billing.php`, `patients.php`, `prescriptions.php`, `reports.php`, `users.php`, `audit_logs.php`)
   - `css/`, `js/`, `images/`, `database/`

---

### Step 3: Verify File & Directory Permissions

1. In cPanel File Manager, locate the `database/` folder.
2. Ensure its permissions are set to **0755** (Read, Write, Execute by Server Owner).
3. Ensure `.htaccess` permissions are **0644**.

---

### Step 4: Run 1-Click Installation & System Health Check

1. Open your browser and visit:  
   👉 **`https://yourdomain.com/setup.php`**
2. The interactive installer will check your PHP version, loaded extensions, and database write access.
3. The SQLite database `database/pharmacy.db` will **automatically create all 16 tables** and seed default accounts!
4. Click **🚀 Launch ORTHOFIX Application** when green PASS badges appear.

---

### Step 5: Activate Free SSL Certificate (HTTPS)

1. In cPanel, navigate to **Security** ➔ **SSL/TLS Status**.
2. Select your domain checkbox.
3. Click **Run AutoSSL**.
4. Free SSL green lock icons will activate within 1-2 minutes.

---

### Step 6: Test & Log In

Visit `https://yourdomain.com` in your browser and log in with pre-configured accounts:

| Role | Username | Password |
| :--- | :--- | :--- |
| **Admin / Billing Manager** | `admin` | `Admin@123` |
| **Billing Worker** | `worker` | `Worker@123` |
| **Doctor** | `doctor` | `Doctor@123` |
| **OP Receptionist** | `receptionist` | `Worker@123` |
| **Super Admin** | `superadmin` | `Admin@123` |

---

## ⚡ Key Technical Features of PHP Hosting Bundle

- **Native PHP REST Router**: `api/index.php` handles all `/api/*` requests dynamically via `.htaccess`.
- **Pure PHP JWT Auth**: `api/jwt.php` handles HS256 JWT tokens without external composer packages.
- **Embedded SQLite DB**: `api/db.php` connects via `pdo_sqlite` with WAL mode and foreign keys enabled.
- **Zero Server Overhead**: Works out of the box on standard Apache / LiteSpeed PHP shared servers.

---

## 🛠 Troubleshooting & FAQ

#### Q: Getting 500 Internal Server Error?
- Ensure `.htaccess` file was uploaded and extracted properly.
- Verify `database/` folder permissions are **0755** so SQLite can create/write `pharmacy.db`.

#### Q: API calls return 404 Not Found?
- Verify Apache `mod_rewrite` is active (enabled by default on BigRock cPanel).
- Ensure `.htaccess` has `RewriteRule ^api/(.*)$ api/index.php [QSA,L]`.

#### Q: How to backup the database?
- Simply open cPanel File Manager and download `database/pharmacy.db` to your local computer!
