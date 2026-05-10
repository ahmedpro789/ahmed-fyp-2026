export const G = `
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

export const S = {
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
               borderRadius:"var(--radius)", border:"1px solid var(--border)", overflow:"hidden" },
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
  newsCard: { background:"var(--white)", borderRadius:"var(--radius)", border:"1px solid var(--border)",
               padding:"22px", display:"flex", flexDirection:"column", gap:10,
               transition:"transform var(--transition), box-shadow var(--transition)" },
  // Posts
  postCard: { background:"var(--white)", borderRadius:"var(--radius)", border:"1px solid var(--border)",
               padding:"22px", marginBottom:18 },
  postActions:{ display:"flex", gap:16, marginTop:14, paddingTop:14, borderTop:"1px solid var(--border)" },
  actionBtn:  { display:"flex", alignItems:"center", gap:6, fontSize:13, color:"var(--muted)",
                 background:"none", border:"none", cursor:"pointer", fontFamily:"var(--sans)",
                 transition:"color var(--transition)" },
  // Messaging
  msgLayout:  { display:"flex", height:"100%", background:"var(--white)",
                 borderRadius:"var(--radius)", border:"1px solid var(--border)", overflow:"hidden" },
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
