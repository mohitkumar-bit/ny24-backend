import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/authModal.js";

export const SLOT_DURATION_MS = 24 * 60 * 60 * 1000;
export const FREE_SLOT_LIMIT = 3;

const PLAN_LIMITS = { free: 3, pro: 50, business: Infinity };

export function isSubscribed(user) {
  return user?.subscription?.status === "active";
}

export function getSlotLimit(user) {
  if (!isSubscribed(user)) return FREE_SLOT_LIMIT;
  const plan = user.subscription?.plan || "free";
  return PLAN_LIMITS[plan] ?? FREE_SLOT_LIMIT;
}

export function findSlot(user, conversationId) {
  const id = String(conversationId);
  return (user.chatSlots || []).find((s) => s.conversationId.toString() === id);
}

export function countActiveSlots(user) {
  const pinnedIds = new Set(
    (user.pinnedConversations || []).map((id) => id.toString())
  );
  return (user.chatSlots || []).filter((s) => isSlotActive(s, pinnedIds)).length;
}

export function isSlotActive(slot, pinnedIds) {
  if (!slot) return false;
  const convId = slot.conversationId.toString();
  if (pinnedIds.has(convId)) return true;
  if (!slot.expiresAt) return true;
  return new Date(slot.expiresAt) > new Date();
}

/** Remove slots pointing to conversations that were deleted manually */
export async function cleanupOrphanedSlots(user) {
  if (!user?.chatSlots?.length) return user;

  const slotConvIds = user.chatSlots.map((s) => s.conversationId);
  const existing = await Conversation.find({ _id: { $in: slotConvIds } }).select(
    "_id"
  );
  const existingSet = new Set(existing.map((c) => c._id.toString()));

  const orphanedIds = user.chatSlots
    .filter((s) => !existingSet.has(s.conversationId.toString()))
    .map((s) => s.conversationId.toString());

  if (orphanedIds.length === 0) return user;

  const orphanedSet = new Set(orphanedIds);
  user.chatSlots = user.chatSlots.filter(
    (s) => !orphanedSet.has(s.conversationId.toString())
  );
  user.pinnedConversations = (user.pinnedConversations || []).filter(
    (id) => !orphanedSet.has(id.toString())
  );
  await user.save();
  return user;
}

/** Remove expired non-pinned slots and delete their conversations + messages */
export async function cleanupExpiredSlots(user) {
  const now = new Date();
  const pinnedIds = new Set(
    (user.pinnedConversations || []).map((id) => id.toString())
  );
  const expiredConvIds = [];

  for (const slot of user.chatSlots || []) {
    const convId = slot.conversationId.toString();
    if (pinnedIds.has(convId)) continue;
    if (slot.expiresAt && new Date(slot.expiresAt) <= now) {
      expiredConvIds.push(slot.conversationId);
    }
  }

  if (expiredConvIds.length === 0) return user;

  await Message.deleteMany({ conversationId: { $in: expiredConvIds } });
  await Conversation.deleteMany({ _id: { $in: expiredConvIds } });

  const expiredSet = new Set(expiredConvIds.map((id) => id.toString()));
  user.chatSlots = (user.chatSlots || []).filter(
    (s) => !expiredSet.has(s.conversationId.toString())
  );
  user.pinnedConversations = (user.pinnedConversations || []).filter(
    (id) => !expiredSet.has(id.toString())
  );
  await user.save();
  return user;
}

export async function resolveOrCreateConversation(senderId, receiverId, conversationId) {
  let conversation;
  let targetReceiverId = receiverId;
  let targetConversationId = conversationId;

  if (targetConversationId) {
    conversation = await Conversation.findById(targetConversationId);
    if (conversation) {
      targetReceiverId = conversation.participants.find(
        (p) => p.toString() !== senderId.toString()
      );
    } else if (!targetReceiverId) {
      targetReceiverId = targetConversationId;
      targetConversationId = null;
    }
  }

  if (!conversation && targetReceiverId) {
    conversation = await Conversation.findOne({
      participants: { $all: [senderId, targetReceiverId] },
    });
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, targetReceiverId],
      });
    }
    targetConversationId = conversation._id;
  }

  return { conversation, targetReceiverId, targetConversationId };
}

/**
 * Claim a slot when user opens or sends in a chat.
 * Pinned conversations keep the slot until unpinned.
 */
