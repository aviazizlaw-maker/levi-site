<?php
// Client reviews for levi-adv.co.il. Stores reviews outside public_html and publishes them at once.
// GET            -> JSON list of published reviews
// POST (JSON)    -> add a review
// GET ?del&t     -> confirmation page for removing a review (link sent by email)
// POST del,t     -> remove the review

$DATA = dirname(__DIR__, 2) . '/levi-data';
if (!is_dir($DATA)) { @mkdir($DATA, 0700, true); }
$FILE = $DATA . '/reviews.json';
$RATE = $DATA . '/rate.json';
$KEYF = $DATA . '/secret.key';
$LOCK = $DATA . '/.lock';
$NOTIFY = 'shlomilevi11@gmail.com';
$SITE = 'https://levi-adv.co.il';

if (!file_exists($KEYF)) { file_put_contents($KEYF, bin2hex(random_bytes(32))); @chmod($KEYF, 0600); }
$KEY = trim(file_get_contents($KEYF));

function load_json($f) { $j = @file_get_contents($f); $a = $j ? json_decode($j, true) : []; return is_array($a) ? $a : []; }
function save_json($f, $a) { $t = $f . '.tmp'; file_put_contents($t, json_encode($a, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)); rename($t, $f); }
function out($code, $a) { http_response_code($code); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }
function page($title, $inner) {
  header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store'); header('X-Robots-Tag: noindex');
  echo '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' . htmlspecialchars($title) . '</title>'
     . '<body style="font-family:system-ui,Arial,sans-serif;background:#F5F3ED;color:#10233F;padding:40px 20px;max-width:640px;margin:auto"><h1>' . htmlspecialchars($title) . '</h1>' . $inner . '</body></html>';
  exit;
}
function with_lock($lock, $fn) { $fp = fopen($lock, 'c'); flock($fp, LOCK_EX); try { return $fn(); } finally { flock($fp, LOCK_UN); fclose($fp); } }
function ulen($s) { return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen(utf8_decode($s)); }

header('X-Content-Type-Options: nosniff');
$m = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// ---- removal (link from the notification email)
if (isset($_GET['del']) || isset($_POST['del'])) {
  $id = preg_replace('/[^a-f0-9]/', '', $_POST['del'] ?? $_GET['del']);
  $t = (string)($_POST['t'] ?? $_GET['t'] ?? '');
  if (!$id || !hash_equals(hash_hmac('sha256', $id, $KEY), $t)) { http_response_code(403); page('קישור לא תקין', '<p>הקישור להסרת ההמלצה אינו תקין.</p>'); }
  if ($m !== 'POST') {
    $r = null; foreach (load_json($FILE) as $x) { if ($x['id'] === $id) $r = $x; }
    if (!$r) page('ההמלצה כבר אינה באתר', '<p>לא נמצאה המלצה כזו. ייתכן שכבר הוסרה.</p>');
    page('הסרת המלצה מהאתר', '<p><b>' . htmlspecialchars($r['name']) . '</b> (' . intval($r['rating']) . '/5)</p><blockquote style="background:#fff;padding:16px;border-radius:12px">' . nl2br(htmlspecialchars($r['text'])) . '</blockquote>'
      . '<form method="post"><input type="hidden" name="del" value="' . $id . '"><input type="hidden" name="t" value="' . htmlspecialchars($t) . '"><button style="font-size:18px;padding:12px 22px;border:0;border-radius:999px;background:#10233F;color:#fff;cursor:pointer">להסיר את ההמלצה מהאתר</button></form>');
  }
  with_lock($LOCK, function () use ($FILE, $id) { save_json($FILE, array_values(array_filter(load_json($FILE), function ($x) use ($id) { return $x['id'] !== $id; }))); });
  page('ההמלצה הוסרה', '<p>ההמלצה הוסרה מהאתר.</p><p><a href="https://levi-adv.co.il/review.html">לעמוד ההמלצות</a></p>');
}

// ---- list
if ($m === 'GET') {
  $pub = array_map(function ($r) { return ['name' => $r['name'], 'rating' => $r['rating'], 'text' => $r['text'], 'date' => $r['date']]; }, array_reverse(load_json($FILE)));
  out(200, ['reviews' => array_slice($pub, 0, 60)]);
}
if ($m !== 'POST') out(405, ['error' => 'method']);

// ---- add
$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) $in = $_POST;
if (!empty($in['website'])) out(200, ['ok' => true]);                 // honeypot: silently ignore bots
$name = trim(preg_replace('/\s+/u', ' ', strip_tags((string)($in['name'] ?? ''))));
$text = trim(preg_replace("/[ \t]+/u", ' ', strip_tags((string)($in['text'] ?? ''))));
$text = preg_replace("/\n{3,}/", "\n\n", str_replace("\r", '', $text));
$rating = intval($in['rating'] ?? 0);
$lang = in_array($in['lang'] ?? '', ['he', 'fr', 'en'], true) ? $in['lang'] : 'he';
if (empty($in['consent'])) out(400, ['error' => 'consent']);
if ($rating < 1 || $rating > 5) out(400, ['error' => 'rating']);
if (ulen($name) < 2 || ulen($name) > 40) out(400, ['error' => 'name']);
if (ulen($text) < 10 || ulen($text) > 800) out(400, ['error' => 'text']);
if (preg_match('~(https?:|www\.|\.(com|co\.il|net|org|io|ru)\b|@)~i', $name . ' ' . $text)) out(400, ['error' => 'links']);

$ipKey = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? '', $KEY);
$now = time();
$limited = with_lock($LOCK, function () use ($RATE, $ipKey, $now) {
  $rate = load_json($RATE);
  foreach ($rate as $k => $ts) { $rate[$k] = array_values(array_filter($ts, function ($t) use ($now) { return $t > $now - 86400; })); if (!$rate[$k]) unset($rate[$k]); }
  $hit = count($rate[$ipKey] ?? []) >= 3;
  if (!$hit) $rate[$ipKey][] = $now;
  save_json($RATE, $rate);
  return $hit;
});
if ($limited) out(429, ['error' => 'rate']);

$id = bin2hex(random_bytes(8));
$review = ['id' => $id, 'name' => $name, 'rating' => $rating, 'text' => $text, 'lang' => $lang, 'date' => date('Y-m-d')];
with_lock($LOCK, function () use ($FILE, $review) { $all = load_json($FILE); $all[] = $review; save_json($FILE, array_slice($all, -500)); });

$link = $SITE . '/api/review.php?del=' . $id . '&t=' . hash_hmac('sha256', $id, $KEY);
$body = "התקבלה המלצה חדשה באתר והיא כבר מפורסמת בעמוד ההמלצות.\n\nשם: $name\nדירוג: $rating/5\n\n$text\n\nלהסרת ההמלצה מהאתר:\n$link\n";
@mail($NOTIFY, '=?UTF-8?B?' . base64_encode('המלצה חדשה באתר: ' . $name . ' (' . $rating . '/5)') . '?=', $body,
  "From: =?UTF-8?B?" . base64_encode('אתר עו"ד לוי') . "?= <noreply@levi-adv.co.il>\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit");

out(200, ['ok' => true, 'review' => ['name' => $name, 'rating' => $rating, 'text' => $text, 'date' => $review['date']]]);
