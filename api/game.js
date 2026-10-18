import { db, auth } from 'hatchable';
export const access='user';
export const methods=['GET','POST'];

function safeNum(v,fallback=0){const n=Number(v);return Number.isFinite(n)?Math.max(0,n):fallback}
async function getRoom(roomId){const {rows}=await db.query('SELECT * FROM chess_rooms WHERE id=$1 LIMIT 1',[roomId]);return rows[0]||null}
async function applyRating(room,result){
 if(!room.rated||!['1-0','0-1','1/2-1/2'].includes(result))return null;
 const existing=await db.query('SELECT room_id FROM chess_game_results WHERE room_id=$1 LIMIT 1',[room.id]);
 if(existing.rows.length)return null;
 const pool=room.time_control==='bullet'?'bullet':room.time_control==='blitz'?'blitz':room.time_control==='rapid'?'rapid':'rapid';
 await db.query("INSERT INTO chess_ratings(user_id,pool,rating) VALUES($1,$2,1200) ON CONFLICT(user_id,pool) DO NOTHING",[room.white_id,pool]);
 await db.query("INSERT INTO chess_ratings(user_id,pool,rating) VALUES($1,$2,1200) ON CONFLICT(user_id,pool) DO NOTHING",[room.black_id,pool]);
 const {rows}=await db.query('SELECT user_id,rating,games,wins,losses,draws FROM chess_ratings WHERE pool=$1 AND user_id IN ($2,$3)',[pool,room.white_id,room.black_id]);
 const w=rows.find(x=>String(x.user_id)===String(room.white_id))||{rating:1200,games:0};
 const b=rows.find(x=>String(x.user_id)===String(room.black_id))||{rating:1200,games:0};
 const expectedW=1/(1+Math.pow(10,(Number(b.rating)-Number(w.rating))/400));
 const scoreW=result==='1-0'?1:result==='0-1'?0:.5;
 const kW=Number(w.games)<20?32:20,kB=Number(b.games)<20?32:20;
 const dw=Math.round(kW*(scoreW-expectedW));
 const dbb=Math.round(kB*((1-scoreW)-(1-expectedW)));
 const newW=Math.max(100,Number(w.rating)+dw),newB=Math.max(100,Number(b.rating)+dbb);
 await db.query('UPDATE chess_ratings SET rating=$3,games=games+1,wins=wins+$4,losses=losses+$5,draws=draws+$6,updated_at=NOW() WHERE user_id=$1 AND pool=$2',[room.white_id,pool,newW,result==='1-0'?1:0,result==='0-1'?1:0,result==='1/2-1/2'?1:0]);
 await db.query('UPDATE chess_ratings SET rating=$3,games=games+1,wins=wins+$4,losses=losses+$5,draws=draws+$6,updated_at=NOW() WHERE user_id=$1 AND pool=$2',[room.black_id,pool,newB,result==='0-1'?1:0,result==='1-0'?1:0,result==='1/2-1/2'?1:0]);
 await db.query('INSERT INTO chess_game_results(room_id,white_id,black_id,time_control,result,white_rating_change,black_rating_change) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(room_id) DO NOTHING',[room.id,room.white_id,room.black_id,pool,result,dw,dbb]);
 return {whiteChange:dw,blackChange:dbb};
}

