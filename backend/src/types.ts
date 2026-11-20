export const MAX_LISTS_PER_HOUSEHOLD = 10;
export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export type Role = "owner" | "member";

export interface Item {
  id: string;
  name: string;
  checked: boolean;
  /** A store section id from categories.ts. Items from before sections existed read as "other". */
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemPatch {
  name?: string;
  checked?: boolean;
  category?: string;
}

/** The signed-in person, taken from the verified Cognito ID token. */
export interface AuthUser {
  userId: string;
  email: string;
  name: string;
}

export interface User extends AuthUser {
  createdAt: string;
  /** Set once a user creates a household; never cleared (a user can only ever own one). */
  ownedHouseholdId?: string;
}

export interface Household {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  listCount: number;
}

/** A person's membership of a household (stored on the household side). */
export interface Member {
  householdId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

/** The same membership seen from the user side, for "which households am I in". */
export interface Membership {
  householdId: string;
  householdName: string;
  role: Role;
  joinedAt: string;
}

export interface GroceryList {
  id: string;
  householdId: string;
  name: string;
  createdAt: string;
}

export interface Invite {
  token: string;
  householdId: string;
  householdName: string;
  invitedBy: string;
  createdAt: string;
  /** Epoch seconds. Also the DynamoDB TTL attribute. */
  expiresAt: number;
}
