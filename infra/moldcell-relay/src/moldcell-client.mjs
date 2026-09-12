export class MoldcellClient {
  constructor(configuration, fetchImplementation = fetch) {
    this.configuration = configuration;
    this.fetchImplementation = fetchImplementation;
  }

  async send(recipient, message) {
    const { baseUrl, providerId, customerId, guid, sender, template, timeoutMs } = this.configuration;
    if (!baseUrl || !providerId || !customerId || !guid || sender !== "NSD" || template !== "NSD_NOTIFICATION") {
      return providerFailure("CONFIGURATION_ERROR", null, null, 503);
    }

    const url = new URL(baseUrl);
    url.pathname = `/rest/${encodeURIComponent(providerId)}/${encodeURIComponent(customerId)}/sendSMS`;
    url.search = new URLSearchParams({
      guid,
      from: sender,
      template,
      to: recipient.slice(1),
      customText: message,
    }).toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImplementation(url, {
        method: "GET",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const text = (await response.text()).slice(0, 65_536);
      if (response.status === 429) return providerFailure("HTTP_429", null, null, 429);
      if (response.status >= 500) return providerFailure(`HTTP_${response.status}`, null, null, 503);
      if (!response.ok) return providerFailure(`HTTP_${response.status}`, null, null, 502);
      return mapProviderResponse(parseProviderResponse(text));
    } catch (error) {
      return error?.name === "AbortError"
        ? providerFailure("TIMEOUT", null, null, 504)
        : providerFailure("NETWORK_ERROR", null, null, 503);
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseProviderResponse(text) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return {
      code: safeText(scalar(value.resultCode), 40),
      message: safeText(scalar(value.resultMessage), 160),
      timestamp: safeText(scalar(value.resultDate), 80),
      requestId: safeText(scalar(value.providerRequestId ?? value.requestId), 120),
    };
  } catch {
    return null;
  }
}

function mapProviderResponse(receipt) {
  if (!receipt?.code) return providerFailure("INVALID_PROVIDER_RESPONSE", null, null, 502);
  const common = {
    accepted: receipt.code === "0",
    providerCode: receipt.code,
    providerMessage: receipt.message,
    providerTimestamp: receipt.timestamp,
    providerRequestId: receipt.requestId,
    httpStatus: 200,
  };
  if (receipt.code === "0") return { ...common, status: "PROVIDER_ACCEPTED" };
  if (receipt.code === "20001") return { ...common, status: "INVALID_MSISDN" };
  if (receipt.code === "20012") return { ...common, status: "OUTNET_NOT_ALLOWED" };
  return { ...common, status: "UNKNOWN_PROVIDER_FAILURE" };
}

function providerFailure(providerCode, providerMessage, providerTimestamp, httpStatus) {
  return {
    accepted: false,
    status: httpStatus === 502 && providerCode === "INVALID_PROVIDER_RESPONSE"
      ? "UNKNOWN_PROVIDER_FAILURE" : "RETRYABLE_FAILURE",
    providerCode,
    providerMessage,
    providerTimestamp,
    providerRequestId: null,
    httpStatus,
  };
}

function scalar(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function safeText(value, maximumLength) {
  return value ? value.replace(/[\r\n\t]+/g, " ").slice(0, maximumLength) : null;
}
