import type { Item } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed (${res.status})`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  list: () => request<{ items: Item[] }>("/items").then((r) => r.items),
  add: (id: string, name: string) =>
    request<unknown>("/items", { method: "POST", body: JSON.stringify({ id, name }) }),
  setChecked: (id: string, checked: boolean) =>
    request<unknown>(`/items/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ checked }) }),
  remove: (id: string) => request<void>(`/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
  clearChecked: () => request<unknown>("/items/clear-checked", { method: "POST" }),
};
