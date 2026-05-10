import { useState, useRef, useEffect } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────
const G = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Jost:wght@300;400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --cream:    #F5EFE6;
  --cream2:   #EDE3D5;
  --cream3:   #E2D5C3;
  --brown1:   #C4A882;
  --brown2:   #9C7A56;
  --brown3:   #6B4F35;
  --brown4:   #3E2C1A;
  --brown5:   #251910;
  --white:    #FDFAF6;
  --text:     #2A1E12;
  --muted:    #7A6350;
  --border:   rgba(100,70,40,0.14);
  --shadow:   0 4px 24px rgba(62,44,26,0.10);
  --shadowlg: 0 12px 48px rgba(62,44,26,0.18);
  --radius:   14px;
  --radiussm: 8px;
  --serif:    'DM Serif Display', serif;
  --sans:     'Jost', sans-serif;
  --transition: 0.22s cubic-bezier(0.4,0,0.2,1);
}

body { background: var(--cream); color: var(--text); font-family: var(--sans); font-size: 15px; line-height: 1.6; }

button { font-family: var(--sans); cursor: pointer; border: none; outline: none; }
input, textarea, select { font-family: var(--sans); outline: none; }

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--cream2); }
::-webkit-scrollbar-thumb { background: var(--brown1); border-radius: 99px; }

.serif { font-family: var(--serif); }

/* ── Shared components ── */
.btn-primary {
  background: var(--brown3);
  color: var(--white);
  padding: 10px 22px;
  border-radius: 99px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  transition: background var(--transition), transform var(--transition);
}
.btn-primary:hover { background: var(--brown4); transform: translateY(-1px); }

.btn-ghost {
  background: transparent;
  color: var(--brown3);
  padding: 10px 22px;
  border-radius: 99px;
  font-size: 14px;
  font-weight: 500;
  border: 1.5px solid var(--brown2);
  transition: all var(--transition);
}
.btn-ghost:hover { background: var(--cream2); }

