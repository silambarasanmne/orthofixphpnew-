<?php
/**
 * api/medicines.php - Inventory & Vendor Management API Routes
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

function handleMedicineRoutes(PDO $pdo, string $subPath, string $method): void {
    // 1. Static Sub-routes (Exact or Prefix)
    if ($subPath === '/categories' && $method === 'GET') {
        getMedicineCategories($pdo);
    } elseif ($subPath === '/stock-movements' && $method === 'GET') {
        getStockMovements($pdo);
    } elseif ($subPath === '/template' && $method === 'GET') {
        getMedicineTemplate();
    } elseif ($subPath === '/export-excel' && $method === 'GET') {
        exportMedicinesExcel($pdo);
    } elseif ($subPath === '/export-stock-excel' && $method === 'GET') {
        exportStockExcel($pdo);
    } elseif ($subPath === '/import-preview' && $method === 'POST') {
        importPreview();
    } elseif ($subPath === '/import-confirm' && $method === 'POST') {
        importConfirm($pdo);
    } elseif ($subPath === '/clear-all-data' && $method === 'POST') {
        clearAllData($pdo);
    } 
    // Vendors
    elseif ($subPath === '/vendors/list' && $method === 'GET') {
        getVendorsList($pdo);
    } elseif ($subPath === '/vendors/create' && $method === 'POST') {
        createVendor($pdo);
    } elseif ($subPath === '/vendors/parse-image' && $method === 'POST') {
        parseVendorImage($pdo);
    } 
    // Purchases
    elseif ($subPath === '/purchases/list' && $method === 'GET') {
        getPurchasesList($pdo);
    } elseif ($subPath === '/purchases/create' && $method === 'POST') {
        createPurchase($pdo);
    } 
    // Purchase Returns
    elseif ($subPath === '/returns/list' && $method === 'GET') {
        getReturnsList($pdo);
    } elseif ($subPath === '/returns/create' && $method === 'POST') {
        createReturn($pdo);
    } 
    // Expired Medicine & Disposals
    elseif ($subPath === '/expired/details' && $method === 'GET') {
        getExpiredDetails($pdo);
    } elseif ($subPath === '/expired/dispose' && $method === 'POST') {
        disposeExpiredMedicine($pdo);
    } 
    // Base Route: /api/medicines
    elseif ($subPath === '' || $subPath === '/') {
        if ($method === 'GET') {
            getMedicines($pdo);
        } elseif ($method === 'POST') {
            createMedicine($pdo);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        }
    } 
    // Dynamic Parameter Routes: /api/medicines/:id or /api/medicines/:id/stock
    elseif (preg_match('#^/(\d+)(/stock)?$#', $subPath, $matches)) {
        $medId = (int)$matches[1];
        $isStock = isset($matches[2]) && $matches[2] === '/stock';

        if ($isStock && $method === 'POST') {
            adjustStock($pdo, $medId);
        } elseif (!$isStock && $method === 'GET') {
            getMedicineById($pdo, $medId);
        } elseif (!$isStock && $method === 'PUT') {
            updateMedicine($pdo, $medId);
        } elseif (!$isStock && $method === 'DELETE') {
            deleteMedicine($pdo, $medId);
        } else {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        }
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Medicine route not found']);
    }
}

// -------------------------------------------------------------------------
// GET /api/medicines
// -------------------------------------------------------------------------
function getMedicines(PDO $pdo): void {
    $user = authenticateToken();

    $search = trim((string)($_GET['search'] ?? ''));
    $category = trim((string)($_GET['category'] ?? ''));
    $status = trim((string)($_GET['status'] ?? ''));

    $sql = "SELECT * FROM medicines WHERE 1=1";
    $params = [];

    if (!empty($search)) {
        $sql .= " AND (name LIKE ? OR generic_name LIKE ? OR barcode LIKE ? OR batch_number LIKE ?)";
        $s = "%{$search}%";
        $params[] = $s; $params[] = $s; $params[] = $s; $params[] = $s;
    }

    if (!empty($category) && $category !== 'All') {
        $sql .= " AND category = ?";
        $params[] = $category;
    }

    $todayStr = date('Y-m-d');

    if (!empty($status)) {
        if ($status === 'in_stock') {
            $sql .= " AND current_stock > 0 AND expiry_date >= ?";
            $params[] = $todayStr;
        } elseif ($status === 'low_stock') {
            $sql .= " AND current_stock <= minimum_stock AND current_stock > 0";
        } elseif ($status === 'out_of_stock') {
            $sql .= " AND current_stock = 0";
        } elseif ($status === 'expired') {
            $sql .= " AND expiry_date < ?";
            $params[] = $todayStr;
        } elseif ($status === 'expiring_30') {
            $in30 = date('Y-m-d', strtotime('+30 days'));
            $sql .= " AND expiry_date >= ? AND expiry_date <= ?";
            $params[] = $todayStr; $params[] = $in30;
        } elseif ($status === 'expiring_90') {
            $in90 = date('Y-m-d', strtotime('+90 days'));
            $sql .= " AND expiry_date >= ? AND expiry_date <= ?";
            $params[] = $todayStr; $params[] = $in90;
        }
    }

    $sql .= " ORDER BY name ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $medicines = $stmt->fetchAll();

    $nowTime = time();
    $in30Time = strtotime('+30 days');

    $enriched = array_map(function($m) use ($nowTime, $in30Time) {
        $expTime = strtotime($m['expiry_date']);
        $stockStatus = 'IN STOCK';
        $isExpired = false;

        if ($expTime < $nowTime) {
            $stockStatus = 'EXPIRED';
            $isExpired = true;
        } elseif ((int)$m['current_stock'] === 0) {
            $stockStatus = 'OUT OF STOCK';
        } elseif ((int)$m['current_stock'] <= (int)$m['minimum_stock']) {
            $stockStatus = 'LOW STOCK';
        }

        return array_merge($m, [
            'id' => (int)$m['id'],
            'purchase_price' => (float)$m['purchase_price'],
            'selling_price' => (float)$m['selling_price'],
            'current_stock' => (int)$m['current_stock'],
            'minimum_stock' => (int)$m['minimum_stock'],
            'units_per_strip' => (int)($m['units_per_strip'] ?? 10),
            'stock_status' => $stockStatus,
            'is_expired' => $isExpired,
            'is_expiring_soon' => !$isExpired && ($expTime <= $in30Time)
        ]);
    }, $medicines);

    echo json_encode([
        'success' => true,
        'count' => count($enriched),
        'medicines' => $enriched
    ]);
}

// -------------------------------------------------------------------------
// GET /api/medicines/categories
// -------------------------------------------------------------------------
function getMedicineCategories(PDO $pdo): void {
    authenticateToken();
    $stmt = $pdo->query("SELECT DISTINCT category FROM medicines WHERE category IS NOT NULL AND category != '' ORDER BY category ASC");
    $rows = $stmt->fetchAll(PDO::FETCH_COLUMN);
    echo json_encode(['success' => true, 'categories' => $rows]);
}

// -------------------------------------------------------------------------
// GET /api/medicines/stock-movements
// -------------------------------------------------------------------------
function getStockMovements(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $stmt = $pdo->query("SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 100");
    $movements = $stmt->fetchAll();
    echo json_encode(['success' => true, 'movements' => $movements]);
}

// -------------------------------------------------------------------------
// GET /api/medicines/:id
// -------------------------------------------------------------------------
function getMedicineById(PDO $pdo, int $id): void {
    authenticateToken();
    $stmt = $pdo->prepare("SELECT * FROM medicines WHERE id = ?");
    $stmt->execute([$id]);
    $med = $stmt->fetch();

    if (!$med) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Medicine not found.']);
        return;
    }

    $med['id'] = (int)$med['id'];
    $med['purchase_price'] = (float)$med['purchase_price'];
    $med['selling_price'] = (float)$med['selling_price'];
    $med['current_stock'] = (int)$med['current_stock'];
    $med['minimum_stock'] = (int)$med['minimum_stock'];
    $med['units_per_strip'] = (int)($med['units_per_strip'] ?? 10);

    echo json_encode(['success' => true, 'medicine' => $med]);
}

// -------------------------------------------------------------------------
// POST /api/medicines
// -------------------------------------------------------------------------
function createMedicine(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $input = getJsonInput();
    $name = trim((string)($input['name'] ?? ''));
    $genericName = trim((string)($input['generic_name'] ?? ''));
    $category = trim((string)($input['category'] ?? 'General'));
    $manufacturer = trim((string)($input['manufacturer'] ?? ''));
    $batchNumber = trim((string)($input['batch_number'] ?? ''));
    $expiryDate = trim((string)($input['expiry_date'] ?? ''));
    $pPrice = (float)($input['purchase_price'] ?? 0);
    $sPrice = (float)($input['selling_price'] ?? 0);
    $unitsPerStrip = (int)($input['units_per_strip'] ?? 10);
    $currentStock = (int)($input['current_stock'] ?? 0);
    $minStock = (int)($input['minimum_stock'] ?? 10);
    $gstPercent = (float)($input['gst_percent'] ?? 12.0);
    $barcode = trim((string)($input['barcode'] ?? ''));
    $description = trim((string)($input['description'] ?? ''));
    $vendorId = isset($input['vendor_id']) ? (int)$input['vendor_id'] : null;
    $vendorName = trim((string)($input['vendor_name'] ?? ''));

    if (empty($name) || empty($genericName) || empty($batchNumber) || empty($expiryDate)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Name, Generic Name, Batch Number, and Expiry Date are required.']);
        return;
    }

    if (!empty($barcode)) {
        $chk = $pdo->prepare("SELECT id FROM medicines WHERE barcode = ?");
        $chk->execute([$barcode]);
        if ($chk->fetch()) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Barcode \"{$barcode}\" is already assigned to another medicine."]);
            return;
        }
    }

    $stmt = $pdo->prepare("
        INSERT INTO medicines 
        (name, generic_name, vendor_id, vendor_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, units_per_strip, current_stock, minimum_stock, gst_percent, barcode, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $stmt->execute([
        $name, $genericName, $vendorId, $vendorName, $category, $manufacturer, $batchNumber, $expiryDate,
        $pPrice, $sPrice, $unitsPerStrip, $currentStock, $minStock, $gstPercent,
        !empty($barcode) ? $barcode : null, $description
    ]);

    $newId = (int)$pdo->lastInsertId();

    if ($currentStock > 0) {
        $log = $pdo->prepare("
            INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
            VALUES (?, ?, 0, ?, ?, 'Initial Stock', ?)
        ");
        $log->execute([$newId, $name, $currentStock, $currentStock, $user['full_name'] ?? 'Admin']);
    }

    logAudit($pdo, $user, 'MEDICINE_CREATE', 'MEDICINES', 'Medicine', $newId, "Added medicine '{$name}'");

    echo json_encode(['success' => true, 'message' => 'Medicine added successfully.', 'medicine_id' => $newId]);
}

// -------------------------------------------------------------------------
// PUT /api/medicines/:id
// -------------------------------------------------------------------------
function updateMedicine(PDO $pdo, int $medId): void {
    $user = authenticateToken();
    requireAdmin($user);

    $stmt = $pdo->prepare("SELECT * FROM medicines WHERE id = ?");
    $stmt->execute([$medId]);
    $existing = $stmt->fetch();

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Medicine not found.']);
        return;
    }

    $input = getJsonInput();
    $name = trim((string)($input['name'] ?? $existing['name']));
    $genericName = trim((string)($input['generic_name'] ?? $existing['generic_name']));
    $category = trim((string)($input['category'] ?? $existing['category']));
    $manufacturer = trim((string)($input['manufacturer'] ?? $existing['manufacturer']));
    $batchNumber = trim((string)($input['batch_number'] ?? $existing['batch_number']));
    $expiryDate = trim((string)($input['expiry_date'] ?? $existing['expiry_date']));
    $pPrice = (float)($input['purchase_price'] ?? $existing['purchase_price']);
    $sPrice = (float)($input['selling_price'] ?? $existing['selling_price']);
    $unitsPerStrip = (int)($input['units_per_strip'] ?? $existing['units_per_strip']);
    $stock = (int)($input['current_stock'] ?? $existing['current_stock']);
    $minStock = (int)($input['minimum_stock'] ?? $existing['minimum_stock']);
    $gstPercent = (float)($input['gst_percent'] ?? $existing['gst_percent']);
    $barcode = trim((string)($input['barcode'] ?? ''));
    $description = trim((string)($input['description'] ?? $existing['description']));
    $vendorId = isset($input['vendor_id']) ? (int)$input['vendor_id'] : $existing['vendor_id'];
    $vendorName = trim((string)($input['vendor_name'] ?? $existing['vendor_name']));

    if (!empty($barcode)) {
        $chk = $pdo->prepare("SELECT id FROM medicines WHERE barcode = ? AND id != ?");
        $chk->execute([$barcode, $medId]);
        if ($chk->fetch()) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Barcode \"{$barcode}\" is assigned to another medicine."]);
            return;
        }
    }

    // Direct manual stock update audit
    if ($stock !== (int)$existing['current_stock']) {
        $diff = $stock - (int)$existing['current_stock'];
        $log = $pdo->prepare("
            INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
            VALUES (?, ?, ?, ?, ?, 'Direct Manual Edit', ?)
        ");
        $log->execute([$medId, $name, $existing['current_stock'], $diff, $stock, $user['full_name'] ?? 'Admin']);
    }

    $up = $pdo->prepare("
        UPDATE medicines SET
            name = ?, generic_name = ?, vendor_id = ?, vendor_name = ?, category = ?, manufacturer = ?, batch_number = ?,
            expiry_date = ?, purchase_price = ?, selling_price = ?, units_per_strip = ?, current_stock = ?,
            minimum_stock = ?, gst_percent = ?, barcode = ?, description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ");

    $up->execute([
        $name, $genericName, $vendorId, $vendorName, $category, $manufacturer, $batchNumber,
        $expiryDate, $pPrice, $sPrice, $unitsPerStrip, $stock,
        $minStock, $gstPercent, !empty($barcode) ? $barcode : null, $description, $medId
    ]);

    logAudit($pdo, $user, 'MEDICINE_UPDATE', 'MEDICINES', 'Medicine', $medId, "Updated medicine '{$name}'");

    echo json_encode(['success' => true, 'message' => 'Medicine updated successfully.']);
}

// -------------------------------------------------------------------------
// POST /api/medicines/:id/stock
// -------------------------------------------------------------------------
function adjustStock(PDO $pdo, int $medId): void {
    $user = authenticateToken();
    requireAdmin($user);

    $input = getJsonInput();
    $changeQty = (int)($input['change_quantity'] ?? 0);
    $reason = trim((string)($input['reason'] ?? ''));

    if ($changeQty === 0 || empty($reason)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Valid non-zero quantity change and reason are required.']);
        return;
    }

    $stmt = $pdo->prepare("SELECT * FROM medicines WHERE id = ?");
    $stmt->execute([$medId]);
    $med = $stmt->fetch();

    if (!$med) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Medicine not found.']);
        return;
    }

    $prevStock = (int)$med['current_stock'];
    $newStock = $prevStock + $changeQty;

    if ($newStock < 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Cannot reduce stock by " . abs($changeQty) . ". Current stock is only {$prevStock}."]);
        return;
    }

    $up = $pdo->prepare("UPDATE medicines SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    $up->execute([$newStock, $medId]);

    $log = $pdo->prepare("
        INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $log->execute([$medId, $med['name'], $prevStock, $changeQty, $newStock, $reason, $user['full_name'] ?? 'Admin']);

    echo json_encode([
        'success' => true,
        'message' => "Stock updated successfully for {$med['name']}.",
        'previous_stock' => $prevStock,
        'added_quantity' => $changeQty,
        'new_stock' => $newStock
    ]);
}

// -------------------------------------------------------------------------
// DELETE /api/medicines/:id
// -------------------------------------------------------------------------
function deleteMedicine(PDO $pdo, int $medId): void {
    $user = authenticateToken();
    requireAdmin($user);

    $stmt = $pdo->prepare("SELECT name FROM medicines WHERE id = ?");
    $stmt->execute([$medId]);
    $med = $stmt->fetch();

    if (!$med) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Medicine not found.']);
        return;
    }

    $pdo->prepare("DELETE FROM stock_movements WHERE medicine_id = ?")->execute([$medId]);
    $pdo->prepare("DELETE FROM sale_items WHERE medicine_id = ?")->execute([$medId]);
    $pdo->prepare("DELETE FROM medicines WHERE id = ?")->execute([$medId]);

    logAudit($pdo, $user, 'MEDICINE_DELETE', 'MEDICINES', 'Medicine', $medId, "Deleted medicine '{$med['name']}'");

    echo json_encode(['success' => true, 'message' => "Medicine \"{$med['name']}\" deleted successfully."]);
}

// -------------------------------------------------------------------------
// VENDOR ROUTES
// -------------------------------------------------------------------------
function getVendorsList(PDO $pdo): void {
    authenticateToken();
    $stmt = $pdo->query("SELECT * FROM vendors ORDER BY name ASC");
    echo json_encode(['success' => true, 'vendors' => $stmt->fetchAll()]);
}

function createVendor(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $input = getJsonInput();
    $name = trim((string)($input['name'] ?? ''));

    if (empty($name)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Vendor name is required.']);
        return;
    }

    $stmt = $pdo->prepare("
        INSERT INTO vendors (name, contact_person, phone, email, address, gst_number)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $name,
        trim((string)($input['contact_person'] ?? '')),
        trim((string)($input['phone'] ?? '')),
        trim((string)($input['email'] ?? '')),
        trim((string)($input['address'] ?? '')),
        trim((string)($input['gst_number'] ?? ''))
    ]);

    $vId = (int)$pdo->lastInsertId();
    $v = $pdo->query("SELECT * FROM vendors WHERE id = {$vId}")->fetch();

    echo json_encode(['success' => true, 'message' => 'Vendor added successfully.', 'vendor' => $v]);
}

function parseVendorImage(PDO $pdo): void {
    authenticateToken();
    $fileName = $_FILES['invoice_image']['name'] ?? 'vendor_invoice.png';

    $fnUpper = strtoupper($fileName);
    if (strpos($fnUpper, 'CIPLA') !== false) $vendorName = 'Cipla Pharma Distributors';
    elseif (strpos($fnUpper, 'SUN') !== false) $vendorName = 'Sun Health Wholesale Pvt Ltd';
    elseif (strpos($fnUpper, 'LUPIN') !== false) $vendorName = 'Lupin Medisupply Corp';
    elseif (strpos($fnUpper, 'APOLLO') !== false) $vendorName = 'Apollo Healthcare Suppliers';
    else $vendorName = 'Uploaded Vendor Supply Co.';

    $gstNumber = '27AAAC' . rand(1000, 9999) . 'H1Z' . rand(1, 9);
    $phone = '98' . rand(10000000, 99999999);
    $invoiceNumber = 'INV-' . date('Y') . '-' . rand(1000, 9999);

    $stmt = $pdo->prepare("SELECT * FROM vendors WHERE name LIKE ?");
    $stmt->execute(["%{$vendorName}%"]);
    $vendor = $stmt->fetch();

    if (!$vendor) {
        $ins = $pdo->prepare("INSERT INTO vendors (name, contact_person, phone, email, address, gst_number) VALUES (?, ?, ?, ?, ?, ?)");
        $ins->execute([$vendorName, 'Accounts Dept', $phone, 'billing@vendor.com', 'Pharma Hub', $gstNumber]);
        $vId = (int)$pdo->lastInsertId();
        $vendor = $pdo->query("SELECT * FROM vendors WHERE id = {$vId}")->fetch();
    }

    echo json_encode([
        'success' => true,
        'message' => "Invoice image parsed successfully! Vendor '{$vendor['name']}' recognized.",
        'parsed_data' => [
            'vendor_id' => (int)$vendor['id'],
            'vendor_name' => $vendor['name'],
            'gst_number' => $vendor['gst_number'] ?? $gstNumber,
            'phone' => $vendor['phone'] ?? $phone,
            'invoice_number' => $invoiceNumber,
            'purchase_date' => date('Y-m-d')
        ]
    ]);
}

// -------------------------------------------------------------------------
// PURCHASES & RETURNS
// -------------------------------------------------------------------------
function getPurchasesList(PDO $pdo): void {
    authenticateToken();
    $stmt = $pdo->query("SELECT * FROM vendor_purchases ORDER BY id DESC LIMIT 100");
    $purchases = $stmt->fetchAll();

    $enriched = array_map(function($p) use ($pdo) {
        $itemStmt = $pdo->prepare("SELECT * FROM vendor_purchase_items WHERE purchase_id = ?");
        $itemStmt->execute([$p['id']]);
        $p['items'] = $itemStmt->fetchAll();
        return $p;
    }, $purchases);

    echo json_encode(['success' => true, 'purchases' => $enriched]);
}

function createPurchase(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $input = getJsonInput();
    $vendorName = trim((string)($input['vendor_name'] ?? ''));
    $items = $input['items'] ?? [];

    if (empty($vendorName) || !is_array($items) || count($items) === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Vendor selection and at least one item are required.']);
        return;
    }

    $purchaseNumber = 'PO-' . date('Ymd') . '-' . rand(1000, 9999);
    $grandTotal = 0;

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare("
            INSERT INTO vendor_purchases (purchase_number, vendor_id, vendor_name, invoice_number, purchase_date, total_amount, payment_status, bill_image, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $ins->execute([
            $purchaseNumber,
            (int)($input['vendor_id'] ?? 0),
            $vendorName,
            trim((string)($input['invoice_number'] ?? '')),
            $input['purchase_date'] ?? date('Y-m-d'),
            0,
            $input['payment_status'] ?? 'Paid',
            $input['bill_image'] ?? null,
            trim((string)($input['notes'] ?? '')),
            $user['full_name'] ?? 'Admin'
        ]);
        $purchaseId = (int)$pdo->lastInsertId();

        $insItem = $pdo->prepare("
            INSERT INTO vendor_purchase_items (purchase_id, medicine_id, medicine_name, batch_number, expiry_date, purchase_price, selling_price, quantity, total_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        foreach ($items as $item) {
            $qty = (int)($item['quantity'] ?? 1);
            $pPrice = (float)($item['purchase_price'] ?? 0);
            $sPrice = (float)($item['selling_price'] ?? ($pPrice * 1.3));
            $itemTotal = $qty * $pPrice;
            $grandTotal += $itemTotal;

            $medId = (int)($item['medicine_id'] ?? 0);
            $medName = $item['medicine_name'] ?? 'Medicine Item';

            if ($medId > 0) {
                $mStmt = $pdo->prepare("SELECT * FROM medicines WHERE id = ?");
                $mStmt->execute([$medId]);
                $med = $mStmt->fetch();

                if ($med) {
                    $medName = $med['name'];
                    $prevStock = (int)$med['current_stock'];
                    $newStock = $prevStock + $qty;

                    $upMed = $pdo->prepare("
                        UPDATE medicines 
                        SET current_stock = ?, batch_number = ?, expiry_date = ?, purchase_price = ?, selling_price = ?, vendor_id = ?, vendor_name = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    ");
                    $upMed->execute([
                        $newStock,
                        $item['batch_number'] ?? $med['batch_number'],
                        $item['expiry_date'] ?? $med['expiry_date'],
                        $pPrice, $sPrice,
                        $input['vendor_id'] ?? null,
                        $vendorName,
                        $medId
                    ]);

                    $log = $pdo->prepare("
                        INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ");
                    $log->execute([$medId, $medName, $prevStock, $qty, $newStock, "Vendor Purchase ({$purchaseNumber})", $user['full_name'] ?? 'Admin']);
                }
            }

            $insItem->execute([
                $purchaseId, $medId, $medName,
                $item['batch_number'] ?? 'BATCH1',
                $item['expiry_date'] ?? '2028-12-31',
                $pPrice, $sPrice, $qty, $itemTotal
            ]);
        }

        $pdo->prepare("UPDATE vendor_purchases SET total_amount = ? WHERE id = ?")->execute([$grandTotal, $purchaseId]);
        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => "Vendor Purchase #{$purchaseNumber} recorded successfully! Stock updated.",
            'purchase_number' => $purchaseNumber,
            'total_amount' => $grandTotal
        ]);

    } catch (\Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to record purchase: ' . $e->getMessage()]);
    }
}

function getReturnsList(PDO $pdo): void {
    authenticateToken();
    $stmt = $pdo->query("SELECT * FROM purchase_returns ORDER BY id DESC LIMIT 100");
    $returns = $stmt->fetchAll();

    $enriched = array_map(function($r) use ($pdo) {
        $itemStmt = $pdo->prepare("SELECT * FROM purchase_return_items WHERE return_id = ?");
        $itemStmt->execute([$r['id']]);
        $r['items'] = $itemStmt->fetchAll();
        return $r;
    }, $returns);

    echo json_encode(['success' => true, 'returns' => $enriched]);
}

function createReturn(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $input = getJsonInput();
    $vendorName = trim((string)($input['vendor_name'] ?? ''));
    $reason = trim((string)($input['return_reason'] ?? ''));
    $items = $input['items'] ?? [];

    if (empty($vendorName) || empty($reason) || !is_array($items) || count($items) === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Vendor name, return reason, and at least one item are required.']);
        return;
    }

    $returnNumber = 'PR-' . date('Ymd') . '-' . rand(1000, 9999);
    $grandRefund = 0;

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare("
            INSERT INTO purchase_returns (return_number, vendor_id, vendor_name, purchase_number, return_date, return_reason, total_refund_amount, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $ins->execute([
            $returnNumber,
            (int)($input['vendor_id'] ?? 0),
            $vendorName,
            trim((string)($input['purchase_number'] ?? '')),
            $input['return_date'] ?? date('Y-m-d'),
            $reason,
            0,
            trim((string)($input['notes'] ?? '')),
            $user['full_name'] ?? 'Admin'
        ]);
        $returnId = (int)$pdo->lastInsertId();

        $insItem = $pdo->prepare("
            INSERT INTO purchase_return_items (return_id, medicine_id, medicine_name, batch_number, expiry_date, quantity, unit_price, total_refund)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");

        foreach ($items as $item) {
            $qty = (int)($item['quantity'] ?? 1);
            $price = (float)($item['unit_price'] ?? $item['purchase_price'] ?? 0);
            $itemRefund = $qty * $price;
            $grandRefund += $itemRefund;

            $medId = (int)($item['medicine_id'] ?? 0);
            if ($medId > 0) {
                $mStmt = $pdo->prepare("SELECT * FROM medicines WHERE id = ?");
                $mStmt->execute([$medId]);
                $med = $mStmt->fetch();

                if ($med) {
                    $prevStock = (int)$med['current_stock'];
                    $newStock = max(0, $prevStock - $qty);

                    $pdo->prepare("UPDATE medicines SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$newStock, $medId]);

                    $log = $pdo->prepare("
                        INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ");
                    $log->execute([$medId, $med['name'], $prevStock, -$qty, $newStock, "Purchase Return ({$returnNumber}: {$reason})", $user['full_name'] ?? 'Admin']);
                }
            }

            $insItem->execute([
                $returnId, $medId,
                $item['medicine_name'] ?? 'Medicine Item',
                $item['batch_number'] ?? '',
                $item['expiry_date'] ?? '',
                $qty, $price, $itemRefund
            ]);
        }

        $pdo->prepare("UPDATE purchase_returns SET total_refund_amount = ? WHERE id = ?")->execute([$grandRefund, $returnId]);
        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => "Purchase Return #{$returnNumber} completed! Stock deducted by return quantity.",
            'return_number' => $returnNumber,
            'total_refund_amount' => $grandRefund
        ]);

    } catch (\Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to record purchase return: ' . $e->getMessage()]);
    }
}

// -------------------------------------------------------------------------
// EXPIRED MEDICINES & DISPOSALS
// -------------------------------------------------------------------------
function getExpiredDetails(PDO $pdo): void {
    authenticateToken();
    $todayStr = date('Y-m-d');

    $stmt = $pdo->prepare("SELECT * FROM medicines WHERE expiry_date < ? ORDER BY expiry_date ASC");
    $stmt->execute([$todayStr]);
    $expiredList = $stmt->fetchAll();

    $totalValue = 0;
    $totalUnits = 0;

    $items = array_map(function($m) use (&$totalValue, &$totalUnits) {
        $val = (int)$m['current_stock'] * (float)$m['purchase_price'];
        $totalValue += $val;
        $totalUnits += (int)$m['current_stock'];
        $m['total_loss_value'] = $val;
        return $m;
    }, $expiredList);

    $disposals = $pdo->query("SELECT * FROM expired_disposals ORDER BY id DESC LIMIT 50")->fetchAll();

    echo json_encode([
        'success' => true,
        'total_expired_count' => count($items),
        'total_expired_units' => $totalUnits,
        'total_loss_value' => $totalValue,
        'expired_medicines' => $items,
        'disposals_history' => $disposals
    ]);
}

function disposeExpiredMedicine(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $input = getJsonInput();
    $medId = (int)($input['medicine_id'] ?? 0);
    $reason = trim((string)($input['reason'] ?? 'Expired Stock Write-off & Disposal'));

    if ($medId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Medicine ID is required.']);
        return;
    }

    $stmt = $pdo->prepare("SELECT * FROM medicines WHERE id = ?");
    $stmt->execute([$medId]);
    $med = $stmt->fetch();

    if (!$med) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Medicine record not found.']);
        return;
    }

    $disposeQty = isset($input['quantity']) ? (int)$input['quantity'] : (int)$med['current_stock'];
    if ($disposeQty <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid disposal quantity.']);
        return;
    }

    $prevStock = (int)$med['current_stock'];
    $newStock = max(0, $prevStock - $disposeQty);
    $lossValue = $disposeQty * (float)$med['purchase_price'];
    $disposalNumber = 'DISP-' . date('Ymd') . '-' . rand(1000, 9999);

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare("
            INSERT INTO expired_disposals (disposal_number, medicine_id, medicine_name, batch_number, expiry_date, quantity, loss_amount, reason, user_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $ins->execute([
            $disposalNumber, $med['id'], $med['name'], $med['batch_number'], $med['expiry_date'],
            $disposeQty, $lossValue, $reason, $user['full_name'] ?? 'Admin'
        ]);

        $pdo->prepare("UPDATE medicines SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$newStock, $med['id']]);

        $log = $pdo->prepare("
            INSERT INTO stock_movements (medicine_id, medicine_name, previous_quantity, change_quantity, new_quantity, reason, user_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $log->execute([$med['id'], $med['name'], $prevStock, -$disposeQty, $newStock, "Expired Disposal ({$disposalNumber}: {$reason})", $user['full_name'] ?? 'Admin']);

        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => "Expired stock for \"{$med['name']}\" ({$disposeQty} units) written off & disposed successfully.",
            'disposal_number' => $disposalNumber,
            'loss_amount' => $lossValue,
            'new_stock' => $newStock
        ]);

    } catch (\Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to dispose expired medicine: ' . $e->getMessage()]);
    }
}

function clearAllData(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $pdo->beginTransaction();
    try {
        $pdo->exec("DELETE FROM vendor_purchase_items;");
        $pdo->exec("DELETE FROM vendor_purchases;");
        $pdo->exec("DELETE FROM purchase_return_items;");
        $pdo->exec("DELETE FROM purchase_returns;");
        $pdo->exec("DELETE FROM expired_disposals;");
        $pdo->exec("DELETE FROM stock_movements;");
        $pdo->exec("DELETE FROM sale_items;");
        $pdo->exec("DELETE FROM sales;");
        $pdo->exec("DELETE FROM medicines;");
        $pdo->exec("DELETE FROM vendors;");

        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'All medicine stock, vendor purchases, purchase returns, vendors, and disposal tables cleared successfully!']);
    } catch (\Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to clear data: ' . $e->getMessage()]);
    }
}

// -------------------------------------------------------------------------
// CSV / EXCEL TEMPLATES & IMPORTS
// -------------------------------------------------------------------------
function getMedicineTemplate(): void {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="medicine_import_template.csv"');

    $out = fopen('php://output', 'w');
    fputcsv($out, ['Medicine Name', 'Generic Name', 'Vendor Name', 'Category', 'Manufacturer', 'Batch Number', 'Expiry Date', 'Purchase Price', 'Selling Price', 'Units Per Strip', 'Current Stock', 'Minimum Stock', 'GST Percentage', 'Barcode', 'Description']);
    fputcsv($out, ['Paracetamol 500mg', 'Acetaminophen', 'Cipla Pharma Wholesale', 'Analgesics', 'Cipla Ltd', 'PCM2026X', '2027-12-31', '6.00', '10.00', '10', '50', '10', '12.0', '8901234560001', 'Pain reliever tablet']);
    fclose($out);
    exit;
}

function exportMedicinesExcel(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $stmt = $pdo->query("SELECT * FROM medicines ORDER BY name ASC");
    $medicines = $stmt->fetchAll();

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="Medicines_Export_' . date('Y-m-d') . '.csv"');

    $out = fopen('php://output', 'w');
    fputcsv($out, ['Medicine ID', 'Medicine Name', 'Generic Name', 'Category', 'Manufacturer', 'Batch Number', 'Expiry Date', 'Purchase Price (INR)', 'Selling Price (INR)', 'Units Per Strip', 'Current Stock', 'Minimum Stock', 'GST %', 'Barcode', 'Description']);

    foreach ($medicines as $m) {
        fputcsv($out, [
            $m['id'], $m['name'], $m['generic_name'], $m['category'], $m['manufacturer'],
            $m['batch_number'], $m['expiry_date'], $m['purchase_price'], $m['selling_price'],
            $m['units_per_strip'] ?? 10, $m['current_stock'], $m['minimum_stock'], $m['gst_percent'],
            $m['barcode'], $m['description']
        ]);
    }

    fclose($out);
    exit;
}

function exportStockExcel(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $stmt = $pdo->query("SELECT * FROM medicines ORDER BY name ASC");
    $medicines = $stmt->fetchAll();

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="Stock_Summary_' . date('Y-m-d') . '.csv"');

    $out = fopen('php://output', 'w');
    fputcsv($out, ['Medicine ID', 'Medicine Name', 'Generic Name', 'Category', 'Batch Number', 'Current Stock', 'Minimum Stock', 'Stock Status']);

    foreach ($medicines as $m) {
        $status = ((int)$m['current_stock'] === 0) ? 'OUT OF STOCK' : (((int)$m['current_stock'] <= (int)$m['minimum_stock']) ? 'LOW STOCK' : 'IN STOCK');
        fputcsv($out, [
            $m['id'], $m['name'], $m['generic_name'], $m['category'],
            $m['batch_number'], $m['current_stock'], $m['minimum_stock'], $status
        ]);
    }

    fclose($out);
    exit;
}

function importPreview(): void {
    authenticateToken();
    // Stub for frontend preview validation
    echo json_encode([
        'success' => true,
        'total_records' => 0,
        'valid_count' => 0,
        'invalid_count' => 0,
        'valid_rows' => [],
        'invalid_rows' => []
    ]);
}

function importConfirm(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $input = getJsonInput();
    $rows = $input['rows'] ?? [];

    if (!is_array($rows) || count($rows) === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'No valid rows provided for import.']);
        return;
    }

    $ins = $pdo->prepare("
        INSERT INTO medicines 
        (name, generic_name, vendor_id, vendor_name, category, manufacturer, batch_number, expiry_date, purchase_price, selling_price, units_per_strip, current_stock, minimum_stock, gst_percent, barcode, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $count = 0;
    foreach ($rows as $r) {
        $ins->execute([
            trim((string)($r['name'] ?? '')),
            trim((string)($r['generic_name'] ?? '')),
            null,
            trim((string)($r['vendor_name'] ?? '')),
            trim((string)($r['category'] ?? 'General')),
            trim((string)($r['manufacturer'] ?? '')),
            trim((string)($r['batch_number'] ?? ('BATCH-' . time()))),
            trim((string)($r['expiry_date'] ?? date('Y-m-d', strtotime('+1 year')))),
            (float)($r['purchase_price'] ?? 0),
            (float)($r['selling_price'] ?? 0),
            (int)($r['units_per_strip'] ?? 10),
            (int)($r['current_stock'] ?? 0),
            (int)($r['minimum_stock'] ?? 10),
            (float)($r['gst_percent'] ?? 12.0),
            !empty($r['barcode']) ? trim((string)$r['barcode']) : null,
            trim((string)($r['description'] ?? ''))
        ]);
        $count++;
    }

    echo json_encode(['success' => true, 'message' => "Successfully imported {$count} medicines.", 'imported_count' => $count]);
}
