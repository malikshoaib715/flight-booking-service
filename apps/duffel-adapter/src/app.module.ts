import { Module } from '@nestjs/common';
import { DuffelClient } from './duffel.client';
import { DuffelController } from './duffel.controller';

@Module({ controllers: [DuffelController], providers: [DuffelClient] })
export class AppModule {}
