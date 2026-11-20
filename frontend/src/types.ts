export interface Item {
  id: string;
  name: string;
  checked: boolean;
  /** Store section id (see `HouseholdDetail.categories`). */
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  label: string;
}

export type Role = "owner" | "member";

export interface Me {
  user: { id: string; name: string; email: string; ownsHousehold: boolean };
  households: { id: string; name: string; role: Role }[];
}

export interface HouseholdDetail {
  household: { id: string; name: string; ownerId: string; role: Role; maxLists: number };
  members: { userId: string; name: string; email: string; role: Role }[];
  lists: { id: string; name: string }[];
  /** Store sections in the order to show them. Defined by the server. */
  categories: Category[];
}

export interface InvitePreview {
  householdId: string;
  householdName: string;
  alreadyMember: boolean;
}
