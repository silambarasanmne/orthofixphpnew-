<?php
/**
 * api/audit_logs.php - System Audit Log Trail API Routes
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

function handleAuditLogRoutes(PDO $pdo, string $subPath, string $method): void {
    if (($subPath === '' || $subPath === '/') && $method === 'GET') {
        getAuditLogs($pdo);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Audit log endpoint not found']);
    }
}

function getAuditLogs(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $module = trim((string)($_GET['module'] ?? ''));
    $action = trim((string)($_GET['action'] ?? ''));
    $username = trim((string)($_GET['username'] ?? ''));
    $search = trim((string)($_GET['search'] ?? ''));
    $pageSize = max(1, (int)($_GET['limit'] ?? 100));
    $pageNum = max(1, (int)($_GET['page'] ?? 1));
    $offset = ($pageNum - 1) * $pageSize;

    $sql = "SELECT * FROM audit_logs WHERE 1=1";
    $params = [];

    if (!empty($module) && $module !== 'ALL') {
        $sql .= " AND module = ?";
        $params[] = $module;
    }

    if (!empty($action) && $action !== 'ALL') {
        $sql .= " AND action = ?";
        $params[] = $action;
    }

    if (!empty($username)) {
        $sql .= " AND username LIKE ?";
        $params[] = "%{$username}%";
    }

    if (!empty($search)) {
        $q = "%{$search}%";
        $sql .= " AND (description LIKE ? OR record_id LIKE ? OR username LIKE ? OR action LIKE ?)";
        $params[] = $q; $params[] = $q; $params[] = $q; $params[] = $q;
    }

    // Count Total
    $countSql = str_replace("SELECT *", "SELECT COUNT(*) as total", $sql);
    $cStmt = $pdo->prepare($countSql);
    $cStmt->execute($params);
    $total = (int)$cStmt->fetchColumn();

    $sql .= " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    $params[] = $pageSize;
    $params[] = $offset;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $logs = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'data' => $logs,
        'total' => $total,
        'page' => $pageNum,
        'pageSize' => $pageSize
    ]);
}
