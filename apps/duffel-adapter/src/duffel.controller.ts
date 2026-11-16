import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  RPC,
  SupplierBookRequest,
  SupplierBookResult,
  SupplierSearchRequest,
  SupplierSearchResult,
} from '@app/contracts';
import { DuffelClient } from './duffel.client';

@Controller()
export class DuffelController {
  constructor(private readonly duffel: DuffelClient) {}

  @MessagePattern(RPC.SUPPLIER_SEARCH)
  search(@Payload() req: SupplierSearchRequest): Promise<SupplierSearchResult> {
    return this.duffel.search(req.criteria, req.travellers);
  }

  @MessagePattern(RPC.SUPPLIER_BOOK)
  book(@Payload() req: SupplierBookRequest): Promise<SupplierBookResult> {
    return this.duffel.book(req);
  }
}
