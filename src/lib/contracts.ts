// Public response types only. This module contains no private records.
export type Category = "balance" | "moments";
export type ChecklistItem = { id: string; text: string; done: boolean };
export type CardView = {
  id: string;
  title: string;
  body: string;
  kind: "personal" | "household";
  createdAt: string;
  checklist: ChecklistItem[];
  explanation: {
    source: string;
    ruleId: string;
    rule: string;
    permission: string;
    privacyHref: string;
  };
};
export type Snapshot = {
  customer: {
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
  household: null | {
    id: string;
    name: string;
    members: {
      id: string;
      name: string;
      role: string;
      balance?: number;
      moments?: { id: string; label: string; createdAt: string }[];
    }[];
  };
  inviteCandidates: { id: string; name: string }[];
  sharing: {
    recipientId: string;
    recipientName: string;
    balance: boolean;
    moments: boolean;
  }[];
  consentHistory: {
    id: string;
    recipientName: string;
    category: Category;
    granted: boolean;
    timestamp: string;
    sequence: number;
    reason: string;
  }[];
  cards: CardView[];
  ownMoments: { id: string; label: string; createdAt: string }[];
};
