<?php
/**
 * api/prescriptions.php - Doctor Prescriptions & Consultations API Routes
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

function handlePrescriptionRoutes(PDO $pdo, string $subPath, string $method): void {
    if ($subPath === '/today' && $method === 'GET') {
        getTodayPrescriptions($pdo);
    } elseif ($subPath === '/all' && $method === 'GET') {
        getAllPrescriptions($pdo);
    } elseif (preg_match('#^/patient/(.+)$#', $subPath, $matches) && $method === 'GET') {
        getPatientPrescription($pdo, urldecode($matches[1]));
    } elseif (($subPath === '' || $subPath === '/') && $method === 'POST') {
        createOrUpdatePrescription($pdo);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Prescription endpoint not found']);
    }
}

function createOrUpdatePrescription(PDO $pdo): void {
    $user = authenticateToken();
    requireRole($user, 'Doctor', 'Medical Manager', 'Admin / Billing Manager', 'Admin');

    $input = getJsonInput();
    $patientToken = (int)($input['patient_token'] ?? 0);
    $patientMobile = trim((string)($input['patient_mobile'] ?? ''));
    $patientName = trim((string)($input['patient_name'] ?? ''));
    $age = (int)($input['age'] ?? 0);
    $symptoms = trim((string)($input['symptoms'] ?? ''));
    $complaints = trim((string)($input['complaints'] ?? $symptoms));
    $diagnosis = trim((string)($input['diagnosis'] ?? ''));
    $doctorComment = trim((string)($input['doctor_comment'] ?? ''));
    $items = $input['items'] ?? [];

    if ($patientToken <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Patient token is required.']);
        return;
    }

    if (empty($doctorComment)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Doctor note is mandatory.']);
        return;
    }

    $doctorId = $user['id'] ?? null;
    $doctorName = $user['full_name'] ?? 'Dr. Specialist';

    // Check existing pending prescription for token
    $chk = $pdo->prepare("SELECT id FROM prescriptions WHERE patient_token = ? AND status = 'Pending'");
    $chk->execute([$patientToken]);
    $existing = $chk->fetch();

    $prescriptionId = null;

    if ($existing) {
        $prescriptionId = (int)$existing['id'];

        $upP = $pdo->prepare("
            UPDATE prescriptions 
            SET doctor_id = ?, doctor_name = ?, complaints = ?, diagnosis = ?, submission_status = 'Submitted'
            WHERE id = ?
        ");
        $upP->execute([$doctorId, $doctorName, $complaints, $diagnosis, $prescriptionId]);

        $chkC = $pdo->prepare("SELECT id FROM consultations WHERE prescription_id = ?");
        $chkC->execute([$prescriptionId]);

        if ($chkC->fetch()) {
            $upC = $pdo->prepare("
                UPDATE consultations
                SET patient_name = ?, patient_mobile = ?, doctor_id = ?, age = ?, symptoms = ?, doctor_comment = ?
                WHERE prescription_id = ?
            ");
            $upC->execute([$patientName, $patientMobile, $doctorId, $age, $symptoms, $doctorComment, $prescriptionId]);
        } else {
            $insC = $pdo->prepare("
                INSERT INTO consultations (prescription_id, patient_token, patient_name, patient_mobile, doctor_id, age, symptoms, doctor_comment)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $insC->execute([$prescriptionId, $patientToken, $patientName, $patientMobile, $doctorId, $age, $symptoms, $doctorComment]);
        }

        $pdo->prepare("DELETE FROM prescription_items WHERE prescription_id = ?")->execute([$prescriptionId]);

    } else {
        $insP = $pdo->prepare("
            INSERT INTO prescriptions (patient_token, patient_mobile, doctor_id, doctor_name, complaints, diagnosis, submission_status, status)
            VALUES (?, ?, ?, ?, ?, ?, 'Submitted', 'Pending')
        ");
        $insP->execute([$patientToken, $patientMobile, $doctorId, $doctorName, $complaints, $diagnosis]);
        $prescriptionId = (int)$pdo->lastInsertId();

        $insC = $pdo->prepare("
            INSERT INTO consultations (prescription_id, patient_token, patient_name, patient_mobile, doctor_id, age, symptoms, doctor_comment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $insC->execute([$prescriptionId, $patientToken, $patientName, $patientMobile, $doctorId, $age, $symptoms, $doctorComment]);
    }

    // Insert prescription items
    if (is_array($items) && count($items) > 0) {
        $insItem = $pdo->prepare("
            INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, quantity, instructions)
            VALUES (?, ?, ?, ?, ?)
        ");

        $fallback = $pdo->query("SELECT id FROM medicines ORDER BY id ASC LIMIT 1")->fetch();
        $fallbackMedId = $fallback ? (int)$fallback['id'] : 1;

        foreach ($items as $item) {
            $validMedId = null;
            if (!empty($item['medicine_id'])) {
                $mChk = $pdo->prepare("SELECT id FROM medicines WHERE id = ?");
                $mChk->execute([(int)$item['medicine_id']]);
                if ($mChk->fetch()) $validMedId = (int)$item['medicine_id'];
            }

            if (!$validMedId && !empty($item['medicine_name'])) {
                $mName = trim((string)$item['medicine_name']);
                $mChk = $pdo->prepare("SELECT id FROM medicines WHERE name LIKE ? OR generic_name LIKE ?");
                $mChk->execute(["%{$mName}%", "%{$mName}%"]);
                $mRow = $mChk->fetch();
                if ($mRow) $validMedId = (int)$mRow['id'];
            }

            $insItem->execute([
                $prescriptionId,
                $validMedId ?: $fallbackMedId,
                $item['medicine_name'] ?? 'General Medicine',
                (int)($item['quantity'] ?? 1),
                $item['instructions'] ?? ''
            ]);
        }
    }

    logAudit($pdo, $user, 'CONSULTATION_SUBMIT', 'DOCTOR', 'Prescription', $prescriptionId, "Doctor '{$doctorName}' saved consultation for token #{$patientToken}");

    echo json_encode(['success' => true, 'message' => 'Prescription & Consultation saved successfully.', 'prescription_id' => $prescriptionId]);
}

function getTodayPrescriptions(PDO $pdo): void {
    authenticateToken();
    $today = date('Y-m-d');

    $stmt = $pdo->prepare("
        SELECT p.*, c.patient_name, c.age, c.symptoms, c.doctor_comment
        FROM prescriptions p
        LEFT JOIN consultations c ON p.id = c.prescription_id
        WHERE date(p.created_at) = date(?) AND p.status = 'Pending'
        ORDER BY p.id DESC
    ");
    $stmt->execute([$today]);
    $prescriptions = $stmt->fetchAll();

    echo json_encode(['success' => true, 'prescriptions' => $prescriptions]);
}

function getPatientPrescription(PDO $pdo, string $identifier): void {
    authenticateToken();

    $stmt = $pdo->prepare("
        SELECT p.*, c.doctor_comment, COALESCE(c.patient_name, pat.patient_name) as patient_name, COALESCE(c.patient_mobile, pat.mobile, p.patient_mobile) as mobile
        FROM prescriptions p
        LEFT JOIN consultations c ON p.id = c.prescription_id
        LEFT JOIN patients pat ON p.patient_token = pat.token
        WHERE (p.patient_token = ? OR p.patient_mobile = ? OR pat.mobile = ? OR c.patient_mobile = ?) AND p.status = 'Pending'
        ORDER BY p.id DESC
        LIMIT 1
    ");
    $stmt->execute([$identifier, $identifier, $identifier, $identifier]);
    $p = $stmt->fetch();

    if (!$p) {
        echo json_encode(['success' => false, 'message' => 'No pending prescription found for this patient.']);
        return;
    }

    $iStmt = $pdo->prepare("SELECT * FROM prescription_items WHERE prescription_id = ?");
    $iStmt->execute([$p['id']]);
    $items = $iStmt->fetchAll();

    echo json_encode([
        'success' => true,
        'prescription' => array_merge($p, ['items' => $items])
    ]);
}

function getAllPrescriptions(PDO $pdo): void {
    authenticateToken();

    $status = trim((string)($_GET['status'] ?? 'all'));
    $doctorName = trim((string)($_GET['doctor_name'] ?? ''));
    $search = trim((string)($_GET['search'] ?? ''));
    $startDate = trim((string)($_GET['start_date'] ?? ''));
    $endDate = trim((string)($_GET['end_date'] ?? ''));

    $sql = "
        SELECT p.*, 
               COALESCE(c.patient_name, pat.patient_name) AS patient_name, 
               COALESCE(c.age, pat.age) AS age, 
               COALESCE(c.patient_mobile, pat.mobile, p.patient_mobile) AS mobile, 
               COALESCE(c.symptoms, pat.symptoms) AS symptoms, 
               c.doctor_comment
        FROM prescriptions p
        LEFT JOIN consultations c ON p.id = c.prescription_id
        LEFT JOIN patients pat ON p.patient_token = pat.token
        WHERE 1=1
    ";
    $params = [];

    if ($status !== 'all' && !empty($status)) {
        $sql .= " AND p.status = ?";
        $params[] = $status;
    }

    if (!empty($doctorName)) {
        $sql .= " AND p.doctor_name LIKE ?";
        $params[] = "%{$doctorName}%";
    }

    if (!empty($search)) {
        $q = "%{$search}%";
        $sql .= " AND (p.patient_token LIKE ? OR c.patient_name LIKE ? OR pat.patient_name LIKE ? OR p.doctor_name LIKE ? OR c.symptoms LIKE ?)";
        $params[] = $q; $params[] = $q; $params[] = $q; $params[] = $q; $params[] = $q;
    }

    if (!empty($startDate)) {
        $sql .= " AND date(p.created_at) >= date(?)";
        $params[] = $startDate;
    }

    if (!empty($endDate)) {
        $sql .= " AND date(p.created_at) <= date(?)";
        $params[] = $endDate;
    }

    $sql .= " ORDER BY p.id DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $prescriptions = $stmt->fetchAll();

    echo json_encode(['success' => true, 'prescriptions' => $prescriptions]);
}
