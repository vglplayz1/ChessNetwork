import { db, auth } from 'hatchable';
export const access='user';
export const methods=['GET'];
export default async function(req,res){
 try{
  const user=req.user||await auth.getUser(req);if(!user)return res.status(401).json({error:'Sign in to view ratings.'});
  const pool=String(req.query?.pool||'rapid').toLowerCase();
  if(!['bullet','blitz','rapid'].includes(pool))return res.status(400).json({error:'Choose bullet, blitz, or rapid.'});
  await db.query("INSERT INTO chess_ratings(user_id,pool,rating) VALUES($1,$2,1200) ON CONFLICT(user_id,pool) DO NOTHING",[String(user.id),pool]);
  const [mine,leaders]=await Promise.all([
   db.query('SELECT pool,rating,games,wins,losses,draws FROM chess_ratings WHERE user_id=$1 ORDER BY pool',[String(user.id)]),
   db.query(`SELECT r.user_id,u.email,COALESCE(NULLIF(u.name,''),split_part(u.email,'@',1)) AS name,r.rating,r.games,r.wins
    FROM chess_ratings r JOIN users u ON u.id=r.user_id WHERE r.pool=$1 AND r.games>0 ORDER BY r.rating DESC,r.games DESC LIMIT 50`,[pool])
  ]);
  return res.json({pool,ratings:mine.rows,leaderboard:leaders.rows});
 }catch(e){return res.status(500).json({error:'Ratings could not be loaded.',detail:String(e&&e.message||'').slice(0,160)});}
}