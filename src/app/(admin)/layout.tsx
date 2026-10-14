import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { MobileNav, Sidebar } from "@/components/admin/sidebar";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const session = await requireAdmin();
  const [[{ unread }], s] = await Promise.all([
    db.select({ unread: count() }).from(conversations).where(eq(conversations.unread, true)),
    getSettings(),
  ]);
  return (
    <div className="flex min-h-screen">
      <Sidebar user={session.user} unread={unread} appName={s.businessName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1">{children}</main>
        <MobileNav unread={unread} />
      </div>
    </div>
  );
}
