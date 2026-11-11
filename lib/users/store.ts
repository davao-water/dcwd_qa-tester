// Admin → Users' saving and loading: the sign-up and password-reset requests, the account list, and editing an
// account. Signing in, passwords and sessions live in lib/auth/store.ts; deleting an account in ./delete.ts.

import { AREA_PATH_SELECT } from "@/lib/areas/tree";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Role } from "@/lib/auth/permissions";

/** An account's fields as the Edit user dialog saves them. */
export type AccountChange = { name: string; email: string; role: Role; designer: boolean; teamLead: boolean; active: boolean };

export function userAdminStore(db: PrismaClient) {
  return {
    /** Sign-ups waiting for approval, oldest first. */
    signUpRequests() {
      return db.user.findMany({
        where: { pending: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, role: true, createdAt: true, claimHash: true },
      });
    },

    /** Forgot-password requests, oldest first. */
    resetRequests() {
      return db.user.findMany({
        where: { pending: false, resetRequestedAt: { not: null } },
        orderBy: { resetRequestedAt: "asc" },
        select: { id: true, name: true, email: true, role: true, active: true, resetRequestedAt: true },
      });
    },

    /** Every account with its modules, active first. `full` false (temporary access): no rows, the list is for admins only. */
    accounts(full: boolean) {
      return db.user.findMany({
        where: { pending: false, ...(full ? {} : { id: { in: [] } }) },
        orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          designer: true,
          teamLead: true,
          active: true,
          mustChangePassword: true,
          areas: { select: { isLead: true, area: { select: AREA_PATH_SELECT } } },
        },
      });
    },

    /** Who an account belongs to, for approving it or resetting its password; null when it no longer exists. */
    contact(id: string) {
      return db.user.findUnique({ where: { id }, select: { email: true, role: true, resetRequestedAt: true } });
    },

    /**
     * Saves an account's changes. Returns a message a user can act on when it can't be done, otherwise null. A database
     * error (such as an email already in use) is thrown for the caller to explain.
     */
    async update(id: string, data: AccountChange): Promise<string | null> {
      // A pending sign-up has no usable password yet, so it is turned on only through Approve, which creates one.
      const target = await db.user.findUnique({ where: { id }, select: { pending: true } });
      if (target?.pending && data.active) return "Use Approve in the list above. It creates their temporary password.";
      await db.user.update({ where: { id }, data });
      return null;
    },
  };
}
