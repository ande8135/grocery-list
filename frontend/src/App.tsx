import { type FormEvent, useMemo, useRef, useState } from "react";
import { parseItems } from "./parseItems";
import { useDictation } from "./useDictation";
import { useItems } from "./useItems";
import type { Item } from "./types";

const SUGGESTIONS = ["Milk", "Eggs", "Bread", "Bananas", "Coffee", "Butter"];

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </svg>
);
const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
  </svg>
);
const BagIcon = () => (
  <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M24 34h48l-4 44a6 6 0 0 1-6 5.5H34a6 6 0 0 1-6-5.5z" fill="currentColor" fillOpacity=".1" />
    <path d="M36 34v-6a12 12 0 0 1 24 0v6" />
    <path d="M42 58l5 5 9-10" />
  </svg>
);

function Row({ item, onToggle, onRemove }: { item: Item; onToggle: () => void; onRemove: () => void }) {
  return (
    <li className={`row${item.checked ? " done" : ""}`}>
      <button className="row-main" onClick={onToggle} aria-pressed={item.checked}>
        <span className="check">
          <CheckIcon />
        </span>
        <span className="name">{item.name}</span>
      </button>
      <button className="remove" onClick={onRemove} aria-label={`Remove ${item.name}`}>
        <CloseIcon />
      </button>
    </li>
  );
}

export default function App() {
  const { items, status, add, toggle, remove, clearChecked } = useItems();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { todo, done } = useMemo(() => {
    const byCreated = (a: Item, b: Item) => a.createdAt.localeCompare(b.createdAt);
    const byUpdatedDesc = (a: Item, b: Item) => b.updatedAt.localeCompare(a.updatedAt);
    return {
      todo: items.filter((i) => !i.checked).sort(byCreated),
      done: items.filter((i) => i.checked).sort(byUpdatedDesc),
    };
  }, [items]);

  const dictation = useDictation((spoken) => parseItems(spoken).forEach(add));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add(text);
    setText("");
    inputRef.current?.focus(); // keep the keyboard up so several items can be added quickly
  };

  const subtitle =
    status === "loading"
      ? ""
      : items.length === 0
        ? "Your list is empty"
        : todo.length === 0
          ? "All done — nice!"
          : `${todo.length} to get${done.length ? ` · ${done.length} in the cart` : ""}`;

  return (
    <div className="app">
      <header className="header">
        <h1>Groceries</h1>
        <p>{subtitle}</p>
      </header>

      {dictation.error && <div className="banner" role="alert">{dictation.error}</div>}

      {status === "error" && <div className="banner" role="status">Can’t reach the server — retrying…</div>}

      <main className="main">
        {status === "loading" ? (
          <>
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </>
        ) : items.length === 0 ? (
          <div className="empty">
            <BagIcon />
            <h2>Nothing on the list</h2>
            <p>Add something below, or tap a favorite.</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => add(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {todo.length > 0 && (
              <ul className="list">
                {todo.map((i) => (
                  <Row key={i.id} item={i} onToggle={() => toggle(i.id)} onRemove={() => remove(i.id)} />
                ))}
              </ul>
            )}
            {done.length > 0 && (
              <>
                <div className="section-head">
                  <span>In the cart</span>
                  <button className="link-btn" onClick={clearChecked}>
                    Clear
                  </button>
                </div>
                <ul className="list">
                  {done.map((i) => (
                    <Row key={i.id} item={i} onToggle={() => toggle(i.id)} onRemove={() => remove(i.id)} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </main>

      <div className="addbar">
        {dictation.listening && (
          <div className="listening" role="status" aria-live="polite">
            <span className="pulse" />
            <div>
              <strong>Listening…</strong>
              <p>{dictation.transcript || "Say what you need, e.g. “milk, eggs and bread”"}</p>
            </div>
          </div>
        )}
        <form onSubmit={submit}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add an item…"
            maxLength={80}
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="sentences"
            aria-label="Add an item"
          />
          {dictation.supported && !text.trim() ? (
            <button
              className={`add-btn mic${dictation.listening ? " on" : ""}`}
              type="button"
              onClick={dictation.toggle}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? "Stop and add items" : "Dictate items"}
            >
              {dictation.listening ? <StopIcon /> : <MicIcon />}
            </button>
          ) : (
            <button className="add-btn" type="submit" disabled={!text.trim()} aria-label="Add">
              <PlusIcon />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
