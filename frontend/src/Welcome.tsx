import { type FormEvent, useState } from "react";
import { api } from "./api";
import { BagIcon } from "./icons";
import type { HouseholdDetail, InvitePreview, Me } from "./types";

/** Pulls the token out of a pasted invite link (or accepts a bare token). */
export function parseInviteToken(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const token = new URL(text).searchParams.get("invite");
    if (token) return token;
  } catch {
    /* not a URL */
  }
  return /^[\w-]{16,}$/.test(text) ? text : null;
}

/** Shown to someone who isn't in any household yet: create one, or join with an invite link. */
export function Welcome({
  me,
  onCreated,
  onInviteToken,
  onSignOut,
}: {
  me: Me["user"];
  onCreated: (h: HouseholdDetail) => void;
  onInviteToken: (token: string) => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createHousehold(name.trim()));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const token = parseInviteToken(link);
    if (!token) return setError("That doesn’t look like an invite link.");
    onInviteToken(token);
  };

  return (
    <div className="app center-screen">
      <div className="hero">
        <BagIcon />
        <h1>Hi, {me.name.split(" ")[0]}!</h1>
        <p>Let’s set up your household. Everyone in it shares the same lists.</p>
      </div>

      {error && <div className="banner" role="alert">{error}</div>}

      <form className="stack" onSubmit={create}>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Household name, e.g. The Smiths"
          maxLength={60}
          autoComplete="off"
          aria-label="Household name"
        />
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          Create household
        </button>
      </form>

      <div className="divider">or join one</div>

      <form className="inline-form" onSubmit={join}>
        <input
          className="field"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Paste an invite link"
          autoComplete="off"
          aria-label="Invite link"
        />
        <button className="btn btn-secondary" disabled={!link.trim()}>
          Join
        </button>
      </form>

      <button className="link-btn center" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

/** "You've been invited" confirmation. */
export function JoinInvite({
  preview,
  onAccept,
  onDecline,
}: {
  preview: InvitePreview;
  onAccept: () => Promise<void>;
  onDecline: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="app center-screen">
      <div className="hero">
        <BagIcon />
        <h1>You’re invited</h1>
        <p>
          Join <strong>{preview.householdName}</strong> to share their grocery lists.
        </p>
      </div>
      {error && <div className="banner" role="alert">{error}</div>}
      <div className="stack">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onAccept();
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          Join household
        </button>
        <button className="btn btn-text" onClick={onDecline}>
          Not now
        </button>
      </div>
    </div>
  );
}
