import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { CabinClass, FlightCriteria } from '@app/contracts';

export const API_INFO = {
  title: 'Flight Booking Service',
  description:
    'Searches and books flights through the Duffel Flights API (test mode). ' +
    'Personal learning project; sandbox data only.',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IATA = /^[A-Z]{3}$/;

export class CriteriaDto implements FlightCriteria {
  @ApiProperty({ example: 'LHR', description: 'IATA airport or city code' })
  @Matches(IATA)
  origin: string;

  @ApiProperty({ example: 'BCN' })
  @Matches(IATA)
  destination: string;

  @ApiProperty({ example: '2027-03-12' })
  @Matches(ISO_DATE)
  departureDate: string;

  @ApiPropertyOptional({ example: '2027-03-19' })
  @IsOptional()
  @Matches(ISO_DATE)
  returnDate?: string;

  @ApiPropertyOptional({ enum: ['economy', 'premium_economy', 'business', 'first'] })
  @IsOptional()
  @IsIn(['economy', 'premium_economy', 'business', 'first'])
  cabinClass?: CabinClass;

  @ApiPropertyOptional({ example: 1, description: '0 = direct flights only' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  maxConnections?: number;
}

/** Flights need no booking fields beyond contact and travellers. */
export class ProductBookingFieldsDto {}
