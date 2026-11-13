import type { Role } from "./types";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin / Owner",
  accountant: "Accountant",
  cashier: "Cashier / Entry",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access, including user management and voiding records.",
  accountant: "Create and edit all registers and masters; view every report. No user admin or voiding.",
  cashier: "Enter and edit their own Income, Expenses, Cashbook and Ledger rows; view customers.",
  viewer: "Read-only access to all modules except user management.",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}