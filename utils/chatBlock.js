import User from "../models/authModal.js";

export async function getBlockedUserIds(userId) {
  const user = await User.findById(userId).select("blockedUsers");
  return (user?.blockedUsers || []).map((id) => id.toString());
}

export async function hasBlockBetween(userIdA, userIdB) {
  if (!userIdA || !userIdB || userIdA.toString() === userIdB.toString()) {
    return { blocked: false };
  }

  const [userA, userB] = await Promise.all([
    User.findById(userIdA).select("blockedUsers"),
    User.findById(userIdB).select("blockedUsers"),
  ]);

  const aBlockedB = (userA?.blockedUsers || []).some(
    (id) => id.toString() === userIdB.toString()
  );
  const bBlockedA = (userB?.blockedUsers || []).some(
    (id) => id.toString() === userIdA.toString()
  );

  if (aBlockedB) {
    return {
      blocked: true,
      code: "USER_BLOCKED",
      message: "You blocked this user. Unblock them to send messages.",
      blockedByMe: true,
    };
  }

  if (bBlockedA) {
    return {
      blocked: true,
      code: "USER_BLOCKED",
      message: "You cannot message this user.",
      blockedByMe: false,
    };
  }

  return { blocked: false };
}

export async function assertCanMessage(senderId, receiverId) {
  const result = await hasBlockBetween(senderId, receiverId);
  if (result.blocked) {
    return result;
  }
  return null;
}
