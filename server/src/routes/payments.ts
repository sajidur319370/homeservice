import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.ts";
import { param } from "../lib/http.ts";
import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";
import { confirmPayment, initPayment, markFailed, type PaymentResult } from "../services/payment.ts";
import { validatePayment } from "../services/sslcommerz.ts";

const router = Router();

// CUSTOMER: start paying for a booking
router.post("/init/:bookingId", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
  res.json(await initPayment(param(req, "bookingId"), currentUser(req).id));
});

// SSLCommerz posts form fields. We only read the ones we need, as strings.
const callbackBody = z.object({ val_id: z.string().min(1).optional(), tran_id: z.string().min(1).optional() });

// Shared by the success redirect AND the IPN: validate with SSLCommerz, then confirm.
async function validateAndConfirm(valId: string): Promise<PaymentResult> {
  const v = await validatePayment(valId);
  return confirmPayment({ ...v, valId });
}

// SSLCommerz sends the BROWSER here (form POST) after paying.
router.post("/success", async (req, res) => {
  const { val_id } = callbackBody.parse(req.body);
  let result: PaymentResult | "failed" = "failed";
  try {
    if (val_id) result = await validateAndConfirm(val_id);
  } catch (err) {
    console.error("Payment success handler:", err instanceof Error ? err.message : err);
  }
  res.redirect(303, `${env.APP_URL}/payment/${result}`);
});

router.post("/fail", async (req, res) => {
  const { tran_id } = callbackBody.parse(req.body);
  if (tran_id) await markFailed(tran_id);
  res.redirect(303, `${env.APP_URL}/payment/failed`);
});

router.post("/cancel", async (req, res) => {
  const { tran_id } = callbackBody.parse(req.body);
  if (tran_id) await markFailed(tran_id);
  res.redirect(303, `${env.APP_URL}/payment/cancelled`);
});

// SSLCommerz calls THIS server-to-server. Always answer 200 so it doesn't retry forever.
router.post("/ipn", async (req, res) => {
  try {
    const { val_id } = callbackBody.parse(req.body);
    if (val_id) await validateAndConfirm(val_id);
  } catch (err) {
    console.error("IPN handler:", err instanceof Error ? err.message : err);
  }
  res.json({ received: true });
});

export default router;
