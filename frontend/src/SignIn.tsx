import { useState } from "react";
import { devSignIn, startSignIn } from "./auth";
import type { AppConfig } from "./config";
import { BagIcon } from "./icons";

export function SignIn({ cfg, notice }: { cfg: AppConfig; notice?: string | null }) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="app center-screen">
      <div className="hero">
        <BagIcon />
        <h1>Groceries</h1>
        <p>One shared list for the whole household.</p>
      </div>

      {notice && <div className="banner" role="alert">{notice}</div>}

      <div className="stack">
        {cfg.mode === "cognito" ? (
          <>
            {cfg.providers.map((p) => (
              <button
                key={p.id}
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void startSignIn(cfg, p.id);
                }}
              >
                Continue with {p.label}
              </button>
            ))}
            <p className="fineprint">We only use your name and email to show who’s in your household.</p>
          </>
        ) : (
          <>
            <p className="fineprint">Local development: pick a pretend person. Use two browsers to try invites.</p>
            {["Alice", "Bob", "Carol"].map((n) => (
              <button key={n} className="btn btn-secondary" onClick={() => devSignIn(n)}>
                Continue as {n}
              </button>
            ))}
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (custom.trim()) devSignIn(custom.trim());
              }}
            >
              <input className="field" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Someone else…" />
              <button className="btn btn-primary" disabled={!custom.trim()}>
                Go
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
