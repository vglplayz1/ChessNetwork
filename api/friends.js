import { db, auth } from 'hatchable';
export const access = 'user';
export const methods = ['GET','POST','DELETE'];

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const controls = {
  bullet: { base: 60, inc: 0 },
  blitz: { base: 180, inc: 0 },
  rapid: { base: 600, inc: 0 },
  classical: { base: 1800, inc: 0 },
  custom: { base: 600, inc: 5 }
};

export default async function (req, res) {
  try {
    const user = req.user || await auth.getUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to manage friends.' });
    const userId = String(user.id);

    if (req.method === 'GET') {
      const [friends, incoming, outgoing, challenges, ratings] = await Promise.all([
        db.query(`SELECT DISTINCT u.id,u.email,COALESCE(NULLIF(u.name,''),split_part(u.email,'@',1)) AS name
          FROM users u WHERE u.id IN (
            SELECT f.friend_id FROM chess_friends f WHERE f.user_id=$1
            UNION SELECT r.requester_id FROM chess_friend_requests r WHERE r.status='accepted' AND r.recipient_id=$1
            UNION SELECT r.recipient_id FROM chess_friend_requests r WHERE r.status='accepted' AND r.requester_id=$1
          ) ORDER BY name LIMIT 100`, [userId]),
        db.query(`SELECT r.id,r.created_at,u.id AS user_id,u.email,COALESCE(NULLIF(u.name,''),split_part(u.email,'@',1)) AS name
          FROM chess_friend_requests r JOIN users u ON u.id=r.requester_id
          WHERE r.recipient_id=$1 AND r.status='pending' ORDER BY r.created_at DESC LIMIT 100`, [userId]),
        db.query(`SELECT r.id,r.created_at,u.id AS user_id,u.email,COALESCE(NULLIF(u.name,''),split_part(u.email,'@',1)) AS name
          FROM chess_friend_requests r JOIN users u ON u.id=r.recipient_id
          WHERE r.requester_id=$1 AND r.status='pending' ORDER BY r.created_at DESC LIMIT 100`, [userId]),
        db.query(`SELECT c.id,c.room_id,c.time_control,c.base_seconds,c.increment_seconds,c.status,c.created_at,
          c.challenger_id,c.challenged_id,
          COALESCE(NULLIF(ch.name,''),split_part(ch.email,'@',1)) AS challenger_name,ch.email AS challenger_email,
          COALESCE(NULLIF(oh.name,''),split_part(oh.email,'@',1)) AS challenged_name,oh.email AS challenged_email
          FROM chess_friend_challenges c
          JOIN users ch ON ch.id=c.challenger_id JOIN users oh ON oh.id=c.challenged_id
          WHERE (c.challenged_id=$1 AND c.status='pending') OR (c.challenger_id=$1 AND c.status IN ('pending','accepted'))
          ORDER BY c.created_at DESC LIMIT 50`, [userId]),
        db.query('SELECT pool,rating,games,wins,losses,draws FROM chess_ratings WHERE user_id=$1 ORDER BY pool', [userId])
      ]);
      return res.json({ me: userId, friends: friends.rows, incoming: incoming.rows, outgoing: outgoing.rows, challenges: challenges.rows, ratings: ratings.rows });
    }

    const body = req.body || {};
    const action = String(body.action || (req.method === 'DELETE' ? 'remove' : 'request'));
    if (action === 'request') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Enter a valid email address.' });
      const { rows } = await db.query('SELECT id,email,name FROM users WHERE lower(email)=$1 LIMIT 1', [email]);
      if (!rows.length) return res.status(404).json({ error: 'No Chess Network account uses that email yet. Ask them to register first.' });
      const friend = rows[0];
      if (String(friend.id) === userId) return res.status(400).json({ error: 'You cannot add yourself.' });
      const existing = await db.query(`SELECT id,status,requester_id,recipient_id FROM chess_friend_requests
        WHERE (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)
        ORDER BY created_at DESC LIMIT 1`, [userId, String(friend.id)]);
      if (existing.rows.length && existing.rows[0].status === 'accepted') return res.status(409).json({ error: 'You are already friends.' });
      if (existing.rows.length && existing.rows[0].status === 'pending') {
        const row = existing.rows[0];
        if (row.requester_id === String(friend.id)) {
          await db.query("UPDATE chess_friend_requests SET status='accepted',updated_at=NOW() WHERE id=$1", [row.id]);
          await db.query('INSERT INTO chess_friends(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [userId, String(friend.id)]);
          return res.json({ ok: true, accepted: true, friend: { id: friend.id, email: friend.email, name: friend.name || email.split('@')[0] } });
        }
        return res.status(409).json({ error: 'Friend request already sent.' });
      }
      const id = crypto.randomUUID();
      await db.query(`INSERT INTO chess_friend_requests(id,requester_id,recipient_id,status,created_at,updated_at)
        VALUES($1,$2,$3,'pending',NOW(),NOW()) ON CONFLICT(requester_id,recipient_id) DO UPDATE SET status='pending',created_at=NOW(),updated_at=NOW()`, [id, userId, String(friend.id)]);
      return res.json({ ok: true, request: { id, email: friend.email, name: friend.name || email.split('@')[0] } });
    }

    if (action === 'accept' || action === 'cancel' || action === 'decline') {
      const requestId = String(body.requestId || '');
      const { rows } = await db.query('SELECT * FROM chess_friend_requests WHERE id=$1 LIMIT 1', [requestId]);
      if (!rows.length) return res.status(404).json({ error: 'Friend request not found.' });
      const request = rows[0];
      if (action === 'accept') {
        if (String(request.recipient_id) !== userId || request.status !== 'pending') return res.status(403).json({ error: 'Only the recipient can accept this request.' });
        await db.query("UPDATE chess_friend_requests SET status='accepted',updated_at=NOW() WHERE id=$1 AND status='pending'", [requestId]);
        await db.query('INSERT INTO chess_friends(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [userId, String(request.requester_id)]);
        return res.json({ ok: true, accepted: true });
      }
      if (action === 'cancel' && String(request.requester_id) !== userId) return res.status(403).json({ error: 'Only the sender can cancel this request.' });
      if (action === 'decline' && String(request.recipient_id) !== userId) return res.status(403).json({ error: 'Only the recipient can decline this request.' });
      await db.query("UPDATE chess_friend_requests SET status='cancelled',updated_at=NOW() WHERE id=$1 AND status='pending'", [requestId]);
      return res.json({ ok: true, cancelled: true });
    }

    if (action === 'remove') {
      const friendId = String(body.friendId || '');
      const email = String(body.email || '').trim().toLowerCase();
      let id = friendId;
      if (!id && email) {
        const { rows } = await db.query('SELECT id FROM users WHERE lower(email)=$1 LIMIT 1', [email]);
        id = rows[0]?.id || '';
      }
      if (!id) return res.status(400).json({ error: 'Choose a friend to remove.' });
      await db.query('DELETE FROM chess_friends WHERE user_id=$1 AND friend_id=$2', [userId, id]);
      await db.query("UPDATE chess_friend_requests SET status='cancelled',updated_at=NOW() WHERE status='accepted' AND ((requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1))", [userId, id]);
      return res.json({ ok: true, removed: true });
    }

    if (action === 'challenge') {
      const friendId = String(body.friendId || '');
      const pool = String(body.timeControl || 'blitz').toLowerCase();
      const tc = controls[pool];
      if (!friendId || !tc) return res.status(400).json({ error: 'Choose a friend and valid time control.' });
      const friendship = await db.query(`SELECT 1 FROM chess_friend_requests WHERE status='accepted'
        AND ((requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)) LIMIT 1`, [userId, friendId]);
      const direct = await db.query('SELECT 1 FROM chess_friends WHERE user_id=$1 AND friend_id=$2 LIMIT 1', [userId, friendId]);
      if (!friendship.rows.length && !direct.rows.length) return res.status(403).json({ error: 'Add and accept this player as a friend first.' });
      const roomId = 'cn-' + crypto.randomUUID();
      const white = Math.random() < .5 ? userId : friendId;
      await db.query(`INSERT INTO chess_rooms(id,status,fen,pgn,white_id,black_id,created_at,updated_at,last_move_at,time_control,base_seconds,increment_seconds,white_time_ms,black_time_ms,clock_started_at,rated)
        VALUES($1,'waiting',$2,'',$3,$4,NOW(),NOW(),NOW(),$5,$6,$7,$6*1000,$6*1000,NULL,TRUE)`,
        [roomId, START_FEN, white, white === userId ? friendId : userId, pool, tc.base, tc.inc]);
      const challengeId = crypto.randomUUID();
      await db.query(`INSERT INTO chess_friend_challenges(id,challenger_id,challenged_id,room_id,time_control,base_seconds,increment_seconds,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,'pending')`, [challengeId,userId,friendId,roomId,pool,tc.base,tc.inc]);
      return res.json({ ok: true, challengeId });
    }

    if (action === 'accept_challenge' || action === 'decline_challenge') {
      const challengeId = String(body.challengeId || '');
      const { rows } = await db.query('SELECT * FROM chess_friend_challenges WHERE id=$1 LIMIT 1', [challengeId]);
      if (!rows.length) return res.status(404).json({ error: 'Challenge not found.' });
      const c = rows[0];
      if (String(c.challenged_id) !== userId || c.status !== 'pending') return res.status(403).json({ error: 'This challenge is not yours to accept.' });
      const status = action === 'accept_challenge' ? 'accepted' : 'declined';
      await db.query('UPDATE chess_friend_challenges SET status=$2,updated_at=NOW() WHERE id=$1', [challengeId,status]);
      if (status === 'accepted') {
        await db.query("UPDATE chess_rooms SET status='playing',clock_started_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='waiting'", [c.room_id]);
        return res.json({ ok: true, roomId: c.room_id });
      }
      await db.query("UPDATE chess_rooms SET status='finished',updated_at=NOW() WHERE id=$1", [c.room_id]);
      return res.json({ ok: true, declined: true });
    }

    return res.status(400).json({ error: 'Unknown friend action.' });
  } catch (error) {
    return res.status(500).json({ error: 'Friends could not be updated right now.', detail: String(error && error.message || '').slice(0, 180) });
  }
}