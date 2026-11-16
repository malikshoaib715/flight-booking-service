import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BookingTraveller, SupplierBookRequest } from '@app/contracts';
import {
  describeDuffelError,
  mapOffers,
  OrderMappingError,
  toOfferRequestBody,
  toOrderBody,
} from '../src/duffel.mapper';
import { DuffelOfferRequestResponse } from '../src/duffel.types';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/offer-request.json'), 'utf8'),
) as DuffelOfferRequestResponse;

const adult: BookingTraveller = {
  type: 'ADULT',
  title: 'ms',
  givenName: 'Amelia',
  familyName: 'Earhart',
  dateOfBirth: '1987-07-24',
  gender: 'f',
};
const child: BookingTraveller = {
  ...adult,
  type: 'CHILD',
  givenName: 'Tom',
  dateOfBirth: '2019-05-02',
};

describe('Duffel mapper', () => {
  describe('toOfferRequestBody', () => {
    it('builds a one-way request with adults by type and children by age', () => {
      const body = toOfferRequestBody(
        { origin: 'LHR', destination: 'BCN', departureDate: '2027-03-12' },
        { adults: 2, childAges: [7] },
      );
      expect(body.data.slices).toEqual([
        { origin: 'LHR', destination: 'BCN', departure_date: '2027-03-12' },
      ]);
      expect(body.data.passengers).toEqual([{ type: 'adult' }, { type: 'adult' }, { age: 7 }]);
      expect(body.data.cabin_class).toBe('economy');
      expect(body.data.max_connections).toBe(1);
    });

    it('adds the reversed slice for a return trip', () => {
      const body = toOfferRequestBody(
        {
          origin: 'LHR',
          destination: 'BCN',
          departureDate: '2027-03-12',
          returnDate: '2027-03-19',
        },
        { adults: 1, childAges: [] },
      );
      expect(body.data.slices[1]).toEqual({
        origin: 'BCN',
        destination: 'LHR',
        departure_date: '2027-03-19',
      });
    });
  });

  describe('mapOffers', () => {
    const offers = mapOffers(fixture, 20);

    it('returns offers cheapest first', () => {
      expect(offers.map((o) => o.price.amount)).toEqual(['268.14', '412.60']);
    });

    it('respects the offer limit', () => {
      expect(mapOffers(fixture, 1)).toHaveLength(1);
    });

    it('maps a direct flight onto the normalised offer', () => {
      const direct = offers[0];
      expect(direct).toMatchObject({
        supplier: 'DUFFEL',
        productType: 'FLIGHT',
        title: 'Duffel Airways: LHR to BCN',
        price: { amount: '268.14', currency: 'GBP' },
        expiresAt: '2026-11-16T18:32:11.482Z',
        refundable: false,
        cancellationPolicies: [],
      });
      expect(direct.id).toMatch(/^dfl_[a-f0-9]{24}$/);
      expect(direct.details).toMatchObject({ kind: 'FLIGHT', stops: 0 });
    });

    it('maps connections, operating carrier and refund penalty', () => {
      const connecting = offers[1];
      expect(connecting.refundable).toBe(true);
      expect(connecting.cancellationPolicies[0].penalty).toEqual({
        amount: '50.00',
        currency: 'GBP',
      });
      if (connecting.details.kind !== 'FLIGHT') throw new Error('expected a flight');
      expect(connecting.details.stops).toBe(1);
      const [first, second] = connecting.details.slices[0].segments;
      expect(first).toMatchObject({ origin: 'LHR', destination: 'MAD', flightNumber: 'ZZ1420' });
      expect(second).toMatchObject({
        marketingCarrier: 'Duffel Airways',
        operatingCarrier: 'Duffel Regional',
        cabinClass: 'economy',
        duration: 'PT1H15M',
      });
    });

    it('produces a stable id for the same supplier offer', () => {
      expect(mapOffers(fixture, 20)[0].id).toBe(offers[0].id);
    });

    it('keeps what booking needs in supplierContext', () => {
      expect(offers[0].supplierContext).toEqual({
        offerId: 'off_0000B2fVZkpGdKq1mCqJrJ',
        totalAmount: '268.14',
        totalCurrency: 'GBP',
        passengers: [
          { id: 'pas_0000B2fVZkKQx5qbA0cRnE', type: 'adult', age: null },
          { id: 'pas_0000B2fVZkKQx5qbA0cRnF', type: null, age: 7 },
        ],
      });
    });
  });

  describe('toOrderBody', () => {
    const request = (travellers: BookingTraveller[]): SupplierBookRequest => ({
      bookingId: 'b0a1c2d3-0000-4000-8000-000000000001',
      offer: mapOffers(fixture, 20)[0],
      contact: { email: 'amelia@example.com', phone: '+442080160508' },
      travellers,
    });

    it('builds an instant order paid from balance for the exact offer total', () => {
      const body = toOrderBody(request([adult, child]));
      expect(body.data.type).toBe('instant');
      expect(body.data.selected_offers).toEqual(['off_0000B2fVZkpGdKq1mCqJrJ']);
      expect(body.data.payments).toEqual([{ type: 'balance', amount: '268.14', currency: 'GBP' }]);
    });

    it('matches travellers to the passenger ids issued with the offer', () => {
      // Order of input must not matter: the child is listed first here.
      const body = toOrderBody(request([child, adult]));
      expect(body.data.passengers).toEqual([
        expect.objectContaining({
          id: 'pas_0000B2fVZkKQx5qbA0cRnE',
          given_name: 'Amelia',
          born_on: '1987-07-24',
          email: 'amelia@example.com',
          phone_number: '+442080160508',
        }),
        expect.objectContaining({ id: 'pas_0000B2fVZkKQx5qbA0cRnF', given_name: 'Tom' }),
      ]);
    });

    it('rejects a traveller mix that differs from what was priced', () => {
      expect(() => toOrderBody(request([adult, adult]))).toThrow(OrderMappingError);
    });

    it('attaches a lap infant to an adult', () => {
      const req = request([adult, child]);
      const ctx = req.offer.supplierContext as { passengers: { age: number | null }[] };
      ctx.passengers[1].age = 1;
      const [adultPassenger] = toOrderBody(req).data.passengers;
      expect(adultPassenger).toMatchObject({ infant_passenger_id: 'pas_0000B2fVZkKQx5qbA0cRnF' });
    });
  });

  it('describes Duffel error bodies', () => {
    expect(
      describeDuffelError(422, {
        errors: [{ code: 'offer_no_longer_available', message: 'The offer has expired' }],
      }),
    ).toBe('offer_no_longer_available: The offer has expired');
    expect(describeDuffelError(500, null)).toBe('HTTP 500');
  });
});
