<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$DATA = __DIR__ . '/data.json';
$BAK  = __DIR__ . '/data.json.bak';
$PASS = __DIR__ . '/.fanoos_admin_hash';

function blank_store(): array {
    return ['version' => 4, 'shared' => ['systemPromptOverride' => ''], 'devices' => []];
}
function load_store_raw(): ?array {
    global $DATA;
    if (!file_exists($DATA)) return null;
    $j = json_decode((string)file_get_contents($DATA), true);
    return is_array($j) ? $j : null;
}
function save_store(array $s): bool {
    global $DATA, $BAK;
    if (file_exists($DATA)) @copy($DATA, $BAK);
    $s['devices'] = (object)$s['devices'];
    $tmp  = $DATA . '.tmp.' . getmypid();
    $json = json_encode($s, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $ok   = $json !== false && file_put_contents($tmp, $json, LOCK_EX) !== false;
    if ($ok) $ok = rename($tmp, $DATA);
    else @unlink($tmp);
    return $ok;
}
function ensure_store(?string $request_device): array {
    $s = load_store_raw();
    if ($s === null) return blank_store();
    if (isset($s['chats'])) {
        $dev = $request_device ?: 'migrated-device';
        $s = [
            'version'  => 4,
            'shared'   => ['systemPromptOverride' => (string)($s['settings']['systemPromptOverride'] ?? '')],
            'devices'  => [$dev => [
                'name'      => 'This device (migrated)',
                'firstSeen' => date('c'),
                'lastSeen'  => date('c'),
                'data'      => $s,
            ]],
        ];
        save_store($s);
    }
    $s['devices'] = (array)($s['devices'] ?? []);
    $s['shared']  = (array)($s['shared'] ?? ['systemPromptOverride' => '']);
    return $s;
}
function check_admin_pass(array $body): bool {
    global $PASS;
    if (!file_exists($PASS)) return true;
    return password_verify((string)($body['password'] ?? ''), (string)file_get_contents($PASS));
}

$action = $_GET['action'] ?? '';
$device = isset($_GET['device']) ? (string)$_GET['device'] : null;
$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $decoded = json_decode((string)file_get_contents('php://input'), true);
    $body = is_array($decoded) ? $decoded : [];
    if ($action === '') $action = (string)($body['action'] ?? '');
}

switch ($action) {
    case 'ping':
        $s = ensure_store($device);
        echo json_encode(['ok' => true, 'engine' => 'php', 'php' => PHP_VERSION, 'devices' => count($s['devices'])]);
        break;

    case 'save':
        $dev  = (string)($body['device'] ?? '');
        $data = $body['data'] ?? null;
        if ($dev === '' || !is_array($data)) { http_response_code(400); echo '{"ok":false,"error":"device + data required"}'; break; }
        $s = ensure_store(null);
        $prev = $s['devices'][$dev] ?? null;
        $s['devices'][$dev] = [
            'name'      => (string)($body['device_name'] ?? 'Unknown device'),
            'firstSeen' => $prev['firstSeen'] ?? date('c'),
            'lastSeen'  => date('c'),
            'data'      => $data,
        ];
        echo json_encode(['ok' => save_store($s), 'device' => $dev]);
        break;

    case 'admin_check':
        echo json_encode(['has_password' => file_exists($PASS)]);
        break;

    case 'admin_set_pass':
        $pw = (string)($body['password'] ?? '');
        if (strlen($pw) < 4) { http_response_code(400); echo '{"ok":false,"error":"password too short"}'; break; }
        file_put_contents($PASS, password_hash($pw, PASSWORD_DEFAULT));
        echo json_encode(['ok' => true]);
        break;

    case 'admin_verify':
        echo json_encode(['ok' => check_admin_pass($body)]);
        break;

    case 'admin_get_system':
        $s = ensure_store(null);
        echo json_encode(['system_prompt' => (string)($s['shared']['systemPromptOverride'] ?? '')]);
        break;

    case 'admin_set_system':
        if (!check_admin_pass($body)) { http_response_code(403); echo '{"ok":false,"error":"wrong password"}'; break; }
        $s  = ensure_store(null);
        $sp = (string)($body['system_prompt'] ?? '');
        $s['shared']['systemPromptOverride'] = $sp;
        foreach ($s['devices'] as $id => $dev) {
            if (isset($dev['data']['settings'])) $s['devices'][$id]['data']['settings']['systemPromptOverride'] = $sp;
        }
        echo json_encode(['ok' => save_store($s)]);
        break;

    default:
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $s = ensure_store($device);
            if ($device !== null) {
                echo json_encode([
                    'data'        => $s['devices'][$device]['data'] ?? null,
                    'shared'      => $s['shared'],
                    'device_name' => $s['devices'][$device]['name'] ?? null,
                ]);
            } else {
                echo json_encode($s);
            }
        } else {
            http_response_code(400);
            echo '{"error":"unknown action"}';
        }
}