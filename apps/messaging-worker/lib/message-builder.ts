export interface SendMessageInput {
  receiverId: string;
  content: string;
  tempId: string;
}

export interface MessagePayload {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  sentAt: string;
}

export function buildMessagePayload(
  userId: string,
  msg: SendMessageInput
): MessagePayload {
  return {
    id: msg.tempId,
    senderId: userId,
    receiverId: msg.receiverId,
    content: msg.content,
    sentAt: new Date().toISOString(),
  };
}
