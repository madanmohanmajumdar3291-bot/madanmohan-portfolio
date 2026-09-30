import {
  pgTable, uuid, text, timestamp, integer, jsonb, boolean, real, pgEnum, index,
} from "drizzle-orm/pg-core";

export const postStatus = pgEnum("post_status", [
  "planned", "draft", "needs_revision", "awaiting_approval", "approved",
  "scheduled", "publishing", "published", "failed",
]);
export const experienceStatus = pgEnum("experience_status", ["unused", "drafted", "published"]);
export const postingMode = pgEnum("posting_mode", ["approval_required", "autonomous"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const userRef = () => uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  onboarded: boolean("onboarded").notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: userRef(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const linkedinAccounts = pgTable("linkedin_accounts", {
  id: id(),
  userId: userRef(),
  linkedinUserId: text("linkedin_user_id").notNull(),
  accessToken: text("access_token").notNull(), // encrypted (lib/crypto)
  refreshToken: text("refresh_token"), // encrypted
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: text("scopes").array().notNull().default([]),
  status: text("status").notNull().default("connected"), // connected | expired | revoked
  createdAt: createdAt(),
});

export type Pillar = { name: string; description: string; weight: number };

export const settings = pgTable("settings", {
  id: id(),
  userId: userRef().unique(),
  goals: text("goals").array().notNull().default([]),
  audience: text("audience").notNull().default(""),
  pillars: jsonb("pillars").$type<Pillar[]>().notNull().default([]),
  tone: text("tone").notNull().default(""),
  frequency: text("frequency").notNull().default("3/week"),
  postingTimes: text("posting_times").array().notNull().default([]),
  maxPostsPerDay: integer("max_posts_per_day").notNull().default(1),
  mode: postingMode("mode").notNull().default("approval_required"),
  autonomousPillars: text("autonomous_pillars").array().notNull().default([]),
  avoidTopics: text("avoid_topics").array().notNull().default([]),
  avoidWords: text("avoid_words").array().notNull().default([]),
  paused: boolean("paused").notNull().default(false),
});

export type VoiceProfile = {
  summary: string;
  sentenceLength: string;
  formality: string;
  humor: string;
  hookStyle: string;
  paragraphStructure: string;
  emojiUsage: string;
  ctaStyle: string;
  tone: string;
  vocabulary: string;
};

export const voiceProfiles = pgTable("voice_profiles", {
  id: id(),
  userId: userRef().unique(),
  samples: text("samples").array().notNull().default([]),
  profile: jsonb("profile").$type<VoiceProfile | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const experiences = pgTable("experiences", {
  id: id(),
  userId: userRef(),
  content: text("content").notNull(),
  source: text("source").notNull().default("text"), // text | voice
  pillar: text("pillar"),
  status: experienceStatus("status").notNull().default("unused"),
  createdAt: createdAt(),
});

export type ReviewCheck = { check: string; result: "pass" | "warn" | "fail"; reason: string };

export const posts = pgTable("posts", {
  id: id(),
  userId: userRef(),
  experienceId: uuid("experience_id").references(() => experiences.id, { onDelete: "set null" }),
  topic: text("topic").notNull(),
  pillar: text("pillar"),
  format: text("format").notNull(),
  objective: text("objective"),
  angle: text("angle"),
  hookStyle: text("hook_style"),
  cta: text("cta"),
  content: text("content").notNull(),
  status: postStatus("status").notNull().default("draft"),
  reviewResults: jsonb("review_results").$type<ReviewCheck[]>(),
  revisionCount: integer("revision_count").notNull().default(0),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  linkedinPostId: text("linkedin_post_id"),
  syncStatus: text("sync_status"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("posts_user_idx").on(t.userId, t.createdAt)]);

export const researchSources = pgTable("research_sources", {
  id: id(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title"),
  publisher: text("publisher"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
});

export const analytics = pgTable("analytics", {
  id: id(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  impressions: integer("impressions"),
  reactions: integer("reactions"),
  comments: integer("comments"),
  reposts: integer("reposts"),
  engagementRate: real("engagement_rate"),
  source: text("source").notNull(), // api | import | manual
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: id(),
  userId: userRef(),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls").$type<unknown[]>(),
  createdAt: createdAt(),
}, (t) => [index("chat_user_idx").on(t.userId, t.createdAt)]);

export const agentLogs = pgTable("agent_logs", {
  id: id(),
  userId: userRef(),
  postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  status: text("status").notNull(), // ok | warn | error
  message: text("message").notNull(),
  createdAt: createdAt(),
}, (t) => [index("logs_user_idx").on(t.userId, t.createdAt)]);

export const usage = pgTable("usage", {
  id: id(),
  userId: userRef(),
  postId: uuid("post_id"),
  tokens: integer("tokens").notNull(),
  cost: real("cost").notNull(),
  action: text("action").notNull(),
  createdAt: createdAt(),
});
