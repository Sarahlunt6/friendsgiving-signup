// Friendsgiving sign-up API: stores every item as one field in a Redis hash.
// Works with Vercel's Upstash Redis integration (either env var naming).
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = "friendsgiving:items";

const CATS = ["Main", "Sides", "Bread", "Salads", "Desserts", "Drinks", "Supplies", "Other"];

// Starting list, used only the first time the database is empty.
const SEED = [
  { id: "rotisserie-chicken", name: "Rotisserie chicken", category: "Main", claimedBy: "Sarah & Ben", order: 0 },
  { id: "turkey", name: "Turkey", category: "Main", order: 1 },
  { id: "mashed-potatoes", name: "Mashed potatoes", category: "Sides", order: 1 },
  { id: "gravy", name: "Gravy", category: "Sides", order: 2 },
  { id: "stuffing", name: "Stuffing", category: "Sides", order: 3 },
  { id: "green-beans", name: "Green bean casserole", category: "Sides", order: 4 },
  { id: "sweet-potatoes", name: "Sweet potatoes", category: "Sides", order: 5 },
  { id: "cranberry", name: "Cranberry sauce", category: "Sides", order: 6 },
  { id: "mac-cheese", name: "Mac and cheese", category: "Sides", order: 7 },
  { id: "rolls", name: "Rolls and butter", category: "Bread", order: 1 },
  { id: "green-salad", name: "Green salad", category: "Salads", order: 1 },
  { id: "fruit-salad", name: "Fruit salad", category: "Salads", order: 2 },
  { id: "dessert-1", name: "Dessert 1", category: "Desserts", slot: true, order: 1 },
  { id: "dessert-2", name: "Dessert 2", category: "Desserts", slot: true, order: 2 },
  { id: "dessert-3", name: "Dessert 3", category: "Desserts", slot: true, order: 3 },
  { id: "drinks", name: "Drinks", category: "Drinks", slot: true, slotLabel: "Open drinks slot",
    slotHint: "Bring whatever drinks you like", slotAsk: "What drinks?", order: 1 },
  { id: "ice", name: "Ice", category: "Drinks", order: 2 },
  { id: "plates", name: "Plates, cups and napkins", category: "Supplies", claimedBy: "Sarah & Ben", order: 1 },
  { id: "utensils", name: "Forks, knives and serving spoons", category: "Supplies", claimedBy: "Sarah & Ben", order: 2 },
];

async function redis(...command) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || `Redis error ${r.status}`);
  return data.result;
}

async function getItem(id) {
  const raw = await redis("HGET", KEY, id);
  return raw ? JSON.parse(raw) : null;
}
const saveItem = (item) => redis("HSET", KEY, item.id, JSON.stringify(item));
const clean = (v, max) => String(v ?? "").trim().slice(0, max);

async function listItems() {
  let flat = await redis("HGETALL", KEY);
  if (!flat || flat.length === 0) {
    const args = SEED.flatMap((it) => [it.id, JSON.stringify(it)]);
    await redis("HSET", KEY, ...args);
    return SEED;
  }
  const items = [];
  for (let i = 0; i < flat.length; i += 2) items.push(JSON.parse(flat[i + 1]));
  return items;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) {
    return res.status(500).json({ error: "The database isn't connected yet. Add Upstash Redis in the Vercel project's Storage tab, then redeploy." });
  }
  try {
    if (req.method === "GET") return res.json({ items: await listItems() });
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { action } = body;

    if (action === "claim") {
      const item = await getItem(clean(body.id, 200));
      if (!item) return res.status(404).json({ error: "That item isn't on the list anymore." });
      if (item.claimedBy) return res.status(409).json({ error: `${item.claimedBy} already signed up for that one.` });
      const name = clean(body.name, 40);
      const dish = clean(body.dish, 60);
      if (!name || (item.slot && !dish)) return res.status(400).json({ error: "Please fill in every field." });
      item.claimedBy = name;
      if (item.slot) item.dish = dish;
      await saveItem(item);
    } else if (action === "unclaim") {
      const item = await getItem(clean(body.id, 200));
      if (item) { item.claimedBy = ""; item.dish = ""; await saveItem(item); }
    } else if (action === "add") {
      const name = clean(body.name, 80);
      const who = clean(body.who, 40);
      const category = CATS.includes(body.category) ? body.category : "Other";
      if (!name || !who) return res.status(400).json({ error: "Add the item and your name." });
      const id = "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await saveItem({ id, name, category, claimedBy: who, custom: true, order: 999 });
    } else if (action === "remove") {
      const item = await getItem(clean(body.id, 200));
      if (item && item.custom) await redis("HDEL", KEY, item.id);
    } else {
      return res.status(400).json({ error: "Unknown action" });
    }
    return res.json({ items: await listItems() });
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong saving that. Try again." });
  }
}