export default async function(req,res){
 try{
  const user=req.user||await auth.getUser(req);if(!user)return res.status(401).json({error:'Sign in required.'});
  const roomId=String((req.method==='POST'?req.body?.roomId:req.query?.roomId)||'').slice(0,100);
  if(!roomId)return res.status(400).json({error:'roomId is required.'});
  let room=await getRoom(roomId);if(!room)return res.status(404).json({error:'Game room not found.'});
  const userId=String(user.id);
  if(String(room.white_id)!==userId&&String(room.black_id)!==userId)return res.status(403).json({error:'You are not a player in this room.'});
  if(req.method==='GET'){
   if(room.status==='playing')await db.query("UPDATE chess_rooms SET updated_at=NOW() WHERE id=$1 AND status='playing'",[roomId]);
   let whiteMs=safeNum(room.white_time_ms),blackMs=safeNum(room.black_time_ms);
   if(room.status==='playing'&&room.clock_started_at){
    const elapsed=Math.max(0,Date.now()-new Date(room.clock_started_at).getTime());
    if(String(room.fen||'').split(/\s+/)[1]==='w')whiteMs=Math.max(0,whiteMs-elapsed);else blackMs=Math.max(0,blackMs-elapsed);
   }
   return res.json({roomId:room.id,status:room.status,fen:room.fen,pgn:room.pgn||'',color:String(room.white_id)===userId?'w':'b',updatedAt:room.updated_at,lastMoveAt:room.last_move_at,timeControl:room.time_control||'rapid',whiteTimeMs:whiteMs,blackTimeMs:blackMs,incrementSeconds:Number(room.increment_seconds||0),clockStartedAt:room.clock_started_at});
  }
  if(room.status!=='playing')return res.status(409).json({error:'This game has ended.'});
  if(req.body?.action==='finish'){
   const result=String(req.body?.result||'');if(!['1-0','0-1','1/2-1/2'].includes(result))return res.status(400).json({error:'Invalid game result.'});
   const finish=await db.query("UPDATE chess_rooms SET status='finished',updated_at=NOW(),clock_started_at=NULL WHERE id=$1 AND status='playing' RETURNING id",[roomId]);
   if(!finish.rows.length)return res.status(409).json({error:'Game already finished.'});
   const ratings=await applyRating(room,result);return res.json({ok:true,status:'finished',result,ratings});
  }
  const fen=String(req.body?.fen||'').trim(),pgn=String(req.body?.pgn||''),expectedFen=String(req.body?.expectedFen||'').trim();
  const resultTag=String(req.body?.result||'');
  if(fen.length>300||pgn.length>12000||fen.split(/\s+/).length<6||!expectedFen)return res.status(400).json({error:'Invalid game state. Refresh the board and try again.'});
  if(expectedFen!==String(room.fen||'').trim())return res.status(409).json({error:'The board changed before your move arrived.',code:'STALE_POSITION',currentFen:room.fen,currentPgn:room.pgn||''});
  const playerColor=String(room.white_id)===userId?'w':'b',currentTurn=String(room.fen||'').trim().split(/\s+/)[1],nextTurn=fen.split(/\s+/)[1],mover=nextTurn==='w'?'b':nextTurn==='b'?'w':null;
  if(currentTurn!==playerColor||mover!==playerColor)return res.status(409).json({error:'It is not your turn to publish that position.'});
  const now=Date.now(),elapsed=room.clock_started_at?Math.max(0,now-new Date(room.clock_started_at).getTime()):0;
  let whiteMs=safeNum(room.white_time_ms,Number(room.base_seconds||600)*1000),blackMs=safeNum(room.black_time_ms,Number(room.base_seconds||600)*1000);
  if(playerColor==='w')whiteMs=Math.max(0,whiteMs-elapsed+Number(room.increment_seconds||0)*1000);else blackMs=Math.max(0,blackMs-elapsed+Number(room.increment_seconds||0)*1000);
  if((playerColor==='w'?whiteMs:blackMs)<=0){
   const timeoutResult=playerColor==='w'?'0-1':'1-0';
   await db.query("UPDATE chess_rooms SET status='finished',updated_at=NOW(),clock_started_at=NULL WHERE id=$1 AND status='playing'",[roomId]);
   const changes=await applyRating(room,timeoutResult);
   return res.status(409).json({error:'Your clock ran out.',code:'FLAGGED',result:timeoutResult,ratings:changes});
  }
  const finalResult=['1-0','0-1','1/2-1/2'].includes(resultTag)?resultTag:(pgn.includes('1-0')?'1-0':pgn.includes('0-1')?'0-1':pgn.includes('1/2-1/2')?'1/2-1/2':'');
  const status=finalResult?'finished':'playing';
  const update=await db.query("UPDATE chess_rooms SET fen=$2,pgn=$3,updated_at=NOW(),last_move_at=NOW(),white_time_ms=$5,black_time_ms=$6,clock_started_at=CASE WHEN $7='finished' THEN NULL ELSE NOW() END,status=$7 WHERE id=$1 AND fen=$4 AND status='playing' RETURNING id",[roomId,fen,pgn,expectedFen,whiteMs,blackMs,status]);
  if(!update.rows?.length){const latest=await getRoom(roomId);return res.status(409).json({error:'The board changed before your move arrived.',code:'STALE_POSITION',currentFen:latest?.fen||room.fen,currentPgn:latest?.pgn||room.pgn||''});}
  let ratings=null;if(finalResult)ratings=await applyRating({...room,white_time_ms:whiteMs,black_time_ms:blackMs},finalResult);
  return res.json({ok:true,roomId,fen,pgn,status,whiteTimeMs:whiteMs,blackTimeMs:blackMs,ratings});
 }catch(error){return res.status(500).json({error:'Game sync temporarily failed.',detail:String(error&&error.message||'').slice(0,180)});}
}