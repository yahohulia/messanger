import { WebSocketServer, WebSocket } from 'ws';
import amqplib, { type ConsumeMessage } from 'amqplib';
import { session, archivedMessage } from '@messanger/db';
import { eq } from 'drizzle-orm';
import { db } from './db';

if (!process.env.RMQ_URL) throw new Error('RMQ_URL is not set');
if (!process.env.WS_PORT) throw new Error('WS_PORT is not set');

const EXCHANGE_NAME = 'chat.direct';

type ClientMessage =
	| { type: 'auth'; token: string }
	| { type: 'ack'; deliveryTag: number }
	| { type: 'send_message'; receiverId: string; content: string; tempId: string }
	| { type: 'read_receipt'; withUserId: string };

const onlineUsers = new Set<string>();
const userSockets = new Map<string, WebSocket>();

function broadcast(excludeUserId: string, payload: unknown) {
	const data = JSON.stringify(payload);
	userSockets.forEach((socket, uid) => {
		if (uid !== excludeUserId && socket.readyState === WebSocket.OPEN) {
			socket.send(data);
		}
	});
}

async function startWorker() {
	const connection = await amqplib.connect(process.env.RMQ_URL!);
	const channel = await connection.createChannel();
	await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });

	const wss = new WebSocketServer({ port: parseInt(process.env.WS_PORT!) });
	console.log(`🚀 Messaging Worker running on ws://localhost:${process.env.WS_PORT}`);

	wss.on('connection', async (ws: WebSocket) => {
		let userId: string | null = null;
		let consumerTag: string | null = null;

		const pendingAcks = new Map<number, ConsumeMessage>();

		ws.on('message', async (data: Buffer) => {
			try {
				const msg = JSON.parse(data.toString()) as ClientMessage;

				if (msg.type === 'auth') {
					const sessionRecord = await db.query.session.findFirst({
						where: eq(session.token, msg.token)
					});

					if (!sessionRecord || new Date(sessionRecord.expiresAt) < new Date()) {
						ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
						return ws.close();
					}

					userId = sessionRecord.userId;
					onlineUsers.add(userId);
					userSockets.set(userId, ws);

					// Send currently online users to the newly connected user
					onlineUsers.forEach((uid) => {
						if (uid !== userId) {
							ws.send(JSON.stringify({ type: 'user_online', userId: uid }));
						}
					});

					// Notify everyone else that this user came online
					broadcast(userId, { type: 'user_online', userId });

					const queueName = `user.${userId}`;
					await channel.assertQueue(queueName, { durable: true, arguments: { 'x-queue-mode': 'lazy' } });
					await channel.bindQueue(queueName, EXCHANGE_NAME, queueName);

					const consumeSetup = await channel.consume(
						queueName,
						(rmqMsg: ConsumeMessage | null) => {
							if (rmqMsg) {
								const deliveryTag = rmqMsg.fields.deliveryTag;
								const payload = JSON.parse(rmqMsg.content.toString());

								pendingAcks.set(deliveryTag, rmqMsg);
								ws.send(JSON.stringify({ type: 'new_message', deliveryTag, data: payload }));

								// Notify sender their message was delivered
								const senderSocket = userSockets.get(payload.senderId);
								if (senderSocket?.readyState === WebSocket.OPEN) {
									senderSocket.send(JSON.stringify({ type: 'message_delivered', messageId: payload.id }));
								}
							}
						},
						{ noAck: false }
					);

					consumerTag = consumeSetup.consumerTag;
					ws.send(JSON.stringify({ type: 'authenticated', userId }));
					console.log(`[Connected] User ${userId} bound to queue.`);
				}

				if (msg.type === 'ack' && userId) {
					const originalMsg = pendingAcks.get(msg.deliveryTag);
					if (originalMsg) {
						channel.ack(originalMsg);
						pendingAcks.delete(msg.deliveryTag);
					}
				}

				if (msg.type === 'read_receipt' && userId) {
					const targetSocket = userSockets.get(msg.withUserId);
					if (targetSocket?.readyState === WebSocket.OPEN) {
						targetSocket.send(JSON.stringify({ type: 'messages_read', byUserId: userId }));
					}
				}

				if (msg.type === 'send_message' && userId) {
					// Use the client-provided tempId so the client can match delivery confirmations
					const payload = {
						id: msg.tempId,
						senderId: userId,
						receiverId: msg.receiverId,
						content: msg.content,
						sentAt: new Date().toISOString()
					};

					channel.publish(
						EXCHANGE_NAME,
						`user.${msg.receiverId}`,
						Buffer.from(JSON.stringify(payload)),
						{ persistent: true }
					);

					if (!onlineUsers.has(msg.receiverId)) {
						console.log(`[Push Notification] Trigger FCM for offline user ${msg.receiverId}`);
					}

					db.insert(archivedMessage)
						.values({
							id: payload.id,
							senderId: payload.senderId,
							receiverId: payload.receiverId,
							content: payload.content,
							sentAt: new Date(payload.sentAt)
						})
						.execute()
						.catch((err) => console.error('Archive Failed:', err));
				}
			} catch (err) {
				console.error('Message processing error:', err);
			}
		});

		ws.on('close', async () => {
			if (userId) {
				onlineUsers.delete(userId);
				userSockets.delete(userId);
				broadcast(userId, { type: 'user_offline', userId });
			}
			if (consumerTag) await channel.cancel(consumerTag);
			pendingAcks.clear();
		});
	});
}

startWorker().catch(console.error);
