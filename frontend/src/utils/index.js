export const API_BASE = "http://127.0.0.1:8000";

export const initials = (name) => {
  if (!name) return "U";
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
};

export const mapMeToUser = (me) => {
  if (!me) return null;
  const profile = me.profile || {};
  const uid = me._id || me.id;
  return {
    id: uid ? String(uid) : "",
    name: me.name || "",
    email: me.email || "",
    handle: me.handle || (me.email || "").split("@")[0],
    userType: me.user_type || "student",
    university: profile.university || "",
    major: profile.major || "",
    targetCountry: profile.target_country || "",
    interests: profile.interests || [],
    bio: me.bio || "",
    avatar: me.avatar || "",
    degree: profile.degree || "",
    countryResidence: profile.country || "",
    recruiterTitle: profile.recruiter_title || "",
    industry: profile.industry || "",
    companySize: profile.company_size || "",
    hiringFocus: profile.hiring_focus || [],
    companyWebsite: profile.company_website || "",
    linkedinCompanyUrl: profile.linkedin_company_url || "",
  };
};

export const toFrontendPost = (post, myUserId) => {
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
    tagColor: "var(--brown3)",
    tagBg: "var(--cream2)",
    text: post.text || "",
    likes: post.likes || 0,
    comments: comments.length,
    liked: myUserId ? likedBy.includes(myUserId) : false,
    saved: myUserId ? savedBy.includes(myUserId) : false,
    commentList: comments.map((c) => ({ u: c.user_name || "Unknown", t: c.text || "" })),
    imageUrl: post.image_url || null,
  };
};
