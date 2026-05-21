import { relations } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth.schema";

export const archivedMessage = sqliteTable("archived_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  senderId: text("sender_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  receiverId: text("receiver_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp" }).notNull(),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }),
  readAt: integer("read_at", { mode: "timestamp" }),
});

export const hiddenContact = sqliteTable(
  "hidden_contact",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.contactId] })]
);

export const archivedMessageRelations = relations(
  archivedMessage,
  ({ one }) => ({
    sender: one(user, {
      fields: [archivedMessage.senderId],
      references: [user.id],
      relationName: "sentMessages",
    }),
    receiver: one(user, {
      fields: [archivedMessage.receiverId],
      references: [user.id],
      relationName: "receivedMessages",
    }),
  }),
);

export * from "./auth.schema";
