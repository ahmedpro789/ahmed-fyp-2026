import { useState, useEffect } from "react";
import { S } from "../../styles/theme";
import { API_BASE } from "../../utils";

export function RecruiterJobsPane({ token }) {
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    employment_type: "Internship",
    location_type: "Hybrid",
    location: "",
    apply_how: "",
    skills: "",
    deadline: "",
  });

  const load = async () => {
    const r = await fetch(`${API_BASE}/recruiter/jobs/me`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json().catch(() => ({}));
    setJobs(Array.isArray(d.jobs) ? d.jobs : []);
  };

  useEffect(() => { load(); }, [token]);

  const submit = async () => {
    setBusy(true);
    setMsg("");
    try {
      const skills_keywords = form.skills
        ? form.skills.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const deadline = form.deadline ? new Date(form.deadline).toISOString() : null;
      const r = await fetch(`${API_BASE}/recruiter/jobs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          employment_type: form.employment_type,
          location_type: form.location_type,
          location: form.location || null,
          apply_how: form.apply_how,
          skills_keywords,
          deadline,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : "Publish failed.");
      setForm({ title: "", description: "", employment_type: "Internship", location_type: "Hybrid", location: "", apply_how: "", skills: "", deadline: "" });
      setMsg("Job published.");
      load();
    } catch (e) {
      setMsg(e.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Remove this posting?")) return;
    await fetch(`${API_BASE}/recruiter/jobs/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    load();
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, marginBottom: 8, color: "var(--brown4)" }}>Job postings</h1>
      <p style={{ color: "var(--muted)", marginBottom: 20 }}>
        Roles appear for your sourcing workflow; SCHLR recommends linking to your ATS or inbox in “How to apply”.
      </p>
      <div className="card" style={{ padding: 22, marginBottom: 26 }}>
        {[
          ["Job title", "title", "text"],
          ["Description", "description", "area"],
          ["Employment type", "employment_type", "text"],
          ["Location mode", "location_type", "text"],
          ["Office / region", "location", "text"],
          ["How to apply", "apply_how", "textarea"],
          ["Skills keywords (comma-separated)", "skills", "text"],
          ["Deadline (optional)", "deadline", "datetime-local"],
        ].map(([label, field, typ]) => (
          <div key={field} style={{ marginBottom: 14 }}>
            <label style={{ ...S.label, display: "block", marginBottom: 6 }}>{label}</label>
            {typ === "textarea" ? (
              <textarea
                rows={4}
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                style={{ ...S.input, width: "100%", resize: "vertical", padding: "10px 14px", borderRadius: 10 }}
              />
            ) : (
              <input
                type={typ}
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                style={{ ...S.input, width: "100%", padding: "10px 14px", borderRadius: 10 }}
              />
            )}
          </div>
        ))}
        {msg && (
          <div style={{ marginBottom: 10, fontSize: 13, color: msg.includes("Error") ? "#8A2E25" : "#1A7A4A" }}>{msg}</div>
        )}
        <button type="button" disabled={busy} onClick={submit} className="btn-primary">
          Publish role
        </button>
      </div>
      {(jobs || []).map((j) => (
        <div key={j._id} className="card" style={{ padding: 18, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--brown4)" }}>{j.title}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {j.employment_type} · {j.location_type}
                {j.location ? ` · ${j.location}` : ""}
              </div>
            </div>
            <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => remove(j._id)}>
              Archive
            </button>
          </div>
          <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{j.description}</p>
          <div style={{ fontSize: 13, marginTop: 10, fontWeight: 600, color: "var(--brown3)" }}>
            Apply:{" "}
            <span style={{ fontWeight: 400, wordBreak: "break-all" }}>{j.apply_how}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
