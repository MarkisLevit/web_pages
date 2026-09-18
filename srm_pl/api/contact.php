<?php
/**
 * Solid Rock Mission Polska — contact form handler
 *
 * Receives POSTs from /kontakt.html (PL) and /en/contact.html (EN), relays the
 * message over authenticated SMTP, then redirects to the thank-you page.
 *
 * Credentials live in /etc/srm/smtp.conf — outside the web root, mode 0640.
 * Nothing secret is stored in this file, so it is safe to keep in the repo.
 *
 * Why an SMTP relay rather than mail(): Hostinger, like nearly every VPS
 * provider, blocks outbound port 25. Mail sent straight from a VPS IP with no
 * SPF or DKIM record lands in spam. Relaying through an authenticated provider
 * is what actually makes these messages arrive.
 */

declare(strict_types=1);

const CONFIG_PATH = '/etc/srm/smtp.conf';
const RATE_DIR    = '/var/lib/srm/ratelimit';
const RATE_MAX    = 5;      // submissions ...
const RATE_WINDOW = 3600;   // ... per hour, per IP

/* ---------------------------------------------------------------- helpers */

/** Strip CR/LF so user input can never inject extra mail headers. */
function clean(string $v, int $max = 200): string
{
    $v = str_replace(["\r", "\n", "\0"], ' ', $v);
    $v = trim((string) preg_replace('/\s+/u', ' ', $v));
    return mb_substr($v, 0, $max);
}

function fail(int $code, string $msg): void
{
    error_log('[srm-contact] ' . $msg);
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    if ($code === 429) {
        exit("Zbyt wiele wiadomosci. Sprobuj ponownie za godzine.\nToo many messages. Please try again in an hour.\n");
    }
    exit("Nie udalo sie wyslac wiadomosci. Napisz na solidrockmission@gmail.com\nCould not send the message. Please email solidrockmission@gmail.com\n");
}

/** Encode a header value that may contain non-ASCII (Polish diacritics). */
function mime_header(string $v): string
{
    return preg_match('/[\x80-\xFF]/', $v)
        ? '=?UTF-8?B?' . base64_encode($v) . '?='
        : $v;
}

/* ------------------------------------------------------------ rate limit */

function rate_limit(string $ip): void
{
    if (!is_dir(RATE_DIR) && !@mkdir(RATE_DIR, 0700, true)) {
        return; // storage unavailable: fail open rather than block real people
    }

    $file = RATE_DIR . '/' . hash('sha256', $ip);
    $now  = time();
    $hits = [];

    if (is_readable($file)) {
        foreach (explode(',', (string) file_get_contents($file)) as $t) {
            $t = (int) $t;
            if ($t > $now - RATE_WINDOW) {
                $hits[] = $t;
            }
        }
    }

    if (count($hits) >= RATE_MAX) {
        fail(429, 'rate limit hit for ' . substr(hash('sha256', $ip), 0, 12));
    }

    $hits[] = $now;
    @file_put_contents($file, implode(',', $hits), LOCK_EX);
}

/* ------------------------------------------------- minimal SMTP client */

final class Smtp
{
    /** @var resource */
    private $fp;

    private string $host;
    private int $port;
    private string $user;
    private string $pass;
    private int $timeout;

    public function __construct(string $host, int $port, string $user, string $pass, int $timeout = 15)
    {
        $this->host    = $host;
        $this->port    = $port;
        $this->user    = $user;
        $this->pass    = $pass;
        $this->timeout = $timeout;
    }

    /** Read one reply, following multi-line continuations such as "250-STARTTLS". */
    private function read(): array
    {
        $lines = [];
        do {
            $line = fgets($this->fp, 1024);
            if ($line === false) {
                throw new RuntimeException('connection closed by server');
            }
            $lines[] = rtrim($line);
        } while (isset($line[3]) && $line[3] === '-');

        $last = $lines[count($lines) - 1];
        return [(int) substr($last, 0, 3), implode(' | ', $lines)];
    }

    private function cmd(string $line, int ...$expect): void
    {
        fwrite($this->fp, $line . "\r\n");
        list($code, $reply) = $this->read();
        if (!in_array($code, $expect, true)) {
            throw new RuntimeException('expected ' . implode('/', $expect) . ', got: ' . $reply);
        }
    }

