export const SEED_POSTS = [
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

export const SEED_NEWS = [
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

export const MESSAGES_SEED = {
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

export const SPECIALIZED_BOTS = [
  { id:"general",   name:"SCHLR AI",        icon:"✦",  desc:"General scholarship assistant" },
  { id:"funded",    name:"FullFund Bot",    icon:"💰", desc:"Fully funded opportunities" },
  { id:"merit",     name:"Merit Advisor",   icon:"🏆", desc:"Merit-based scholarships" },
  { id:"need",      name:"Need-Based Aid",  icon:"🤝", desc:"Financial aid & grants" },
  { id:"intern",    name:"Internship Pro",  icon:"💼", desc:"Internship & career advice" },
  { id:"phd",       name:"PhD Guide",       icon:"🎓", desc:"Doctoral programs & funding" },
];

export const STUDENT_NAV = [
  { id: "chat", label: "AI Chat", icon: "✦" },
  { id: "news", label: "Feed", icon: "📰" },
  { id: "matches", label: "My Matches", icon: "🎯" },
  { id: "guides", label: "Guides", icon: "📖" },
  { id: "messages", label: "Messages", icon: "💬" },
  { id: "profile", label: "Profile", icon: "👤" },
];

export const RECRUITER_NAV = [
  { id: "recruiter_home", label: "Overview", icon: "📊" },
  { id: "recruiter_jobs", label: "Job posts", icon: "💼" },
  { id: "news", label: "Community", icon: "🌐" },
  { id: "recruiter_company", label: "Company", icon: "🏢" },
  { id: "messages", label: "Messages", icon: "💬" },
  { id: "profile", label: "Profile", icon: "👤" },
];

export const ADMIN_NAV = [
  { id: "admin_panel", label: "Admin Panel", icon: "🛡️" },
  { id: "news", label: "Community", icon: "🌐" },
  { id: "messages", label: "Messages", icon: "💬" },
  { id: "profile", label: "Profile", icon: "👤" },
];

export const INTERESTS = ["Fully Funded","Merit Based","Need Based","PhD","Masters","Bachelors","STEM","Arts","Medicine","Law","Internship","Research"];

export const POST_TAGS = ["Achievement","Tip","Question","Internship Open","Scholarship Alert","Experience"];
