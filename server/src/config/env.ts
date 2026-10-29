import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().default(5000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
    APP_URL: z.url(),
    PAYMENT_MODE: z.enum(["mock", "sslcommerz"]).default("mock"),
    SSLC_STORE_ID: z.string().optional(),
    SSLC_STORE_PASSWORD: z.string().optional(),
  })
  .refine((e) => e.PAYMENT_MODE === "mock" || (e.SSLC_STORE_ID && e.SSLC_STORE_PASSWORD), {
    message: "SSLC_STORE_ID and SSLC_STORE_PASSWORD are required when PAYMENT_MODE=sslcommerz",
    path: ["SSLC_STORE_ID"],
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

// Fully typed: env.PORT is a number, env.PAYMENT_MODE is "mock" | "sslcommerz".
export const env = parsed.data;
