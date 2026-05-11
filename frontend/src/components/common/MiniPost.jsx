import { initials } from "../../utils";

export function MiniPost({ post }) {
  return (
    <div style={{background:"var(--white)",borderRadius:"var(--radius)",
      border:"1px solid var(--border)",padding:"18px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:600,
          background:post.tagBg,color:post.tagColor}}>{post.tag}</span>
        <span style={{fontSize:12,color:"var(--muted)"}}>{post.time}</span>
      </div>
      <p style={{fontSize:14,color:"var(--text)",lineHeight:1.6}}>{post.text}</p>
      {post.imageUrl && (
        <img src={post.imageUrl} alt="" style={{marginTop:10,width:"100%",maxHeight:200,objectFit:"cover",
          borderRadius:10,border:"1px solid var(--border)"}} />
      )}
      <div style={{display:"flex",gap:16,marginTop:12,fontSize:13,color:"var(--muted)"}}>
        <span>♥ {post.likes}</span>
        <span>💬 {post.commentList?.length||0}</span>
      </div>
    </div>
  );
}
