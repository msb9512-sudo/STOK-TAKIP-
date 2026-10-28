<?php
// BarStock Management API
// UTF-8 & JSON Headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

$dataFile = __DIR__ . '/data.json';

// Initialize default data structure if data.json does not exist
if (!file_exists($dataFile)) {
    $initialData = [
        'products' => [],
        'inventory' => [
            'store' => [],
            'bar' => []
        ],
        'transactions' => [],
        'categories' => ['Bira', 'Şarap', 'Alkollü İçki', 'Meşrubat', 'Kokteyl', 'Atıştırmalık', 'Genel'],
        'users' => [
            [
                'username' => 'yonetici',
                'password' => '1453',
                'name' => 'Sistem Yöneticisi',
                'role' => 'MANAGER'
            ],
            [
                'username' => 'depocu',
                'password' => '1453',
                'name' => 'Depo Sorumlusu',
                'role' => 'STORE_OWNER'
            ],
            [
                'username' => 'barmen',
                'password' => '1453',
                'name' => 'Ana Bar Barmen',
                'role' => 'BARTENDER'
            ]
        ],
        'orders' => []
    ];
    @file_put_contents($dataFile, json_encode($initialData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function loadData($dataFile) {
    if (!file_exists($dataFile)) {
        return [
            'products' => [],
            'inventory' => ['store' => [], 'bar' => []],
            'transactions' => [],
            'categories' => ['Bira', 'Şarap', 'Alkollü İçki', 'Meşrubat', 'Kokteyl', 'Atıştırmalık', 'Genel'],
            'users' => [],
            'orders' => []
        ];
    }
    $raw = @file_get_contents($dataFile);
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = [
            'products' => [],
            'inventory' => ['store' => [], 'bar' => []],
            'transactions' => [],
            'categories' => ['Bira', 'Şarap', 'Alkollü İçki', 'Meşrubat', 'Kokteyl', 'Atıştırmalık', 'Genel'],
            'users' => [],
            'orders' => []
        ];
    }
    return $data;
}

function saveData($dataFile, $data) {
    return @file_put_contents($dataFile, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

$action = isset($_GET['action']) ? trim($_GET['action']) : '';
$method = $_SERVER['REQUEST_METHOD'];
$requestBody = json_decode(file_get_contents('php://input'), true);

$data = loadData($dataFile);

switch ($action) {
    case 'sync':
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit(0);

    case 'save_product':
        if ($method === 'POST' && is_array($requestBody)) {
            $prod = $requestBody;
            $found = false;
            foreach ($data['products'] as &$p) {
                if (isset($p['id']) && $p['id'] === $prod['id']) {
                    $p = array_merge($p, $prod);
                    $found = true;
                    break;
                }
            }
            if (!$found && isset($prod['id'])) {
                $data['products'][] = $prod;
                // Add initial inventory placeholders if not exist
                $storeFound = false;
                foreach ($data['inventory']['store'] as $s) {
                    if ($s['productId'] === $prod['id']) { $storeFound = true; break; }
                }
                if (!$storeFound) {
                    $data['inventory']['store'][] = ['productId' => $prod['id'], 'quantity' => 0];
                }
                $barFound = false;
                foreach ($data['inventory']['bar'] as $b) {
                    if ($b['productId'] === $prod['id']) { $barFound = true; break; }
                }
                if (!$barFound) {
                    $data['inventory']['bar'][] = ['productId' => $prod['id'], 'quantity' => 0];
                }
            }
            saveData($dataFile, $data);
            echo json_encode(['success' => true, 'product' => $prod], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
        break;

    case 'delete_product':
        if ($method === 'POST' && isset($requestBody['id'])) {
            $id = $requestBody['id'];
            $data['products'] = array_values(array_filter($data['products'], function($p) use ($id) {
                return $p['id'] !== $id;
            }));
            $data['inventory']['store'] = array_values(array_filter($data['inventory']['store'], function($i) use ($id) {
                return $i['productId'] !== $id;
            }));
            $data['inventory']['bar'] = array_values(array_filter($data['inventory']['bar'], function($i) use ($id) {
                return $i['productId'] !== $id;
            }));
            saveData($dataFile, $data);
            echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
        break;

    case 'save_transaction':
        if ($method === 'POST' && isset($requestBody['transaction'])) {
            $t = $requestBody['transaction'];
            array_unshift($data['transactions'], $t);

            // Update inventory in sync
            $productId = $t['productId'] ?? null;
            $qty = floatval($t['quantity'] ?? 0);
            $type = $t['type'] ?? '';

            if ($productId) {
                if ($type === 'PURCHASE') {
                    $found = false;
                    foreach ($data['inventory']['store'] as &$item) {
                        if ($item['productId'] === $productId) {
                            $item['quantity'] = floatval($item['quantity']) + $qty;
                            $found = true;
                            break;
                        }
                    }
                    if (!$found) {
                        $data['inventory']['store'][] = ['productId' => $productId, 'quantity' => $qty];
                    }
                } elseif ($type === 'TRANSFER') {
                    foreach ($data['inventory']['store'] as &$item) {
                        if ($item['productId'] === $productId) {
                            $item['quantity'] = max(0, floatval($item['quantity']) - $qty);
                            break;
                        }
                    }
                    $barFound = false;
                    foreach ($data['inventory']['bar'] as &$item) {
                        if ($item['productId'] === $productId) {
                            $item['quantity'] = floatval($item['quantity']) + $qty;
                            $barFound = true;
                            break;
                        }
                    }
                    if (!$barFound) {
                        $data['inventory']['bar'][] = ['productId' => $productId, 'quantity' => $qty];
                    }
                } elseif ($type === 'SALE' || $type === 'WASTE') {
                    foreach ($data['inventory']['bar'] as &$item) {
                        if ($item['productId'] === $productId) {
                            $item['quantity'] = max(0, floatval($item['quantity']) - $qty);
                            break;
                        }
                    }
                } elseif ($type === 'COUNT_ADJUSTMENT') {
                    $location = $t['location'] ?? 'store';
                    if (isset($data['inventory'][$location])) {
                        foreach ($data['inventory'][$location] as &$item) {
                            if ($item['productId'] === $productId) {
                                $item['quantity'] = $qty;
                                break;
                            }
                        }
                    }
                }
            }

            saveData($dataFile, $data);
            echo json_encode(['success' => true, 'transaction' => $t], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
        break;

    case 'register_user':
        if ($method === 'POST' && isset($requestBody['username'])) {
            $user = $requestBody;
            $exists = false;
            foreach ($data['users'] as &$u) {
                if ($u['username'] === $user['username']) {
                    $u = array_merge($u, $user);
                    $exists = true;
                    break;
                }
            }
            if (!$exists) {
                $data['users'][] = $user;
            }
            saveData($dataFile, $data);
            echo json_encode(['success' => true, 'user' => $user], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
        break;

    case 'update_user':
        if ($method === 'POST' && isset($requestBody['username'])) {
            $uName = $requestBody['username'];
            foreach ($data['users'] as &$u) {
                if ($u['username'] === $uName) {
                    $u = array_merge($u, $requestBody);
                    break;
                }
            }
            saveData($dataFile, $data);
            echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
        break;

    case 'delete_user':
        if ($method === 'POST' && isset($requestBody['username'])) {
            $uName = $requestBody['username'];
            $data['users'] = array_values(array_filter($data['users'], function($u) use ($uName) {
                return $u['username'] !== $uName;
            }));
            saveData($dataFile, $data);
            echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
        break;

    case 'create_order':
        if ($method === 'POST' && is_array($requestBody)) {
            $newOrder = $requestBody;
            $data['orders'][] = $newOrder;
            saveData($dataFile, $data);
            echo json_encode(['success' => true, 'order' => $newOrder], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
        break;

    case 'update_order':
        if ($method === 'POST' && isset($requestBody['id'])) {
            $orderId = $requestBody['id'];
            foreach ($data['orders'] as &$ord) {
                if ($ord['id'] === $orderId) {
                    $ord = array_merge($ord, $requestBody);
                    break;
                }
            }
            saveData($dataFile, $data);
            echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
        break;

    case 'save_stock_count':
        if ($method === 'POST' && is_array($requestBody)) {
            $session = $requestBody;
            if (!isset($data['stockCounts']) || !is_array($data['stockCounts'])) {
                $data['stockCounts'] = [];
            }
            $found = false;
            foreach ($data['stockCounts'] as &$sc) {
                if (isset($sc['id']) && $sc['id'] === $session['id']) {
                    $sc = array_merge($sc, $session);
                    $found = true;
                    break;
                }
            }
            if (!$found && isset($session['id'])) {
                array_unshift($data['stockCounts'], $session);
            }
            saveData($dataFile, $data);
            echo json_encode(['success' => true, 'stockCount' => $session], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
        break;

    case 'delete_stock_count':
        if ($method === 'POST' && isset($requestBody['id'])) {
            $scId = $requestBody['id'];
            if (isset($data['stockCounts']) && is_array($data['stockCounts'])) {
                $data['stockCounts'] = array_values(array_filter($data['stockCounts'], function($sc) use ($scId) {
                    return $sc['id'] !== $scId;
                }));
            }
            saveData($dataFile, $data);
            echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
            exit(0);
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Geçersiz istek veya bilinmeyen action: ' . htmlspecialchars($action)], JSON_UNESCAPED_UNICODE);
        exit(0);
}
