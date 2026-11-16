import { Injectable, Logger } from '@nestjs/common';
import {
  FlightCriteria,
  SupplierBookRequest,
  SupplierBookResult,
  SupplierSearchResult,
  Travellers,
} from '@app/contracts';
import { NOT_CONFIGURED, supplierFetch, toAmount } from '@app/common';
import {
  describeDuffelError,
  mapOffers,
  OrderMappingError,
  toOfferRequestBody,
  toOrderBody,
} from './duffel.mapper';
import { DuffelOfferRequestResponse, DuffelOrderResponse } from './duffel.types';

@Injectable()
export class DuffelClient {
  private readonly logger = new Logger(DuffelClient.name);
  private readonly baseUrl = process.env.DUFFEL_BASE_URL ?? 'https://api.duffel.com';
  private readonly token = process.env.DUFFEL_ACCESS_TOKEN ?? '';
  private readonly searchTimeoutMs = Number(process.env.SUPPLIER_SEARCH_TIMEOUT_MS ?? 20_000);
  // Duffel asks clients to allow at least 130s for order creation.
  private readonly bookTimeoutMs = Number(process.env.SUPPLIER_BOOK_TIMEOUT_MS ?? 130_000);
  private readonly maxOffers = Number(process.env.MAX_OFFERS_PER_SUPPLIER ?? 20);

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Duffel-Version': 'v2',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async search(criteria: FlightCriteria, travellers: Travellers): Promise<SupplierSearchResult> {
    if (!this.token) return { ok: false, error: NOT_CONFIGURED('DUFFEL_ACCESS_TOKEN') };

    // Ask Duffel to stop waiting on airlines shortly before our own timeout.
    const supplierTimeout = Math.max(2_000, this.searchTimeoutMs - 3_000);
    const res = await supplierFetch<DuffelOfferRequestResponse>(
      {
        method: 'POST',
        url: `${this.baseUrl}/air/offer_requests?return_offers=true&supplier_timeout=${supplierTimeout}`,
        headers: this.headers(),
        body: toOfferRequestBody(criteria, travellers),
        timeoutMs: this.searchTimeoutMs,
      },
      describeDuffelError,
    );
    if (!res.ok) return res;

    const offers = mapOffers(res.data, this.maxOffers);
    this.logger.log(`offer request ${res.data.data.id}: ${res.data.data.offers.length} offers`);
    return { ok: true, offers };
  }

  async book(req: SupplierBookRequest): Promise<SupplierBookResult> {
    if (!this.token) return { ok: false, error: NOT_CONFIGURED('DUFFEL_ACCESS_TOKEN') };
    if (!this.token.startsWith('duffel_test_') && process.env.ALLOW_LIVE_BOOKINGS !== 'true') {
      return {
        ok: false,
        error: {
          code: 'LIVE_BOOKING_BLOCKED',
          message: 'Refusing to create an order with a non-test Duffel token',
          retryable: false,
        },
      };
    }

    let body: ReturnType<typeof toOrderBody>;
    try {
      body = toOrderBody(req);
    } catch (err) {
      if (!(err instanceof OrderMappingError)) throw err;
      return { ok: false, error: { code: 'VALIDATION', message: err.message, retryable: false } };
    }

    const res = await supplierFetch<DuffelOrderResponse>(
      {
        method: 'POST',
        url: `${this.baseUrl}/air/orders`,
        headers: this.headers(),
        body,
        timeoutMs: this.bookTimeoutMs,
      },
      describeDuffelError,
    );
    if (!res.ok) return res;

    const order = res.data.data;
    return {
      ok: true,
      booking: {
        supplierReference: order.booking_reference ?? order.id,
        status: 'CONFIRMED',
        total: { amount: toAmount(order.total_amount), currency: order.total_currency },
      },
    };
  }
}
