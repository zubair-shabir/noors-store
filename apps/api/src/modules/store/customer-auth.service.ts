import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { CustomerDto } from '@noors/shared';
import type { EmailSender } from '../../lib/email.js';
import { HttpError } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { hashToken } from './cart.service.js';

export const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** Codes one email address can be sent per 15 minutes. */
const CODES_PER_WINDOW = 3;
const TOUCH_AFTER_MS = 60 * 60 * 1000;

const codeHash = (email: string, code: string) =>
  createHash('sha256').update(`${email}:${code}`).digest();

const toDto = (c: { id: string; email: string; name: string | null; phone: string | null }) => ({
  id: c.id,
  email: c.email,
  name: c.name,
  phone: c.phone,
});

/** Passwordless sign-in for shoppers: a 6-digit code sent by email. */
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly email: EmailSender,
  ) {}

  /** Emails a fresh code. Returns the code itself only when email isn't really sent (dev). */
  async requestCode(email: string): Promise<{ expiresIn: number; devCode?: string }> {
    const recent = await this.prisma.otpCode.count({
      where: { email, createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) } },
    });
    if (recent >= CODES_PER_WINDOW) {
      throw new HttpError(
        429,
        'We have sent a few codes already. Check your inbox or try again in 15 minutes.',
        'rate_limited',
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.otpCode.create({
      data: {
        email,
        codeHash: codeHash(email, code).toString('hex'),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    await this.email.send({
      to: email,
      subject: `${code} is your Noor's sign-in code`,
      text: `Your Noor's sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
    });
    return {
      expiresIn: CODE_TTL_MS / 1000,
      ...(this.email.delivers ? {} : { devCode: code }),
    };
  }

  /** Checks the latest code for the email; on success signs the customer in (creating them). */
  async verifyCode(
    email: string,
    code: string,
  ): Promise<{ token: string; expiresAt: Date; customer: CustomerDto }> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    const invalid = new HttpError(
      400,
      'That code is not right. Check it and try again.',
      'invalid_code',
    );
    if (!otp) {
      throw new HttpError(400, 'That code has expired. Ask for a new one.', 'code_expired');
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new HttpError(429, 'Too many tries. Ask for a new code.', 'too_many_attempts');
    }
    // Count the attempt before comparing, so parallel guesses can't skip the limit.
    const counted = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, attempts: { lt: MAX_ATTEMPTS }, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) throw invalid;

    const expected = Buffer.from(otp.codeHash, 'hex');
    if (!timingSafeEqual(expected, codeHash(email, code))) throw invalid;

    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw invalid;

    const customer = await this.prisma.customer.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_TTL_MS);
    await this.prisma.customerSession.create({
      data: { tokenHash: hashToken(token), customerId: customer.id, expiresAt },
    });
    return { token, expiresAt, customer: toDto(customer) };
  }

  async authenticate(token: string): Promise<CustomerDto | null> {
    const session = await this.prisma.customerSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { customer: true },
    });
    if (!session || session.expiresAt <= new Date()) return null;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
      await this.prisma.customerSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }
    return toDto(session.customer);
  }

  async logout(token: string) {
    await this.prisma.customerSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}
