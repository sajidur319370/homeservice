// SSLCommerz with Node's built-in fetch: no SDK needed.
import { env } from "../config/env.ts";
import { HttpError } from "../lib/http.ts";
import type { BookingForPayment } from "./payment.ts";

const BASE = "https://sandbox.sslcommerz.com"; // live: https://securepay.sslcommerz.com

// Ask SSLCommerz to create a payment page. Returns the URL to send the browser to.
export async function createSession(booking: BookingForPayment, tranId: string): Promise<string> {
  const body = new URLSearchParams({
    store_id: env.SSLC_STORE_ID ?? "",
    store_passwd: env.SSLC_STORE_PASSWORD ?? "",
    total_amount: String(booking.price),
    currency: "BDT",
    tran_id: tranId,
    success_url: `${env.APP_URL}/api/payments/success`,
    fail_url: `${env.APP_URL}/api/payments/fail`,
    cancel_url: `${env.APP_URL}/api/payments/cancel`,
    ipn_url: `${env.APP_URL}/api/payments/ipn`,
    shipping_method: "NO",
    product_name: booking.serviceTitle,
    product_category: "Service",
    product_profile: "non-physical-goods",
    cus_name: booking.customerName,
    cus_email: booking.customerEmail,
    cus_add1: booking.address,
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
    cus_phone: booking.customerPhone ?? "01700000000",
  });

  const res = await fetch(`${BASE}/gwprocess/v4/api.php`, { method: "POST", body });
  const data = (await res.json()) as { status?: string; failedreason?: string; GatewayPageURL?: string };
  if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
    throw new HttpError(502, data.failedreason ?? "Payment gateway error");
  }
  return data.GatewayPageURL;
}

export type ValidatedPayment = { tranId: string; amount: number; currency: string };

// Server-to-server check. NEVER trust what the browser posts without this.
export async function validatePayment(valId: string): Promise<ValidatedPayment> {
  const url = new URL(`${BASE}/validator/api/validationserverAPI.php`);
  url.search = new URLSearchParams({
    val_id: valId,
    store_id: env.SSLC_STORE_ID ?? "",
    store_passwd: env.SSLC_STORE_PASSWORD ?? "",
    format: "json",
  }).toString();

  const data = (await fetch(url).then((r) => r.json())) as {
    status?: string;
    tran_id?: string;
    amount?: string;
    currency?: string;
  };
  if (!data.status || !["VALID", "VALIDATED"].includes(data.status) || !data.tran_id) {
    throw new HttpError(400, "Payment is not valid");
  }
  return { tranId: data.tran_id, amount: Number(data.amount), currency: data.currency ?? "" };
}
