<?php
/**
 * api/jwt.php - Standalone Pure PHP JWT Token & Authorization Helper
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

define('JWT_SECRET', 'medicare-pharmacy-super-secret-key-2026');

function base64UrlEncode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/'));
}

function generateJWT(array $payload, string $secret = JWT_SECRET, int $expirySeconds = 86400): string {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload['iat'] = time();
    $payload['exp'] = time() + $expirySeconds;

    $base64Header = base64UrlEncode($header);
    $base64Payload = base64UrlEncode(json_encode($payload));

    $signature = hash_hmac('sha256', $base64Header . '.' . $base64Payload, $secret, true);
    $base64Signature = base64UrlEncode($signature);

    return $base64Header . '.' . $base64Payload . '.' . $base64Signature;
}

function verifyJWT(string $jwt, string $secret = JWT_SECRET): ?array {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) {
        return null;
    }

    list($base64Header, $base64Payload, $base64Signature) = $parts;

    $signature = base64UrlEncode(hash_hmac('sha256', $base64Header . '.' . $base64Payload, $secret, true));

    if (!hash_equals($signature, $base64Signature)) {
        return null;
    }

    $payload = json_decode(base64UrlDecode($base64Payload), true);
    if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) {
        return null; // Expired or invalid
    }

    return $payload;
}

function getBearerToken(): ?string {
    $headers = [];
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
    } else {
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) == 'HTTP_') {
                $headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))))] = $value;
            }
        }
    }

    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';

    if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
        return $matches[1];
    }

    if (isset($_GET['token']) && !empty($_GET['token'])) {
        return $_GET['token'];
    }

    return null;
}

function authenticateToken(): array {
    $token = getBearerToken();
    if (!$token) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Authentication token required.']);
        exit;
    }

    $user = verifyJWT($token);
    if (!$user) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Invalid or expired token.']);
        exit;
    }

    return $user;
}

function requireAdmin(array $user): void {
    $role = strtolower((string)($user['role'] ?? ''));
    $isAdmin = (strpos($role, 'admin') !== false || strpos($role, 'manager') !== false || $role === 'super admin');

    if (!$isAdmin) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Access denied. Administrator privilege required.']);
        exit;
    }
}

function requireRole(array $user, string ...$allowedRoles): void {
    $userRole = trim((string)($user['role'] ?? ''));
    $normalizedUserRole = strtolower($userRole);

    // Super Admin / Admin always pass all role checks
    if ($normalizedUserRole === 'super admin' || $normalizedUserRole === 'admin / billing manager' || $normalizedUserRole === 'admin' || strpos($normalizedUserRole, 'admin') !== false) {
        return;
    }

    $roleMap = [
        'op worker' => ['op worker', 'receptionist', 'op'],
        'doctor' => ['doctor'],
        'billing worker' => ['billing worker', 'medical billing worker', 'cashier', 'biller'],
        'medical billing worker' => ['billing worker', 'medical billing worker', 'cashier', 'biller'],
        'billing manager' => ['billing manager', 'medical manager', 'manager'],
        'medical manager' => ['billing manager', 'medical manager', 'manager']
    ];

    foreach ($allowedRoles as $allowed) {
        $normAllowed = strtolower(trim($allowed));
        if ($normAllowed === $normalizedUserRole) return;
        $aliases = $roleMap[$normAllowed] ?? [$normAllowed];
        if (in_array($normalizedUserRole, $aliases)) return;
    }

    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => 'Access denied. Requires role: ' . implode(', ', $allowedRoles)
    ]);
    exit;
}

function logAudit(PDO $pdo, ?array $user, string $action, string $module, ?string $recordType = null, $recordId = null, string $description = ''): void {
    try {
        $userId = $user['id'] ?? null;
        $username = $user['username'] ?? 'system';
        $role = $user['role'] ?? 'System';

        $ipAddress = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

        $stmt = $pdo->prepare("
            INSERT INTO audit_logs (user_id, username, role, action, module, record_type, record_id, description, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            $userId,
            $username,
            $role,
            $action,
            $module,
            $recordType,
            $recordId !== null ? (string)$recordId : null,
            $description,
            $ipAddress,
            $userAgent
        ]);
    } catch (\Throwable $e) {
        error_log('Audit Log Error: ' . $e->getMessage());
    }
}
