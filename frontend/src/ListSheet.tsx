import { type FormEvent, useState } from "react";
import { api } from "./api";
import { Sheet } from "./Sheet";
import type { HouseholdDetail } from "./types";

/** Create a list, or rename / delete an existing one. */
export function ListSheet({
  hid,
  detail,
  editing,
  onClose,
  onDone,
}: {
  hid: string;
  detail: HouseholdDetail;
  editing: { id: string; name: string } | null; // null = new list
  onClose: () => void;
  onDone: (selectListId?: string) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = detail.household.role === "owner";

  const run = async (fn: () => Promise<string | undefined>) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      if (editing) {
        await api.renameList(hid, editing.id, name.trim());
        return editing.id;
      }
      return (await api.createList(hid, name.trim())).id;
    });
  };

  const full = !editing && detail.lists.length >= detail.household.maxLists;

  return (
    <Sheet title={editing ? "Edit list" : "New list"} onClose={onClose}>
      {error && <div className="banner" role="alert">{error}</div>}
      {full ? (
        <p className="sheet-note">
          A household can have up to {detail.household.maxLists} lists. Delete one to make room.
        </p>
      ) : (
        <form className="stack" onSubmit={save}>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Costco, Hardware store"
            maxLength={40}
            autoFocus
            autoComplete="off"
            aria-label="List name"
          />
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {editing ? "Save" : "Create list"}
          </button>
        </form>
      )}
      {editing && isOwner && detail.lists.length > 1 && (
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete “${editing.name}” and everything on it?`)) {
              void run(async () => {
                await api.deleteList(hid, editing.id);
                return undefined;
              });
            }
          }}
        >
          Delete list
        </button>
      )}
    </Sheet>
  );
}
