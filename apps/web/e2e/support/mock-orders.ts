// In-memory stand-in for the order endpoints (T-ORD-01, T-ORD-03, T-ORD-02), answering with payloads that satisfy the
// shared contracts. Services come from the catalogue mock with fixed prices; each order starts
// unpaid. The real behaviour (charges, invoice lines, eligibility, audit) is covered by
// apps/api/src/orders.api.spec.ts.
import {
  cancelOrderRequestSchema,
  createDiagnosticVisitRequestSchema,
  departmentWorklistSchema,
  diagnosticVisitSchema,
  orderableServiceListSchema,
  placeOrdersRequestSchema,
  serviceOrderListSchema,
  serviceOrderSchema,
  startOrderRequestSchema,
  type PatientRef,
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
  /** Reception's diagnostic visits by patient. */
  const byPatient = new Map<string, string[]>();

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
          due: PRICES[service.code] ?? '0.00',
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

  /** UC-VIS-02: one diagnostic visit per request, keyed by the patient for the reception list. */
  function diagnostic(body: unknown) {
    const request = createDiagnosticVisitRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const visitId = ID(next++);
    const placed = place(visitId, 'RECEPTION_DIRECT', { items: request.data.items });
    if (placed.status !== 201) return placed;
    const list = orders.get(visitId) ?? [];
    byPatient.set(request.data.patientId, [
      ...(byPatient.get(request.data.patientId) ?? []),
      visitId,
    ]);
    return {
      status: 201,
      body: diagnosticVisitSchema.parse({
        visitId,
        patientId: request.data.patientId,
        arrivedAt: new Date().toISOString(),
        orders: list,
      }),
    };
  }

  /** UC-ORD-02 interim rule: only REQUESTED and unpaid. */
  function cancel(orderId: string, body: unknown) {
    const request = cancelOrderRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    for (const list of orders.values()) {
      const index = list.findIndex((order) => order.orderId === orderId);
      const order = list[index];
      if (!order) continue;
      if (request.data.expectedVersion !== order.version) return problem(409, 'STALE_RECORD');
      if (order.payment.eligibility === 'ELIGIBLE') return problem(409, 'FEATURE_NOT_AVAILABLE');
      const cancelled = serviceOrderSchema.parse({
        ...order,
        status: 'CANCELLED',
        cancelReason: request.data.reason,
        payment: { ...order.payment, due: '0.00', lineStatus: 'CANCELLED' },
        version: order.version + 1,
      });
      list[index] = cancelled;
      return { status: 200, body: cancelled };
    }
    return problem(404, 'NOT_FOUND');
  }

  /** T-ORD-02: the patient each visit's orders belong to, for the department worklist. */
  const patientOfVisit = new Map<string, PatientRef>();
  const findOrder = (orderId: string) => {
    for (const list of orders.values()) {
      const index = list.findIndex((order) => order.orderId === orderId);
      if (index >= 0) return { list, index };
    }
    return null;
  };

  /** The cashier takes the whole line (tests call this; the cashier mock is separate). */
  function pay(orderId: string) {
    const found = findOrder(orderId);
    const order = found?.list[found.index];
    if (!found || !order) throw new Error(`No order ${orderId}`);
    found.list[found.index] = {
      ...order,
      payment: {
        ...order.payment,
        paid: order.payment.amount,
        due: '0.00',
        eligibility: 'ELIGIBLE',
      },
    };
  }

  /** FR-BIL-003: only a REQUESTED order whose line is fully paid starts. */
  function start(orderId: string, body: unknown) {
    const request = startOrderRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const found = findOrder(orderId);
    const order = found?.list[found.index];
    if (!found || !order) return problem(404, 'NOT_FOUND');
    if (request.data.expectedVersion !== order.version) return problem(409, 'STALE_RECORD');
    if (order.status !== 'REQUESTED') return problem(409, 'INVALID_TRANSITION');
    if (order.payment.eligibility !== 'ELIGIBLE') {
      const refused = problem(409, 'PAYMENT_NOT_ELIGIBLE');
      return {
        ...refused,
        body: {
          ...refused.body,
          lines: [{ lineId: ID(9000), invoiceNumber: 'S-000042', due: order.payment.due }],
        },
      };
    }
    const started = serviceOrderSchema.parse({
      ...order,
      status: 'IN_PROGRESS',
      version: order.version + 1,
    });
    found.list[found.index] = started;
    return { status: 200, body: started };
  }

  function worklist(category: string | null) {
    const rows = [...orders.entries()].flatMap(([visitId, list]) => {
      const patient = patientOfVisit.get(visitId);
      if (!patient) return [];
      return list
        .filter((order) => order.status === 'REQUESTED' || order.status === 'IN_PROGRESS')
        .filter((order) => !category || order.service.category === category)
        .map((order) => ({ ...order, patient }));
    });
    return { status: 200, body: departmentWorklistSchema.parse({ orders: rows }) };
  }

  function answer(method: string, path: string, body: unknown, params: URLSearchParams) {
    if (path === '/orders/worklist' && method === 'GET') return worklist(params.get('category'));
    const startPath = /^\/orders\/([^/]+)\/start$/.exec(path);
    if (startPath?.[1] && method === 'POST') return start(startPath[1], body);
    if (path === '/visits/diagnostic' && method === 'POST') return diagnostic(body);
    if (path === '/visits/orders' && method === 'GET') {
      const visits = byPatient.get(params.get('patientId') ?? '') ?? [];
      const list = visits.flatMap((visitId) => orders.get(visitId) ?? []);
      return { status: 200, body: serviceOrderListSchema.parse({ orders: list }) };
    }
    const cancelPath = /^\/orders\/([^/]+)\/cancel$/.exec(path);
    if (cancelPath?.[1] && method === 'POST') return cancel(cancelPath[1], body);
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

  /** T-ORD-02: places orders for a patient's visit, as the doctor would. */
  function seedForPatient(visitId: string, patient: PatientRef, body: unknown) {
    patientOfVisit.set(visitId, patient);
    return place(visitId, 'CONSULTATION', body);
  }

  return { answer, orders, place, pay, seedForPatient };
}
