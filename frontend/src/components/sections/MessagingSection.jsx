import { useState, useRef, useEffect } from "react";
import { S } from "../../styles/theme";
import { API_BASE, initials } from "../../utils";

export function MessagingSection({ user, token }) {
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);

  const authH = { Authorization: `Bearer ${token}` };

  const loadThreads = async () => {
    try {
      const r = await fetch(`${API_BASE}/dm/threads`, { headers: authH });
      const data = await r.json().catch(() => []);
      setThreads(Array.isArray(data) ? data : []);
    } catch {
      setThreads([]);
    }
  };

  useEffect(() => { loadThreads(); }, [token]);

  const openThread = async (th) => {
    setActiveThread(th);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/dm/threads/${th.thread_id}/messages`, { headers: authH });
      const data = await r.json().catch(() => []);
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setMessages([]);
    }
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = searchQ.trim();
      if (q.length < 2) {
        setSearchHits([]);
        return;
      }
      try {
        const r = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(q)}`, { headers: authH });
        const d = await r.json();
        setSearchHits(d.users || []);
      } catch {
        setSearchHits([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchQ, token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeThread]);

  const startDm = async (hit) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/dm/threads`, {
        method: "POST",
        headers: { ...authH, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: hit.id }),
      });
      const thread = await r.json();
      if (!r.ok) throw new Error(thread.detail || "Could not open conversation.");
      await loadThreads();
      setSearchQ("");
      setSearchHits([]);
      await openThread(thread);
    } catch (e) {
      setErr(e.message || "Could not start chat.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!input.trim() || !activeThread) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/dm/threads/${activeThread.thread_id}/messages`, {
        method: "POST",
        headers: { ...authH, "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Send failed");
      setInput("");
      await openThread(activeThread);
      await loadThreads();
    } catch (e) {
      setErr(e.message || "Send failed.");
    } finally {
      setBusy(false);
    }
  };

  const titleForThread = (th) =>
    th?.other_user?.name || "Conversation";

  const subForThread = (th) =>
    (th?.other_user?.handle ? "@" + th.other_user.handle : "") ||
    "";

  const activePeer = activeThread?.other_user;
  const label = activePeer ? `${activePeer.name} (${activePeer.handle ? "@" + activePeer.handle : ""})` : "Select or start a conversation";

  return (
    <div style={{ height: "calc(100vh - 62px - 56px)" }}>
      <div style={{ ...S.msgLayout, height: "100%" }}>
        <div style={S.contactList}>
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--brown4)" }}>Inbox</div>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Find people by name or @handle…"
              style={{
                ...S.input,
                marginTop: 10,
                padding: "8px 12px",
                borderRadius: 10,
                fontSize: 13,
              }}
            />
            {searchHits.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 160,
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--cream)",
                }}>
                {searchHits.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={busy}
                    onClick={() => startDm(u)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      background: "transparent",
                      cursor: "pointer",
                      fontFamily: "var(--sans)",
                      fontSize: 13,
                    }}>
                    {u.name}{" "}
                    <span style={{ color: "var(--muted)" }}>@{u.handle}</span>
                    {u.user_type === "recruiter" && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          padding: "2px 6px",
                          borderRadius: 99,
                          background: "var(--brown4)",
                          color: "var(--white)",
                          fontWeight: 600,
                        }}>
                        REC
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {threads.map((th) => {
            const last = th.last_message;
            const isRecruiter = th.other_user?.user_type === "recruiter";
            const active = activeThread?.thread_id === th.thread_id;
            return (
              <div key={th.thread_id} onClick={() => openThread(th)} style={S.contactItem(active)}>
                <div
                  className="avatar"
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    background: isRecruiter ? "var(--brown3)" : "var(--brown1)",
                    color: "var(--white)",
                    fontSize: 13,
                  }}>
                  {initials(titleForThread(th))}
                </div>
                <div style={{ overflow: "hidden" }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--brown4)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                    {titleForThread(th)}
                    {subForThread(th) && (
                      <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 6 }}>
                        @{th.other_user?.handle}
                      </span>
                    )}
                    {isRecruiter && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 99,
                          background: "var(--brown4)",
                          color: "var(--white)",
                          fontWeight: 600,
                        }}>
                        RECRUITER
                      </span>
                    )}
                  </div>
                  {last?.text && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                      {last.sender_id === user.id ? "You: " : ""}
                      {last.text}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {threads.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: "var(--muted)" }}>
              No conversations yet. Search for a student or recruiter above to send the first message.
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "var(--cream)",
            }}>
            <div className="avatar" style={{ width: 38, height: 38, background: "var(--brown2)", color: "var(--white)", fontSize: 13 }}>
              {activePeer?.name ? initials(activePeer.name) : "⋯"}
            </div>
            <div style={{ fontWeight: 600, color: "var(--brown4)" }}>{label}</div>
          </div>

          {!!err && (
            <div style={{ padding: "8px 16px", fontSize: 13, background: "#FCEBE9", color: "#8A2E25" }}>{err}</div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m) => {
              const mine = m.sender_id === user.id;
              const when = m.created_at ? new Date(m.created_at).toLocaleString() : "";
              return (
                <div
                  key={m._id}
                  style={{
                    display: "flex",
                    justifyContent: mine ? "flex-end" : "flex-start",
                    gap: 8,
                    alignItems: "flex-end",
                  }}>
                  {!mine && (
                    <div className="avatar" style={{ width: 28, height: 28, background: "var(--brown1)", color: "var(--white)", fontSize: 11 }}>
                      {initials(activePeer?.name || "P")}
                    </div>
                  )}
                  <div>
                    <div style={S.bubble(mine)}>{m.text}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, textAlign: mine ? "right" : "left" }}>{when}</div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              disabled={!activeThread || busy}
              placeholder={activeThread ? "Write a secure message…" : "Pick a conversation from the left"}
              style={{ flex: 1, ...S.input, borderRadius: 99, padding: "11px 18px", opacity: activeThread ? 1 : 0.6 }}
            />
            <button onClick={send} disabled={!activeThread || busy} className="btn-primary" style={{ padding: "11px 22px", opacity: activeThread ? 1 : 0.5 }}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
