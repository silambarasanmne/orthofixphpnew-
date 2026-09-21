<?php
// router.php - Local Development Router for PHP Built-in Server
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// 1. Serve existing static file directly
$filePath = __DIR__ . $uri;
if ($uri !== '/' && file_exists($filePath) && !is_dir($filePath)) {
    return false;
}

// 2. Route API requests to api/index.php
if (strpos($uri, '/api') === 0) {
    require __DIR__ . '/api/index.php';
    exit;
}

// 3. Clean SPA route mapping
$routes = [
    '/' => '/login.html',
    '/login' => '/login.html',
    '/billing' => '/billing.html',
    '/billing-manager' => '/billing-manager.html',
    '/dashboard' => '/dashboard.html',
    '/medicines' => '/medicines.html',
    '/history' => '/history.html',
    '/reports' => '/reports.html',
    '/users' => '/users.html',
    '/doctor' => '/doctor.html',
    '/patients' => '/patients.html',
    '/superadmin' => '/superadmin.html',
    '/register' => '/register.html',
    '/setup' => '/setup.php',
];

if (isset($routes[$uri])) {
    $target = __DIR__ . $routes[$uri];
    if (file_exists($target)) {
        require $target;
        exit;
    }
}

if (file_exists(__DIR__ . $uri . '.html')) {
    require __DIR__ . $uri . '.html';
    exit;
}

require __DIR__ . '/login.html';
