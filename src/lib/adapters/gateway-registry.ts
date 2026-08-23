/*
 * SettleMate AI — Gateway Registry & Provider Dispatch
 */

import { BankStatementCsvAdapter } from "./bank-statement-csv";
import { RazorpayGatewayAdapter } from "./gateway-razorpay";
import { GenericGatewayAdapter } from "./generic-gateway";
import type { ProviderAdapter, ProviderType } from "./types";

export class GatewayRegistry {
  private static instance: GatewayRegistry;
  private adapters = new Map<ProviderType, ProviderAdapter>();

  private constructor() {
    this.register(new RazorpayGatewayAdapter());
    this.register(new BankStatementCsvAdapter());
    this.register(new GenericGatewayAdapter());
  }

  static getInstance(): GatewayRegistry {
    if (!GatewayRegistry.instance) {
      GatewayRegistry.instance = new GatewayRegistry();
    }
    return GatewayRegistry.instance;
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.providerType, adapter);
  }

  get(type: ProviderType): ProviderAdapter {
    const a = this.adapters.get(type);
    if (!a) throw new Error(`Unsupported provider adapter: ${type}`);
    return a;
  }
}
