import { type FormEvent, useState } from "react";
import { api } from "./api";
import { CheckIcon, CloseIcon } from "./icons";
import { Sheet } from "./Sheet";
import type { HouseholdDetail, Me } from "./types";

export function HouseholdSheet({
  me,
  detail,
  households,
  onClose,
  onSwitch,
  onMembersChanged,
  onLeft,
  onCreated,
  onSignOut,
}: {
  me: Me["user"];
  detail: HouseholdDetail;
  households: Me["households"];
  onClose: () => void;
  onSwitch: (hid: string) => void;
  onMembersChanged: () => void;
  onLeft: () => void;
  onCreated: (h: HouseholdDetail) => void;
  onSignOut: () => void;
}) {
  const hid = detail.household.id;
  const isOwner = detail.household.role === "owner";
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createInvite = () =>
    guard(async () => {
      const { token } = await api.createInvite(hid);
      const url = `${window.location.origin}/?invite=${token}`;
      setInviteUrl(url);
      setCopied(false);
      if (navigator.share) {
        try {
          await navigator.share({ title: `Join ${detail.household.name} on Groceries`, url });
          return;
        } catch {
          /* share sheet dismissed: keep the link visible so it can be copied */
        }
      }
    });

  const copy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      /* the link is visible; it can be copied by hand */
    }
  };

  const remove = (uid: string, name: string) => {
    if (!window.confirm(`Remove ${name} from ${detail.household.name}?`)) return;
    void guard(async () => {
      await api.removeMember(hid, uid);
      onMembersChanged();
    });
  };

  const leave = () => {
    if (!window.confirm(`Leave ${detail.household.name}?`)) return;
    void guard(async () => {
      await api.removeMember(hid, me.id);
      onLeft();
    });
  };

  const createOwn = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    void guard(async () => onCreated(await api.createHousehold(newName.trim())));
  };

  return (
    <Sheet title={detail.household.name} onClose={onClose}>
      {error && <div className="banner" role="alert">{error}</div>}

      <h3 className="sheet-h">Members</h3>
      <ul className="members">
        {detail.members.map((m) => (
          <li key={m.userId}>
            <div className="avatar">{m.name.charAt(0).toUpperCase()}</div>
            <div className="who">
              <strong>
                {m.name}
                {m.userId === me.id ? " (you)" : ""}
              </strong>
              <span>{m.role === "owner" ? "Owner" : m.email || "Member"}</span>
            </div>
            {isOwner && m.userId !== me.id && (
              <button className="remove" onClick={() => remove(m.userId, m.name)} aria-label={`Remove ${m.name}`}>
                <CloseIcon />
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <>
          <h3 className="sheet-h">Invite someone</h3>
          {inviteUrl ? (
            <div className="invite-box">
              <input className="field" readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
              <button className="btn btn-secondary" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary" disabled={busy} onClick={createInvite}>
              Create invite link
            </button>
          )}
          <p className="sheet-note">The link works once and expires in 7 days. Send it to the person you’re inviting.</p>
        </>
      )}

      {(households.length > 1 || !me.ownsHousehold) && (
        <>
          <h3 className="sheet-h">Your households</h3>
          <ul className="hh-list">
            {households.map((h) => (
              <li key={h.id}>
                <button onClick={() => onSwitch(h.id)}>
                  <span>{h.name}</span>
                  {h.id === hid && (
                    <span className="tick">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {!me.ownsHousehold && (
        <form className="stack" onSubmit={createOwn}>
          <input
            className="field"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Start your own household"
            maxLength={60}
            autoComplete="off"
            aria-label="New household name"
          />
          <button className="btn btn-secondary" disabled={busy || !newName.trim()}>
            Create my household
          </button>
        </form>
      )}

      <div className="sheet-footer">
        {!isOwner && (
          <button className="btn btn-danger" disabled={busy} onClick={leave}>
            Leave household
          </button>
        )}
        <p className="fineprint">
          Signed in as {me.name}
          {me.email ? ` · ${me.email}` : ""}
        </p>
        <button className="btn btn-text" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </Sheet>
  );
}
