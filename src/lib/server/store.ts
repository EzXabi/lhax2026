import "server-only";
import { randomUUID } from "node:crypto";
import type { Category } from "../contracts";

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
  type: "parent_moves_in";
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
    sequence: 0,
  };
}

const globalStore = globalThis as typeof globalThis & {
  kbcHomeStore?: DemoStore;
};
export function store(): DemoStore {
  return (globalStore.kbcHomeStore ??= seedStore());
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
