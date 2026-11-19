import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { HouseholdSheet } from "./HouseholdSheet";
import { ChevronIcon, CheckIcon, CloseIcon, MicIcon, PlusIcon, StopIcon, BagIcon } from "./icons";
import { ListSheet } from "./ListSheet";
import { parseItems } from "./parseItems";
import type { HouseholdDetail, Item, Me } from "./types";
import { useDictation } from "./useDictation";
import { useHousehold } from "./useHousehold";
import { useItems } from "./useItems";

const SUGGESTIONS = ["Milk", "Eggs", "Bread", "Bananas", "Coffee", "Butter"];

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

const listKey = (hid: string) => `grocery.list.${hid}`;

export function Home({
  me,
  households,
  hid,
  onSwitchHousehold,
  onAccountChanged,
  onCreatedHousehold,
  onSignOut,
}: {
  me: Me["user"];
  households: Me["households"];
  hid: string;
  onSwitchHousehold: (hid: string) => void;
  onAccountChanged: () => void;
  onCreatedHousehold: (h: HouseholdDetail) => void;
  onSignOut: () => void;
}) {
  const { detail, refresh } = useHousehold(hid);
  const [selected, setSelected] = useState<string | null>(() => localStorage.getItem(listKey(hid)));
  const [sheet, setSheet] = useState<null | "household" | "new-list" | "edit-list">(null);

  useEffect(() => setSelected(localStorage.getItem(listKey(hid))), [hid]);

  // Fall back to the first list if the remembered one is gone (deleted by someone else, say).
  const activeList = detail ? (detail.lists.find((l) => l.id === selected) ?? detail.lists[0] ?? null) : null;
  const selectList = (id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(listKey(hid), id);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {detail && activeList ? (
        <ListScreen
          key={`${hid}/${activeList.id}`}
          hid={hid}
          detail={detail}
          list={activeList}
          onSelectList={selectList}
          onOpenHousehold={() => setSheet("household")}
          onNewList={() => setSheet("new-list")}
          onEditList={() => setSheet("edit-list")}
        />
      ) : (
        <div className="app">
          <header className="header">
            <h1>Groceries</h1>
          </header>
          <main className="main">
            <div className="skeleton" />
            <div className="skeleton" />
          </main>
        </div>
      )}

      {detail && sheet === "household" && (
        <HouseholdSheet
          me={me}
          detail={detail}
          households={households}
          onClose={() => setSheet(null)}
          onSwitch={(id) => {
            setSheet(null);
            if (id !== hid) onSwitchHousehold(id);
          }}
          onMembersChanged={() => void refresh()}
          onLeft={() => {
            setSheet(null);
            onAccountChanged();
          }}
          onCreated={(h) => {
            setSheet(null);
            onCreatedHousehold(h);
          }}
          onSignOut={onSignOut}
        />
      )}
      {detail && (sheet === "new-list" || sheet === "edit-list") && (
        <ListSheet
          hid={hid}
          detail={detail}
          editing={sheet === "edit-list" && activeList ? activeList : null}
          onClose={() => setSheet(null)}
          onDone={(id) => {
            setSheet(null);
            if (id) selectList(id);
            void refresh();
          }}
        />
      )}
    </>
  );
}

function ListScreen({
  hid,
  detail,
  list,
  onSelectList,
  onOpenHousehold,
  onNewList,
  onEditList,
}: {
  hid: string;
  detail: HouseholdDetail;
  list: { id: string; name: string };
  onSelectList: (id: string) => void;
  onOpenHousehold: () => void;
  onNewList: () => void;
  onEditList: () => void;
}) {
  const { items, status, add, toggle, remove, clearChecked } = useItems(hid, list.id);
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

  // Keep the active tab visible when there are many lists.
  useEffect(() => {
    document.querySelector(".tab.active")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [list.id, detail.lists.length]);

  const canAddList = detail.lists.length < detail.household.maxLists;

  return (
    <div className="app">
      <header className="header">
        <button className="hh-pill" onClick={onOpenHousehold} aria-label="Household settings">
          <span className="avatar sm">{detail.household.name.charAt(0).toUpperCase()}</span>
          <span>{detail.household.name}</span>
          <ChevronIcon />
        </button>
        <h1>{list.name}</h1>
        <p>{subtitle}</p>
      </header>

      <nav className="tabs" aria-label="Lists">
        {detail.lists.map((l) => (
          <button
            key={l.id}
            className={`tab${l.id === list.id ? " active" : ""}`}
            onClick={() => (l.id === list.id ? onEditList() : onSelectList(l.id))}
            aria-current={l.id === list.id}
          >
            {l.name}
          </button>
        ))}
        {canAddList && (
          <button className="tab add" onClick={onNewList}>
            + New list
          </button>
        )}
      </nav>

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
