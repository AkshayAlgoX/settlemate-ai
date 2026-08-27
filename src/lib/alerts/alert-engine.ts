/*
 * SettleMate AI — Smart Alerting Engine & Signed Webhook Dispatcher
 *
 * Deterministically generates high-risk alerts from reconciliation exceptions
 * and dispatches cryptographically signed HMAC-SHA256 webhooks to mock
 * Slack, PagerDuty, and email integration endpoints.
 */

import { dispatchWebhook, generateWebhookSignature } from "@/lib/api/v1-store";
import {
  type SmartAlert,
  type AlertChannel,
  type AlertSeverity,
  DEFAULT_ALERT_CHANNELS,
  generateDeterministicAlert,
} from "./alert-types";

export {
  type SmartAlert,
  type AlertChannel,
  type AlertSeverity,
  DEFAULT_ALERT_CHANNELS,
  generateDeterministicAlert,
};

/**
 * Dispatches a signed smart alert via HMAC-SHA256 webhook.
 */
export async function dispatchSmartAlert(
  alert: SmartAlert,
  overrideUrl?: string,
  secret: string = "whsec_settlemate_live_signing_key_001"
): Promise<SmartAlert> {
  const targetUrl = overrideUrl || alert.targetUrl;
  const eventName = `reconciliation.alert.${alert.severity.toLowerCase()}`;

  const payload = {
    alertId: alert.id,
    exceptionId: alert.exceptionId,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    amountPaise: alert.amountPaise,
    formattedAmount: alert.formattedAmount,
    ruleTriggered: alert.ruleTriggered,
    recommendedPlaybook: alert.recommendedPlaybook,
    metadata: alert.metadata,
    timestamp: alert.timestamp,
  };

  const signatureRaw = generateWebhookSignature(payload, secret);
  const signatureHeader = `t=${Math.floor(Date.now() / 1000)},v1=${signatureRaw}`;

  const deliveryLog = await dispatchWebhook(
    targetUrl,
    eventName,
    payload,
    secret,
    alert.id
  );

  return {
    ...alert,
    targetUrl,
    signature: signatureHeader,
    deliveryStatus: deliveryLog.status,
    statusCode: deliveryLog.statusCode,
  };
}
