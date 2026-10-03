import { createHash, randomBytes } from 'node:crypto';
import type { AdminMeDto, TwoFactorSetupDto } from '@noors/shared';
import { HttpError } from '../../lib/errors.js';
import type { PrismaClient } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import type { SecretBox } from '../../lib/secrets.js';
import { newTotpSecret, totpUri, verifyTotp } from '../../lib/totp.js';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_AFTER_MS = 5 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Compared against when the email is unknown, so a miss takes as long as a wrong password.
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

const toMe = (u: {
  id: string;
  email: string;
  name: string;
  role: AdminMeDto['role'];
  totpSecret: string | null;
}): AdminMeDto => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  twoFactor: Boolean(u.totpSecret),
});

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; admin: AdminMeDto }
  | { ok: false; reason: 'invalid_credentials' | 'two_factor_required' | 'invalid_code' };

export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secrets: SecretBox,
  ) {}

  /**
   * Signs in with email and password, plus the authenticator code when two-factor sign-in
   * is on. The code is only asked for after the password checks out.
   */
  async login(
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string; code?: string } = {},
  ): Promise<LoginResult> {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok || !user.isActive) return { ok: false, reason: 'invalid_credentials' };
    if (user.totpSecret) {
      if (!meta.code) return { ok: false, reason: 'two_factor_required' };
      if (!verifyTotp(this.secrets.open(user.totpSecret), meta.code)) {
        return { ok: false, reason: 'invalid_code' };
      }
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.adminSession.create({
        data: {
          tokenHash: hashToken(token),
          adminUserId: user.id,
          expiresAt,
          ip: meta.ip?.slice(0, 64),
          userAgent: meta.userAgent?.slice(0, 300),
        },
      }),
      this.prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      this.prisma.auditLog.create({
        data: { adminUserId: user.id, action: 'login', entity: 'admin_user', entityId: user.id },
      }),
    ]);
    return { ok: true, token, expiresAt, admin: toMe(user) };
  }

  /** Resolves a session token to its admin, or null when it is unknown, expired or disabled. */
  async authenticate(token: string): Promise<AdminMeDto | null> {
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { adminUser: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.adminUser.isActive) return null;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
      await this.prisma.adminSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }
    return toMe(session.adminUser);
  }

  async logout(token: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  /** Changes your own password and signs out your other sessions. */
  async changePassword(adminId: string, current: string, next: string, keepToken?: string) {
    const user = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (!(await verifyPassword(current, user.passwordHash))) {
      throw new HttpError(400, 'Your current password is not right', 'invalid_password');
    }
    await this.prisma.$transaction([
      this.prisma.adminUser.update({
        where: { id: adminId },
        data: { passwordHash: await hashPassword(next) },
      }),
      this.prisma.adminSession.deleteMany({
        where: {
          adminUserId: adminId,
          ...(keepToken && { tokenHash: { not: hashToken(keepToken) } }),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          adminUserId: adminId,
          action: 'password_change',
          entity: 'admin_user',
          entityId: adminId,
        },
      }),
    ]);
  }

  /** A fresh secret to add to an authenticator app. Nothing is saved until it is confirmed. */
  async twoFactorSetup(adminId: string): Promise<TwoFactorSetupDto> {
    const user = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    const secret = newTotpSecret();
    return { secret, uri: totpUri(secret, user.email) };
  }

  /** Turns on two-factor sign-in once a code from the app proves it was set up. */
  async enableTwoFactor(adminId: string, secret: string, code: string): Promise<AdminMeDto> {
    if (!verifyTotp(secret, code)) {
      throw new HttpError(
        400,
        'That code is not right. Check the time on your phone.',
        'invalid_code',
      );
    }
    const user = await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { totpSecret: this.secrets.seal(secret) },
    });
    await this.prisma.auditLog.create({
      data: {
        adminUserId: adminId,
        action: 'two_factor_on',
        entity: 'admin_user',
        entityId: adminId,
      },
    });
    return toMe(user);
  }

  async disableTwoFactor(adminId: string, code: string): Promise<AdminMeDto> {
    const user = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (user.totpSecret && !verifyTotp(this.secrets.open(user.totpSecret), code)) {
      throw new HttpError(400, 'That code is not right', 'invalid_code');
    }
    const updated = await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { totpSecret: null },
    });
    await this.prisma.auditLog.create({
      data: {
        adminUserId: adminId,
        action: 'two_factor_off',
        entity: 'admin_user',
        entityId: adminId,
      },
    });
    return toMe(updated);
  }
}
