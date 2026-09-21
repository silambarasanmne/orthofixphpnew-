<?php
/**
 * api/billing.php - POS Billing & Sales API Routes
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

function handleBillingRoutes(PDO $pdo, string $subPath, string $method): void {
    if ($subPath === '/sale' && $method === 'POST') {
        processSaleTransaction($pdo);
    } elseif ($subPath === '/history' && $method === 'GET') {
        getBillingHistory($pdo);
    } elseif (preg_match('#^/invoice/(.+)$#', $subPath, $matches)) {
        getInvoiceDetails($pdo, urldecode($matches[1]));
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Billing endpoint not found']);
    }
}

function generateInvoiceNumber(PDO $pdo): string {
    $dateStr = date('Ymd');
    $prefix = "INV-{$dateStr}-";

    $stmt = $pdo->prepare("SELECT invoice_number FROM sales WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1");
    $stmt->execute(["{$prefix}%"]);
    $lastSale = $stmt->fetch();

    $nextSeq = 1;
    if ($lastSale && !empty($lastSale['invoice_number'])) {
        $parts = explode('-', $lastSale['invoice_number']);
        $lastSeq = (int)end($parts);
        if ($lastSeq > 0) {
            $nextSeq = $lastSeq + 1;
        }
    }

    return $prefix . str_pad((string)$nextSeq, 4, '0', STR_PAD_LEFT);
}

function processSaleTransaction(PDO $pdo): void {
    $user = authenticateToken();
    requireRole($user, 'Billing Worker', 'Billing Manager', 'Admin / Billing Manager', 'Admin');

    $input = getJsonInput();
    $items = $input['items'] ?? [];
    $customerName = trim((string)($input['customer_name'] ?? 'Walk-in Customer'));
    $customerPhone = trim((string)($input['customer_phone'] ?? ''));
    $customerAddress = trim((string)($input['customer_address'] ?? ''));
    $discountType = $input['discount_type'] ?? 'fixed';
    $discVal = (float)($input['discount_value'] ?? 0);
    $paymentMethod = $input['payment_method'] ?? 'Cash';
    $amountReceived = isset($input['amount_received']) ? (float)$input['amount_received'] : null;
    $targetConsultationId = $input['consultation_id'] ?? $input['prescription_id'] ?? null;
    $consultFee = (float)($input['consultation_charges'] ?? 0);
    $extraFee = (float)($input['other_charges'] ?? 0);

    if ($targetConsultationId) {
        $chk = $pdo->prepare("SELECT id, invoice_number FROM sales WHERE consultation_id = ?");
        $chk->execute([$targetConsultationId]);
        $existing = $chk->fetch();
        if ($existing) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => "Duplicate Billing Error: Consultation #{$targetConsultationId} has already been billed under Invoice #{$existing['invoice_number']}."
            ]);
            return;
        }
    }

    if (!is_array($items) || count($items) === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Cart cannot be empty.']);
        return;
    }

    if (!in_array($paymentMethod, ['Cash', 'UPI', 'Card'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid payment method selected.']);
        return;
    }

    // Doctor info resolution
    $resolvedDoctorId = $input['doctor_id'] ?? null;
    $resolvedDoctorName = $input['doctor_name'] ?? 'Dr. Specialist';

    if ($targetConsultationId) {
        $pStmt = $pdo->prepare("SELECT doctor_id, doctor_name FROM prescriptions WHERE id = ?");
        $pStmt->execute([$targetConsultationId]);
        $pRec = $pStmt->fetch();
        if ($pRec) {
            if (!empty($pRec['doctor_id'])) $resolvedDoctorId = $pRec['doctor_id'];
            if (!empty($pRec['doctor_name'])) $resolvedDoctorName = $pRec['doctor_name'];
        }
    }

    // 1. Validate Items & Stock
    $nowTime = time();
    $validatedItems = [];
    $calculatedSubtotal = 0;

    foreach ($items as $item) {
        $medId = (int)($item['medicine_id'] ?? 0);
        $mStmt = $pdo->prepare("SELECT * FROM medicines WHERE id = ?");
        $mStmt->execute([$medId]);
        $med = $mStmt->fetch();

        if (!$med) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Medicine ID {$medId} not found."]);
            return;
        }

        // Expiry check
        if (strtotime($med['expiry_date']) < $nowTime) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Medicine \"{$med['name']}\" is expired ({$med['expiry_date']}) and cannot be billed."]);
            return;
        }

        // Stock check
        $requestedQty = (int)($item['quantity'] ?? 0);
        if ($requestedQty <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Invalid quantity for {$med['name']}."]);
            return;
        }

        $currentStock = (int)$med['current_stock'];
        if ($currentStock === 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "This medicine ({$med['name']}) is currently out of stock."]);
            return;
        }

        if ($requestedQty > $currentStock) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Only {$currentStock} units available for {$med['name']}."]);
            return;
        }

        $unitsPerStrip = (int)($med['units_per_strip'] ?? 10);
        $unitPrice = isset($item['unit_price']) ? (float)$item['unit_price'] : ((float)$med['selling_price'] / ($unitsPerStrip > 0 ? $unitsPerStrip : 10));
        $itemTotal = $unitPrice * $requestedQty;
        $calculatedSubtotal += $itemTotal;

        $validatedItems[] = [
            'medicine' => $med,
            'quantity' => $requestedQty,
            'unit_price' => $unitPrice,
            'item_total' => $itemTotal
        ];
    }

    // 2. Calculations
    $medicineSubtotal = $calculatedSubtotal;
    $overallSubtotal = $medicineSubtotal + $consultFee + $extraFee;

    $discountAmt = 0;
    if ($discountType === 'percent') {
        if ($discVal < 0 || $discVal > 100) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Discount percentage must be between 0% and 100%.']);
            return;
        }
        $discountAmt = ($overallSubtotal * $discVal) / 100;
    } else {
        if ($discVal < 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Discount amount cannot be negative.']);
            return;
        }
        $discountAmt = $discVal;
    }

    if ($discountAmt > $overallSubtotal) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Discount cannot exceed total bill amount.']);
        return;
    }

    $grandTotal = $overallSubtotal - $discountAmt;

    // 3. Payment Validation
    $amtReceived = ($amountReceived !== null) ? $amountReceived : $grandTotal;
    $changeAmt = 0;

    if ($paymentMethod === 'Cash') {
        if ($amtReceived < $grandTotal) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Amount received (₹" . number_format($amtReceived, 2) . ") is less than Grand Total (₹" . number_format($grandTotal, 2) . ")."]);
            return;
        }
        $changeAmt = $amtReceived - $grandTotal;
    } else {
        $amtReceived = $grandTotal;
        $changeAmt = 0;
    }

    $invoiceNumber = generateInvoiceNumber($pdo);

    // 4. Atomic Database Save
    $pdo->beginTransaction();
    try {
        $insSale = $pdo->prepare("
            INSERT INTO sales 
            (invoice_number, customer_name, customer_phone, customer_address, subtotal, discount_type, discount_value, discount_amount, grand_total, payment_method, amount_received, change_amount, worker_id, worker_name, consultation_id, doctor_id, doctor_name, consultation_charges, medicine_charges, other_charges, checkout_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed')
        ");

        $insSale->execute([
            $invoiceNumber,
            $customerName,
            $customerPhone,
            $customerAddress,
            $overallSubtotal,
            $discountType,
            $discVal,
            $discountAmt,
            $grandTotal,
            $paymentMethod,
            $amtReceived,
            $changeAmt,
            $user['id'],
            $user['full_name'] ?? 'Worker',
            $targetConsultationId,
            $resolvedDoctorId,
            $resolvedDoctorName,
            $consultFee,
            $medicineSubtotal,
            $extraFee
        ]);

        $saleId = (int)$pdo->lastInsertId();

        $insSaleItem = $pdo->prepare("
            INSERT INTO sale_items (sale_id, medicine_id, medicine_name, generic_name, batch_number, unit_price, quantity, total_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $upStock = $pdo->prepare("UPDATE medicines SET current_stock = current_stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $insMovement = $pdo->prepare("
            INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
            VALUES (?, ?, ?, ?, ?, 'Customer Sale', ?)
        ");

        foreach ($validatedItems as $vi) {
            $med = $vi['medicine'];
            $insSaleItem->execute([
                $saleId, $med['id'], $med['name'], $med['generic_name'], $med['batch_number'],
                $vi['unit_price'], $vi['quantity'], $vi['item_total']
            ]);

            $prevStock = (int)$med['current_stock'];
            $newStock = $prevStock - $vi['quantity'];

            $upStock->execute([$vi['quantity'], $med['id']]);
            $insMovement->execute([$med['id'], $med['name'], $prevStock, -$vi['quantity'], $newStock, $user['full_name'] ?? 'Worker']);
        }

        if ($targetConsultationId) {
            $pdo->prepare("UPDATE prescriptions SET status = 'Billed' WHERE id = ?")->execute([$targetConsultationId]);
        }

        $pdo->commit();

        logAudit($pdo, $user, 'BILL_CREATE', 'BILLING', 'Sale', $saleId, "Generated Invoice #{$invoiceNumber} (Total: ₹" . number_format($grandTotal, 2) . ")");

    } catch (\Throwable $txError) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to record sale transaction: ' . $txError->getMessage()]);
        return;
    }

    // Fetch complete sale detail
    $sStmt = $pdo->prepare("SELECT * FROM sales WHERE id = ?");
    $sStmt->execute([$saleId]);
    $createdSale = $sStmt->fetch();

    $iStmt = $pdo->prepare("SELECT * FROM sale_items WHERE sale_id = ?");
    $iStmt->execute([$saleId]);
    $saleItems = $iStmt->fetchAll();

    echo json_encode([
        'success' => true,
        'message' => 'Sale completed successfully.',
        'invoice' => array_merge($createdSale, ['items' => $saleItems])
    ]);
}

function getBillingHistory(PDO $pdo): void {
    authenticateToken();

    $invoiceNumber = trim((string)($_GET['invoice_number'] ?? ''));
    $customer = trim((string)($_GET['customer'] ?? ''));
    $startDate = trim((string)($_GET['start_date'] ?? ''));
    $endDate = trim((string)($_GET['end_date'] ?? ''));
    $workerId = trim((string)($_GET['worker_id'] ?? ''));
    $paymentMethod = trim((string)($_GET['payment_method'] ?? ''));

    $sql = "SELECT * FROM sales WHERE 1=1";
    $params = [];

    if (!empty($invoiceNumber)) {
        $sql .= " AND invoice_number LIKE ?";
        $params[] = "%{$invoiceNumber}%";
    }

    if (!empty($customer)) {
        $sql .= " AND (customer_name LIKE ? OR customer_phone LIKE ?)";
        $params[] = "%{$customer}%";
        $params[] = "%{$customer}%";
    }

    if (!empty($startDate)) {
        $sql .= " AND date(created_at) >= date(?)";
        $params[] = $startDate;
    }

    if (!empty($endDate)) {
        $sql .= " AND date(created_at) <= date(?)";
        $params[] = $endDate;
    }

    if (!empty($workerId)) {
        $sql .= " AND worker_id = ?";
        $params[] = $workerId;
    }

    if (!empty($paymentMethod) && $paymentMethod !== 'All') {
        $sql .= " AND payment_method = ?";
        $params[] = $paymentMethod;
    }

    $sql .= " ORDER BY id DESC LIMIT 200";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $sales = $stmt->fetchAll();

    echo json_encode(['success' => true, 'count' => count($sales), 'sales' => $sales]);
}

function getInvoiceDetails(PDO $pdo, string $identifier): void {
    authenticateToken();

    if (is_numeric($identifier)) {
        $stmt = $pdo->prepare("SELECT * FROM sales WHERE id = ?");
    } else {
        $stmt = $pdo->prepare("SELECT * FROM sales WHERE invoice_number = ?");
    }
    $stmt->execute([$identifier]);
    $sale = $stmt->fetch();

    if (!$sale) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Invoice not found.']);
        return;
    }

    $iStmt = $pdo->prepare("SELECT * FROM sale_items WHERE sale_id = ?");
    $iStmt->execute([$sale['id']]);
    $items = $iStmt->fetchAll();

    echo json_encode([
        'success' => true,
        'invoice' => array_merge($sale, ['items' => $items])
    ]);
}
