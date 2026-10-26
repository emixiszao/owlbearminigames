export function isAllowedCommand(senderRole, commandType) {
  if (commandType === "start" || commandType === "close") return senderRole === "GM";
  if (commandType === "action") return senderRole === "GM" || senderRole === "PLAYER";
  return false;
}
