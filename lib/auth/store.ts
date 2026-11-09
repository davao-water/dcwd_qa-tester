import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password";
import type { Role } from "./permissions";

// Prisma glue for accounts and sessions. Takes the client as a parameter so tests can run it against a throwaway SQLite file.

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** A session is pushed back to the full TTL once less than this is left, so active users stay signed in. */
const SLIDE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionUser = { id: string; name: string; email: string; role: Role; designer: boolean; teamLead: boolean; mustChangePassword: boolean; avatarColor: number; avatarName: string | null };

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** A sign-up's browser can get a new temporary password at most this often. */
export const CLAIM_EVERY_MS = 60 * 1000;

const userSelect = { id: true, name: true, email: true, role: true, designer: true, teamLead: true, mustChangePassword: true, active: true, avatarColor: true, avatarName: true } as const;

export function authStore(db: PrismaClient, now: () => Date = () => new Date()) {
  /**
   * The request a sign-up's browser holds (its cookie secret), while it can still lead to a temporary password: waiting
   * for approval, or approved but not yet given its own password. Null for anything else.
   */
  async function claimable(secret: string) {
    if (!secret) return null;
    const u = await db.user.findUnique({
      where: { claimHash: hashToken(secret) },
      select: { id: true, name: true, email: true, pending: true, active: true, mustChangePassword: true, claimHash: true, claimAt: true },
    });
    if (!u?.claimHash) return null;
    if (u.pending || (u.active && u.mustChangePassword)) return u;
    return null;
  }

  /** Seconds left before this request may get another temporary password (0 when it may now). */
  const waitFor = (claimAt: Date | null) => (claimAt ? Math.max(0, Math.ceil((claimAt.getTime() + CLAIM_EVERY_MS - now().getTime()) / 1000)) : 0);

  return {
    /** Returns the user only for a correct password on an active account. Unknown emails take the same time. */
    async checkCredentials(email: string, password: string): Promise<SessionUser | null> {
      const user = await db.user.findUnique({ where: { email: normalizeEmail(email) }, select: { ...userSelect, passwordHash: true } });
      const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash()));
      if (!user || !ok || !user.active) return null;
      return toSessionUser(user);
    },

    /**
     * A self sign-up: no password the person knows, turned off and pending until an admin approves it. The browser that
     * made it keeps `secret` (returned for a new request) in a cookie; only its hash is stored. After approval that
     * browser alone can get the temporary password (claimTempPassword).
     *
     * When the email is taken: signing up again **from the same browser** (`secret` given and matching) is allowed while
     * the request is waiting or approved-but-unused, and may change the nickname ("again"). From anywhere else nothing
     * changes, and the result says whether that account is still waiting ("pending") or already exists ("exists").
     */
    async signUp(input: { name: string; email: string; role: Role }, secret?: string): Promise<{ result: "created" | "again" | "exists" | "pending" | "busy"; secret?: string; busyEmail?: string }> {
      if (input.role === "ADMIN") throw new Error("Admins can't sign themselves up.");
      const email = normalizeEmail(input.email);
      const mine = secret ? await claimable(secret) : null;
      if (mine && mine.email === email) {
        await db.user.update({ where: { id: mine.id }, data: { name: input.name, ...(mine.pending ? { role: input.role } : {}) } });
        return { result: "again", secret };
      }
      // One request per browser: a second email would replace the cookie and leave the first request unclaimable.
      if (mine) return { result: "busy", busyEmail: mine.email };
      const fresh = newToken();
      try {
        await db.user.create({
          data: {
            name: input.name,
            email,
            role: input.role,
            // A random secret nobody knows, so the account can't be signed into before a temporary password is given.
            passwordHash: await hashPassword(newToken()),
            active: false,
            pending: true,
            mustChangePassword: true,
            claimHash: hashToken(fresh),
          },
        });
        return { result: "created", secret: fresh };
      } catch (e) {
        if ((e as { code?: unknown } | null)?.code !== "P2002") throw e;
        const taken = await db.user.findUnique({ where: { email }, select: { pending: true } });
        return { result: taken?.pending ? "pending" : "exists" };
      }
    },

    /**
     * What the sign-in page shows the browser holding `secret`: its request is waiting, or approved and ready for a
     * temporary password (with how long until it may get one). Null otherwise.
     */
    async claimStatus(secret: string): Promise<{ state: "waiting" | "approved"; name: string; waitSeconds: number } | null> {
      const u = await claimable(secret);
      if (!u?.claimHash) return null;
      return { state: u.pending ? "waiting" : "approved", name: u.name, waitSeconds: waitFor(u.claimAt) };
    },

    /**
     * Gives the approved request held by `secret` a new temporary password, replacing any earlier one, at most once a
     * minute. Returns it for the browser to show once, or how many seconds to wait. Null when there is nothing to give.
     */
    async claimTempPassword(secret: string, makeTemp: () => string): Promise<{ tempPassword: string; email: string } | { waitSeconds: number } | null> {
      const u = await claimable(secret);
      if (!u?.claimHash || u.pending) return null;
      const wait = waitFor(u.claimAt);
      if (wait) return { waitSeconds: wait };
      const tempPassword = makeTemp();
      const passwordHash = await hashPassword(tempPassword);
      // Conditional, so two presses at once can't both get one.
      const r = await db.user.updateMany({
        where: { id: u.id, claimHash: u.claimHash, active: true, mustChangePassword: true, OR: [{ claimAt: null }, { claimAt: { lte: new Date(now().getTime() - CLAIM_EVERY_MS) } }] },
        data: { passwordHash, claimAt: now() },
      });
      if (r.count !== 1) {
        // Another press won, or the account changed meanwhile (reset, turned off): say which.
        const still = await claimable(secret);
        return still && !still.pending ? { waitSeconds: Math.max(1, waitFor(still.claimAt)) } : null;
      }
      // A new temporary password signs out anyone using an earlier one.
      await db.session.deleteMany({ where: { userId: u.id } });
      return { tempPassword, email: u.email };
    },

    /**
     * Ends a sign-up's claim once the person has signed in with their temporary password, so nobody using that browser
     * later can make another one. Their own password, chosen next, would end it anyway.
     */
    async endClaim(userId: string) {
      await db.user.updateMany({ where: { id: userId, claimHash: { not: null } }, data: { claimHash: null, claimAt: null } });
    },

    /** "Forgot password" on the sign-in page: flags the account for an admin, who resets it in Admin → Users. */
    async requestReset(email: string): Promise<"requested" | "unknown" | "pending" | "inactive"> {
      const user = await db.user.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true, pending: true, active: true } });
      if (!user) return "unknown";
      if (user.pending) return "pending";
      if (!user.active) return "inactive";
      await db.user.update({ where: { id: user.id }, data: { resetRequestedAt: now() } });
      return "requested";
    },

    /** Clears a forgot-password request, after a reset or when the admin dismisses it. */
    async clearResetRequest(userId: string): Promise<boolean> {
      const r = await db.user.updateMany({ where: { id: userId, resetRequestedAt: { not: null } }, data: { resetRequestedAt: null } });
      return r.count === 1;
    },

    /** What waits for an admin in Admin → Users: sign-up requests and forgot-password requests. */
    async adminRequests(): Promise<{ signUps: number; resets: number }> {
      const [signUps, resets] = await Promise.all([
        db.user.count({ where: { pending: true } }),
        db.user.count({ where: { resetRequestedAt: { not: null }, pending: false } }),
      ]);
      return { signUps, resets };
    },

    /**
     * Turns a pending sign-up on. A request made from a browser that remembers it (it has a claim) needs nothing
     * more: that browser gets the temporary password itself. A request made before that (no claim) gets the temporary
     * password from `makeTemp` here, for the admin to hand over. Either way they must choose their own at first sign-in.
     * Null when the request was already handled.
     */
    async approveSignUp(userId: string, makeTemp: () => string): Promise<{ tempPassword: string | null } | null> {
      const claimed = await db.user.updateMany({ where: { id: userId, pending: true, claimHash: { not: null } }, data: { pending: false, active: true } });
      if (claimed.count === 1) return { tempPassword: null };
      const tempPassword = makeTemp();
      const passwordHash = await hashPassword(tempPassword);
      const older = await db.user.updateMany({ where: { id: userId, pending: true, claimHash: null }, data: { pending: false, active: true, passwordHash, mustChangePassword: true } });
      return older.count === 1 ? { tempPassword } : null;
    },

    /** Deletes a pending sign-up. It never signed in, so nothing refers to it. */
    async rejectSignUp(userId: string): Promise<boolean> {
      const r = await db.user.deleteMany({ where: { id: userId, pending: true } });
      return r.count === 1;
    },

    /** Creates a session and returns the raw token for the cookie. Only its hash is stored. */
    async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
      const token = newToken();
      const expiresAt = new Date(now().getTime() + SESSION_TTL_MS);
      await db.session.deleteMany({ where: { userId, expiresAt: { lte: now() } } });
      await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
      return { token, expiresAt };
    },

    async resolveSession(token: string): Promise<SessionUser | null> {
      if (!token) return null;
      const id = hashToken(token);
      const s = await db.session.findUnique({ where: { id }, include: { user: { select: userSelect } } });
      if (!s) return null;
      const t = now().getTime();
      if (s.expiresAt.getTime() <= t || !s.user.active) {
        await db.session.deleteMany({ where: { id } });
        return null;
      }
      if (s.expiresAt.getTime() - t < SLIDE_AFTER_MS) {
        await db.session.update({ where: { id }, data: { expiresAt: new Date(t + SESSION_TTL_MS) } });
      }
      return toSessionUser(s.user);
    },

    async deleteSession(token: string) {
      await db.session.deleteMany({ where: { id: hashToken(token) } });
    },

    /** Signs a user out everywhere, optionally keeping the session they are using now. */
    async deleteUserSessions(userId: string, keepToken?: string) {
      await db.session.deleteMany({ where: { userId, ...(keepToken ? { id: { not: hashToken(keepToken) } } : {}) } });
    },

    /** Any new password, chosen or reset by an admin, ends the sign-up's claim: its browser can't get one any more. */
    async setPassword(userId: string, password: string, mustChange: boolean) {
      await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), mustChangePassword: mustChange, claimHash: null, claimAt: null } });
    },

    async verifyUserPassword(userId: string, password: string): Promise<boolean> {
      const u = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
      return u ? verifyPassword(password, u.passwordHash) : false;
    },

    async createUser(input: { name: string; email: string; role: Role; designer?: boolean; teamLead?: boolean; password: string; mustChangePassword?: boolean }) {
      return db.user.create({
        data: {
          name: input.name,
          email: normalizeEmail(input.email),
          role: input.role,
          designer: input.designer ?? false,
          teamLead: input.teamLead ?? false,
          passwordHash: await hashPassword(input.password),
          mustChangePassword: input.mustChangePassword ?? true,
        },
        select: { id: true },
      });
    },

    /** True when the change would leave no active admin, which would lock everyone out of user management. */
    async wouldRemoveLastAdmin(userId: string, next: { role: Role; active: boolean }): Promise<boolean> {
      if (next.role === "ADMIN" && next.active) return false;
      const others = await db.user.count({ where: { role: "ADMIN", active: true, id: { not: userId } } });
      return others === 0;
    },
  };
}

function toSessionUser(u: { id: string; name: string; email: string; role: string; designer: boolean; teamLead: boolean; mustChangePassword: boolean; avatarColor: number; avatarName: string | null }): SessionUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role, designer: u.designer, teamLead: u.teamLead, mustChangePassword: u.mustChangePassword, avatarColor: u.avatarColor, avatarName: u.avatarName };
}
