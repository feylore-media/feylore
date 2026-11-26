import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import {
  CALENDAR_DOMAINS,
  CALENDAR_MAX_WINDOW_DAYS,
  CALENDAR_SOURCES,
  type CalendarFilters,
  type CalendarPreferences,
  type CalendarSourceId,
} from "../../shared/calendar.js";
import type { CalendarDomain } from "../../shared/upcoming.js";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const calendarQuerySchema = z.object({
  from: z.string().regex(datePattern),
  to: z.string().regex(datePattern),
  media: z.string().optional(),
  sources: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

const preferencesSchema = z.object({
  view: z.enum(["agenda", "month"]),
  domains: z.array(z.enum(CALENDAR_DOMAINS as [CalendarDomain, ...CalendarDomain[]])),
  sources: z.array(
    z.enum(CALENDAR_SOURCES as [CalendarSourceId, ...CalendarSourceId[]]),
  ),
});

const dayStr = (date: Date) => date.toISOString().slice(0, 10);

function splitList(
  raw: string,
  allowed: readonly string[],
): string[] | null {
  if (!raw) return null;
  const values = raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => allowed.includes(v));
  return values;
}

export async function registerCalendarRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.get("/api/v1/calendar", async (request) => {
    const user = requireAuth(request);
    const query = calendarQuerySchema.parse(request.query);
    const from = query.from;
    let to = query.to;
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const maxTo = new Date(
      fromDate.getTime() + CALENDAR_MAX_WINDOW_DAYS * 86400000,
    );
    if (new Date(`${to}T00:00:00.000Z`) > maxTo) to = dayStr(maxTo);
    const filters: CalendarFilters = {
      domains: splitList(query.media ?? "", CALENDAR_DOMAINS) as
        | CalendarDomain[]
        | null,
      sources: splitList(query.sources ?? "", CALENDAR_SOURCES) as
        | CalendarSourceId[]
        | null,
      from,
      to,
      limit: query.limit ?? null,
    };
    return { data: await ctx.calendar.list(user, filters) };
  });

  app.get("/api/v1/calendar/preferences", async (request) => {
    const user = requireAuth(request);
    return { data: await ctx.calendar.getPreferences(user.id) };
  });

  app.put("/api/v1/calendar/preferences", async (request) => {
    const user = requireAuth(request);
    const prefs = preferencesSchema.parse(request.body) as CalendarPreferences;
    await ctx.calendar.savePreferences(user.id, prefs);
    return { data: prefs };
  });
}