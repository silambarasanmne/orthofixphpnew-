<?php
/**
 * api/reports.php - Analytics & Reports API Routes
 * ORTHOFIX SPECIALITY CLINIC - PHP Edition
 */

function handleReportRoutes(PDO $pdo, string $subPath, string $method): void {
    if ($subPath === '/dashboard' && $method === 'GET') {
        getDashboardReports($pdo);
    } elseif ($subPath === '/date-wise' && $method === 'GET') {
        getDateWiseReport($pdo);
    } elseif ($subPath === '/yearly' && $method === 'GET') {
        getYearlyReport($pdo);
    } elseif ($subPath === '/export-sales-excel' && $method === 'GET') {
        exportSalesExcel($pdo);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Report endpoint not found']);
    }
}

function getDashboardReports(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $todayStr = date('Y-m-d');
    $monthStr = date('Y-m');
    $yearStr = date('Y');

    // 1. Revenue Summaries (Cash Only)
    $stmt1 = $pdo->prepare("SELECT SUM(grand_total) as total, COUNT(*) as count FROM sales WHERE date(created_at) = date(?) AND payment_method = 'Cash'");
    $stmt1->execute([$todayStr]);
    $todayRev = $stmt1->fetch();

    $stmt2 = $pdo->prepare("SELECT SUM(grand_total) as total, COUNT(*) as count FROM sales WHERE strftime('%Y-%m', created_at) = ? AND payment_method = 'Cash'");
    $stmt2->execute([$monthStr]);
    $monthRev = $stmt2->fetch();

    $stmt3 = $pdo->prepare("SELECT SUM(grand_total) as total, COUNT(*) as count FROM sales WHERE strftime('%Y', created_at) = ? AND payment_method = 'Cash'");
    $stmt3->execute([$yearStr]);
    $yearRev = $stmt3->fetch();

    $cashOverview = $pdo->query("
        SELECT 
            COUNT(*) as total_bills,
            COALESCE(SUM(grand_total), 0) as total_revenue,
            COALESCE(AVG(grand_total), 0) as avg_bill,
            COALESCE(SUM(discount_amount), 0) as total_discounts
        FROM sales
        WHERE payment_method = 'Cash'
    ")->fetch();

    // 2. Inventory Cards
    $totalMeds = (int)$pdo->query("SELECT COUNT(*) FROM medicines")->fetchColumn();
    $lowStock = (int)$pdo->query("SELECT COUNT(*) FROM medicines WHERE current_stock <= minimum_stock AND current_stock > 0")->fetchColumn();
    $outStock = (int)$pdo->query("SELECT COUNT(*) FROM medicines WHERE current_stock = 0")->fetchColumn();

    $in90Days = date('Y-m-d', strtotime('+90 days'));
    $stmtExp = $pdo->prepare("SELECT COUNT(*) FROM medicines WHERE expiry_date >= ? AND expiry_date <= ?");
    $stmtExp->execute([$todayStr, $in90Days]);
    $expiringSoon = (int)$stmtExp->fetchColumn();

    // 3. Chart Datasets (Cash Only)
    $dailySalesData = [];
    for ($i = 6; $i >= 0; $i--) {
        $dStr = date('Y-m-d', strtotime("-{$i} days"));
        $dLabel = date('D, M j', strtotime("-{$i} days"));
        $stmtD = $pdo->prepare("SELECT SUM(grand_total) as total FROM sales WHERE date(created_at) = date(?) AND payment_method = 'Cash'");
        $stmtD->execute([$dStr]);
        $sum = (float)($stmtD->fetchColumn() ?? 0);
        $dailySalesData[] = [
            'date' => $dStr,
            'label' => $dLabel,
            'sales' => $sum
        ];
    }

    $monthlySalesData = [];
    $monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for ($m = 1; $m <= 12; $m++) {
        $mPad = str_pad((string)$m, 2, '0', STR_PAD_LEFT);
        $key = "{$yearStr}-{$mPad}";
        $stmtM = $pdo->prepare("SELECT SUM(grand_total) as total FROM sales WHERE strftime('%Y-%m', created_at) = ? AND payment_method = 'Cash'");
        $stmtM->execute([$key]);
        $sum = (float)($stmtM->fetchColumn() ?? 0);
        $monthlySalesData[] = [
            'month' => $monthNames[$m - 1],
            'sales' => $sum
        ];
    }

    $topSelling = $pdo->query("
        SELECT si.medicine_name, SUM(si.quantity) as total_qty, SUM(si.total_price) as total_revenue
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.payment_method = 'Cash'
        GROUP BY si.medicine_name
        ORDER BY total_qty DESC
        LIMIT 5
    ")->fetchAll();

    echo json_encode([
        'success' => true,
        'revenue' => [
            'today' => (float)($todayRev['total'] ?? 0),
            'today_count' => (int)($todayRev['count'] ?? 0),
            'month' => (float)($monthRev['total'] ?? 0),
            'month_count' => (int)($monthRev['count'] ?? 0),
            'year' => (float)($yearRev['total'] ?? 0),
            'year_count' => (int)($yearRev['count'] ?? 0)
        ],
        'cash_summary' => [
            'total_bills' => (int)($cashOverview['total_bills'] ?? 0),
            'total_revenue' => (float)($cashOverview['total_revenue'] ?? 0),
            'avg_bill' => (float)($cashOverview['avg_bill'] ?? 0),
            'total_discounts' => (float)($cashOverview['total_discounts'] ?? 0)
        ],
        'inventory' => [
            'total_medicines' => $totalMeds,
            'low_stock' => $lowStock,
            'out_of_stock' => $outStock,
            'expiring_soon' => $expiringSoon
        ],
        'charts' => [
            'daily_sales' => $dailySalesData,
            'monthly_sales' => $monthlySalesData,
            'top_selling' => $topSelling
        ]
    ]);
}

function getDateWiseReport(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $fromDate = trim((string)($_GET['from_date'] ?? ''));
    $toDate = trim((string)($_GET['to_date'] ?? ''));

    $sql = "SELECT * FROM sales WHERE 1=1";
    $params = [];

    if (!empty($fromDate)) {
        $sql .= " AND date(created_at) >= date(?)";
        $params[] = $fromDate;
    }
    if (!empty($toDate)) {
        $sql .= " AND date(created_at) <= date(?)";
        $params[] = $toDate;
    }

    $sql .= " ORDER BY created_at DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $sales = $stmt->fetchAll();

    $totalBills = count($sales);
    $grossSales = 0;
    $totalDiscounts = 0;
    $netRevenue = 0;

    foreach ($sales as $s) {
        $grossSales += (float)$s['subtotal'];
        $totalDiscounts += (float)$s['discount_amount'];
        $netRevenue += (float)$s['grand_total'];
    }

    $avgBillValue = $totalBills > 0 ? ($netRevenue / $totalBills) : 0;

    echo json_encode([
        'success' => true,
        'summary' => [
            'total_bills' => $totalBills,
            'gross_sales' => $grossSales,
            'total_discounts' => $totalDiscounts,
            'net_revenue' => $netRevenue,
            'avg_bill_value' => $avgBillValue
        ],
        'sales' => $sales
    ]);
}

function getYearlyReport(PDO $pdo): void {
    $user = authenticateToken();
    requireAdmin($user);

    $year = trim((string)($_GET['year'] ?? date('Y')));
    $monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    $monthlyReport = [];
    $grandBills = 0;
    $grandGross = 0;
    $grandDiscounts = 0;
    $grandNet = 0;

    for ($m = 1; $m <= 12; $m++) {
        $mPad = str_pad((string)$m, 2, '0', STR_PAD_LEFT);
        $key = "{$year}-{$mPad}";

        $stmt = $pdo->prepare("
            SELECT COUNT(*) as bills, SUM(subtotal) as gross, SUM(discount_amount) as discount, SUM(grand_total) as net
            FROM sales
            WHERE strftime('%Y-%m', created_at) = ?
        ");
        $stmt->execute([$key]);
        $row = $stmt->fetch();

        $bills = (int)($row['bills'] ?? 0);
        $gross = (float)($row['gross'] ?? 0);
        $discount = (float)($row['discount'] ?? 0);
        $net = (float)($row['net'] ?? 0);

        $grandBills += $bills;
        $grandGross += $gross;
        $grandDiscounts += $discount;
        $grandNet += $net;

        $monthlyReport[] = [
            'month_index' => $m,
            'month_name' => $monthNames[$m - 1],
            'bills_count' => $bills,
            'gross_sales' => $gross,
            'discount_amount' => $discount,
            'net_revenue' => $net
        ];
    }

    echo json_encode([
        'success' => true,
        'year' => (int)$year,
        'totals' => [
            'total_bills' => $grandBills,
            'gross_sales' => $grandGross,
            'total_discounts' => $grandDiscounts,
            'net_revenue' => $grandNet
        ],
        'months' => $monthlyReport
    ]);
}

function exportSalesExcel(PDO $pdo): void {
    authenticateToken();

    $fromDate = trim((string)($_GET['from_date'] ?? ''));
    $toDate = trim((string)($_GET['to_date'] ?? ''));

    $sql = "SELECT * FROM sales WHERE 1=1";
    $params = [];

    if (!empty($fromDate)) {
        $sql .= " AND date(created_at) >= date(?)";
        $params[] = $fromDate;
    }
    if (!empty($toDate)) {
        $sql .= " AND date(created_at) <= date(?)";
        $params[] = $toDate;
    }

    $sql .= " ORDER BY id DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $sales = $stmt->fetchAll();

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="Sales_Report_' . date('Y-m-d') . '.csv"');

    $out = fopen('php://output', 'w');
    fputcsv($out, ['Invoice Number', 'Date & Time', 'Customer Name', 'Customer Phone', 'Subtotal (INR)', 'Discount (INR)', 'Grand Total (INR)', 'Payment Method', 'Worker / Cashier']);

    foreach ($sales as $s) {
        fputcsv($out, [
            $s['invoice_number'],
            $s['created_at'],
            $s['customer_name'] ?? 'Walk-in',
            $s['customer_phone'] ?? '',
            $s['subtotal'],
            $s['discount_amount'],
            $s['grand_total'],
            $s['payment_method'],
            $s['worker_name']
        ]);
    }

    fclose($out);
    exit;
}
