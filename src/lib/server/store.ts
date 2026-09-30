import "server-only";
import { randomUUID } from "node:crypto";
import type { Category } from "../contracts";
import type { MomentType } from "../moment-catalog";

export type Customer = {
  id: string;
  name: string;
  profile: {
    age: number;
    city: string;
    occupation: string;
    balance: number;
    currency: string;
  };
};
export type Household = { id: string; name: string; createdBy: string };
export type Membership = {
  id: string;
  householdId: string;
  customerId: string;
  role: "founder" | "member";
  status: "active" | "left";
};
export type Invitation = {
  id: string;
  tokenHash: string;
  householdId: string;
  intendedRecipientId: string;
  createdBy: string;
  expiresAt: number;
  consumedAt: string | null;
};
export type ConsentEvent = {
  id: string;
  subjectId: string;
  recipientId: string;
  category: Category;
  granted: boolean;
  timestamp: string;
  sequence: number;
  reason: "preference" | "household departure";
};
export type Moment = {
  id: string;
  ownerId: string;
  type: MomentType;
  createdAt: string;
};
export type Card = {
  id: string;
  recipientId: string;
  sourceMomentId: string;
  ruleId: string;
  checklistIds: string[];
  completedIds: string[];
  dismissed: boolean;
};
export type AuditEvent = {
  actor: string;
  action: string;
  resource: string;
  result: "allowed" | "denied";
  timestamp: string;
};
export type DemoStore = {
  customers: Customer[];
  households: Household[];
  memberships: Membership[];
  invitations: Invitation[];
  consents: ConsentEvent[];
  moments: Moment[];
  cards: Card[];
  audit: AuditEvent[];
  accounts: { id: string; ownerId: string; name: string; iban: string; balance: number }[];
  transactions: { id: string; accountId: string; label: string; amount: number; date: string; category: string }[];
  budgets: { ownerId: string; category: string; limit: number }[];
  goals: { id: string; ownerId: string; name: string; target: number; saved: number }[];
  appointments: { id: string; ownerId: string; topic: string; date: string; channel: string }[];
  settings: { ownerId: string; largeText: boolean; quietMode: boolean }[];
  sequence: number;
};

export function seedStore(): DemoStore {
  return {
    customers: [
      {
        id: "sofie",
        name: "Sofie",
        profile: {
          age: 39,
          city: "Leuven",
          occupation: "Architect",
          balance: 4280.5,
          currency: "EUR",
        },
      },
      {
        id: "tom",
        name: "Tom",
        profile: {
          age: 41,
          city: "Leuven",
          occupation: "Teacher",
          balance: 3150.25,
          currency: "EUR",
        },
      },
      {
        id: "maria",
        name: "Maria",
        profile: {
          age: 68,
          city: "Mechelen",
          occupation: "Retired librarian",
          balance: 12450.75,
          currency: "EUR",
        },
      },
    ],
    households: [{ id: "home", name: "Our household", createdBy: "sofie" }],
    memberships: [
      {
        id: "membership-sofie",
        householdId: "home",
        customerId: "sofie",
        role: "founder",
        status: "active",
      },
      {
        id: "membership-tom",
        householdId: "home",
        customerId: "tom",
        role: "member",
        status: "active",
      },
    ],
    invitations: [],
    consents: [],
    moments: [],
    cards: [],
    audit: [],
    accounts: [
      { id: "sofie-current", ownerId: "sofie", name: "Current account", iban: "BE12 7340 1111 2233", balance: 3240.5 },
      { id: "sofie-savings", ownerId: "sofie", name: "Savings account", iban: "BE45 7340 1111 4455", balance: 1040 },
      { id: "tom-current", ownerId: "tom", name: "Current account", iban: "BE23 7340 3333 8899", balance: 2350.25 },
      { id: "tom-savings", ownerId: "tom", name: "Savings account", iban: "BE56 7340 3333 1122", balance: 800 },
      { id: "maria-current", ownerId: "maria", name: "Current account", iban: "BE67 7340 6666 7788", balance: 2180.75 },
      { id: "maria-savings", ownerId: "maria", name: "Savings account", iban: "BE90 7340 6666 9900", balance: 10270 },
    ],
    transactions: [
      { id: "tx-s-1", accountId: "sofie-current", label: "Groceries", amount: -86.4, date: "2026-09-28", category: "Groceries" },
      { id: "tx-s-2", accountId: "sofie-current", label: "Energy", amount: -142, date: "2026-09-25", category: "Energy" },
      { id: "tx-s-3", accountId: "sofie-current", label: "Salary", amount: 2860, date: "2026-09-25", category: "Income" },
      { id: "tx-t-1", accountId: "tom-current", label: "Transport", amount: -71.3, date: "2026-09-24", category: "Transport" },
      { id: "tx-t-2", accountId: "tom-current", label: "Groceries", amount: -73.1, date: "2026-09-15", category: "Groceries" },
      { id: "tx-m-1", accountId: "maria-current", label: "Pension", amount: 1680, date: "2026-09-25", category: "Income" },
      { id: "tx-m-2", accountId: "maria-current", label: "Pharmacy", amount: -34.6, date: "2026-09-20", category: "Health" },
    ],
    budgets: [
      { ownerId: "sofie", category: "Groceries", limit: 450 },
      { ownerId: "sofie", category: "Energy", limit: 180 },
      { ownerId: "tom", category: "Groceries", limit: 400 },
    ],
    goals: [{ id: "goal-sofie", ownerId: "sofie", name: "Family holiday", target: 3000, saved: 1200 }],
    appointments: [],
    settings: ["sofie", "tom", "maria"].map((ownerId) => ({ ownerId, largeText: false, quietMode: false })),
    sequence: 0,
  };
}

const globalStore = globalThis as typeof globalThis & {
  kbcHomeStore?: DemoStore;
};
export function store(): DemoStore {
  const current = (globalStore.kbcHomeStore ??= seedStore());
  // Next dev preserves globalThis across hot reloads. Add new synthetic fields
  // without discarding invitations, consents, or moments already in the demo.
  if (!current.accounts) {
    const initial = seedStore();
    current.accounts = initial.accounts;
    current.transactions = initial.transactions;
    current.budgets = initial.budgets;
    current.goals = initial.goals;
    current.appointments = initial.appointments;
    current.settings = initial.settings;
  }
  return current;
}
export function resetStore() {
  globalStore.kbcHomeStore = seedStore();
}
export function id(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}
export function audit(
  actor: string,
  action: string,
  resource: string,
  result: AuditEvent["result"] = "allowed",
) {
  store().audit.push({
    actor,
    action,
    resource,
    result,
    timestamp: new Date().toISOString(),
  });
}
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function customer(customerId: string) {
  const value = store().customers.find((c) => c.id === customerId);
  if (!value) throw new DomainError("Customer not found.", 404);
  return value;
}