.card {
  background: var(--white);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.avatar {
  border-radius: 50%;
  object-fit: cover;
  background: var(--cream3);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--serif);
  color: var(--brown3);
  font-size: 16px;
  flex-shrink: 0;
}
`;

// ─── SEED DATA ─────────────────────────────────────────
const SEED_POSTS = [
  { id:1, user:"Ayesha Raza", handle:"ayesharaza", avatar:"AR", type:"student",
    time:"2h ago", tag:"Achievement", tagColor:"#6B4F35", tagBg:"#EDE3D5",
    text:"Just got selected for the Chevening Scholarship 2025! 🎉 The key was a strong SOP and 3 solid references. Happy to help anyone applying!",
    likes:142, comments:23, liked:false, saved:false,
    commentList:[{u:"Hamza K",t:"Congratulations! Can you share your SOP template?"},
                 {u:"Sara M",t:"Amazing! Which country?"}] },
  { id:2, user:"Bilal Ahmed", handle:"bilalahmed", avatar:"BA", type:"student",
    time:"5h ago", tag:"Tip", tagColor:"#9C7A56", tagBg:"#F5EFE6",
    text:"Pro tip for DAAD applications: Start your language certificate early. The Goethe-Institut has 3-month wait times. Also, contact professors BEFORE applying — having a supervisor letter makes your app 10× stronger.",
    likes:89, comments:14, liked:true, saved:false,
    commentList:[{u:"Nadia T",t:"This saved me so much time. Thank you!"}] },
  { id:3, user:"TechBridge Co.", handle:"techbridge", avatar:"TB", type:"recruiter",
    time:"1d ago", tag:"Internship Open", tagColor:"#3E2C1A", tagBg:"#C4A882",
    text:"We are hiring 3 Software Engineering interns for Summer 2025. Remote-friendly, stipend PKR 60k/month. Looking for students with React or Python background. DM or apply via profile link.",
    likes:211, comments:47, liked:false, saved:true,
    commentList:[{u:"Ali H",t:"Applied! Looking forward to hearing back."},{u:"Zara B",t:"Is it open for fresh grads?"}] },
];

const SEED_NEWS = [
  { id:1, site:"scholarshiproar.com", status:"online", favicon:"🎓",
    title:"Chevening Scholarships 2025-26 Applications Now Open", time:"2h ago",
    snippet:"The UK government's Chevening program opens applications for fully-funded master's degrees. Deadline: November 5, 2025.", tag:"Fully Funded" },
  { id:2, site:"scholarships.com", status:"online", favicon:"📚",
    title:"DAAD EPOS Scholarships for Developing Countries", time:"5h ago",
    snippet:"Germany's DAAD announces scholarships for graduates from developing countries. Covers tuition, living allowance, and travel.", tag:"Merit Based" },
  { id:3, site:"scholarshiproar.com", status:"online", favicon:"🎓",
    title:"Gates Cambridge Scholarship — Deadline Approaching", time:"1d ago",
    snippet:"One of the most prestigious fully-funded awards covering full cost of study at Cambridge University.", tag:"Fully Funded" },
  { id:4, site:"scholarships.com", status:"online", favicon:"📚",
    title:"Commonwealth Shared Scholarship 2025", time:"2d ago",
    snippet:"Commonwealth Scholarship Commission opens applications for students from low and middle income countries.", tag:"Need Based" },
];

const MESSAGES_SEED = {
  "Hamza Khan": [
    { from:"them", text:"Hey! Did you apply for Chevening this cycle?", time:"10:32 AM" },
    { from:"me",   text:"Yes! Just submitted last week. You?", time:"10:34 AM" },
    { from:"them", text:"Still working on my SOP. Could you review it?", time:"10:35 AM" },
    { from:"me",   text:"Of course, send it over!", time:"10:36 AM" },
  ],
  "Sara Malik": [
    { from:"them", text:"The DAAD tip from your post was so helpful!", time:"Yesterday" },
    { from:"me",   text:"Really glad it helped 😊", time:"Yesterday" },
  ],
  "TechBridge Co.": [
    { from:"them", text:"We reviewed your profile. Interested in an interview?", time:"Mon" },
    { from:"me",   text:"Absolutely! I'm available this week.", time:"Mon" },
  ],
};

const SPECIALIZED_BOTS = [
  { id:"general",   name:"SCHLR AI",        icon:"✦",  desc:"General scholarship assistant" },
  { id:"funded",    name:"FullFund Bot",    icon:"💰", desc:"Fully funded opportunities" },
  { id:"merit",     name:"Merit Advisor",   icon:"🏆", desc:"Merit-based scholarships" },
  { id:"need",      name:"Need-Based Aid",  icon:"🤝", desc:"Financial aid & grants" },
  { id:"intern",    name:"Internship Pro",  icon:"💼", desc:"Internship & career advice" },
  { id:"phd",       name:"PhD Guide",       icon:"🎓", desc:"Doctoral programs & funding" },
];

// ─── UTILS ────────────────────────────────────────────
const initials = (name) => name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
const API_BASE = "http://127.0.0.1:8000";

const toFrontendPost = (post, myUserId) => {
  const comments = post.comments || [];
  const likedBy = post.liked_by || [];
  const savedBy = post.saved_by || [];
  return {
    id: post._id,
    user: post.user_name || "Unknown User",
    handle: post.user_handle || "",
    avatar: post.user_avatar || initials(post.user_name || "U"),
    type: post.user_type || "student",
    time: post.created_at ? new Date(post.created_at).toLocaleString() : "Just now",
    tag: post.tag || "General",
    tagColor:"var(--brown3)",
    tagBg:"var(--cream2)",
    text: post.text || "",
    likes: post.likes || 0,
    comments: comments.length,
    liked: myUserId ? likedBy.includes(myUserId) : false,
    saved: myUserId ? savedBy.includes(myUserId) : false,
    commentList: comments.map((c) => ({ u: c.user_name || "Unknown", t: c.text || "" })),
  };
};

// ─── INLINE STYLES ────────────────────────────────────
const S = {
  // Layout
  app:      { minHeight:"100vh", background:"var(--cream)", display:"flex", flexDirection:"column" },
  // Nav
  nav:      { background:"var(--white)", borderBottom:"1px solid var(--border)", padding:"0 32px",
               display:"flex", alignItems:"center", gap:"12px", height:"62px", position:"sticky", top:0, zIndex:100,
               boxShadow:"0 2px 12px rgba(62,44,26,0.06)" },
  navLogo:  { fontFamily:"var(--serif)", fontSize:"26px", color:"var(--brown4)", letterSpacing:"-0.5px",
               fontStyle:"italic", marginRight:"auto" },
  navItem:  (active) => ({
    padding:"8px 16px", borderRadius:99, fontSize:"14px", fontWeight:500,
    background: active ? "var(--brown3)" : "transparent",
    color: active ? "var(--white)" : "var(--muted)",
    cursor:"pointer", border:"none", fontFamily:"var(--sans)",
    transition:"all var(--transition)",
  }),
  // Auth
  authWrap: { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
               background:"var(--cream)", position:"relative", overflow:"hidden" },
  authCard: { background:"var(--white)", borderRadius:20, boxShadow:"var(--shadowlg)",
               border:"1px solid var(--border)", width:"100%", maxWidth:480, padding:"44px 40px" },
  authTitle:{ fontFamily:"var(--serif)", fontSize:"36px", color:"var(--brown4)", lineHeight:1.15, marginBottom:6 },
  field:    { display:"flex", flexDirection:"column", gap:6, marginBottom:16 },
  label:    { fontSize:"12px", fontWeight:600, color:"var(--muted)", letterSpacing:"0.06em", textTransform:"uppercase" },
  input:    { background:"var(--cream)", border:"1.5px solid var(--border)", borderRadius:10,
               padding:"11px 16px", fontSize:"14px", color:"var(--text)", transition:"border var(--transition)" },
  // Dashboard
  dash:     { display:"flex", flex:1, height:"calc(100vh - 62px)", overflow:"hidden" },
  sidebar:  { width:220, background:"var(--white)", borderRight:"1px solid var(--border)",
               display:"flex", flexDirection:"column", padding:"20px 0", flexShrink:0 },
  sideItem: (active) => ({
    display:"flex", alignItems:"center", gap:12, padding:"11px 22px",
    borderRadius:"0 99px 99px 0", marginRight:16, marginBottom:2,
    background: active ? "var(--cream2)" : "transparent",
    color: active ? "var(--brown3)" : "var(--muted)",
    cursor:"pointer", fontSize:"14px", fontWeight: active ? 600 : 400,
    borderLeft: active ? "3px solid var(--brown3)" : "3px solid transparent",
    transition:"all var(--transition)",
  }),
  main:     { flex:1, overflow:"auto", padding:"28px 32px" },
  // Chat
  chatWrap: { display:"flex", height:"100%", gap:0, background:"var(--white)",
               borderRadius:var_radius, border:"1px solid var(--border)", overflow:"hidden" },
  botList:  { width:220, borderRight:"1px solid var(--border)", background:"var(--cream)",
               padding:"16px 12px", display:"flex", flexDirection:"column", gap:6, overflowY:"auto" },
  botItem:  (active) => ({
    padding:"12px 14px", borderRadius:10, cursor:"pointer",
    background: active ? "var(--white)" : "transparent",
    boxShadow: active ? "var(--shadow)" : "none",
    transition:"all var(--transition)", border:"1px solid",
    borderColor: active ? "var(--border)" : "transparent",
  }),
  chatMain: { flex:1, display:"flex", flexDirection:"column" },
  chatHdr:  { padding:"16px 20px", borderBottom:"1px solid var(--border)",
               display:"flex", alignItems:"center", gap:12 },
  msgs:     { flex:1, overflowY:"auto", padding:"20px", display:"flex", flexDirection:"column", gap:14 },
  bubble:   (mine) => ({
    maxWidth:"70%", padding:"12px 16px", borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
    background: mine ? "var(--brown3)" : "var(--cream2)",
    color: mine ? "var(--white)" : "var(--text)",
    alignSelf: mine ? "flex-end" : "flex-start",
    fontSize:14, lineHeight:1.55,
  }),
  chatInput:{ display:"flex", gap:10, padding:"16px 20px", borderTop:"1px solid var(--border)" },
  msgInput: { flex:1, background:"var(--cream)", border:"1.5px solid var(--border)",
               borderRadius:99, padding:"11px 18px", fontSize:14, resize:"none" },
  sendBtn:  { background:"var(--brown3)", color:"var(--white)", borderRadius:99,
               padding:"11px 22px", fontSize:14, fontWeight:500, border:"none", cursor:"pointer" },
  // News
  newsGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:20 },
  newsCard: { background:"var(--white)", borderRadius:var_radius, border:"1px solid var(--border)",
               padding:"22px", display:"flex", flexDirection:"column", gap:10,
               transition:"transform var(--transition), box-shadow var(--transition)" },
  // Posts
  postCard: { background:"var(--white)", borderRadius:var_radius, border:"1px solid var(--border)",
               padding:"22px", marginBottom:18 },
  postActions:{ display:"flex", gap:16, marginTop:14, paddingTop:14, borderTop:"1px solid var(--border)" },
  actionBtn:  { display:"flex", alignItems:"center", gap:6, fontSize:13, color:"var(--muted)",
                 background:"none", border:"none", cursor:"pointer", fontFamily:"var(--sans)",
                 transition:"color var(--transition)" },
  // Messaging
  msgLayout:  { display:"flex", height:"100%", background:"var(--white)",
                 borderRadius:var_radius, border:"1px solid var(--border)", overflow:"hidden" },
  contactList:{ width:260, borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column" },
  contactItem:(active) => ({
    display:"flex", alignItems:"center", gap:12, padding:"14px 16px", cursor:"pointer",
    background: active ? "var(--cream2)" : "transparent",
    borderBottom:"1px solid var(--border)", transition:"background var(--transition)",
  }),
  // Profile
  profBanner: { height:180, borderRadius:"var(--radius) var(--radius) 0 0",
                 background:"linear-gradient(135deg, var(--brown3) 0%, var(--brown2) 60%, var(--brown1) 100%)",
                 position:"relative" },
  profAvatar: { width:90, height:90, borderRadius:"50%", border:"4px solid var(--white)",
                 background:"var(--cream3)", display:"flex", alignItems:"center", justifyContent:"center",
                 fontFamily:"var(--serif)", fontSize:28, color:"var(--brown3)",
                 position:"absolute", bottom:-42, left:28 },
};

function var_radius(){ return "var(--radius)" }

// ─── AUTH ─────────────────────────────────────────────
function AuthPage({ onLogin, onAuthToken, initialMode = "login", onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name:"", email:"", password:"", confirmPassword:"",
    university:"", degree:"", major:"", gpa:"",
    country:"", targetCountry:"", interests:[],
    userType:"student"
  });

  const interests = ["Fully Funded","Merit Based","Need Based","PhD","Masters","Bachelors","STEM","Arts","Medicine","Law","Internship","Research"];

  useEffect(() => {
    setMode(initialMode);
    setStep(1);
    setError("");
  }, [initialMode]);

  const toggleInterest = (i) => {
    setForm(f=>({...f, interests: f.interests.includes(i) ? f.interests.filter(x=>x!==i) : [...f.interests,i]}));
  };

  const handleSubmit = async () => {
    setError("");
    const normalizedEmail = form.email.trim().toLowerCase();
    const gmailRegex = /^[A-Za-z0-9._%+-]+@gmail\.com$/;
    const strongPassRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!gmailRegex.test(normalizedEmail)) {
      setError("Only valid @gmail.com emails are allowed.");
      return;
    }
    if (!form.email.trim() || !form.password.trim()) {
      setError("Email and password are required.");
      return;
    }
    if (mode==="signup" && step===1) {
      if (!form.name.trim()) {
        setError("Full name is required.");
        return;
      }
      if (!strongPassRegex.test(form.password)) {
        setError("Password must be 8+ chars with uppercase, lowercase, number, and special character.");
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError("Password and confirm password do not match.");
        return;
      }
      setStep(2);
      return;
    }

    const endpoint = mode === "login" ? "/auth/login" : "/auth/signup";
    const payload = mode === "login"
      ? { email: normalizedEmail, password: form.password }
      : {
          name: form.name,
          email: normalizedEmail,
          password: form.password,
          user_type: form.userType,
          university: form.university,
          degree: form.degree,
          major: form.major,
          country: form.country,
          target_country: form.targetCountry,
          interests: form.interests,
        };

    try {
      setLoading(true);
      const resp = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || "Authentication failed");

      const token = data.token;
      const apiUser = data.user || {};
      const profile = apiUser.profile || {};
      onAuthToken(token);
      onLogin({
        id: apiUser.id,
        name: apiUser.name || form.name,
        email: apiUser.email || form.email,
        handle: apiUser.handle || form.email.split("@")[0],
        userType: apiUser.user_type || form.userType,
        university: profile.university || form.university,
        major: profile.major || form.major,
        targetCountry: profile.target_country || form.targetCountry,
        interests: profile.interests || form.interests,
      });
    } catch (err) {
      setError(err.message || "Unable to authenticate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{G}</style>
      <div style={S.authWrap}>
        {/* bg decoration */}
        <div style={{position:"absolute",top:-80,right:-80,width:360,height:360,borderRadius:"50%",
          background:"radial-gradient(circle, var(--cream3) 0%, transparent 70%)",opacity:0.7}} />
        <div style={{position:"absolute",bottom:-60,left:-60,width:260,height:260,borderRadius:"50%",
          background:"radial-gradient(circle, var(--brown1) 0%, transparent 70%)",opacity:0.25}} />

        <div style={S.authCard}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
            <button onClick={onBack} className="btn-ghost" style={{padding:"7px 16px",fontSize:12}}>← Back</button>
            <div style={{fontSize:12,color:"var(--muted)"}}>Secure authentication</div>
          </div>
          {/* Logo */}
          <div style={{textAlign:"center",marginBottom:28}}>
            <span style={{fontFamily:"var(--serif)",fontSize:"44px",color:"var(--brown4)",fontStyle:"italic",letterSpacing:"-1px"}}>
              SCHLR
            </span>
            <div style={{fontSize:12,color:"var(--muted)",letterSpacing:"0.12em",marginTop:2}}>SCHOLARSHIP COMMUNITY</div>
          </div>

          {/* Tab */}
          <div style={{display:"flex",background:"var(--cream2)",borderRadius:99,padding:4,marginBottom:28}}>
            {["login","signup"].map(m=>(
              <button key={m} onClick={()=>{setMode(m);setStep(1)}}
                style={{flex:1,padding:"9px",borderRadius:99,fontFamily:"var(--sans)",fontSize:14,fontWeight:500,
                  background:mode===m?"var(--brown3)":"transparent",
                  color:mode===m?"var(--white)":"var(--muted)",border:"none",cursor:"pointer",
                  transition:"all var(--transition)",textTransform:"capitalize"}}>
                {m}
              </button>
            ))}
          </div>

          {mode==="login" ? (
            <>
              {[["Email","email","email"],["Password","password","password"]].map(([lbl,name,type])=>(
                <div key={name} style={S.field}>
                  <label style={S.label}>{lbl}</label>
                  <input type={type} style={S.input} placeholder={lbl}
                    value={form[name]} onChange={e=>setForm(f=>({...f,[name]:e.target.value}))} />
                </div>
              ))}
              <button disabled={loading} onClick={handleSubmit} className="btn-primary" style={{width:"100%",marginTop:8,padding:"13px",opacity:loading?0.75:1}}>
                {loading ? "Signing In..." : "Sign In"}
              </button>
            </>
          ) : step===1 ? (
            <>
              {/* User type */}
              <div style={S.field}>
                <label style={S.label}>I am a</label>
                <div style={{display:"flex",gap:10}}>
                  {[["student","Student 🎓"],["recruiter","Recruiter 💼"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setForm(f=>({...f,userType:v}))}
                      style={{flex:1,padding:"10px",borderRadius:10,fontFamily:"var(--sans)",fontSize:13,fontWeight:500,
                        background:form.userType===v?"var(--brown3)":"var(--cream2)",
                        color:form.userType===v?"var(--white)":"var(--text)",
                        border:form.userType===v?"none":"1px solid var(--border)",cursor:"pointer"}}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {[["Full Name","name","text"],["Email","email","email"],["Password","password","password"],
                ["Confirm Password","confirmPassword","password"],
                ["University / Company","university","text"]].map(([lbl,name,type])=>(
                <div key={name} style={S.field}>
                  <label style={S.label}>{lbl}</label>
                  <input type={type} style={S.input} placeholder={lbl}
                    value={form[name]} onChange={e=>setForm(f=>({...f,[name]:e.target.value}))} />
                </div>
              ))}
              <button disabled={loading} onClick={handleSubmit} className="btn-primary" style={{width:"100%",marginTop:8,padding:"13px",opacity:loading?0.75:1}}>
                Continue →
              </button>
            </>
          ) : (
            <>
              <div style={{fontFamily:"var(--serif)",fontSize:20,color:"var(--brown4)",marginBottom:18}}>
                Tell us more to personalize your experience
              </div>
              {[["Degree Level","degree","text","BSc / MSc / PhD"],
                ["Major / Field","major","text","Computer Science"],
                ["Current Country","country","text","Pakistan"],
                ["Target Study Country","targetCountry","text","UK, Germany, USA"]].map(([lbl,name,type,ph])=>(
                <div key={name} style={S.field}>
                  <label style={S.label}>{lbl}</label>
                  <input type={type} style={S.input} placeholder={ph}
                    value={form[name]} onChange={e=>setForm(f=>({...f,[name]:e.target.value}))} />
                </div>
              ))}
              <div style={S.field}>
                <label style={S.label}>Scholarship Interests</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {interests.map(i=>(
                    <button key={i} onClick={()=>toggleInterest(i)}
                      style={{padding:"5px 13px",borderRadius:99,fontSize:12,fontWeight:500,cursor:"pointer",
                        fontFamily:"var(--sans)",transition:"all var(--transition)",
                        background:form.interests.includes(i)?"var(--brown3)":"var(--cream2)",
                        color:form.interests.includes(i)?"var(--white)":"var(--text)",
                        border:form.interests.includes(i)?"none":"1px solid var(--border)"}}>
                      {i}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:10,marginTop:8}}>
                <button onClick={()=>setStep(1)} className="btn-ghost" style={{flex:1,padding:"13px"}}>← Back</button>
                <button disabled={loading} onClick={handleSubmit} className="btn-primary" style={{flex:2,padding:"13px",opacity:loading?0.75:1}}>
                  {loading ? "Creating Account..." : "Create Account 🎉"}
                </button>
              </div>
            </>
          )}
          {!!error && (
            <div style={{marginTop:14,padding:"10px 12px",background:"#FCEBE9",border:"1px solid #E7B8B2",borderRadius:10,color:"#8A2E25",fontSize:13}}>
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function LandingPage({ onChoose }) {
  return (
    <>
      <style>{G}</style>
      <div style={S.authWrap}>
        <div style={{position:"absolute",top:-80,right:-80,width:360,height:360,borderRadius:"50%",
          background:"radial-gradient(circle, var(--cream3) 0%, transparent 70%)",opacity:0.7}} />
        <div style={{position:"absolute",bottom:-60,left:-60,width:260,height:260,borderRadius:"50%",
          background:"radial-gradient(circle, var(--brown1) 0%, transparent 70%)",opacity:0.25}} />

        <div style={{...S.authCard, maxWidth:560}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"var(--serif)",fontSize:48,color:"var(--brown4)",fontStyle:"italic"}}>SCHLR</div>
            <div style={{fontSize:12,color:"var(--muted)",letterSpacing:"0.12em",marginTop:2}}>SCHOLARSHIP COMMUNITY</div>
            <div style={{marginTop:18,fontSize:15,color:"var(--muted)"}}>
              Discover scholarships, connect with peers, and grow your academic career.
            </div>
          </div>
          <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:28}}>
            <button className="btn-primary" style={{padding:"12px 28px"}} onClick={() => onChoose("signup")}>Sign Up</button>
            <button className="btn-ghost" style={{padding:"12px 28px"}} onClick={() => onChoose("login")}>Sign In</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── CHATBOT SECTION ──────────────────────────────────
function ChatSection({ user, token }) {
  const [activeBot, setActiveBot] = useState(SPECIALIZED_BOTS[0]);
  const [chats, setChats] = useState({ general:[
    {role:"assistant", text:`Hello ${user.name?.split(" ")[0] || "there"}! I'm SCHLR AI. I can help you find scholarships, review applications, and guide you through the process. What are you looking for today?`}
  ]});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  const msgs = chats[activeBot.id] || [];

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const updated = [...msgs, {role:"user", text:userMsg}];
    setChats(c=>({...c,[activeBot.id]:updated}));
    setLoading(true);

    try {
  const resp = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      question: userMsg,
      conversation_history: updated.map(m => ({
        role: m.role,
        content: m.text
      })),
      bot_type: activeBot.id
    })
  });

  const data = await resp.json();

  const reply = data.answer || "No response received.";

  setChats(c => ({
    ...c,
    [activeBot.id]: [
      ...updated,
      { role: "assistant", text: reply }
    ]
  }));

} catch (err) {
  setChats(c => ({
    ...c,
    [activeBot.id]: [
      ...updated,
      { 
        role: "assistant", 
        text: "Backend connection error. Make sure FastAPI is running." 
      }
    ]
  }));
}

