import { getIdToken } from "./auth";
import type { AppConfig } from "./config";
import type { HouseholdDetail, InvitePreview, Item, Me } from "./types";

let config: AppConfig = { mode: "dev" };
export const setApiConfig = (c: AppConfig) => (config = c);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const send = async (forceRefresh: boolean) => {
    const token = await getIdToken(config, forceRefresh);
    if (!token) throw new ApiError(401, "Not signed in");
    return fetch(`/api${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  };

  let res = await send(false);
  if (res.status === 401) res = await send(true); // token may have just expired: refresh once and retry
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const hh = (hid: string) => `/households/${encodeURIComponent(hid)}`;
const li = (hid: string, lid: string) => `${hh(hid)}/lists/${encodeURIComponent(lid)}`;

export const api = {
  me: () => request<Me>("/me"),

  createHousehold: (name: string) => request<HouseholdDetail>("/households", { method: "POST", body: { name } }),
  household: (hid: string) => request<HouseholdDetail>(hh(hid)),
  createInvite: (hid: string) =>
    request<{ token: string; expiresAt: number }>(`${hh(hid)}/invites`, { method: "POST" }),
  removeMember: (hid: string, uid: string) =>
    request<void>(`${hh(hid)}/members/${encodeURIComponent(uid)}`, { method: "DELETE" }),

  previewInvite: (token: string) => request<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) =>
    request<HouseholdDetail>(`/invites/${encodeURIComponent(token)}/accept`, { method: "POST" }),

  createList: (hid: string, name: string) =>
    request<{ id: string; name: string }>(`${hh(hid)}/lists`, { method: "POST", body: { name } }),
  renameList: (hid: string, lid: string, name: string) =>
    request<{ id: string; name: string }>(li(hid, lid), { method: "PATCH", body: { name } }),
  deleteList: (hid: string, lid: string) => request<void>(li(hid, lid), { method: "DELETE" }),

  items: (hid: string, lid: string) => request<{ items: Item[] }>(`${li(hid, lid)}/items`).then((r) => r.items),
  addItem: (hid: string, lid: string, id: string, name: string) =>
    request<unknown>(`${li(hid, lid)}/items`, { method: "POST", body: { id, name } }),
  setChecked: (hid: string, lid: string, id: string, checked: boolean) =>
    request<unknown>(`${li(hid, lid)}/items/${encodeURIComponent(id)}`, { method: "PATCH", body: { checked } }),
  setCategory: (hid: string, lid: string, id: string, category: string) =>
    request<unknown>(`${li(hid, lid)}/items/${encodeURIComponent(id)}`, { method: "PATCH", body: { category } }),
  removeItem: (hid: string, lid: string, id: string) =>
    request<void>(`${li(hid, lid)}/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
  clearChecked: (hid: string, lid: string) =>
    request<unknown>(`${li(hid, lid)}/items/clear-checked`, { method: "POST" }),
};
