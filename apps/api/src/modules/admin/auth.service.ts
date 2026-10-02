import { createHash, randomBytes } from 'node:crypto';
import type { AdminMeDto } from '@noors/shared';
import type { PrismaClient } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_AFTER_MS = 5 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Compared against when the email is unknown, so a miss takes as long as a wrong password.
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

const toMe = (u: { id: string; email: string; name: string; role: AdminMeDto['role'] }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});

export class AdminAuthService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Returns a new session token and the admin, or null when the email or password is wrong. */
  async login(
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string } = {},
  ): Promise<{ token: string; expiresAt: Date; admin: AdminMeDto } | null> {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok || !user.isActive) return null;

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
    return { token, expiresAt, admin: toMe(user) };
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
}
