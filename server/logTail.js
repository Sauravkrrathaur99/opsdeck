export function isAccessLogPath(filePath) {
  return /access\.log|gunicorn-access/i.test(filePath || '');
}

export function buildTailCommand(filePath, lines = 150) {
  const n = Math.min(Math.max(parseInt(lines, 10) || 150, 50), 500);
  const f = JSON.stringify(filePath);
  return `{ tail -n ${n} ${f} 2>/dev/null || sudo -n tail -n ${n} ${f} 2>&1; }`;
}

/** Django-style HTTP lines — no IPs, no user-agents, bots/scanners stripped */
export function buildAppAccessLogCommand(filePath, lines = 200) {
  const n = Math.min(Math.max(parseInt(lines, 10) || 200, 50), 800);
  const f = JSON.stringify(filePath);
  const exclude = [
    'grep -vEi',
    '"got \\(https://|UptimeRobot|Pingdom|StatusCake|curl/[0-9]|wget/|python-requests|Go-http-client|',
    '/\\\\.env |/\\\\.git|/wp-admin|/wp-login|xmlrpc|phpmyadmin|/\\\\.aws/|/actuator|/\\\\.well-known/security"',
  ].join(' ');
  const extract = 'grep -oE \'\\[[^]]+\\] "(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) [^"]*" [0-9]+ [0-9]+\'';
  const format = 'sed -E \'s/\\[([0-9]{2}\\/[A-Za-z]{3}\\/[0-9]{4}):([0-9]{2}:[0-9]{2}:[0-9]{2}).*\\] (.*)/[\\1 \\2] \\3/\'';
  return `{ tail -n ${n} ${f} 2>/dev/null || sudo -n tail -n ${n} ${f}; } 2>/dev/null | ${exclude} | ${extract} | ${format}`;
}

export const NGINX_LOG_CANDIDATES = [
  '/var/log/nginx/access.log',
  '/var/log/nginx/error.log',
];

export const NGINX_DISCOVER_SCRIPT = [
  'for f in /var/log/nginx/access.log /var/log/nginx/error.log /var/log/nginx/*access*.log /var/log/nginx/*isam*.log; do',
  '  [ -f "$f" ] && echo "$f"',
  'done',
  'grep -h "access_log\\|error_log" /etc/nginx/sites-enabled/* 2>/dev/null | grep -oE "/[^ ;]+\\.log" | sort -u | while read -r f; do',
  '  [ -f "$f" ] && echo "$f"',
  'done',
].join('\n');