setLoading(false);
  };

  return (
    <div style={{height:"calc(100vh - 62px - 56px)", display:"flex", gap:20}}>
      {/* Bot selector sidebar */}
      <div style={{width:220,display:"flex",flexDirection:"column",gap:6}}>
        <div style={{fontFamily:"var(--serif)",fontSize:17,color:"var(--brown4)",marginBottom:8,paddingLeft:4}}>
          AI Advisors
        </div>
        {SPECIALIZED_BOTS.map(bot=>(
          <div key={bot.id} onClick={()=>setActiveBot(bot)}
            style={{...S.botItem(activeBot.id===bot.id),padding:"12px 14px",borderRadius:12,
              cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>{bot.icon}</span>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--brown4)"}}>{bot.name}</div>
              <div style={{fontSize:11,color:"var(--muted)"}}>{bot.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Chat area */}
      <div style={{flex:1,display:"flex",flexDirection:"column",background:"var(--white)",
        borderRadius:"var(--radius)",border:"1px solid var(--border)",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"16px 20px",borderBottom:"1px solid var(--border)",
          display:"flex",alignItems:"center",gap:12,background:"var(--cream)"}}>
          <span style={{fontSize:24}}>{activeBot.icon}</span>
          <div>
            <div style={{fontWeight:600,color:"var(--brown4)"}}>{activeBot.name}</div>
            <div style={{fontSize:12,color:"var(--muted)"}}>{activeBot.desc}</div>
          </div>
          <div style={{marginLeft:"auto",padding:"4px 12px",borderRadius:99,background:"#E6F9F0",
            color:"#1A7A4A",fontSize:11,fontWeight:600}}>● Online</div>
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"20px",display:"flex",flexDirection:"column",gap:14}}>
          {msgs.map((m,i)=>(
            <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",gap:10,alignItems:"flex-end"}}>
              {m.role==="assistant" && (
                <div style={{width:32,height:32,borderRadius:"50%",background:"var(--cream3)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                  {activeBot.icon}
                </div>
              )}
              <div style={S.bubble(m.role==="user")}>{m.text}</div>
              {m.role==="user" && (
                <div className="avatar" style={{width:32,height:32,fontSize:12,background:"var(--brown2)",color:"var(--white)"}}>
                  {initials(user.name||"U")}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:"var(--cream3)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{activeBot.icon}</div>
              <div style={{...S.bubble(false),display:"flex",gap:5,alignItems:"center"}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{width:7,height:7,borderRadius:"50%",background:"var(--brown2)",
                    animation:`bounce 1.2s ${i*0.2}s ease-in-out infinite`}} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef}/>
        </div>

        {/* Input */}
        <div style={{padding:"14px 16px",borderTop:"1px solid var(--border)",display:"flex",gap:10}}>
          <input value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
            placeholder={`Ask ${activeBot.name} anything…`}
            style={{flex:1,background:"var(--cream)",border:"1.5px solid var(--border)",
              borderRadius:99,padding:"11px 18px",fontSize:14,color:"var(--text)"}} />
          <button onClick={send} disabled={loading}
            style={{background:loading?"var(--cream3)":"var(--brown3)",color:"var(--white)",
              borderRadius:99,padding:"11px 22px",fontSize:14,fontWeight:500,border:"none",cursor:"pointer",
              transition:"background var(--transition)"}}>
            Send
          </button>
        </div>
      </div>
      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} }
      `}</style>
    </div>
  );
}

// ─── NEWS + COMMUNITY SECTION ─────────────────────────
function NewsSection({ user, token, onPostsUpdated }) {
  const [tab, setTab] = useState("news");
  const [posts, setPosts] = useState([]);
  const [postError, setPostError] = useState("");

  const loadPosts = async () => {
    try {
      const resp = await fetch(`${API_BASE}/posts`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await resp.json();
      const rawPosts = Array.isArray(data) ? data : (data.posts || []);
      const mapped = rawPosts.map((p) => toFrontendPost(p, user.id));
      setPosts(mapped);
      onPostsUpdated?.(mapped);
    } catch {
      setPosts(SEED_POSTS);
      onPostsUpdated?.(SEED_POSTS);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);
  const [newPost, setNewPost] = useState("");
  const [postTag, setPostTag] = useState("Achievement");
  const [openComments, setOpenComments] = useState(null);
  const [commentInput, setCommentInput] = useState("");

  const likePost = async (id) => {
    setPostError("");
    const resp = await fetch(`${API_BASE}/posts/${id}/like`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      setPostError(data.detail || "Unable to like post.");
      return;
    }
    loadPosts();
  };
  const savePost = async (id) => {
    setPostError("");
    const resp = await fetch(`${API_BASE}/posts/${id}/save`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      setPostError(data.detail || "Unable to save post.");
      return;
    }
    loadPosts();
  };

  const submitPost = async () => {
    if (!newPost.trim()) return;
    setPostError("");
    const resp = await fetch(`${API_BASE}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ text: newPost, tag: postTag }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      setPostError(data.detail || "Unable to create post.");
      return;
    }
    setNewPost("");
    loadPosts();
  };

  const addComment = async (id) => {
    if (!commentInput.trim()) return;
    setPostError("");
    const resp = await fetch(`${API_BASE}/posts/${id}/comment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ text: commentInput }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      setPostError(data.detail || "Unable to add comment.");
      return;
    }
    setCommentInput("");
    loadPosts();
  };

  const tags = ["Achievement","Tip","Question","Internship Open","Scholarship Alert","Experience"];
  const tagColors = { online:"#1A7A4A", offline:"#A32D2D" };

  return (
    <div>
      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:24,background:"var(--cream2)",
        borderRadius:99,padding:4,width:"fit-content"}}>
        {["news","community"].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"8px 24px",borderRadius:99,fontFamily:"var(--sans)",
              fontSize:14,fontWeight:500,border:"none",cursor:"pointer",
              background:tab===t?"var(--brown3)":"transparent",
              color:tab===t?"var(--white)":"var(--muted)",
              textTransform:"capitalize",transition:"all var(--transition)"}}>
            {t==="news"?"📰 Latest News":"🌐 Community"}
          </button>
        ))}
      </div>

      {tab==="news" ? (
        <>
          {/* Site status bar */}
          <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
            {[...new Set(SEED_NEWS.map(n=>n.site))].map(site=>(
              <div key={site} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",
                borderRadius:99,background:"var(--white)",border:"1px solid var(--border)",fontSize:12}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:tagColors.online}} />
                <span style={{color:"var(--muted)"}}>{site}</span>
                <span style={{color:tagColors.online,fontWeight:600}}>Online</span>
              </div>
            ))}
          </div>

          <div style={S.newsGrid}>
            {SEED_NEWS.map(n=>(
              <div key={n.id} style={S.newsCard}
                onMouseEnter={e=>e.currentTarget.style.cssText+=";transform:translateY(-3px);box-shadow:var(--shadowlg)"}
                onMouseLeave={e=>e.currentTarget.style.cssText+=";transform:none;box-shadow:var(--shadow)"}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:"var(--muted)"}}>
                    <span>{n.favicon}</span> {n.site}
                  </div>
                  <span style={{fontSize:11,color:"var(--muted)"}}>{n.time}</span>
                </div>
                <div style={{padding:"4px 10px",borderRadius:99,background:"var(--cream2)",
                  color:"var(--brown3)",fontSize:11,fontWeight:600,width:"fit-content",
                  letterSpacing:"0.04em"}}>{n.tag}</div>
                <div style={{fontFamily:"var(--serif)",fontSize:17,color:"var(--brown4)",lineHeight:1.3}}>
                  {n.title}
                </div>
                <div style={{fontSize:13,color:"var(--muted)",lineHeight:1.6}}>{n.snippet}</div>
                <button style={{marginTop:4,color:"var(--brown3)",fontSize:13,fontWeight:500,
                  background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0,
                  fontFamily:"var(--sans)"}}>
                  Read more →
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {!!postError && (
            <div style={{marginBottom:16,padding:"10px 12px",background:"#FCEBE9",border:"1px solid #E7B8B2",borderRadius:10,color:"#8A2E25",fontSize:13}}>
              {postError}
            </div>
          )}
          {/* New post composer */}
          <div style={{background:"var(--white)",borderRadius:"var(--radius)",
            border:"1px solid var(--border)",padding:"20px",marginBottom:24}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <div className="avatar" style={{width:40,height:40,background:"var(--brown2)",color:"var(--white)",fontSize:14}}>
                {initials(user.name||"U")}
              </div>
              <div style={{flex:1}}>
                <textarea value={newPost} onChange={e=>setNewPost(e.target.value)}
                  placeholder="Share a scholarship tip, achievement, or question…"
                  rows={3}
                  style={{width:"100%",background:"var(--cream)",border:"1.5px solid var(--border)",
                    borderRadius:12,padding:"12px 16px",fontSize:14,resize:"none",
                    color:"var(--text)",fontFamily:"var(--sans)"}} />
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
                  <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                    {tags.map(t=>(
                      <button key={t} onClick={()=>setPostTag(t)}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:12,fontWeight:500,
                          fontFamily:"var(--sans)",cursor:"pointer",transition:"all var(--transition)",
                          background:postTag===t?"var(--brown3)":"var(--cream2)",
                          color:postTag===t?"var(--white)":"var(--text)",border:"none"}}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <button onClick={submitPost} className="btn-primary" style={{padding:"9px 22px"}}>
                    Post
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Posts */}
          {posts.map(post=>(
            <div key={post.id} style={S.postCard}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{display:"flex",gap:12,alignItems:"center"}}>
                  <div className="avatar" style={{width:42,height:42,
                    background:post.type==="recruiter"?"var(--brown3)":"var(--brown1)",
                    color:"var(--white)",fontSize:14}}>
                    {post.avatar||initials(post.user)}
                  </div>
                  <div>
                    <div style={{fontWeight:600,color:"var(--brown4)",fontSize:14,display:"flex",alignItems:"center",gap:8}}>
                      {post.user}
                      {post.type==="recruiter" && (
                        <span style={{padding:"2px 8px",borderRadius:99,background:"var(--brown4)",
                          color:"var(--white)",fontSize:10,fontWeight:600,letterSpacing:"0.05em"}}>RECRUITER</span>
                      )}
                    </div>
                    <div style={{fontSize:12,color:"var(--muted)"}}>@{post.handle} · {post.time}</div>
                  </div>
                </div>
                <span style={{padding:"3px 12px",borderRadius:99,fontSize:11,fontWeight:600,
                  letterSpacing:"0.04em",background:post.tagBg,color:post.tagColor}}>
                  {post.tag}
                </span>
              </div>
              <p style={{marginTop:14,color:"var(--text)",lineHeight:1.65,fontSize:14}}>{post.text}</p>
              {/* Actions */}
              <div style={S.postActions}>
                <button onClick={()=>likePost(post.id)} style={{...S.actionBtn,
                  color:post.liked?"var(--brown3)":"var(--muted)"}}>
                  <span style={{fontSize:16}}>{post.liked?"♥":"♡"}</span> {post.likes}
                </button>
                <button onClick={()=>setOpenComments(openComments===post.id?null:post.id)} style={S.actionBtn}>
                  <span style={{fontSize:16}}>💬</span> {post.commentList?.length||0}
                </button>
                <button onClick={()=>savePost(post.id)} style={{...S.actionBtn,
                  color:post.saved?"var(--brown3)":"var(--muted)",marginLeft:"auto"}}>
                  <span style={{fontSize:16}}>{post.saved?"🔖":"🏷"}</span> {post.saved?"Saved":"Save"}
                </button>
              </div>
              {/* Comments */}
              {openComments===post.id && (
                <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid var(--border)"}}>
                  {post.commentList.map((c,i)=>(
                    <div key={i} style={{display:"flex",gap:10,marginBottom:12,alignItems:"flex-start"}}>
                      <div className="avatar" style={{width:30,height:30,background:"var(--cream3)",fontSize:11}}>
                        {initials(c.u)}
                      </div>
                      <div style={{background:"var(--cream)",borderRadius:10,padding:"9px 14px",flex:1}}>
                        <div style={{fontSize:12,fontWeight:600,color:"var(--brown4)",marginBottom:3}}>{c.u}</div>
                        <div style={{fontSize:13,color:"var(--text)"}}>{c.t}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:10,marginTop:10}}>
                    <input value={commentInput} onChange={e=>setCommentInput(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addComment(post.id)}
                      placeholder="Write a comment…"
                      style={{flex:1,...S.input,padding:"9px 14px",borderRadius:10}} />
                    <button onClick={()=>addComment(post.id)} className="btn-primary" style={{padding:"9px 18px"}}>
                      Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── MESSAGING SECTION ────────────────────────────────
function MessagingSection({ user }) {
  const contacts = ["Hamza Khan","Sara Malik","TechBridge Co."];
  const [active, setActive] = useState("Hamza Khan");
  const [convs, setConvs] = useState(MESSAGES_SEED);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  const msgs = convs[active] || [];
  useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[msgs]);

  const send = () => {
    if (!input.trim()) return;
    setConvs(c=>({...c,[active]:[...msgs,{from:"me",text:input.trim(),time:"Now"}]}));
    setInput("");
  };

  return (
    <div style={{height:"calc(100vh - 62px - 56px)"}}>
      <div style={{...S.msgLayout,height:"100%"}}>
        {/* Contacts */}
        <div style={S.contactList}>
          <div style={{padding:"16px 16px 12px",borderBottom:"1px solid var(--border)"}}>
            <div style={{fontFamily:"var(--serif)",fontSize:18,color:"var(--brown4)"}}>Messages</div>
          </div>
          {contacts.map(c=>{
            const lastMsg = (convs[c]||[]).slice(-1)[0];
            const isRecruiter = c.includes("Co.") || c.includes("Inc.");
            return (
              <div key={c} onClick={()=>setActive(c)} style={S.contactItem(active===c)}>
                <div className="avatar" style={{width:40,height:40,flexShrink:0,
                  background:isRecruiter?"var(--brown3)":"var(--brown1)",
                  color:"var(--white)",fontSize:13}}>
                  {initials(c)}
                </div>
                <div style={{overflow:"hidden"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--brown4)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {c}
                    {isRecruiter && <span style={{marginLeft:6,fontSize:10,padding:"1px 6px",borderRadius:99,
                      background:"var(--brown4)",color:"var(--white)",fontWeight:600}}>RECRUITER</span>}
                  </div>
                  {lastMsg && <div style={{fontSize:12,color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {lastMsg.from==="me"?"You: ":""}{lastMsg.text}
                  </div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Chat pane */}
        <div style={{flex:1,display:"flex",flexDirection:"column"}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border)",
            display:"flex",alignItems:"center",gap:12,background:"var(--cream)"}}>
            <div className="avatar" style={{width:38,height:38,background:"var(--brown2)",
              color:"var(--white)",fontSize:13}}>{initials(active)}</div>
            <div style={{fontWeight:600,color:"var(--brown4)"}}>{active}</div>
            <div style={{marginLeft:"auto",fontSize:12,color:"#1A7A4A",fontWeight:500}}>● Active</div>
          </div>

          <div style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:12}}>
            {msgs.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.from==="me"?"flex-end":"flex-start",gap:8,alignItems:"flex-end"}}>
                {m.from==="them" && (
                  <div className="avatar" style={{width:28,height:28,background:"var(--brown1)",
                    color:"var(--white)",fontSize:11}}>{initials(active)}</div>
                )}
                <div>
                  <div style={S.bubble(m.from==="me")}>{m.text}</div>
                  <div style={{fontSize:10,color:"var(--muted)",marginTop:4,
                    textAlign:m.from==="me"?"right":"left"}}>{m.time}</div>
                </div>
              </div>
            ))}
            <div ref={endRef}/>
          </div>

          <div style={{padding:"14px 16px",borderTop:"1px solid var(--border)",display:"flex",gap:10}}>
            <input value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&send()}
              placeholder={`Message ${active}…`}
              style={{flex:1,...S.input,borderRadius:99,padding:"11px 18px"}} />
            <button onClick={send} className="btn-primary" style={{padding:"11px 22px"}}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PROFILE SECTION ──────────────────────────────────
function ProfileSection({ user, allPosts, token }) {
  const [tab, setTab] = useState("posts");
  const [editing, setEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    bio:"Scholarship hunter | CS Student | Passionate about EdTech",
    skills:"Python, React, Machine Learning, Research Writing",
    linkedin:"", github:"", website:"",
    cvUploaded:false, openToInternship:false,
  });

  useEffect(() => {
    const loadMe = async () => {
      try {
        const resp = await fetch(`${API_BASE}/auth/me`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const p = data.profile || {};
        setProfileData((prev) => ({
          ...prev,
          bio: data.bio || prev.bio,
          skills: p.skills || prev.skills,
          linkedin: p.linkedin_url || prev.linkedin,
          github: p.github_url || prev.github,
          website: p.website_url || prev.website,
        }));
      } catch {
        // keep local defaults if API is unavailable
      }
    };
    loadMe();
  }, [token]);

  const saveProfile = async () => {
    await fetch(`${API_BASE}/users/${user.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: user.name,
        profile: {
          major: user.major || "",
          university: user.university || "",
          target_country: user.targetCountry || "",
          interests: user.interests || [],
          skills: profileData.skills,
          linkedin_url: profileData.linkedin,
          github_url: profileData.github,
          website_url: profileData.website,
        },
      }),
    });
  };

  const myPosts = allPosts.filter(p=>p.handle===user.handle);
  const savedPosts = allPosts.filter(p=>p.saved);

  const stats = [
    {label:"Posts",val:myPosts.length},
    {label:"Followers",val:142},
    {label:"Following",val:89},
  ];

  return (
    <div style={{maxWidth:760,margin:"0 auto"}}>
      {/* Profile card */}
      <div style={{background:"var(--white)",borderRadius:var_radius(),
        border:"1px solid var(--border)",overflow:"hidden",marginBottom:24}}>
        <div style={S.profBanner} />
        <div style={{padding:"56px 28px 24px",position:"relative"}}>
          <div style={S.profAvatar}>{initials(user.name||"U")}</div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginBottom:12}}>
            <button onClick={async ()=>{
              if (editing) await saveProfile();
              setEditing(!editing);
            }} className="btn-ghost" style={{padding:"8px 20px"}}>
              {editing?"Save Profile":"Edit Profile"}
            </button>
            {user.userType==="student" && (
              <button onClick={()=>setProfileData(p=>({...p,openToInternship:!p.openToInternship}))}
                style={{padding:"8px 20px",borderRadius:99,fontSize:14,fontWeight:500,
                  fontFamily:"var(--sans)",cursor:"pointer",border:"none",
                  background:profileData.openToInternship?"#E6F9F0":"var(--cream2)",
                  color:profileData.openToInternship?"#1A7A4A":"var(--muted)",transition:"all var(--transition)"}}>
                {profileData.openToInternship?"✓ Open to Internship":"Open to Internship?"}
              </button>
            )}
          </div>
          <div style={{fontFamily:"var(--serif)",fontSize:26,color:"var(--brown4)"}}>{user.name}</div>
          <div style={{color:"var(--muted)",fontSize:13,marginBottom:6}}>@{user.handle}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {user.userType==="recruiter" && (
              <span style={{padding:"3px 12px",borderRadius:99,background:"var(--brown4)",
                color:"var(--white)",fontSize:11,fontWeight:600,letterSpacing:"0.05em"}}>RECRUITER</span>
            )}
            {user.university && <span className="tag" style={{background:"var(--cream2)",color:"var(--brown3)"}}>🏛 {user.university}</span>}
            {user.major && <span className="tag" style={{background:"var(--cream2)",color:"var(--brown3)"}}>📚 {user.major}</span>}
            {user.targetCountry && <span className="tag" style={{background:"var(--cream2)",color:"var(--brown3)"}}>🌍 {user.targetCountry}</span>}
          </div>

          {editing ? (
            <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:12}}>
              {[["Bio","bio"],["Skills","skills"],["LinkedIn URL","linkedin"],
                ["GitHub URL","github"],["Portfolio URL","website"]].map(([lbl,key])=>(
                <div key={key} style={S.field}>
                  <label style={S.label}>{lbl}</label>
                  <input value={profileData[key]} onChange={e=>setProfileData(p=>({...p,[key]:e.target.value}))}
                    style={S.input} placeholder={lbl} />
                </div>
              ))}
              {/* CV Upload */}
              <div>
                <label style={S.label}>CV / Resume</label>
                <div style={{marginTop:6,display:"flex",alignItems:"center",gap:12}}>
                  <button onClick={()=>setProfileData(p=>({...p,cvUploaded:true}))}
                    style={{padding:"10px 18px",borderRadius:10,background:"var(--cream2)",
                      border:"1.5px dashed var(--brown1)",color:"var(--brown3)",fontSize:13,
                      fontWeight:500,cursor:"pointer",fontFamily:"var(--sans)"}}>
                    {profileData.cvUploaded?"📄 CV Uploaded ✓":"📤 Upload CV / Resume"}
                  </button>
                  {profileData.cvUploaded && <span style={{fontSize:12,color:"#1A7A4A"}}>Visible on profile</span>}
                </div>
              </div>
            </div>
          ) : (
            <>
              <p style={{color:"var(--text)",fontSize:14,lineHeight:1.65,marginBottom:12}}>{profileData.bio}</p>
              {profileData.skills && (
                <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:12}}>
                  {profileData.skills.split(",").map(s=>(
                    <span key={s} className="tag" style={{background:"var(--cream3)",color:"var(--brown4)",padding:"4px 12px"}}>
                      {s.trim()}
                    </span>
                  ))}
                </div>
              )}
              <div style={{display:"flex",gap:24}}>
                {stats.map(s=>(
                  <div key={s.label} style={{textAlign:"center"}}>
                    <div style={{fontFamily:"var(--serif)",fontSize:22,color:"var(--brown4)"}}>{s.val}</div>
                    <div style={{fontSize:12,color:"var(--muted)"}}>{s.label}</div>
                  </div>
                ))}
              </div>
              {profileData.cvUploaded && (
                <div style={{marginTop:14,display:"flex",alignItems:"center",gap:8,padding:"10px 16px",
                  borderRadius:10,background:"var(--cream2)",width:"fit-content",fontSize:13}}>
                  📄 <span style={{fontWeight:500,color:"var(--brown3)"}}>CV uploaded</span>
                  <span style={{color:"var(--muted)"}}>— visible to recruiters</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:20,background:"var(--cream2)",
        borderRadius:99,padding:4,width:"fit-content"}}>
        {[["posts","My Posts"],["saved","Saved"],["interests","Interests"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:"8px 20px",borderRadius:99,border:"none",cursor:"pointer",
              fontFamily:"var(--sans)",fontSize:13,fontWeight:500,transition:"all var(--transition)",
              background:tab===k?"var(--brown3)":"transparent",
              color:tab===k?"var(--white)":"var(--muted)"}}>
            {l}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab==="posts" && (
        myPosts.length===0
          ? <div style={{textAlign:"center",color:"var(--muted)",padding:40}}>No posts yet. Share your first achievement!</div>
          : myPosts.map(p=><MiniPost key={p.id} post={p}/>)
      )}
      {tab==="saved" && (
        savedPosts.length===0
          ? <div style={{textAlign:"center",color:"var(--muted)",padding:40}}>No saved posts yet.</div>
          : savedPosts.map(p=><MiniPost key={p.id} post={p}/>)
      )}
      {tab==="interests" && (
        <div style={{background:"var(--white)",borderRadius:"var(--radius)",
          border:"1px solid var(--border)",padding:"24px"}}>
          <div style={{fontFamily:"var(--serif)",fontSize:18,color:"var(--brown4)",marginBottom:14}}>
            Scholarship Interests
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
            {(user.interests||["Fully Funded","Merit Based","STEM"]).map(i=>(
              <span key={i} className="tag" style={{background:"var(--cream2)",color:"var(--brown3)",
                padding:"6px 16px",fontSize:12}}>✓ {i}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniPost({ post }) {
  return (
    <div style={{background:"var(--white)",borderRadius:"var(--radius)",
      border:"1px solid var(--border)",padding:"18px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:600,
          background:post.tagBg,color:post.tagColor}}>{post.tag}</span>
        <span style={{fontSize:12,color:"var(--muted)"}}>{post.time}</span>
      </div>
      <p style={{fontSize:14,color:"var(--text)",lineHeight:1.6}}>{post.text}</p>
      <div style={{display:"flex",gap:16,marginTop:12,fontSize:13,color:"var(--muted)"}}>
        <span>♥ {post.likes}</span>
        <span>💬 {post.commentList?.length||0}</span>
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────
const NAV_ITEMS = [
  {id:"chat",    label:"AI Chat",    icon:"✦"},
  {id:"news",    label:"News",       icon:"📰"},
  {id:"messages",label:"Messages",  icon:"💬"},
  {id:"profile", label:"Profile",    icon:"👤"},
];

function Dashboard({ user, token, onLogout }) {
  const [section, setSection] = useState("chat");
  const [posts, setPosts] = useState([]);

  return (
    <>
      <style>{G}</style>
      <div style={S.app}>
        {/* Top nav */}
        <nav style={S.nav}>
          <span style={S.navLogo}>SCHLR</span>
          {NAV_ITEMS.map(item=>(
            <button key={item.id} onClick={()=>setSection(item.id)}
              style={S.navItem(section===item.id)}>
              {item.icon} {item.label}
            </button>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:8}}>
            {user.userType==="recruiter" && (
              <span style={{padding:"3px 10px",borderRadius:99,background:"var(--brown4)",
                color:"var(--white)",fontSize:11,fontWeight:600}}>RECRUITER</span>
            )}
            <div className="avatar" style={{width:34,height:34,background:"var(--brown2)",
              color:"var(--white)",fontSize:12,cursor:"default"}}>
              {initials(user.name||"U")}
            </div>
            <button onClick={onLogout} className="btn-ghost" style={{padding:"7px 16px",fontSize:13}}>
              Sign out
            </button>
          </div>
        </nav>

        {/* Content */}
        <div style={{padding:"28px 32px",flex:1,overflow:"auto"}}>
          {section==="chat"     && <ChatSection user={user} token={token}/>}
          {section==="news"     && <NewsSection user={user} token={token} onPostsUpdated={setPosts}/>}
          {section==="messages" && <MessagingSection user={user}/>}
          {section==="profile"  && <ProfileSection user={user} allPosts={posts} token={token}/>}
        </div>
      </div>
    </>
  );
}

// ─── ROOT ─────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("schlr_token") || "");
  const [bootLoading, setBootLoading] = useState(true);
  const [authView, setAuthView] = useState("landing");
  const [authMode, setAuthMode] = useState("login");

  const handleToken = (value) => {
    setToken(value);
    localStorage.setItem("schlr_token", value);
  };
  const handleLogout = () => {
    localStorage.removeItem("schlr_token");
    setToken("");
    setUser(null);
  };

  useEffect(() => {
    const bootstrapSession = async () => {
      if (!token) {
        setBootLoading(false);
        return;
      }
      try {
        const resp = await fetch(`${API_BASE}/auth/me`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error("Session expired");
        const me = await resp.json();
        const profile = me.profile || {};
        setUser({
          id: me._id || me.id,
          name: me.name,
          email: me.email,
          handle: me.handle || (me.email || "").split("@")[0],
          userType: me.user_type,
          university: profile.university || "",
          major: profile.major || "",
          targetCountry: profile.target_country || "",
          interests: profile.interests || [],
        });
      } catch {
        localStorage.removeItem("schlr_token");
        setToken("");
        setUser(null);
      } finally {
        setBootLoading(false);
      }
    };
    bootstrapSession();
  }, [token]);

  if (bootLoading) return <div style={{padding:40,fontFamily:"Jost, sans-serif"}}>Loading...</div>;
  if (!user && authView === "landing") return <LandingPage onChoose={(mode) => { setAuthMode(mode); setAuthView("auth"); }} />;
  if (!user) return <AuthPage onLogin={setUser} onAuthToken={handleToken} initialMode={authMode} onBack={() => setAuthView("landing")} />;
  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}