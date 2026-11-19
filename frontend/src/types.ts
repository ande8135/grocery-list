export interface Item {
  id: string;
  name: string;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
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
}

export interface InvitePreview {
  householdId: string;
  householdName: string;
  alreadyMember: boolean;
}
