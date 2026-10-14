import { and, asc, count, isNotNull, ne } from "drizzle-orm";
import { Package } from "lucide-react";
import { db } from "@/db";
import { clientServices, services } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { ServicesManager, type ServiceRow } from "./services-manager";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  await requireAdmin();
  const [rows, usage] = await Promise.all([
    db.query.services.findMany({ orderBy: [asc(services.name)] }),
    db
      .select({ serviceId: clientServices.serviceId, n: count() })
      .from(clientServices)
      .where(and(ne(clientServices.status, "cancelled"), isNotNull(clientServices.serviceId)))
      .groupBy(clientServices.serviceId),
  ]);
  const usageMap = new Map(usage.map((u) => [u.serviceId, u.n]));
  const data: ServiceRow[] = rows.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    price: s.price,
    currency: s.currency,
    interval: s.interval,
    active: s.active,
    clients: usageMap.get(s.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Services"
        description="Your catalog — assign these to clients and bill them in a click."
        icon={<Package className="h-5 w-5" />}
      />
      <div className="p-4 sm:p-6">
        <ServicesManager rows={data} />
      </div>
    </div>
  );
}
