<?php
/**
 * api/auth.php - Authentication API Routes
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

function handleAuthRoutes(PDO $pdo, string $subPath, string $method): void {
    if ($subPath === '/login' && $method === 'POST') {
        loginUser($pdo);
    } elseif ($subPath === '/logout' && $method === 'POST') {
        logoutUser($pdo);
    } elseif ($subPath === '/me' && $method === 'GET') {
        getCurrentUserProfile();
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Auth endpoint not found']);
    }
}

function handleOpAuthRoutes(PDO $pdo, string $subPath, string $method): void {
    if ($subPath === '/login' && $method === 'POST') {
        loginUser($pdo);
    } elseif ($subPath === '/me' && $method === 'GET') {
        getCurrentUserProfile();
    } elseif ($subPath === '/users' && $method === 'POST') {
        createOpUser($pdo);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'OP Auth endpoint not found']);
    }
}

function loginUser(PDO $pdo): void {
    $input = getJsonInput();
    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');

    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username and password are required.']);
        return;
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user) {
        logAudit($pdo, ['username' => $username, 'role' => 'Unknown'], 'FAILED_LOGIN', 'AUTH', 'User', null, "Failed login attempt for unknown user: {$username}");
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Invalid username or password.']);
        return;
    }

    if (!(int)$user['is_active']) {
        logAudit($pdo, ['id' => $user['id'], 'username' => $user['username'], 'role' => $user['role']], 'FAILED_LOGIN', 'AUTH', 'User', $user['id'], "Login attempt on deactivated account: {$user['username']}");
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Account is deactivated. Contact Admin.']);
        return;
    }

    // Support both bcrypt password_verify and direct match fallback
    $validPassword = password_verify($password, $user['password']) || ($password === $user['password']);

    if (!$validPassword) {
        logAudit($pdo, ['id' => $user['id'], 'username' => $user['username'], 'role' => $user['role']], 'FAILED_LOGIN', 'AUTH', 'User', $user['id'], "Invalid password entered for user: {$user['username']}");
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Invalid username or password.']);
        return;
    }

    // Update last_login_at
    $nowIso = date('c');
    try {
        $up = $pdo->prepare("UPDATE users SET last_login_at = ? WHERE id = ?");
        $up->execute([$nowIso, $user['id']]);
    } catch (\Throwable $e) {}

    // Generate JWT Token
    $tokenPayload = [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'full_name' => $user['full_name'],
        'role' => $user['role']
    ];
    $token = generateJWT($tokenPayload);

    logAudit($pdo, $tokenPayload, 'LOGIN', 'AUTH', 'User', $user['id'], "User '{$user['username']}' logged in successfully");

    echo json_encode([
        'success' => true,
        'token' => $token,
        'user' => [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'full_name' => $user['full_name'],
            'name' => $user['full_name'],
            'role' => $user['role']
        ]
    ]);
}

function logoutUser(PDO $pdo): void {
    $user = authenticateToken();
    logAudit($pdo, $user, 'LOGOUT', 'AUTH', 'User', $user['id'] ?? null, "User '{$user['username']}' logged out");
    echo json_encode(['success' => true, 'message' => 'Logged out successfully.']);
}

function getCurrentUserProfile(): void {
    $user = authenticateToken();
    echo json_encode(['success' => true, 'user' => $user]);
}

function createOpUser(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $input = getJsonInput();
    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');
    $fullName = trim((string)($input['full_name'] ?? $input['name'] ?? ''));
    $role = trim((string)($input['role'] ?? 'OP Worker'));

    if (empty($username) || empty($password) || empty($fullName)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username, password, and name are required.']);
        return;
    }

    $check = $pdo->prepare("SELECT id FROM users WHERE username = ?");
    $check->execute([$username]);
    if ($check->fetch()) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Username '{$username}' is already taken."]);
        return;
    }

    $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
    $nowIso = date('c');

    $stmt = $pdo->prepare("
        INSERT INTO users (username, password, full_name, role, is_active, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ");
    $stmt->execute([$username, $hashedPassword, $fullName, $role, $user['username'], $nowIso, $nowIso]);
    $newId = (int)$pdo->lastInsertId();

    logAudit($pdo, $user, 'USER_CREATE', 'USERS', 'User', $newId, "Created user '{$username}' with role '{$role}'");

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => 'User created successfully',
        'user' => [
            'id' => $newId,
            'username' => $username,
            'full_name' => $fullName,
            'role' => $role
        ]
    ]);
}
