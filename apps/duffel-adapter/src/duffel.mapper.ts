import {
  FlightCriteria,
  FlightSlice,
  Offer,
  SupplierBookRequest,
  Travellers,
} from '@app/contracts';
import { offerId, toAmount } from '@app/common';
import {
  DuffelErrorBody,
  DuffelOffer,
  DuffelOfferRequestResponse,
  DuffelSlice,
} from './duffel.types';

/** Under this age Duffel treats the passenger as an infant travelling on an adult's lap. */
const INFANT_MAX_AGE = 1;

export function toOfferRequestBody(criteria: FlightCriteria, travellers: Travellers) {
  const slices = [
    {
      origin: criteria.origin,
      destination: criteria.destination,
      departure_date: criteria.departureDate,
    },
  ];
  if (criteria.returnDate) {
    slices.push({
      origin: criteria.destination,
      destination: criteria.origin,
      departure_date: criteria.returnDate,
    });
  }
  return {
    data: {
      slices,
      passengers: [
        ...Array.from({ length: travellers.adults }, () => ({ type: 'adult' as const })),
        ...travellers.childAges.map((age) => ({ age })),
      ],
      cabin_class: criteria.cabinClass ?? 'economy',
      max_connections: criteria.maxConnections ?? 1,
    },
  };
}

export function mapOffers(response: DuffelOfferRequestResponse, limit: number): Offer[] {
  return response.data.offers
    .map(mapOffer)
    .sort((a, b) => Number(a.price.amount) - Number(b.price.amount))
    .slice(0, limit);
}

export function mapOffer(offer: DuffelOffer): Offer {
  const slices = offer.slices.map(mapSlice);
  const refund = offer.conditions?.refund_before_departure ?? null;
  const first = slices[0];
  const stops = Math.max(...slices.map((s) => s.segments.length - 1), 0);

  return {
    id: offerId('dfl', offer.id),
    supplier: 'DUFFEL',
    productType: 'FLIGHT',
    title: `${offer.owner.name}: ${first.origin} to ${first.destination}${slices.length > 1 ? ' (return)' : ''}`,
    price: { amount: toAmount(offer.total_amount), currency: offer.total_currency },
    expiresAt: offer.expires_at,
    refundable: refund ? refund.allowed : null,
    cancellationPolicies:
      refund?.allowed && refund.penalty_amount && refund.penalty_currency
        ? [
            {
              // The refund penalty applies from the moment of booking.
              from: new Date(0).toISOString(),
              penalty: {
                amount: toAmount(refund.penalty_amount),
                currency: refund.penalty_currency,
              },
            },
          ]
        : [],
    details: {
      kind: 'FLIGHT',
      airline: { name: offer.owner.name, iataCode: offer.owner.iata_code },
      slices,
      stops,
    },
    supplierContext: {
      offerId: offer.id,
      totalAmount: offer.total_amount,
      totalCurrency: offer.total_currency,
      passengers: offer.passengers.map((p) => ({ id: p.id, type: p.type, age: p.age })),
    },
  };
}

function mapSlice(slice: DuffelSlice): FlightSlice {
  return {
    origin: slice.origin.iata_code,
    destination: slice.destination.iata_code,
    duration: slice.duration,
    segments: slice.segments.map((s) => ({
      origin: s.origin.iata_code,
      destination: s.destination.iata_code,
      departingAt: s.departing_at,
      arrivingAt: s.arriving_at,
      marketingCarrier: s.marketing_carrier.name,
      // Regulators require the operating carrier to be shown to the customer.
      operatingCarrier: s.operating_carrier.name,
      flightNumber: `${s.marketing_carrier.iata_code ?? ''}${s.marketing_carrier_flight_number}`,
      duration: s.duration,
      cabinClass: s.passengers?.[0]?.cabin_class ?? null,
    })),
  };
}

interface ContextPassenger {
  id: string;
  type: string | null;
  age: number | null;
}

export class OrderMappingError extends Error {}

/**
 * Builds a Duffel "instant" order paid from the account balance. Passenger ids
 * come from the offer; travellers are matched to them by adult/child type in
 * the order they were supplied.
 */
export function toOrderBody(req: SupplierBookRequest) {
  const ctx = req.offer.supplierContext as {
    offerId: string;
    totalAmount: string;
    totalCurrency: string;
    passengers: ContextPassenger[];
  };
  const isAdult = (p: ContextPassenger) => p.type === 'adult';
  const adultSlots = ctx.passengers.filter(isAdult);
  const childSlots = ctx.passengers.filter((p) => !isAdult(p));
  const adults = req.travellers.filter((t) => t.type === 'ADULT');
  const children = req.travellers.filter((t) => t.type === 'CHILD');

  if (adults.length !== adultSlots.length || children.length !== childSlots.length) {
    throw new OrderMappingError(
      `Offer was priced for ${adultSlots.length} adult(s) and ${childSlots.length} child(ren); ` +
        `got ${adults.length} adult(s) and ${children.length} child(ren)`,
    );
  }

  const base = (t: (typeof req.travellers)[number], id: string) => ({
    id,
    title: t.title,
    given_name: t.givenName,
    family_name: t.familyName,
    born_on: t.dateOfBirth,
    gender: t.gender,
    email: req.contact.email,
    phone_number: req.contact.phone,
  });

  const adultPassengers: (ReturnType<typeof base> & { infant_passenger_id?: string })[] =
    adults.map((t, i) => base(t, adultSlots[i].id));
  const childPassengers = children.map((t, i) => base(t, childSlots[i].id));

  // Each lap infant must be attached to a distinct adult.
  const infants = childSlots.filter(
    (p) => p.type === 'infant_without_seat' || (p.age !== null && p.age <= INFANT_MAX_AGE),
  );
  if (infants.length > adultPassengers.length) {
    throw new OrderMappingError('Each infant needs a separate accompanying adult');
  }
  infants.forEach((infant, i) => {
    adultPassengers[i].infant_passenger_id = infant.id;
  });

  return {
    data: {
      type: 'instant',
      selected_offers: [ctx.offerId],
      passengers: [...adultPassengers, ...childPassengers],
      payments: [{ type: 'balance', amount: ctx.totalAmount, currency: ctx.totalCurrency }],
      metadata: { booking_id: req.bookingId },
    },
  };
}

export function describeDuffelError(status: number, body: unknown): string {
  const errors = (body as DuffelErrorBody | null)?.errors ?? [];
  if (!errors.length) return `HTTP ${status}`;
  return errors
    .map((e) => `${e.code ?? e.type ?? 'error'}: ${e.message ?? e.title ?? ''}`)
    .join('; ');
}
