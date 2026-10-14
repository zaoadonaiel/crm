/**
 * Demo data for local development: npm run db:seed
 * Safe to run more than once (skips if clients already exist).
 */
import "dotenv/config";
import { db } from "../src/db";
import * as t from "../src/db/schema";

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY);

async function main() {
  const existing = await db.query.clients.findFirst();
  if (existing) {
    console.log("Clients already exist, skipping seed.");
    return;
  }

  const [hosting, seo, care] = await db
    .insert(t.services)
    .values([
      { name: "Web Hosting", description: "Managed hosting, SSL, daily backups", price: 4900, interval: "month" },
      { name: "SEO Retainer", description: "Monthly on-page & technical SEO", price: 60000, interval: "month" },
      { name: "Website Care Plan", description: "Updates, security and small edits", price: 150000, interval: "year" },
    ])
    .returning();

  const people = [
    { name: "Ahmad Malik", email: "ahmad@malikdesign.co", company: "Malik Design Co", status: "active" as const, tags: ["hosting"] },
    { name: "Rachel Sardido", email: "rachel@brightpath.io", company: "BrightPath", status: "active" as const, tags: ["seo", "vip"] },
    { name: "Derek Lee", email: "derek@leeventures.com", company: "Lee Ventures", status: "prospect" as const, tags: ["agency"] },
    { name: "Kelly Denmeade", email: "kelly@denmeade.com", company: "Denmeade Coaching", status: "prospect" as const, tags: [] },
    { name: "Zach Sherrod", email: "zach@northbeam.dev", company: "Northbeam", status: "lead" as const, tags: ["saas"] },
    { name: "Fiona Reynolds", email: "fiona@reynoldslaw.com", company: "Reynolds Law", status: "past" as const, tags: [] },
  ];
  const clients = await db
    .insert(t.clients)
    .values(people.map((p, i) => ({ ...p, createdAt: ago(40 - i * 6), lastContactedAt: ago(10 - i) })))
    .returning();
  const [ahmad, rachel, derek, kelly, zach] = clients;

  await db.insert(t.clientServices).values([
    { clientId: ahmad!.id, serviceId: hosting!.id, name: "Web Hosting", price: 4900, interval: "month", renewalDate: new Date(Date.now() + 12 * DAY), details: { Domain: "malikdesign.co", Plan: "Business", Server: "US-East" } },
    { clientId: rachel!.id, serviceId: seo!.id, name: "SEO Retainer", price: 60000, interval: "month", renewalDate: new Date(Date.now() + 5 * DAY), details: { Keywords: "42 tracked" } },
    { clientId: rachel!.id, serviceId: care!.id, name: "Website Care Plan", price: 150000, interval: "year", renewalDate: new Date(Date.now() + 90 * DAY), details: {} },
  ]);

  await db.insert(t.proposals).values([
    { clientId: derek!.id, title: "Website redesign + hosting", amount: 850000, status: "sent", sentAt: ago(4), body: "## Scope\n- New 8-page marketing site\n- Hosting & care plan\n\n## Timeline\n6 weeks" },
    { clientId: kelly!.id, title: "Coaching site refresh", amount: 320000, status: "viewed", sentAt: ago(9), viewedAt: ago(8), body: "Refresh of the existing site with booking integration." },
  ]);

  const convo = async (clientId: string, subject: string, msgs: { dir: "in" | "out"; text: string; d: number }[]) => {
    const last = msgs[msgs.length - 1]!;
    const [c] = await db
      .insert(t.conversations)
      .values({ clientId, subject, lastMessageAt: ago(last.d), lastMessagePreview: last.text.slice(0, 140), lastMessageDirection: last.dir, unread: last.dir === "in" })
      .returning();
    await db.insert(t.messages).values(
      msgs.map((m) => ({ conversationId: c!.id, direction: m.dir, channel: "email" as const, subject, bodyText: m.text, createdAt: ago(m.d) })),
    );
  };
  await convo(zach!.id, "New tool: automated client reports", [
    { dir: "out", text: "Hey Zach, I just built a tool that sends your clients automated monthly reports. Want early access?", d: 3 },
    { dir: "in", text: "Hey! Northbeam just shipped something similar internally, but I'd love to see yours. Do you have time Thursday?", d: 2 },
  ]);
  await convo(derek!.id, "Website redesign proposal", [
    { dir: "out", text: "Hi Derek, here's the proposal we discussed. Let me know if you have any questions!", d: 4 },
  ]);
  await convo(ahmad!.id, "Hosting renewal", [
    { dir: "out", text: "Hi Ahmad, your hosting renews on the 12th. Anything you'd like to change?", d: 6 },
    { dir: "in", text: "All good, keep it as is. Thanks!", d: 5 },
    { dir: "out", text: "Perfect, you're all set.", d: 5 },
  ]);

  await db.insert(t.activities).values([
    { clientId: derek!.id, type: "proposal.sent", summary: "Proposal “Website redesign + hosting” sent to Derek Lee", createdAt: ago(4) },
    { clientId: kelly!.id, type: "proposal.viewed", summary: "Kelly Denmeade viewed “Coaching site refresh”", createdAt: ago(8) },
    { clientId: zach!.id, type: "message.received", summary: "Zach Sherrod replied to “New tool: automated client reports”", createdAt: ago(2) },
  ]);

  console.log(`Seeded ${clients.length} clients, 3 services, 2 proposals, 3 conversations.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
