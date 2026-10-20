import Parser from "rss-parser";
import { env } from "../env.js";
import { stripHtml, truncate } from "../text.js";
import { USER_AGENT } from "./robots.js";
import type { RawItem, Source } from "./types.js";

const MAX_ITEMS_PER_SOURCE = 20;
const SUMMARY_MAX = 500;

export class SkippedSource extends Error {}

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, ...headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  return response;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const summary = (text: string | undefined | null) => truncate(stripHtml(text ?? ""), SUMMARY_MAX);

const rssParser = new Parser();

async function fetchRss(source: Source): Promise<RawItem[]> {
  const xml = await (await get(source.address, { accept: "application/rss+xml, application/atom+xml, */*" })).text();
  const feed = await rssParser.parseString(xml);
  return feed.items.slice(0, MAX_ITEMS_PER_SOURCE).flatMap((item) => {
    if (!item.link || !item.title) return [];
    return [{
      url: item.link,
      title: stripHtml(item.title),
      summary: summary(item.contentSnippet ?? item.summary ?? item.content),
      publishedAt: toDate(item.isoDate ?? item.pubDate),
      engagement: 0,
      tags: (item.categories ?? []).filter((c): c is string => typeof c === "string"),
    }];
  });
}

interface HnHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  created_at_i: number;
  story_text: string | null;
}

async function fetchHackerNews(source: Source): Promise<RawItem[]> {
  const data = (await (await get(source.address)).json()) as { hits: HnHit[] };
  return data.hits.slice(0, MAX_ITEMS_PER_SOURCE).map((hit) => ({
    url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
    title: hit.title,
    summary: summary(hit.story_text),
    publishedAt: toDate(hit.created_at_i),
    engagement: (hit.points ?? 0) + (hit.num_comments ?? 0),
    tags: [],
  }));
}

interface DevToArticle {
  title: string;
  description: string | null;
  url: string;
  tag_list: string[];
  positive_reactions_count: number;
  comments_count: number;
  published_at: string;
}

async function fetchDevTo(source: Source): Promise<RawItem[]> {
  const articles = (await (await get(source.address, { accept: "application/vnd.forem.api-v1+json" })).json()) as DevToArticle[];
  return articles.slice(0, MAX_ITEMS_PER_SOURCE).map((a) => ({
    url: a.url,
    title: a.title,
    summary: summary(a.description),
    publishedAt: toDate(a.published_at),
    engagement: a.positive_reactions_count + a.comments_count,
    tags: a.tag_list,
  }));
}

let redditToken: { value: string; expiresAt: number } | null = null;

async function redditAccessToken(): Promise<string> {
  const credentials = env.reddit;
  if (!credentials) throw new SkippedSource("REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET não configurados");
  if (redditToken && redditToken.expiresAt > Date.now() + 60_000) return redditToken.value;

  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "user-agent": USER_AGENT, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Reddit OAuth HTTP ${response.status}`);
  const data = (await response.json()) as { access_token: string; expires_in: number };
  redditToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return redditToken.value;
}

interface RedditPost {
  data: {
    title: string;
    url: string;
    permalink: string;
    selftext: string;
    is_self: boolean;
    score: number;
    num_comments: number;
    created_utc: number;
    subreddit: string;
    link_flair_text: string | null;
    stickied: boolean;
    over_18: boolean;
  };
}

/** Usa só a API oficial (oauth.reddit.com). O endereço da fonte é o subreddit, ex.: "r/dotnet". */
async function fetchReddit(source: Source): Promise<RawItem[]> {
  const token = await redditAccessToken();
  const subreddit = source.address.replace(/^\/?r\//, "");
  const response = await get(`https://oauth.reddit.com/r/${subreddit}/top?t=day&limit=${MAX_ITEMS_PER_SOURCE}`, {
    authorization: `Bearer ${token}`,
  });
  const data = (await response.json()) as { data: { children: RedditPost[] } };
  return data.data.children
    .map((c) => c.data)
    .filter((p) => !p.stickied && !p.over_18)
    .map((p) => ({
      url: p.is_self ? `https://www.reddit.com${p.permalink}` : p.url,
      title: p.title,
      summary: summary(p.selftext),
      publishedAt: toDate(p.created_utc),
      engagement: p.score + p.num_comments,
      tags: [p.subreddit, p.link_flair_text].filter((t): t is string => Boolean(t)),
    }));
}

export function fetchSource(source: Source): Promise<RawItem[]> {
  switch (source.type) {
    case "rss":
      return fetchRss(source);
    case "hackernews":
      return fetchHackerNews(source);
    case "devto":
      return fetchDevTo(source);
    case "reddit":
      return fetchReddit(source);
  }
}
