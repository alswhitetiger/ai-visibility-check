import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';

export const providerNames = ['google', 'kakao', 'naver'];
export function providerStatus(env) {
  return Object.fromEntries(providerNames.map(p => [p, !!(env[p.toUpperCase() + '_CLIENT_ID'] && env[p.toUpperCase() + '_CLIENT_SECRET'])]));
}

export function authOptions(env) {
  const socialProviders = {};
  for (const [p, enabled] of Object.entries(providerStatus(env))) {
    if (enabled) socialProviders[p] = { clientId: env[p.toUpperCase() + '_CLIENT_ID'], clientSecret: env[p.toUpperCase() + '_CLIENT_SECRET'] };
  }
  if (socialProviders.kakao) Object.assign(socialProviders.kakao, {
    disableDefaultScope: true,
    scope: ['profile_nickname'],
    mapProfileToUser: profile => ({ email: `kakao-${profile.id}@users.invalid` }),
  });
  const mailReady = !!(env.RESEND_API_KEY && env.AUTH_EMAIL_FROM);
  async function sendEmail(to, subject, text) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [to], subject, text: `가게 체크\n\n${text}\n\n본인이 요청하지 않았다면 이 메일을 무시하세요.` }),
    });
    if (!response.ok) throw new Error('인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return {
    appName: '가게 체크', database: env.DB, secret: env.AUTH_SECRET,
    baseURL: env.AUTH_BASE_URL, basePath: '/api/auth',
    trustedOrigins: [env.AUTH_BASE_URL],
    emailAndPassword: {
      enabled: true, minPasswordLength: 12, maxPasswordLength: 128,
      requireEmailVerification: mailReady,
      ...(mailReady ? { sendResetPassword: async ({ user, url }) => sendEmail(user.email, '가게 체크 비밀번호 재설정', `아래 주소에서 비밀번호를 다시 설정하세요.\n${url}`) } : {}),
    },
    ...(mailReady ? {
      emailVerification: { sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: true },
      plugins: [emailOTP({
        overrideDefaultEmailVerification: true, otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: 'hashed', rateLimit: { window: 60, max: 3 },
        sendVerificationOTP: ({ email, otp, type }) => sendEmail(email, type === 'forget-password' ? '가게 체크 비밀번호 재설정 번호' : '가게 체크 이메일 인증번호', `인증번호: ${otp}\n\n10분 안에 입력해 주세요.`),
      })],
    } : {}),
    socialProviders,
    account: { encryptOAuthTokens: true, accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true, allowUnlinkingAll: false } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 40,
      customRules: { '/sign-up/email': { window: 3600, max: 5 }, '/sign-in/email': { window: 60, max: 5 }, '/request-password-reset': { window: 60, max: 3 } } },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] }, useSecureCookies: env.AUTH_BASE_URL?.startsWith('https:'), defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' } },
  };
}
export const createAuth = env => betterAuth(authOptions(env));

export async function sessionOf(request, env) {
  if (!env.AUTH_SECRET || !env.AUTH_BASE_URL) return null;
  return createAuth(env).api.getSession({ headers: request.headers });
}
