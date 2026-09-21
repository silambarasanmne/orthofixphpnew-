<?php
/**
 * api/users.php - User Account Management API Routes
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

function handleUserRoutes(PDO $pdo, string $subPath, string $method): void {
    if ($subPath === '' || $subPath === '/') {
        if ($method === 'GET') {
            getUsersList($pdo);
        } elseif ($method === 'POST') {
            createUserAccount($pdo);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        }
    } elseif (preg_match('#^/(\d+)(/status|/reset-password)?$#', $subPath, $matches)) {
        $userId = (int)$matches[1];
        $action = $matches[2] ?? '';

        if ($action === '/status' && $method === 'PATCH') {
            toggleUserStatus($pdo, $userId);
        } elseif ($action === '/reset-password' && $method === 'POST') {
            resetUserPassword($pdo, $userId);
        } elseif (empty($action) && $method === 'PUT') {
            updateUserAccount($pdo, $userId);
        } elseif (empty($action) && $method === 'DELETE') {
            deleteUserAccount($pdo, $userId);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        }
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'User endpoint not found']);
    }
}

$VALID_ROLES = [
    'Super Admin',
    'Admin / Billing Manager',
    'Billing Manager',
    'Medical Manager',
    'Doctor',
    'OP Worker',
    'Billing Worker',
    'Medical Billing Worker'
];

function getUsersList(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $stmt = $pdo->query("SELECT id, username, full_name, email, mobile_number, role, is_active, last_login_at, created_by, created_at, updated_at FROM users ORDER BY id ASC");
    $users = $stmt->fetchAll();

    $enriched = array_map(function($u) {
        $u['id'] = (int)$u['id'];
        $u['is_active'] = (int)$u['is_active'];
        return $u;
    }, $users);

    echo json_encode(['success' => true, 'users' => $enriched]);
}

function createUserAccount(PDO $pdo): void {
    global $VALID_ROLES;
    $user = authenticateToken();
    requireAdmin($user);

    $input = getJsonInput();
    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');
    $fullName = trim((string)($input['full_name'] ?? ''));
    $email = trim((string)($input['email'] ?? ''));
    $mobile = trim((string)($input['mobile_number'] ?? ''));
    $role = trim((string)($input['role'] ?? 'Billing Worker'));

    if (empty($username) || empty($password) || empty($fullName)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username, password, and full name are required.']);
        return;
    }

    $chk = $pdo->prepare("SELECT id FROM users WHERE username = ?");
    $chk->execute([$username]);
    if ($chk->fetch()) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Username \"{$username}\" already exists."]);
        return;
    }

    $assignedRole = in_array($role, $VALID_ROLES) ? $role : 'Billing Worker';
    $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
    $nowIso = date('c');

    $stmt = $pdo->prepare("
        INSERT INTO users (username, password, full_name, email, mobile_number, role, is_active, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ");
    $stmt->execute([
        $username, $hashedPassword, $fullName, $email, $mobile, $assignedRole,
        $user['username'] ?? 'admin', $nowIso, $nowIso
    ]);
    $newId = (int)$pdo->lastInsertId();

    logAudit($pdo, $user, 'USER_CREATE', 'USERS', 'User', $newId, "Admin created user '{$username}' with role '{$assignedRole}'");

    echo json_encode(['success' => true, 'message' => 'User created successfully.', 'user_id' => $newId]);
}

function updateUserAccount(PDO $pdo, int $userId): void {
    global $VALID_ROLES;
    $user = authenticateToken();
    requireAdmin($user);

    $chk = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $chk->execute([$userId]);
    $existing = $chk->fetch();

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'User not found.']);
        return;
    }

    $input = getJsonInput();
    $fullName = trim((string)($input['full_name'] ?? $existing['full_name']));
    $email = isset($input['email']) ? trim((string)$input['email']) : $existing['email'];
    $mobile = isset($input['mobile_number']) ? trim((string)$input['mobile_number']) : $existing['mobile_number'];
    $role = trim((string)($input['role'] ?? $existing['role']));

    $assignedRole = in_array($role, $VALID_ROLES) ? $role : $existing['role'];
    $nowIso = date('c');

    $up = $pdo->prepare("
        UPDATE users SET full_name = ?, email = ?, mobile_number = ?, role = ?, updated_at = ? WHERE id = ?
    ");
    $up->execute([$fullName, $email, $mobile, $assignedRole, $nowIso, $userId]);

    logAudit($pdo, $user, 'USER_UPDATE', 'USERS', 'User', $userId, "Admin updated user details for '{$existing['username']}'");

    echo json_encode(['success' => true, 'message' => 'User updated successfully.']);
}

function toggleUserStatus(PDO $pdo, int $userId): void {
    $user = authenticateToken();
    requireAdmin($user);

    if ($userId === (int)($user['id'] ?? 0)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'You cannot deactivate your own account.']);
        return;
    }

    $input = getJsonInput();
    $isActive = isset($input['is_active']) ? (int)$input['is_active'] : 1;

    $chk = $pdo->prepare("SELECT username FROM users WHERE id = ?");
    $chk->execute([$userId]);
    $existing = $chk->fetch();

    $nowIso = date('c');
    $up = $pdo->prepare("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?");
    $up->execute([$isActive ? 1 : 0, $nowIso, $userId]);

    $actionName = $isActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE';
    logAudit($pdo, $user, $actionName, 'USERS', 'User', $userId, "Admin set user status to " . ($isActive ? 'Active' : 'Inactive') . " for '" . ($existing['username'] ?? $userId) . "'");

    echo json_encode(['success' => true, 'message' => "User status changed to " . ($isActive ? 'Active' : 'Inactive') . "."]);
}

function resetUserPassword(PDO $pdo, int $userId): void {
    $user = authenticateToken();
    requireAdmin($user);

    $input = getJsonInput();
    $newPassword = (string)($input['new_password'] ?? '');

    if (empty(trim($newPassword))) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'New password is required.']);
        return;
    }

    $chk = $pdo->prepare("SELECT username FROM users WHERE id = ?");
    $chk->execute([$userId]);
    $existing = $chk->fetch();

    $hashed = password_hash($newPassword, PASSWORD_BCRYPT);
    $nowIso = date('c');

    $up = $pdo->prepare("UPDATE users SET password = ?, updated_at = ? WHERE id = ?");
    $up->execute([$hashed, $nowIso, $userId]);

    logAudit($pdo, $user, 'PASSWORD_RESET', 'USERS', 'User', $userId, "Admin reset password for user '" . ($existing['username'] ?? $userId) . "'");

    echo json_encode(['success' => true, 'message' => 'Password reset successfully.']);
}

function deleteUserAccount(PDO $pdo, int $userId): void {
    $user = authenticateToken();
    requireAdmin($user);

    if ($userId === (int)($user['id'] ?? 0)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'You cannot delete your logged-in Super Admin account.']);
        return;
    }

    $chk = $pdo->prepare("SELECT username FROM users WHERE id = ?");
    $chk->execute([$userId]);
    $existing = $chk->fetch();

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'User account not found.']);
        return;
    }

    $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$userId]);

    logAudit($pdo, $user, 'USER_DELETE', 'USERS', 'User', $userId, "Admin deleted user account '{$existing['username']}'");

    echo json_encode(['success' => true, 'message' => "User account '{$existing['username']}' deleted successfully."]);
}
