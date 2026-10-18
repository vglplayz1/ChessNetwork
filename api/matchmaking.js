import { db, auth } from 'hatchable';
export const access = 'user';
export const methods = ['GET','POST','DELETE'];
const START_FEN='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const controls={bullet:{base:60,inc:0},blitz:{base:180,inc:0},rapid:{base:600,inc:0},classical:{base:1800,inc:0},custom:{base:600,inc:5}};

async function stateFor(userId){
 const {rows}=await db.query(`SELECT q.status,q.room_id,q.joined_at,q.time_control,q.base_seconds,q.increment_seconds,
  r.status AS room_status,r.fen,r.pgn,r.white_id,r.black_id,r.white_time_ms,r.black_time_ms,r.clock_started_at,
  COALESCE(NULLIF(u.name,''),split_part(u.email,'@',1)) AS opponent_name
  FROM chess_match_queue q LEFT JOIN chess_rooms r ON r.id=q.room_id
  LEFT JOIN users u ON u.id=CASE WHEN r.white_id=$1 THEN r.black_id ELSE r.white_id END
  WHERE q.user_id=$1 LIMIT 1`,[userId]);
 if(!rows.length)return {status:'idle'};
 const x=rows[0];
 if(x.status==='matched'&&x.room_id&&x.room_status==='playing')return {
  status:'matched',roomId:x.room_id,color:String(x.white_id)===userId?'w':'b',fen:x.fen,pgn:x.pgn||'',
  opponentName:x.opponent_name||'Chess Network player',timeControl:x.time_control||'rapid',
  baseSeconds:Number(x.base_seconds||600),incrementSeconds:Number(x.increment_seconds||0),
  whiteTimeMs:Number(x.white_time_ms||600000),blackTimeMs:Number(x.black_time_ms||600000),
  clockStartedAt:x.clock_started_at
 };
 return {status:x.status||'waiting',joinedAt:x.joined_at,timeControl:x.time_control||'rapid'};
}
async function tryMatch(userId){
 const {rows:mine}=await db.query("SELECT time_control,base_seconds,increment_seconds FROM chess_match_queue WHERE user_id=$1 AND status='waiting' LIMIT 1",[userId]);
 if(!mine.length)return;
 const mineControl=mine[0];
 const {rows:opponents}=await db.query(`SELECT user_id,display_name FROM chess_match_queue
  WHERE status='waiting' AND user_id<>$1 AND time_control=$2 AND updated_at>NOW()-INTERVAL '3 minutes'
  ORDER BY joined_at ASC LIMIT 1`,[userId,mineControl.time_control]);
 if(!opponents.length)return;
 const opponent=opponents[0];
 const roomId='cn-'+crypto.randomUUID();
 const white=Math.random()<.5?userId:opponent.user_id;
 const result=await db.query(`INSERT INTO chess_rooms(id,status,fen,pgn,white_id,black_id,created_at,updated_at,last_move_at,time_control,base_seconds,increment_seconds,white_time_ms,black_time_ms,clock_started_at,rated)
  SELECT $1,'playing',$2,'',$3,$4,NOW(),NOW(),NOW(),$5,$6,$7,$6*1000,$6*1000,NOW(),TRUE
  WHERE EXISTS(SELECT 1 FROM chess_match_queue WHERE user_id=$8 AND status='waiting')
  AND EXISTS(SELECT 1 FROM chess_match_queue WHERE user_id=$9 AND status='waiting') RETURNING id`,
  [roomId,START_FEN,white,white===userId?opponent.user_id:userId,mineControl.time_control,mineControl.base_seconds,mineControl.increment_seconds,userId,opponent.user_id]);
 if(!result.rows.length)return;
 await db.query("UPDATE chess_match_queue SET status='matched',room_id=$3,updated_at=NOW() WHERE user_id IN ($1,$2) AND status='waiting'",[userId,opponent.user_id,roomId]);
}
export default async function(req,res){
 try{
  const user=req.user||await auth.getUser(req);if(!user)return res.status(401).json({error:'Sign in to find a match.'});
  const userId=String(user.id);const displayName=String(user.name||(user.email?user.email.split('@')[0]:'Chess player')).slice(0,48);
  if(req.method==='DELETE'){await db.query("DELETE FROM chess_match_queue WHERE user_id=$1 AND status='waiting'",[userId]);return res.json({ok:true,left:true});}
  if(req.method==='POST'){
   const pool=String(req.body?.timeControl||'rapid').toLowerCase();const tc=controls[pool];
   if(!tc)return res.status(400).json({error:'Choose Bullet, Blitz, Rapid, Classical, or Custom.'});
   const {rows:existing}=await db.query("SELECT q.status,q.room_id,r.status AS room_status,r.updated_at FROM chess_match_queue q LEFT JOIN chess_rooms r ON r.id=q.room_id WHERE q.user_id=$1 LIMIT 1",[userId]);
   if(existing.length&&existing[0].status==='matched'&&existing[0].room_status==='playing'&&Date.now()-new Date(existing[0].updated_at||0).getTime()<120000)return res.json(await stateFor(userId));
   if(existing.length&&existing[0].room_id&&existing[0].room_status==='playing'){await db.query("UPDATE chess_rooms SET status='finished',updated_at=NOW() WHERE id=$1 AND status='playing'",[existing[0].room_id]);await db.query("UPDATE chess_match_queue SET status='expired',room_id=NULL,updated_at=NOW() WHERE room_id=$1",[existing[0].room_id]);}
   await db.query(`INSERT INTO chess_match_queue(user_id,display_name,status,room_id,joined_at,updated_at,time_control,base_seconds,increment_seconds)
    VALUES($1,$2,'waiting',NULL,NOW(),NOW(),$3,$4,$5)
    ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,status='waiting',room_id=NULL,joined_at=NOW(),updated_at=NOW(),time_control=EXCLUDED.time_control,base_seconds=EXCLUDED.base_seconds,increment_seconds=EXCLUDED.increment_seconds`,
    [userId,displayName,pool,tc.base,tc.inc]);
  }else{await db.query("UPDATE chess_match_queue SET updated_at=NOW() WHERE user_id=$1 AND status='waiting'",[userId]);}
  await tryMatch(userId);
  const state=await stateFor(userId);
  return res.json(state.status==='waiting'?{...state,message:'Searching for a '+state.timeControl+' opponent…'}:state);
 }catch(error){return res.status(500).json({error:'Matchmaking temporarily failed.',detail:String(error&&error.message||'').slice(0,180)});}
}