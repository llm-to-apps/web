import { NextRequest, NextResponse } from 'next/server';

import { isValidEmail, normalizeEmail } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { sendEmail } from '../../../../../lib/email';
import { clearEmailLoginCode, createEmailLoginCode } from '../../../../../lib/email-login-codes';

type StartEmailAuthRequest = {
  email?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as StartEmailAuthRequest;
  const email = normalizeEmail(body.email ?? '');

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, message: 'A valid email is required' },
      { status: 400 }
    );
  }

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email
    }
  });

  let loginCode: Awaited<ReturnType<typeof createEmailLoginCode>>;

  try {
    loginCode = await createEmailLoginCode(email);
  } catch (error) {
    console.error('[Auth] Failed to store email login code', { email, error });
    return NextResponse.json(
      { ok: false, message: 'Failed to create email code' },
      { status: 503 }
    );
  }

  try {
    await sendEmail({
      html: `<p>Your OS7 sign-in code is <strong>${loginCode.code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
      subject: 'Your OS7 sign-in code',
      text: `Your OS7 sign-in code is ${loginCode.code}. This code expires in 10 minutes.`,
      to: email
    });
  } catch (error) {
    await clearEmailLoginCode(email).catch(() => undefined);
    console.error('[Auth] Failed to send email login code', { email, error });
    return NextResponse.json(
      { ok: false, message: 'Failed to send email code' },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true
  });
}
