<?php
/**
 * api/patients.php - Patient Registration & Token Queue API Routes
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

function handlePatientRoutes(PDO $pdo, string $subPath, string $method): void {
    if ($subPath === '/export' && $method === 'GET') {
        exportPatientsCSV($pdo);
    } elseif (($subPath === '/stats' || $subPath === '') && $method === 'GET' && strpos($_SERVER['REQUEST_URI'], '/stats') !== false) {
        getPatientStats($pdo);
    } elseif ($subPath === '' || $subPath === '/') {
        if ($method === 'GET') {
            getPatientsList($pdo);
        } elseif ($method === 'POST') {
            registerPatient($pdo);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        }
    } elseif (preg_match('#^/id/(\d+)$#', $subPath, $matches) && $method === 'GET') {
        getPatientById($pdo, (int)$matches[1]);
    } elseif (preg_match('#^/(\d+)$#', $subPath, $matches)) {
        $idOrToken = (int)$matches[1];
        if ($method === 'GET') {
            getPatientByToken($pdo, $idOrToken);
        } elseif ($method === 'PUT') {
            updatePatient($pdo, $idOrToken);
        } elseif ($method === 'DELETE') {
            deletePatient($pdo, $idOrToken);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        }
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Patient endpoint not found']);
    }
}

function validatePatientInput(array $data): array {
    $errors = [];

    $patientName = trim((string)($data['patient_name'] ?? ''));
    $age = $data['age'] ?? null;
    $mobile = trim((string)($data['mobile'] ?? ''));
    $symptoms = trim((string)($data['symptoms'] ?? ''));
    $gender = trim((string)($data['gender'] ?? 'Male'));

    if (empty($patientName)) {
        $errors['patient_name'] = 'Patient Name is required';
    } elseif (strlen($patientName) < 3) {
        $errors['patient_name'] = 'Patient Name must be at least 3 characters long';
    } elseif (!preg_match('/^[a-zA-Z\s]+$/', $patientName)) {
        $errors['patient_name'] = 'Patient Name must contain alphabets and spaces only';
    }

    if ($age === null || $age === '') {
        $errors['age'] = 'Age is required';
    } else {
        $ageNum = (int)$age;
        if ($ageNum < 0 || $ageNum > 120) {
            $errors['age'] = 'Age must be between 0 and 120';
        }
    }

    if (empty($mobile)) {
        $errors['mobile'] = 'Mobile Number is required';
    } elseif (!preg_match('/^\d{10}$/', $mobile)) {
        $errors['mobile'] = 'Mobile Number must be exactly 10 digits';
    }

    if (empty($symptoms)) {
        $errors['symptoms'] = 'Issues / Symptoms is required';
    } elseif (strlen($symptoms) < 5) {
        $errors['symptoms'] = 'Issues / Symptoms must be at least 5 characters long';
    }

    if (!in_array($gender, ['Male', 'Female', 'Other'])) {
        $errors['gender'] = 'Gender must be Male, Female, or Other';
    }

    return [
        'isValid' => empty($errors),
        'errors' => $errors
    ];
}

function generateToken(PDO $pdo): int {
    $today = date('Y-m-d');
    $stmt = $pdo->prepare("SELECT MAX(token) as max_token FROM patients WHERE date(created_at) = date(?)");
    $stmt->execute([$today]);
    $row = $stmt->fetch();
    $maxToken = (int)($row['max_token'] ?? 0);
    return $maxToken > 0 ? ($maxToken + 1) : 1;
}

function registerPatient(PDO $pdo): void {
    $user = authenticateToken();
    requireRole($user, 'OP Worker', 'Receptionist', 'Admin / Billing Manager', 'Admin');

    $input = getJsonInput();
    $val = validatePatientInput($input);

    if (!$val['isValid']) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Validation failed', 'errors' => $val['errors']]);
        return;
    }

    $token = generateToken($pdo);
    $patientName = trim((string)$input['patient_name']);
    $age = (int)$input['age'];
    $gender = trim((string)($input['gender'] ?? 'Male'));
    $mobile = trim((string)$input['mobile']);
    $symptoms = trim((string)$input['symptoms']);

    $stmt = $pdo->prepare("
        INSERT INTO patients (token, patient_name, age, gender, mobile, symptoms)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([$token, $patientName, $age, $gender, $mobile, $symptoms]);
    $newId = (int)$pdo->lastInsertId();

    $pStmt = $pdo->prepare("SELECT * FROM patients WHERE id = ?");
    $pStmt->execute([$newId]);
    $patientData = $pStmt->fetch();

    logAudit($pdo, $user, 'PATIENT_REGISTER', 'PATIENTS', 'Patient', $newId, "Registered patient '{$patientName}' with token #{$token}");

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => 'Patient registered successfully',
        'token' => $token,
        'data' => array_merge($patientData, [
            'id' => (int)$patientData['id'],
            'token' => (int)$patientData['token'],
            'age' => (int)$patientData['age']
        ])
    ]);
}

function updatePatient(PDO $pdo, int $id): void {
    $user = authenticateToken();
    requireRole($user, 'OP Worker', 'Receptionist', 'Admin / Billing Manager', 'Admin');

    $chk = $pdo->prepare("SELECT * FROM patients WHERE id = ?");
    $chk->execute([$id]);
    if (!$chk->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Patient record not found']);
        return;
    }

    $input = getJsonInput();
    $val = validatePatientInput($input);

    if (!$val['isValid']) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Validation failed', 'errors' => $val['errors']]);
        return;
    }

    $stmt = $pdo->prepare("
        UPDATE patients SET patient_name = ?, age = ?, gender = ?, mobile = ?, symptoms = ? WHERE id = ?
    ");
    $stmt->execute([
        trim((string)$input['patient_name']),
        (int)$input['age'],
        trim((string)($input['gender'] ?? 'Male')),
        trim((string)$input['mobile']),
        trim((string)$input['symptoms']),
        $id
    ]);

    logAudit($pdo, $user, 'PATIENT_UPDATE', 'PATIENTS', 'Patient', $id, "Updated details for patient ID #{$id}");

    echo json_encode(['success' => true, 'message' => 'Patient record updated successfully']);
}

function deletePatient(PDO $pdo, int $id): void {
    $user = authenticateToken();
    requireAdmin($user);

    $chk = $pdo->prepare("SELECT * FROM patients WHERE id = ?");
    $chk->execute([$id]);
    if (!$chk->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Patient record not found']);
        return;
    }

    $pdo->prepare("DELETE FROM patients WHERE id = ?")->execute([$id]);

    logAudit($pdo, $user, 'PATIENT_DELETE', 'PATIENTS', 'Patient', $id, "Admin deleted patient record ID #{$id}");

    echo json_encode(['success' => true, 'message' => 'Patient record deleted successfully by Admin']);
}

function getPatientsList(PDO $pdo): void {
    authenticateToken();

    $search = trim((string)($_GET['search'] ?? ''));
    $fromDate = trim((string)($_GET['fromDate'] ?? ''));
    $toDate = trim((string)($_GET['toDate'] ?? ''));
    $date = trim((string)($_GET['date'] ?? ''));
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(1, (int)($_GET['limit'] ?? 20));
    $offset = ($page - 1) * $limit;

    $sql = "SELECT * FROM patients WHERE 1=1";
    $params = [];

    if (!empty($search)) {
        $sql .= " AND (patient_name LIKE ? OR mobile LIKE ? OR symptoms LIKE ? OR token LIKE ?)";
        $s = "%{$search}%";
        $params[] = $s; $params[] = $s; $params[] = $s; $params[] = $s;
    }

    if (!empty($date)) {
        $sql .= " AND date(created_at) = date(?)";
        $params[] = $date;
    } elseif (!empty($fromDate) && !empty($toDate)) {
        $sql .= " AND date(created_at) >= date(?) AND date(created_at) <= date(?)";
        $params[] = $fromDate; $params[] = $toDate;
    }

    // Count Total
    $countSql = str_replace("SELECT *", "SELECT COUNT(*) as total", $sql);
    $cStmt = $pdo->prepare($countSql);
    $cStmt->execute($params);
    $total = (int)$cStmt->fetchColumn();

    $sql .= " ORDER BY id DESC LIMIT ? OFFSET ?";
    $params[] = $limit;
    $params[] = $offset;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $patients = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'data' => $patients,
        'pagination' => [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'totalPages' => ceil($total / $limit)
        ]
    ]);
}

function getPatientById(PDO $pdo, int $id): void {
    authenticateToken();
    $stmt = $pdo->prepare("SELECT * FROM patients WHERE id = ?");
    $stmt->execute([$id]);
    $patient = $stmt->fetch();

    if (!$patient) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => "No patient found with ID #{$id}"]);
        return;
    }

    echo json_encode(['success' => true, 'data' => $patient]);
}

function getPatientByToken(PDO $pdo, int $token): void {
    authenticateToken();
    $stmt = $pdo->prepare("SELECT * FROM patients WHERE token = ? ORDER BY id DESC LIMIT 1");
    $stmt->execute([$token]);
    $patient = $stmt->fetch();

    if (!$patient) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => "No patient found with token #{$token}"]);
        return;
    }

    echo json_encode(['success' => true, 'data' => $patient]);
}

function getPatientStats(PDO $pdo): void {
    authenticateToken();
    $today = date('Y-m-d');

    $stmt1 = $pdo->prepare("SELECT COUNT(*) FROM patients WHERE date(created_at) = date(?)");
    $stmt1->execute([$today]);
    $totalToday = (int)$stmt1->fetchColumn();

    $stmt2 = $pdo->prepare("SELECT COUNT(*) FROM prescriptions WHERE date(created_at) = date(?) AND status = 'Pending'");
    $stmt2->execute([$today]);
    $pendingPrescriptions = (int)$stmt2->fetchColumn();

    $stmt3 = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE date(created_at) = date(?)");
    $stmt3->execute([$today]);
    $billedCount = (int)$stmt3->fetchColumn();

    $stmt4 = $pdo->prepare("SELECT MAX(token) FROM patients WHERE date(created_at) = date(?)");
    $stmt4->execute([$today]);
    $lastToken = (int)($stmt4->fetchColumn() ?? 0);

    echo json_encode([
        'success' => true,
        'data' => [
            'totalToday' => $totalToday,
            'pendingPrescriptions' => $pendingPrescriptions,
            'billedCount' => $billedCount,
            'lastToken' => $lastToken
        ]
    ]);
}

function exportPatientsCSV(PDO $pdo): void {
    authenticateToken();

    $stmt = $pdo->query("SELECT * FROM patients ORDER BY id DESC");
    $patients = $stmt->fetchAll();

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="Orthofix_Registered_Patient_Records.csv"');

    $out = fopen('php://output', 'w');
    fputcsv($out, ['Token', 'Patient Name', 'Patient ID', 'Age', 'Gender', 'Mobile Number', 'Symptoms / Issues', 'Registration Date']);

    foreach ($patients as $p) {
        fputcsv($out, [
            $p['token'],
            $p['patient_name'],
            'OP-' . $p['id'],
            $p['age'],
            $p['gender'] ?? 'Male',
            $p['mobile'],
            $p['symptoms'],
            $p['created_at']
        ]);
    }

    fclose($out);
    exit;
}
