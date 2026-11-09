import { z } from "zod";
import { ROLES } from "@/lib/auth/permissions";

export const PASSWORD_MIN = 10;

/** Only DCWD office addresses can have accounts, whether they sign up or an admin adds them. */
export const EMAIL_DOMAIN = "davao-water.gov.ph";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .pipe(z.email("Enter a valid email address"))
  // Compares the whole part after the last "@", so "x@davao-water.gov.ph.example.com" and "x@sub.davao-water.gov.ph" are refused.
  .refine((v) => v.slice(v.lastIndexOf("@") + 1) === EMAIL_DOMAIN, `Use your @${EMAIL_DOMAIN} email address`);

export const loginInput = z.object({
  email: z.string().trim().min(1, "Enter your email").max(200),
  password: z.string().min(1, "Enter your password").max(200),
});

/** Roles people can pick for themselves on the sign-up form. Admins are only made by another admin. */
export const SIGNUP_ROLES = ["QA", "DEV"] as const;

/** A nickname, shown wherever the app shows a person (tickets, replies, the team directory). Same rule everywhere. */
export const NICKNAME_MAX = 40;
const nickname = z.string().trim().min(2, "Enter a nickname of at least 2 characters").max(NICKNAME_MAX, `Keep it to ${NICKNAME_MAX} characters`);

/** No password: once an admin approves the request, the browser that sent it gets a temporary one (lib/auth/store.ts). */
export const signupInput = z.object({
  role: z.enum(SIGNUP_ROLES, "Choose QA tester or Developer"),
  name: nickname,
  email,
});

/** "Forgot password" on the sign-in page. */
export const forgotInput = z.object({ email });

export const userInput = z.object({
  name: nickname,
  email,
  role: z.enum(ROLES, "Pick a role"),
  designer: z.boolean().default(false),
  /** Manages Team & modules on top of the role. */
  teamLead: z.boolean().default(false),
});

export const userUpdateInput = userInput.extend({
  active: z.boolean(),
});

export const passwordChangeInput = z
  .object({
    current: z.string().min(1, "Enter your current password").max(200),
    next: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`).max(200),
    confirm: z.string().max(200),
  })
  .refine((v) => v.next === v.confirm, { message: "The passwords don't match", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "Choose a password different from the current one", path: ["next"] });

export type UserInput = z.infer<typeof userInput>;
export type SignupInput = z.infer<typeof signupInput>;