    public function send(
        string $fromEmail,
        string $fromName,
        string $to,
        string $replyTo,
        string $subject,
        string $body
    ): void {
        // Port 465 is implicit TLS; 587 starts in plaintext and upgrades via STARTTLS.
        $scheme = $this->port === 465 ? 'ssl://' : 'tcp://';
        $ctx    = stream_context_create([
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);

        $fp = @stream_socket_client(
            $scheme . $this->host . ':' . $this->port,
            $errno,
            $errstr,
            $this->timeout,
            STREAM_CLIENT_CONNECT,
            $ctx
        );
        if ($fp === false) {
            throw new RuntimeException('connect failed: ' . $errstr . ' (' . $errno . ')');
        }

        $this->fp = $fp;
        stream_set_timeout($this->fp, $this->timeout);

        list($code, $reply) = $this->read();
        if ($code !== 220) {
            throw new RuntimeException('bad greeting: ' . $reply);
        }

        $ehlo = gethostname() ?: 'localhost';
        $this->cmd('EHLO ' . $ehlo, 250);

        if ($this->port !== 465) {
            $this->cmd('STARTTLS', 220);
            if (!stream_socket_enable_crypto($this->fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('TLS negotiation failed');
            }
            $this->cmd('EHLO ' . $ehlo, 250); // must re-introduce after upgrading
        }

        $this->cmd('AUTH LOGIN', 334);
        $this->cmd(base64_encode($this->user), 334);
        $this->cmd(base64_encode($this->pass), 235);

        $this->cmd('MAIL FROM:<' . $fromEmail . '>', 250);
        $this->cmd('RCPT TO:<' . $to . '>', 250, 251);
        $this->cmd('DATA', 354);

        $headers = [
            'From: ' . mime_header($fromName) . ' <' . $fromEmail . '>',
            'To: <' . $to . '>',
            'Reply-To: <' . $replyTo . '>',
            'Subject: ' . mime_header($subject),
            'Date: ' . date(DATE_RFC2822),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $this->host . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            'X-Mailer: srm-contact',
        ];

        $payload = implode("\r\n", $headers) . "\r\n\r\n"
                 . chunk_split(base64_encode($body), 76, "\r\n");

        // Dot-stuffing: a lone "." on its own line would end DATA prematurely.
        $payload = (string) preg_replace('/^\./m', '..', $payload);

        fwrite($this->fp, $payload . "\r\n.\r\n");

        list($code, $reply) = $this->read();
        if ($code !== 250) {
            throw new RuntimeException('message rejected: ' . $reply);
        }

        @fwrite($this->fp, "QUIT\r\n");
        @fclose($this->fp);
    }
}

/* ------------------------------------------------------------------ main */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Location: /', true, 303);
    exit;
}

$lang    = (($_POST['lang'] ?? 'pl') === 'en') ? 'en' : 'pl';
$success = $lang === 'en' ? '/en/thank-you.html' : '/dziekujemy.html';

// Honeypot: a real person never sees this field, so anything in it is a bot.
// Redirect as if it worked — telling spammers they were caught invites tuning.
if (trim((string) ($_POST['bot-field'] ?? '')) !== '') {
    header('Location: ' . $success, true, 303);
    exit;
}

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
rate_limit($ip);

if (!is_readable(CONFIG_PATH)) {
    fail(500, 'missing ' . CONFIG_PATH . ' — run server-setup.sh');
}

$cfg = parse_ini_file(CONFIG_PATH);
if ($cfg === false) {
    fail(500, 'could not parse ' . CONFIG_PATH);
}
foreach (['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'from_email', 'to_email'] as $k) {
    if (empty($cfg[$k])) {
        fail(500, "config key '" . $k . "' is missing or empty");
    }
}

// The PL and EN forms use different field names; accept either.
$name    = clean((string) ($_POST['imie']     ?? $_POST['name']    ?? ''));
$email   = clean((string) ($_POST['email']    ?? ''));
$phone   = clean((string) ($_POST['telefon']  ?? $_POST['phone']   ?? ''), 40);
$topic   = clean((string) ($_POST['temat']    ?? $_POST['subject'] ?? ''));
$message = trim((string) ($_POST['wiadomosc'] ?? $_POST['message'] ?? ''));

if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail(400, 'validation failed (name/email/message)');
}

// The consent box carries `required`, but that is enforced only by the browser.
// RODO expects consent to actually be given, so re-check it server side and
// record it in the message that gets delivered.
if (!isset($_POST['zgoda']) && !isset($_POST['consent'])) {
    fail(400, 'consent checkbox not submitted');
}
$message = mb_substr(str_replace("\r\n", "\n", $message), 0, 5000);

$rule = str_repeat('-', 52);
$body = "Nowa wiadomosc ze strony / New message from the website\n"
      . $rule . "\n\n"
      . 'Imie / Name:     ' . $name . "\n"
      . 'E-mail:          ' . $email . "\n"
      . ($phone !== '' ? 'Telefon / Phone: ' . $phone . "\n" : '')
      . 'Temat / Subject: ' . $topic . "\n"
      . 'Jezyk / Form:    ' . strtoupper($lang) . "\n"
      . "Zgoda RODO:      tak / consent recorded via the form\n\n"
      . $rule . "\n\n"
      . $message . "\n\n"
      . $rule . "\n"
      . 'Wyslano / Sent: ' . date('Y-m-d H:i:s T') . "\n"
      . 'IP: ' . $ip . "\n"
      . "Odpowiedz bezposrednio na te wiadomosc, aby napisac do nadawcy.\n"
      . "Reply directly to this email to reach the sender.\n";

$subject = '[Strona] ' . ($topic !== '' ? $topic : 'Wiadomosc') . ' - ' . $name;

try {
    $smtp = new Smtp(
        (string) $cfg['smtp_host'],
        (int) $cfg['smtp_port'],
        (string) $cfg['smtp_user'],
        (string) $cfg['smtp_pass']
    );
    $smtp->send(
        (string) $cfg['from_email'],
        (string) ($cfg['from_name'] ?? 'Solid Rock Mission'),
        (string) $cfg['to_email'],
        $email,
        $subject,
        $body
    );
} catch (Throwable $e) {
    fail(502, 'SMTP: ' . $e->getMessage());
}

header('Location: ' . $success, true, 303);
