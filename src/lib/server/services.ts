import "server-only";
import { audit, customer, DomainError, id, store } from "./store";

export function ownMoney(actorId: string) {
  customer(actorId);
  const accounts = store().accounts.filter((a) => a.ownerId === actorId);
  const accountIds = new Set(accounts.map((a) => a.id));
  return {
    accounts: accounts.map((a) => ({ ...a, transactions: store().transactions.filter((t) => t.accountId === a.id).map(({ id, label, amount, date, category }) => ({ id, label, amount, date, category })) })),
    budgets: store().budgets.filter((b) => b.ownerId === actorId).map((b) => ({ category: b.category, limit: b.limit, spent: store().transactions.filter((t) => accountIds.has(t.accountId) && t.category === b.category && t.amount < 0).reduce((sum, t) => sum - t.amount, 0) })),
    goals: store().goals.filter((g) => g.ownerId === actorId).map(({ id, name, target, saved }) => ({ id, name, target, saved })),
  };
}

export function setBudget(actorId: string, category: string, limit: number) {
  customer(actorId);
  if (!/^[A-Za-z ]{2,30}$/.test(category) || !Number.isFinite(limit) || limit < 0 || limit > 100000)
    throw new DomainError("Enter a category and a valid demo budget between €0 and €100,000.");
  const existing = store().budgets.find((b) => b.ownerId === actorId && b.category.toLowerCase() === category.toLowerCase());
  if (existing) existing.limit = limit;
  else store().budgets.push({ ownerId: actorId, category, limit });
  audit(actorId, "budget.save", category);
}

export function addGoal(actorId: string, name: string, target: number) {
  customer(actorId);
  if (name.trim().length < 2 || name.length > 40 || !Number.isFinite(target) || target <= 0 || target > 1000000)
    throw new DomainError("Enter a goal name and a target between €1 and €1,000,000.");
  store().goals.push({ id: id("goal"), ownerId: actorId, name: name.trim(), target, saved: 0 });
  audit(actorId, "goal.create", "own goal");
}

export function bookAppointment(actorId: string, topic: string, date: string, channel: string) {
  customer(actorId);
  const topics = ["General question", "Home and family", "Budget conversation", "Care for a parent"];
  const channels = ["In branch", "Video call", "Phone call"];
  const when = new Date(date);
  if (!topics.includes(topic) || !channels.includes(channel) || !Number.isFinite(when.getTime()) || when.getTime() < Date.now() || when.getTime() > Date.now() + 180 * 86400000)
    throw new DomainError("Choose an available topic, channel, and future date within six months.");
  store().appointments.push({ id: id("appointment"), ownerId: actorId, topic, date: when.toISOString(), channel });
  audit(actorId, "appointment.book", "demo appointment");
}

export function setSetting(actorId: string, key: "largeText" | "quietMode", value: boolean) {
  customer(actorId);
  const settings = store().settings.find((s) => s.ownerId === actorId);
  if (!settings) throw new DomainError("Settings not found.", 404);
  settings[key] = value;
  audit(actorId, "setting.change", key);
}
