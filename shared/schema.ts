import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  salary: text("salary").notNull(),
  description: text("description").notNull(),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const swipes = pgTable("swipes", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id),
  direction: text("direction").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
});

export const insertSwipeSchema = createInsertSchema(swipes).omit({
  id: true,
  createdAt: true,
});

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Swipe = typeof swipes.$inferSelect;
export type InsertSwipe = z.infer<typeof insertSwipeSchema>;
