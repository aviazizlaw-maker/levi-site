<?php
// Case details sent from the site's tools (e.g. the flight compensation simulator) to the office.
// Saved outside public_html and emailed to the lawyer. Only POST is accepted.

$DATA = dirname(__DIR__, 2) . '/levi-data';
if (!is_dir($DATA)) { @mkdir($DATA, 0700, true); }
$FILE = $DATA . '/leads.json';
$RATE = $DATA . '/lead-rate.json';
$KEYF = $DATA . '/secret.key';
$LOCK = $DATA . '/.lock';
$NOTIFY = 'shlomilevi11@gmail.com';

if (!file_exists($KEYF)) { file_put_contents($KEYF, bin2hex(random_bytes(32))); @chmod($KEYF, 0600); }
$KEY = trim(file_get_contents($KEYF));

function load_json($f) { $j = @file_get_contents($f); $a = $j ? json_decode($j, true) : []; return is_array($a) ? $a : []; }
function save_json($f, $a) { $t = $f . '.tmp'; file_put_contents($t, json_encode($a, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); @chmod($t, 0600); rename($t, $f); }
function out($code, $a) { http_response_code($code); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }
function with_lock($lock, $fn) { $fp = fopen($lock, 'c'); flock($fp, LOCK_EX); try { return $fn(); } finally { flock($fp, LOCK_UN); fclose($fp); } }
function ulen($s) { return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s); }
function clean($s, $max) { $s = trim(str_replace("\r", '', strip_tags((string)$s))); return function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max); }

header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['error' => 'method']);
$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) out(400, ['error' => 'format']);
if (!empty($in['website'])) out(200, ['ok' => true]);                    // honeypot

$name = clean($in['name'] ?? '', 60);
$phone = preg_replace('/[^0-9+\- ]/', '', (string)($in['phone'] ?? ''));
$email = clean($in['email'] ?? '', 120);
$note = clean($in['note'] ?? '', 1500);
$summary = clean($in['summary'] ?? '', 4000);
$tool = preg_replace('/[^a-z0-9-]/', '', (string)($in['tool'] ?? 'site'));
$lang = in_array($in['lang'] ?? '', ['he', 'fr', 'en'], true) ? $in['lang'] : 'he';

if (empty($in['consent'])) out(400, ['error' => 'consent']);
if (ulen($name) < 2) out(400, ['error' => 'name']);
$digits = preg_replace('/\D/', '', $phone);
if (strlen($digits) < 9 || strlen($digits) > 15) out(400, ['error' => 'phone']);
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) out(400, ['error' => 'email']);
if (ulen($summary) < 10) out(400, ['error' => 'summary']);

$ipKey = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? '', $KEY);
$now = time();
$limited = with_lock($LOCK, function () use ($RATE, $ipKey, $now) {
  $rate = load_json($RATE);
  foreach ($rate as $k => $ts) { $rate[$k] = array_values(array_filter($ts, function ($t) use ($now) { return $t > $now - 86400; })); if (!$rate[$k]) unset($rate[$k]); }
  $hit = count($rate[$ipKey] ?? []) >= 5;
  if (!$hit) $rate[$ipKey][] = $now;
  save_json($RATE, $rate);
  return $hit;
});
if ($limited) out(429, ['error' => 'rate']);

$lead = ['id' => bin2hex(random_bytes(6)), 'time' => date('Y-m-d H:i'), 'tool' => $tool, 'lang' => $lang, 'name' => $name, 'phone' => $phone, 'email' => $email, 'summary' => $summary, 'note' => $note];
with_lock($LOCK, function () use ($FILE, $lead) { $all = load_json($FILE); $all[] = $lead; save_json($FILE, array_slice($all, -1000)); });

$wa = 'https://wa.me/' . preg_replace('/^0/', '972', $digits);
$body = "פנייה חדשה מהאתר ($tool)\n\nשם: $name\nטלפון: $phone\nוואטסאפ: $wa\n" . ($email ? "מייל: $email\n" : '') . "שפה: $lang\nזמן: {$lead['time']}\n\n--- פרטי המקרה ---\n$summary\n" . ($note ? "\n--- הערות הפונה ---\n$note\n" : '') . "\nהפונה אישר/ה שהפרטים יועברו לעורך הדין.\n";
$headers = "From: =?UTF-8?B?" . base64_encode('אתר עו"ד לוי') . "?= <noreply@levi-adv.co.il>\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
if ($email) $headers .= "\r\nReply-To: $email";
$sent = @mail($NOTIFY, '=?UTF-8?B?' . base64_encode('פנייה חדשה מהסימולטור: ' . $name) . '?=', $body, $headers);

out(200, ['ok' => true, 'mailed' => (bool)$sent]);
