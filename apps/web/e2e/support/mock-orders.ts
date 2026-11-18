// In-memory stand-in for the order endpoints (T-ORD-01), answering with payloads that satisfy the
// shared contracts. Services come from the catalogue mock with fixed prices; each order starts
// unpaid. The real behaviour (charges, invoice lines, eligibility, audit) is covered by
// apps/api/src/orders.api.spec.ts.
import {
  orderableServiceListSchema,
  placeOrdersRequestSchema,
  serviceOrderListSchema,
  type ServiceOrder,
  type ServiceRecord,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const PRICES: Record<string, string> = { CBC: '450.00', 'XRAY-CHEST': '800.00' };

const problem = (status: number, code: string) => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code },
});

export function createOrderStore(services: readonly ServiceRecord[]) {
  let next = 1200;
  /** Orders by visit; the mock keys a consultation's orders by its ID. */
  const orders = new Map<string, ServiceOrder[]>();

  const orderable = (direct: boolean, text: string) =>
    services
      .filter((service) => service.active && PRICES[service.code])
      .filter((service) => !direct || service.directlyOrderable)
      .filter((service) =>
        `${service.code} ${service.nameEn ?? ''}`.toLowerCase().includes(text.toLowerCase()),
      )
      .map((service) => ({
        serviceItemId: service.serviceItemId,
        code: service.code,
        category: service.category,
        nameBn: service.nameBn,
        nameEn: service.nameEn,
        directlyOrderable: service.directlyOrderable,
        reportHours: service.reportHours,
        unitPrice: PRICES[service.code],
        version: service.version,
      }));

  function place(visitId: string, source: ServiceOrder['source'], body: unknown) {
    const request = placeOrdersRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const list = orders.get(visitId) ?? [];
    for (const item of request.data.items) {
      const service = services.find((row) => row.serviceItemId === item.serviceItemId);
      if (!service) return problem(422, 'VALIDATION_FAILED');
      if (source === 'RECEPTION_DIRECT' && !service.directlyOrderable) {
        return problem(422, 'TEST_NOT_DIRECTLY_ORDERABLE');
      }
      list.push({
        orderId: ID(next++),
        visitId,
        source,
        service: {
          serviceItemId: service.serviceItemId,
          code: service.code,
          category: service.category,
          nameBn: service.nameBn,
          nameEn: service.nameEn,
        },
        reportHours: service.reportHours,
        priority: item.priority,
        clinicalNote: item.clinicalNote,
        status: 'REQUESTED',
        payment: {
          amount: PRICES[service.code] ?? '0.00',
          paid: '0.00',
          eligibility: 'NOT_ELIGIBLE',
          lineStatus: 'ACTIVE',
        },
        requestedAt: new Date().toISOString(),
        requestedBy: 'Karim Uddin',
        cancelReason: null,
        version: 1,
      });
    }
    orders.set(visitId, list);
    return { status: 201, body: serviceOrderListSchema.parse({ orders: list }) };
  }

  function answer(method: string, path: string, body: unknown, params: URLSearchParams) {
    const picker = /^\/orders\/(services|direct-services)$/.exec(path);
    if (picker && method === 'GET') {
      const services = orderable(picker[1] === 'direct-services', params.get('q') ?? '');
      return { status: 200, body: orderableServiceListSchema.parse({ services }) };
    }
    const consultation = /^\/consultations\/([^/]+)\/orders$/.exec(path);
    if (!consultation?.[1]) return null;
    if (method === 'POST') return place(consultation[1], 'CONSULTATION', body);
    return {
      status: 200,
      body: serviceOrderListSchema.parse({ orders: orders.get(consultation[1]) ?? [] }),
    };
  }

  return { answer, orders, place };
}
