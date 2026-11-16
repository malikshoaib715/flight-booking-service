/** Subset of the Duffel Flights API (version v2) wire format used by this adapter. */

export interface DuffelAirline {
  id?: string;
  name: string;
  iata_code: string | null;
}

export interface DuffelPlace {
  iata_code: string;
  name?: string;
}

export interface DuffelSegment {
  id: string;
  origin: DuffelPlace;
  destination: DuffelPlace;
  departing_at: string;
  arriving_at: string;
  duration: string | null;
  marketing_carrier: DuffelAirline;
  operating_carrier: DuffelAirline;
  marketing_carrier_flight_number: string;
  passengers?: { passenger_id: string; cabin_class: string | null }[];
}

export interface DuffelSlice {
  id: string;
  origin: DuffelPlace;
  destination: DuffelPlace;
  duration: string | null;
  segments: DuffelSegment[];
}

export interface DuffelCondition {
  allowed: boolean;
  penalty_amount: string | null;
  penalty_currency: string | null;
}

export interface DuffelOfferPassenger {
  id: string;
  type: string | null;
  age: number | null;
}

export interface DuffelOffer {
  id: string;
  total_amount: string;
  total_currency: string;
  expires_at: string | null;
  owner: DuffelAirline;
  slices: DuffelSlice[];
  passengers: DuffelOfferPassenger[];
  conditions?: {
    refund_before_departure?: DuffelCondition | null;
    change_before_departure?: DuffelCondition | null;
  } | null;
}

export interface DuffelOfferRequestResponse {
  data: {
    id: string;
    live_mode: boolean;
    offers: DuffelOffer[];
  };
}

export interface DuffelOrderResponse {
  data: {
    id: string;
    booking_reference: string;
    total_amount: string;
    total_currency: string;
  };
}

export interface DuffelErrorBody {
  errors?: { code?: string; title?: string; message?: string; type?: string }[];
}
