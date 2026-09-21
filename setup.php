<?php
/**
 * setup.php - BigRock Hosting Deployment & System Health Checker
 * ORTHOFIX SPECIALITY CLINIC
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

$phpVersion = PHP_VERSION;
$phpVersionOk = version_compare(PHP_VERSION, '7.4.0', '>=');

$requiredExtensions = ['pdo', 'pdo_sqlite', 'json', 'openssl', 'mbstring'];
$extensionStatus = [];
$allExtensionsOk = true;

foreach ($requiredExtensions as $ext) {
    $loaded = extension_loaded($ext);
    $extensionStatus[$ext] = $loaded;
    if (!$loaded) {
        $allExtensionsOk = false;
    }
}

$dbDir = __DIR__ . '/database';
if (!is_dir($dbDir)) {
    @mkdir($dbDir, 0755, true);
}

$dbDirWritable = is_writable($dbDir) || is_writable(__DIR__);
$dbFile = $dbDir . '/pharmacy.db';
$dbWritable = file_exists($dbFile) ? is_writable($dbFile) : $dbDirWritable;

$dbStatus = false;
$dbMessage = '';

if ($allExtensionsOk && $dbDirWritable) {
    try {
        require_once __DIR__ . '/api/db.php';
        $pdo = getDB();
        $userCount = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $medCount = (int)$pdo->query("SELECT COUNT(*) FROM medicines")->fetchColumn();
        $dbStatus = true;
        $dbMessage = "Database connected successfully! Registered Users: {$userCount}, Medicines: {$medCount}.";
    } catch (\Throwable $e) {
        $dbStatus = false;
        $dbMessage = "Database Error: " . $e->getMessage();
    }
} else {
    $dbMessage = "Database setup pending prerequisite check completion.";
}

$isHostReady = $phpVersionOk && $allExtensionsOk && $dbDirWritable && $dbStatus;

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ORTHOFIX — BigRock Hosting Installation & Health Check</title>
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --primary: #38bdf8;
            --success: #22c55e;
            --danger: #ef4444;
            --border: #334155;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
        body { background-color: var(--bg-color); color: var(--text-main); display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
        .container { background-color: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; max-width: 650px; width: 100%; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        .header { text-align: center; margin-bottom: 28px; }
        .header h1 { font-size: 24px; color: var(--primary); margin-bottom: 6px; }
        .header p { color: var(--text-muted); font-size: 14px; }
        .section { margin-bottom: 24px; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
        .section-title { font-size: 15px; font-weight: 600; margin-bottom: 14px; color: #e2e8f0; display: flex; align-items: center; justify-content: space-between; }
        .check-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed #334155; font-size: 14px; }
        .check-item:last-child { border-bottom: none; }
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
        .badge-success { background: rgba(34, 197, 94, 0.15); color: var(--success); border: 1px solid rgba(34, 197, 94, 0.3); }
        .badge-danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }
        .btn-launch { display: block; width: 100%; padding: 14px; text-align: center; background-color: var(--primary); color: #0f172a; font-weight: 700; text-decoration: none; border-radius: 10px; font-size: 16px; transition: all 0.2s; }
        .btn-launch:hover { background-color: #0284c7; color: #ffffff; }
        .credentials { background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 10px; padding: 16px; margin-top: 16px; font-size: 13px; }
        .credentials code { background: rgba(0, 0, 0, 0.4); padding: 2px 6px; border-radius: 4px; color: #7dd3fc; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 ORTHOFIX SPECIALITY CLINIC</h1>
            <p>BigRock cPanel PHP Hosting Readiness Check</p>
        </div>

        <div class="section">
            <div class="section-title">
                <span>1. Server PHP Requirements</span>
                <span class="badge <?php echo $phpVersionOk ? 'badge-success' : 'badge-danger'; ?>">
                    <?php echo $phpVersionOk ? 'PASS' : 'FAIL'; ?>
                </span>
            </div>
            <div class="check-item">
                <span>PHP Version (>= 7.4.0 required)</span>
                <strong><?php echo $phpVersion; ?></strong>
            </div>
            <?php foreach ($extensionStatus as $ext => $ok): ?>
            <div class="check-item">
                <span>PHP Extension: <code><?php echo $ext; ?></code></span>
                <span class="badge <?php echo $ok ? 'badge-success' : 'badge-danger'; ?>"><?php echo $ok ? 'Loaded' : 'Missing'; ?></span>
            </div>
            <?php endforeach; ?>
        </div>

        <div class="section">
            <div class="section-title">
                <span>2. Database & File Permissions</span>
                <span class="badge <?php echo $dbStatus ? 'badge-success' : 'badge-danger'; ?>">
                    <?php echo $dbStatus ? 'READY' : 'ERROR'; ?>
                </span>
            </div>
            <div class="check-item">
                <span>Database Folder Writable (<code>database/</code>)</span>
                <span class="badge <?php echo $dbDirWritable ? 'badge-success' : 'badge-danger'; ?>"><?php echo $dbDirWritable ? 'Writable' : 'Locked'; ?></span>
            </div>
            <div class="check-item" style="flex-direction: column; align-items: flex-start; gap: 6px;">
                <span>Database Status:</span>
                <p style="color: <?php echo $dbStatus ? '#4ade80' : '#f87171'; ?>; font-size: 13px; line-height: 1.4;"><?php echo htmlspecialchars($dbMessage); ?></p>
            </div>
        </div>

        <?php if ($isHostReady): ?>
            <a href="login.html" class="btn-launch">🚀 Launch ORTHOFIX Application</a>
            <div class="credentials">
                <strong>🔑 Initial Default Login Accounts:</strong><br><br>
                - <strong>Admin / Manager:</strong> Username: <code>admin</code> | Password: <code>Admin@123</code><br>
                - <strong>Billing Worker:</strong> Username: <code>worker</code> | Password: <code>Worker@123</code><br>
                - <strong>Doctor:</strong> Username: <code>doctor</code> | Password: <code>Doctor@123</code>
            </div>
        <?php else: ?>
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 14px; border-radius: 10px; color: #f87171; font-size: 13px; text-align: center;">
                ⚠️ System requirements incomplete. Please fix the failed check items above or ensure <code>database/</code> permissions are 0755 in BigRock cPanel.
            </div>
        <?php endif; ?>
    </div>
</body>
</html>
