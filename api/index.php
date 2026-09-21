<?php
/**
 * api/index.php - Central API Router for PHP Backend
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

// Enable Error Reporting for debugging if needed, clean JSON output
error_reporting(E_ALL & ~E_NOTICE & ~E_WARNING);
ini_set('display_errors', '0');

// Set Global CORS Headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Cache-Control: no-cache, no-store, must-revalidate, max-age=0, private");
header("Pragma: no-cache");
header("Expires: 0");

// Handle Preflight OPTIONS Request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// JSON Input Parsing Helper
function getJsonInput(): array {
    static $inputData = null;
    if ($inputData !== null) {
        return $inputData;
    }

    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $inputData = $decoded;
            return $inputData;
        }
    }

    $inputData = $_POST;
    return $inputData;
}

// Require Core Modules
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/jwt.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/medicines.php';
require_once __DIR__ . '/billing.php';
require_once __DIR__ . '/patients.php';
require_once __DIR__ . '/prescriptions.php';
require_once __DIR__ . '/reports.php';
require_once __DIR__ . '/users.php';
require_once __DIR__ . '/audit_logs.php';

// Obtain PDO Database Connection
$pdo = getDB();

// Determine Request Path
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Strip script name prefix if called directly or via rewrite
$scriptName = $_SERVER['SCRIPT_NAME'];
$dirName = dirname($scriptName);

if (strpos($uri, '/api') !== false) {
    $path = substr($uri, strpos($uri, '/api') + 4);
} else {
    $path = $uri;
}

$path = '/' . ltrim($path, '/');

// Set Output Header to JSON by default (unless file downloads)
if (!preg_match('#/(template|export-excel|export-stock-excel|export-sales-excel|export)$#', $path)) {
    header('Content-Type: application/json; charset=utf-8');
}

// Dispatch to Appropriate Controller
try {
    if (strpos($path, '/auth') === 0 && strpos($path, '/op-auth') === false) {
        $subPath = substr($path, 5);
        handleAuthRoutes($pdo, $subPath, $method);
    } elseif (strpos($path, '/op-auth') === 0) {
        $subPath = substr($path, 8);
        handleOpAuthRoutes($pdo, $subPath, $method);
    } elseif (strpos($path, '/medicines') === 0) {
        $subPath = substr($path, 10);
        handleMedicineRoutes($pdo, $subPath, $method);
    } elseif (strpos($path, '/billing') === 0) {
        $subPath = substr($path, 8);
        handleBillingRoutes($pdo, $subPath, $method);
    } elseif (strpos($path, '/patients') === 0) {
        $subPath = substr($path, 9);
        handlePatientRoutes($pdo, $subPath, $method);
    } elseif ($path === '/stats' && $method === 'GET') {
        getPatientStats($pdo);
    } elseif (strpos($path, '/prescriptions') === 0) {
        $subPath = substr($path, 14);
        handlePrescriptionRoutes($pdo, $subPath, $method);
    } elseif (strpos($path, '/reports') === 0) {
        $subPath = substr($path, 8);
        handleReportRoutes($pdo, $subPath, $method);
    } elseif (strpos($path, '/users') === 0) {
        $subPath = substr($path, 6);
        handleUserRoutes($pdo, $subPath, $method);
    } elseif (strpos($path, '/audit-logs') === 0) {
        $subPath = substr($path, 11);
        handleAuditLogRoutes($pdo, $subPath, $method);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => "API route not found: {$path}"]);
    }
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Internal Server Error',
        'error' => $e->getMessage()
    ]);
}