export async function claimSlot(user, conversationId) {
  const limit = getSlotLimit(user);
  if (limit === Infinity) {
    return { ok: true, slot: null, isSubscribed: true };
  }

  await cleanupExpiredSlots(user);
  const convId = conversationId.toString();
  const pinnedIds = new Set(
    (user.pinnedConversations || []).map((id) => id.toString())
  );
  const existing = findSlot(user, convId);

  if (existing && isSlotActive(existing, pinnedIds)) {
    return {
      ok: true,
      slot: existing,
      openedAt: existing.openedAt,
      expiresAt: pinnedIds.has(convId) ? null : existing.expiresAt,
      isPinned: pinnedIds.has(convId),
      alreadyHad: true,
    };
  }

  if (existing && !isSlotActive(existing, pinnedIds)) {
    const now = new Date();
    existing.openedAt = now;
    existing.expiresAt = new Date(now.getTime() + SLOT_DURATION_MS);
    await user.save();
    return {
      ok: true,
      slot: existing,
      openedAt: existing.openedAt,
      expiresAt: existing.expiresAt,
      isPinned: false,
      alreadyHad: false,
    };
  }

  if (countActiveSlots(user) >= limit) {
    return {
      ok: false,
      code: "CHAT_LIMIT_REACHED",
      message: `All ${limit} chat slots are in use. Wait for a slot to expire, unpin a chat, or upgrade.`,
      limit,
    };
  }

  const now = new Date();
  const slot = {
    conversationId,
    openedAt: now,
    expiresAt: new Date(now.getTime() + SLOT_DURATION_MS),
  };
  if (!user.chatSlots) user.chatSlots = [];
  user.chatSlots.push(slot);
  await user.save();

  return {
    ok: true,
    slot,
    openedAt: slot.openedAt,
    expiresAt: slot.expiresAt,
    isPinned: false,
    alreadyHad: false,
  };
}

/** Pin: occupies a slot permanently until unpinned */
export async function claimSlotOnPin(user, conversationId) {
  const limit = getSlotLimit(user);
  if (limit === Infinity) return { ok: true };

  await cleanupExpiredSlots(user);
  const convId = conversationId.toString();
  let slot = findSlot(user, convId);

  if (!slot) {
    if (countActiveSlots(user) >= limit) {
      return {
        ok: false,
        code: "CHAT_LIMIT_REACHED",
        message: `All ${limit} chat slots are in use. Unpin or wait for a slot to free up before pinning another chat.`,
        limit,
      };
    }
    const now = new Date();
    slot = {
      conversationId,
      openedAt: now,
      expiresAt: null,
    };
    if (!user.chatSlots) user.chatSlots = [];
    user.chatSlots.push(slot);
  } else {
    slot.expiresAt = null;
  }
  await user.save();
  return { ok: true, slot };
}

/** Unpin: resume 24h countdown from openedAt */
export async function releaseSlotOnUnpin(user, conversationId) {
  const slot = findSlot(user, conversationId);
  if (!slot) return;

  const now = new Date();
  const expiryFromOpen = new Date(
    new Date(slot.openedAt).getTime() + SLOT_DURATION_MS
  );
  slot.expiresAt = expiryFromOpen > now ? expiryFromOpen : now;
  await user.save();
  await cleanupExpiredSlots(user);
}

export function getActiveConversationIds(user) {
  const pinnedIds = new Set(
    (user.pinnedConversations || []).map((id) => id.toString())
  );
  return (user.chatSlots || [])
    .filter((s) => isSlotActive(s, pinnedIds))
    .map((s) => s.conversationId);
}

/** Slotted chats first (by openedAt asc), then locked chats (by lastMessageAt desc) */
export function sortConversationsForFreeUser(conversations, user) {
  conversations.sort((a, b) => {
    if (a.hasActiveSlot && !b.hasActiveSlot) return -1;
    if (!a.hasActiveSlot && b.hasActiveSlot) return 1;

    if (a.hasActiveSlot && b.hasActiveSlot) {
      const slotA = findSlot(user, a._id);
      const slotB = findSlot(user, b._id);
      const openedA = slotA?.openedAt ? new Date(slotA.openedAt).getTime() : 0;
      const openedB = slotB?.openedAt ? new Date(slotB.openedAt).getTime() : 0;
      return openedA - openedB;
    }

    const dateA = new Date(a.lastMessageAt || 0).getTime();
    const dateB = new Date(b.lastMessageAt || 0).getTime();
    return dateB - dateA;
  });
}

export function getSlotInfoForConversation(user, conversationId) {
  const pinnedIds = new Set(
    (user.pinnedConversations || []).map((id) => id.toString())
  );
  const slot = findSlot(user, conversationId.toString());
  if (!slot || !isSlotActive(slot, pinnedIds)) return null;
  const isPinned = pinnedIds.has(conversationId.toString());
  return {
    openedAt: slot.openedAt,
    expiresAt: isPinned ? null : slot.expiresAt,
    isPinned,
  };
}
