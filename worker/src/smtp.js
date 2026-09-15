import { connect } from 'cloudflare:sockets';

const encoder = new TextEncoder();
function base64(value) {
  let binary = '';
  for (const byte of encoder.encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function timeout(promise, ms = 12000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('SMTP 응답 시간이 초과되었습니다.')), ms); })]).finally(() => clearTimeout(timer));
}
function fromHeader(value, user) {
  const safe = String(value || '').replace(/[\r\n]/g, '').trim();
  const match = safe.match(/^(.*?)\s*<([^<>]+)>$/);
  const name = (match?.[1] || safe || '가게체크').trim();
  const address = (match?.[2] || user).trim();
  const display = /[^\x20-\x7e]/.test(name) ? `=?UTF-8?B?${base64(name)}?=` : name;
  return `${display} <${address}>`;
}

export async function sendGmail({ user, password, from, to, subject, text }) {
  const socket = connect({ hostname: 'smtp.gmail.com', port: 465 }, { secureTransport: 'on', allowHalfOpen: true });
  await timeout(socket.opened);
  const reader = socket.readable.getReader(), writer = socket.writable.getWriter(), decoder = new TextDecoder();
  let buffer = '';
  async function reply(expected) {
    while (true) {
      const end = buffer.indexOf('\r\n');
      if (end < 0) {
        const chunk = await timeout(reader.read());
        if (chunk.done) throw new Error('SMTP 연결이 예기치 않게 종료되었습니다.');
        buffer += decoder.decode(chunk.value, { stream: true }); continue;
      }
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      if (/^\d{3} /.test(line)) {
        const code = Number(line.slice(0, 3));
        if (code !== expected) throw new Error(`SMTP 서버가 요청을 거부했습니다. (${code})`);
        return;
      }
    }
  }
  async function command(value, expected) {
    if (value) await timeout(writer.write(encoder.encode(value)));
    await reply(expected);
  }
  try {
    await reply(220);
    await command('EHLO ai-visibility-check\r\n', 250);
    await command('AUTH LOGIN\r\n', 334);
    await command(base64(user) + '\r\n', 334);
    await command(base64(password.replace(/\s/g, '')) + '\r\n', 235);
    await command(`MAIL FROM:<${user.replace(/[\r\n]/g, '')}>\r\n`, 250);
    await command(`RCPT TO:<${to.replace(/[\r\n]/g, '')}>\r\n`, 250);
    await command('DATA\r\n', 354);
    const body = base64(text).match(/.{1,76}/g).join('\r\n');
    const message = [
      `From: ${fromHeader(from, user)}`, `To: <${to.replace(/[\r\n]/g, '')}>`,
      `Subject: =?UTF-8?B?${base64(subject)}?=`, `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body,
    ].join('\r\n');
    await command(message + '\r\n.\r\n', 250);
    await command('QUIT\r\n', 221);
  } finally {
    reader.releaseLock(); writer.releaseLock(); await socket.close().catch(() => {});
  }
}
