import { useState, useEffect } from "react";
import { S, G } from "../styles/theme";
import { initials } from "../utils";
import { STUDENT_NAV, RECRUITER_NAV, ADMIN_NAV } from "../constants";
import { ChatSection } from "./sections/ChatSection";
import { MatchesSection } from "./sections/MatchesSection";
import { GuidesSection } from "./sections/GuidesSection";
import { RecruiterOverview } from "./sections/RecruiterOverview";
import { RecruiterJobsPane } from "./sections/RecruiterJobsPane";
import { RecruiterCompanyPane } from "./sections/RecruiterCompanyPane";
import { NewsSection } from "./sections/NewsSection";
import { MessagingSection } from "./sections/MessagingSection";
import { ProfileSection } from "./sections/ProfileSection";
import { AdminSection } from "./sections/AdminSection";


export function Dashboard({ user, token, onLogout, onUserRefresh }) {
  const employer = user.userType === "recruiter";
  const admin = user.userType === "super_admin";
  
  const [section, setSection] = useState(
    admin ? "admin_panel" : (employer ? "recruiter_home" : "chat")
  );
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    setSection(admin ? "admin_panel" : (employer ? "recruiter_home" : "chat"));
  }, [employer, admin]);

  const navItems = admin ? ADMIN_NAV : (employer ? RECRUITER_NAV : STUDENT_NAV);

  return (
    <>
      <style>{G}</style>
      <div style={S.app}>
        <nav style={S.nav}>
          <span style={S.navLogo}>SCHLR</span>
          {navItems.map((item) => (
            <button key={item.id} type="button" onClick={() => setSection(item.id)} style={S.navItem(section === item.id)}>
              {item.icon} {item.label}
            </button>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 8 }}>
            {(employer || admin) && (
              <span style={{ padding: "3px 10px", borderRadius: 99, background: "var(--brown4)", color: "var(--white)", fontSize: 11, fontWeight: 600 }}>
                {admin ? "ADMIN" : "RECRUITER"}
              </span>
            )}
            <div
              className="avatar"
              style={{
                width: 34,
                height: 34,
                background: "var(--brown2)",
                color: "var(--white)",
                fontSize: 12,
                cursor: "default",
                overflow: "hidden",
              }}>
              {user.avatar && String(user.avatar).startsWith("http") ? (
                <img src={user.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                initials(user.name || "U")
              )}
            </div>
            <button type="button" onClick={onLogout} className="btn-ghost" style={{ padding: "7px 16px", fontSize: 13 }}>
              Sign out
            </button>
          </div>
        </nav>

        <div style={{ padding: "28px 32px", flex: 1, overflow: "auto" }}>
          {!employer && section === "chat" && <ChatSection user={user} token={token} />}
          {!employer && section === "matches" && <MatchesSection token={token} />}
          {!employer && section === "guides" && <GuidesSection />}
          {employer && section === "recruiter_home" && <RecruiterOverview token={token} />}
          {employer && section === "recruiter_jobs" && <RecruiterJobsPane token={token} />}
          {employer && section === "recruiter_company" && (
            <RecruiterCompanyPane token={token} user={user} onUserRefresh={onUserRefresh} />
          )}
          {admin && section === "admin_panel" && <AdminSection token={token} />}
          {section === "news" && <NewsSection user={user} token={token} onPostsUpdated={setPosts} />}
          {section === "messages" && <MessagingSection user={user} token={token} />}
          {section === "profile" && (
            <ProfileSection user={user} allPosts={posts} token={token} onUserRefresh={onUserRefresh} />
          )}
        </div>
      </div>
    </>
  );
}
