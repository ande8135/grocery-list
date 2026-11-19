import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api, ApiError, setApiConfig } from "./api";
import { completeSignIn, isSignedIn, onSessionChange, signOut } from "./auth";
import { type AppConfig, loadConfig } from "./config";
import { Home } from "./Home";
import { SignIn } from "./SignIn";
import type { HouseholdDetail, InvitePreview, Me } from "./types";
import { JoinInvite, Welcome } from "./Welcome";

const INVITE_KEY = "grocery.invite";
const HH_KEY = "grocery.household";

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

type Boot = { phase: "loading" } | { phase: "failed"; message: string } | { phase: "ready"; cfg: AppConfig; notice: string | null };

export default function App() {
  const [boot, setBoot] = useState<Boot>({ phase: "loading" });
  const signedIn = useSyncExternalStore(onSessionChange, isSignedIn);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await loadConfig();
        setApiConfig(cfg);

        // An invite link (?invite=...) is remembered across the sign-in redirect.
        const url = new URL(window.location.href);
        const invite = url.searchParams.get("invite");
        if (invite) {
          store.set(INVITE_KEY, invite);
          url.searchParams.delete("invite");
          window.history.replaceState(null, "", url.pathname + url.search);
        }

        const notice = await completeSignIn(cfg);
        setBoot({ phase: "ready", cfg, notice });
      } catch (err) {
        setBoot({ phase: "failed", message: (err as Error).message });
      }
    })();
  }, []);

  if (boot.phase === "loading") return <div className="app center-screen" aria-busy="true" />;
  if (boot.phase === "failed") {
    return (
      <div className="app center-screen">
        <div className="banner" role="alert">{boot.message}</div>
      </div>
    );
  }
  if (!signedIn) return <SignIn cfg={boot.cfg} notice={boot.notice} />;
  return <Account cfg={boot.cfg} />;
}

/** Everything that needs a signed-in user: load the account, then route to the right screen. */
function Account({ cfg }: { cfg: AppConfig }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hid, setHid] = useState<string | null>(() => store.get(HH_KEY));
  const [invite, setInvite] = useState<{ token: string; preview: InvitePreview } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const logOut = useCallback(() => {
    store.set(HH_KEY, null);
    signOut(cfg);
  }, [cfg]);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.me());
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return; // session ended; the sign-in screen takes over
      setError((err as Error).message);
    }
  }, []);

  const startInvite = useCallback(async (token: string) => {
    try {
      const preview = await api.previewInvite(token);
      store.set(INVITE_KEY, null);
      if (preview.alreadyMember) {
        setHid(preview.householdId);
        return;
      }
      setInvite({ token, preview });
    } catch (err) {
      store.set(INVITE_KEY, null);
      setInviteError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadMe();
      const pending = store.get(INVITE_KEY);
      if (pending) await startInvite(pending);
    })();
  }, [loadMe, startInvite]);

  const select = useCallback((id: string) => {
    store.set(HH_KEY, id);
    setHid(id);
  }, []);

  const joined = useCallback(
    async (h: HouseholdDetail) => {
      setInvite(null);
      select(h.household.id);
      await loadMe();
    },
    [loadMe, select],
  );

  if (error) {
    return (
      <div className="app center-screen">
        <div className="banner" role="alert">{error}</div>
        <button className="btn btn-secondary" onClick={() => void loadMe()}>
          Try again
        </button>
        <button className="link-btn center" onClick={logOut}>Sign out</button>
      </div>
    );
  }
  if (!me) return <div className="app center-screen" aria-busy="true" />;

  if (invite) {
    return (
      <JoinInvite
        preview={invite.preview}
        onAccept={async () => joined(await api.acceptInvite(invite.token))}
        onDecline={() => setInvite(null)}
      />
    );
  }

  if (me.households.length === 0) {
    return (
      <>
        {inviteError && <div className="banner floating" role="alert">{inviteError}</div>}
        <Welcome me={me.user} onCreated={joined} onInviteToken={(t) => void startInvite(t)} onSignOut={logOut} />
      </>
    );
  }

  const current = me.households.find((h) => h.id === hid) ?? me.households[0]!;
  return (
    <Home
      key={current.id}
      me={me.user}
      households={me.households}
      hid={current.id}
      onSwitchHousehold={select}
      onAccountChanged={() => void loadMe()}
      onCreatedHousehold={(h) => void joined(h)}
      onSignOut={logOut}
    />
  );
}
