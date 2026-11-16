/**
 * Product-specific part of the model: flights sold through Duffel.
 * Everything else in libs/contracts is supplier-agnostic.
 */

export const SUPPLIER = 'DUFFEL' as const;
export type Supplier = typeof SUPPLIER;

export const PRODUCT_TYPE = 'FLIGHT' as const;
export type ProductType = typeof PRODUCT_TYPE;

export const SUPPLIER_QUEUE = 'supplier.duffel';

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export interface FlightCriteria {
  /** IATA airport or city code. */
  origin: string;
  destination: string;
  /** ISO date, YYYY-MM-DD. */
  departureDate: string;
  returnDate?: string;
  cabinClass?: CabinClass;
  /** 0 = direct only. */
  maxConnections?: number;
}

export interface FlightSegment {
  origin: string;
  destination: string;
  departingAt: string;
  arrivingAt: string;
  marketingCarrier: string;
  operatingCarrier: string;
  flightNumber: string;
  /** ISO 8601 duration, e.g. PT2H5M. */
  duration: string | null;
  cabinClass: string | null;
}

export interface FlightSlice {
  origin: string;
  destination: string;
  duration: string | null;
  segments: FlightSegment[];
}

export interface FlightDetails {
  kind: 'FLIGHT';
  airline: { name: string; iataCode: string | null };
  slices: FlightSlice[];
  stops: number;
}

export type SearchCriteria = FlightCriteria;
export type OfferDetails = FlightDetails;

/** Flights need nothing beyond the contact and travellers. */
export type ProductBookingFields = unknown;
