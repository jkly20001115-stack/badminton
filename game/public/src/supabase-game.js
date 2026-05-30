const SUPABASE_JS_URL = 'https://esm.sh/@supabase/supabase-js@2.76.1';

let clientPromise = null;

export function isSupabaseConfigured() {
  const config = getConfig();
  return Boolean(config.url && config.publishableKey);
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import(SUPABASE_JS_URL).then(({ createClient }) => {
      const config = getConfig();
      return createClient(config.url, config.publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        realtime: {
          params: {
            eventsPerSecond: 30,
          },
        },
      });
    });
  }
  return clientPromise;
}

export async function createRealtimeChannel(roomId, onMessage) {
  const client = await getSupabaseClient();
  if (!client) return null;

  const channel = client.channel(`badminton:${roomId}`, {
    config: {
      broadcast: { self: false },
      presence: { key: crypto.randomUUID() },
    },
  });

  channel.on('broadcast', { event: 'game' }, ({ payload }) => onMessage(payload));

  await new Promise((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reject(new Error(`Supabase Realtime channel ${status}`));
      }
    });
  });

  return { client, channel };
}

export async function saveMatchResult(result) {
  const client = await getSupabaseClient();
  if (!client) return { skipped: true };

  const { data, error } = await client
    .from('match_results')
    .insert({
      room_id: result.roomId || null,
      mode: result.mode,
      player_a_name: result.playerAName || null,
      player_b_name: result.playerBName || null,
      winner_side: result.winnerSide,
      winner_name: result.winnerName || null,
      games_a: result.gamesA,
      games_b: result.gamesB,
      final_points_a: result.finalPointsA,
      final_points_b: result.finalPointsB,
      set_scores: result.setScores,
      duration_seconds: result.durationSeconds,
      client_version: result.clientVersion || 'badminton0.1',
    })
    .select('id')
    .single();

  if (error) throw error;
  return { saved: true, id: data.id };
}

function getConfig() {
  return window.BADMINTON_SUPABASE || {};
}
