import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Der Server kann hier nichts entschlüsseln und soll es auch nicht.
 * Er reicht Chiffrat und die öffentlichen Signaturschlüssel weiter;
 * lesbar wird alles erst im Browser.
 */

export type Teilnehmer = {
  userId: string;
  handle: string;
  displayName: string | null;
  signingPublicKey: string | null;
  exchangePublicKey: string | null;
};

export type UnterhaltungsUebersicht = {
  id: string;
  isGroup: boolean;
  title: string | null;
  lastMessageAt: string;
  lastReadAt: string;
  andere: Teilnehmer[];
};

export type RohNachricht = {
  id: string;
  senderId: string;
  iv: string;
  data: string;
  signature: string;
  createdAt: string;
};

function isMissing(code: string | undefined) {
  return code === "PGRST205" || code === "42P01" || code === "PGRST200";
}

/** Alle Unterhaltungen des Nutzers, neueste zuerst. */
export async function getUnterhaltungen(
  userId: string,
): Promise<UnterhaltungsUebersicht[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("conversation_participants")
    .select(
      "last_read_at, conversation:conversations!inner (id, is_group, title, last_message_at)",
    )
    .eq("user_id", userId);

  if (error) {
    if (isMissing(error.code)) return [];
    throw new Error(`Unterhaltungen nicht ladbar: ${error.message}`);
  }

  const zeilen = (data ?? []) as unknown as {
    last_read_at: string;
    conversation: {
      id: string;
      is_group: boolean;
      title: string | null;
      last_message_at: string;
    };
  }[];

  if (zeilen.length === 0) return [];

  // Alle Teilnehmer in einem Aufruf statt einem pro Unterhaltung.
  const ids = zeilen.map((z) => z.conversation.id);
  const { data: alleTeilnehmer } = await supabase
    .from("conversation_participants")
    .select(
      "conversation_id, user_id, profile:profiles!inner (handle, display_name)",
    )
    .in("conversation_id", ids);

  const proUnterhaltung = new Map<string, Teilnehmer[]>();
  for (const row of (alleTeilnehmer ?? []) as unknown as {
    conversation_id: string;
    user_id: string;
    profile: { handle: string; display_name: string | null };
  }[]) {
    if (row.user_id === userId) continue;
    const liste = proUnterhaltung.get(row.conversation_id) ?? [];
    liste.push({
      userId: row.user_id,
      handle: row.profile.handle,
      displayName: row.profile.display_name,
      signingPublicKey: null,
      exchangePublicKey: null,
    });
    proUnterhaltung.set(row.conversation_id, liste);
  }

  return zeilen
    .map((z) => ({
      id: z.conversation.id,
      isGroup: z.conversation.is_group,
      title: z.conversation.title,
      lastMessageAt: z.conversation.last_message_at,
      lastReadAt: z.last_read_at,
      andere: proUnterhaltung.get(z.conversation.id) ?? [],
    }))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/** Teilnehmer samt öffentlicher Schlüssel — für Prüfung und Zustellung. */
export async function getTeilnehmer(
  conversationId: string,
): Promise<Teilnehmer[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("conversation_participants")
    .select(
      "user_id, profile:profiles!inner (handle, display_name), keys:user_keys (signing_public_key, exchange_public_key)",
    )
    .eq("conversation_id", conversationId);

  if (error) {
    if (isMissing(error.code)) return [];
    throw new Error(`Teilnehmer nicht ladbar: ${error.message}`);
  }

  return ((data ?? []) as unknown as {
    user_id: string;
    profile: { handle: string; display_name: string | null };
    keys: {
      signing_public_key: string;
      exchange_public_key: string;
    } | null;
  }[]).map((row) => ({
    userId: row.user_id,
    handle: row.profile.handle,
    displayName: row.profile.display_name,
    signingPublicKey: row.keys?.signing_public_key ?? null,
    exchangePublicKey: row.keys?.exchange_public_key ?? null,
  }));
}

/** Nachrichten einer Unterhaltung, älteste zuerst. */
export async function getNachrichten(
  conversationId: string,
  limit = 100,
): Promise<RohNachricht[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, iv, data, signature, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissing(error.code)) return [];
    throw new Error(`Nachrichten nicht ladbar: ${error.message}`);
  }

  return ((data ?? []) as unknown as {
    id: string;
    sender_id: string;
    iv: string;
    data: string;
    signature: string;
    created_at: string;
  }[])
    .map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      iv: row.iv,
      data: row.data,
      signature: row.signature,
      createdAt: row.created_at,
    }))
    .reverse();
}

/** Hat der Nutzer schon Schlüssel angelegt? */
export async function hatSchluesselServerseitig(
  userId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_keys")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
