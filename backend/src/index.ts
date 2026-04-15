import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import FormData from "form-data";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import multer from "multer";
import PDFDocument from "pdfkit";
import { Pool, PoolClient } from "pg";
import { z } from "zod";

dotenv.config();

const app = express();
const upload = multer();
const port = Number(process.env.PORT || 4001);
const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8001";
const jwtSecret = process.env.JWT_SECRET || "replace_with_long_secret";
const sharedLoginPassword = process.env.SHARED_LOGIN_PASSWORD || "ims123";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sseClients = new Set<express.Response>();

type OrderLine = { product_code: string; quantity: number; price?: number; name?: string };
type BatchLine = { product_code: string; quantity: number; name?: string };

const orderSchema = z.object({
  type: z.enum(["sales", "purchase"]),
  party_name: z.string().min(1),
  party_contact: z.string().optional().default(""),
  products: z.array(
    z.object({
      product_code: z.string().min(1),
      quantity: z.number().positive(),
      price: z.number().nonnegative().optional(),
      name: z.string().optional()
    })
  ),
  status: z.string().min(1),
  notes: z.string().optional().default("")
});

const batchSchema = z.object({
  batch_number: z.string().min(1),
  raw_materials: z.array(z.object({ product_code: z.string().min(1), quantity: z.number().positive(), name: z.string().optional() })),
  output: z.array(z.object({ product_code: z.string().min(1), quantity: z.number().positive(), name: z.string().optional() })),
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]),
  notes: z.string().optional().default("")
});

app.use(cors());
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

const publishEvent = (event: string, payload: unknown) => {
  const body = `data: ${JSON.stringify({ event, payload, timestamp: new Date().toISOString() })}\n\n`;
  for (const client of sseClients) client.write(body);
};

const tokenFromRequest = (req: express.Request) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.replace("Bearer ", "");
  if (typeof req.query.token === "string") return req.query.token;
  return "";
};

const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path === "/auth/login") return next();
  const token = tokenFromRequest(req);
  if (!token) return res.status(401).json({ message: "Authorization token required" });
  try {
    jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const adjustInventory = async (
  client: PoolClient,
  lines: OrderLine[] | BatchLine[],
  factor: 1 | -1,
  sourceType: "sales" | "purchase" | "manufacturing" | "import",
  referenceId: string,
  transactionType: string
) => {
  for (const line of lines) {
    const qty = Math.round(line.quantity * factor);
    const current = await client.query("SELECT quantity FROM products WHERE product_code = $1 FOR UPDATE", [line.product_code]);
    if (current.rowCount === 0) {
      throw new Error(`Product not found: ${line.product_code}`);
    }
    const nextQty = Number(current.rows[0].quantity) + qty;
    if (nextQty < 0) {
      throw new Error(`Insufficient stock for product ${line.product_code}`);
    }
    await client.query("UPDATE products SET quantity = $1, last_updated = NOW() WHERE product_code = $2", [nextQty, line.product_code]);
    await client.query(
      `INSERT INTO inventory_transactions
        (transaction_type, reference_id, product_code, quantity_delta, source_type, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [transactionType, referenceId, line.product_code, qty, sourceType, JSON.stringify(line)]
    );
  }
};

app.get("/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});

app.use("/api", authMiddleware);

app.post("/api/auth/login", (req, res) => {
  const schema = z.object({ password: z.string().min(1), user: z.string().optional().default("shared-user") });
  const payload = schema.parse(req.body);
  if (payload.password !== sharedLoginPassword) return res.status(401).json({ message: "Invalid shared password" });
  const token = jwt.sign({ sub: payload.user, scope: "shared_access" }, jwtSecret, { expiresIn: "8h" });
  return res.json({ token, user: payload.user });
});

app.get("/api/events", (req, res) => {
  const token = tokenFromRequest(req);
  if (!token) return res.status(401).end();
  try {
    jwt.verify(token, jwtSecret);
  } catch {
    return res.status(401).end();
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ event: "connected" })}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
  return undefined;
});

app.get("/api/products", async (_req, res) => {
  const data = await pool.query("SELECT * FROM products ORDER BY last_updated DESC");
  res.json(data.rows);
});

app.post("/api/products", async (req, res) => {
  const schema = z.object({
    product_code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional().default(""),
    weight: z.number().nonnegative().default(0),
    price: z.number().nonnegative().default(0),
    quantity: z.number().int().nonnegative().default(0)
  });
  const payload = schema.parse(req.body);
  await pool.query(
    `INSERT INTO products (product_code, name, description, weight, price, quantity)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (product_code) DO UPDATE
     SET name = EXCLUDED.name,
         description = EXCLUDED.description,
         weight = EXCLUDED.weight,
         price = EXCLUDED.price,
         quantity = EXCLUDED.quantity,
         last_updated = NOW()`,
    [payload.product_code, payload.name, payload.description, payload.weight, payload.price, payload.quantity]
  );
  publishEvent("inventory_changed", { source: "product_upsert", product_code: payload.product_code });
  res.status(201).json({ message: "Product saved" });
});

app.post("/api/orders", async (req, res) => {
  const payload = orderSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO orders (type, party_name, party_contact, products, status, notes)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING *`,
      [payload.type, payload.party_name, payload.party_contact, JSON.stringify(payload.products), payload.status, payload.notes]
    );
    if (payload.status === "dispatch" && payload.type === "sales") {
      await adjustInventory(client, payload.products, -1, "sales", result.rows[0].order_id, "sales_dispatch");
    }
    if (payload.status === "completed" && payload.type === "purchase") {
      await adjustInventory(client, payload.products, 1, "purchase", result.rows[0].order_id, "purchase_completion");
    }
    await client.query("COMMIT");
    publishEvent("order_changed", { type: payload.type, status: payload.status, order_id: result.rows[0].order_id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.get("/api/orders", async (req, res) => {
  const type = req.query.type as string | undefined;
  const values: string[] = [];
  let where = "";
  if (type && ["sales", "purchase"].includes(type)) {
    where = "WHERE type = $1";
    values.push(type);
  }
  const rows = await pool.query(`SELECT * FROM orders ${where} ORDER BY created_at DESC`, values);
  res.json(rows.rows);
});

app.post("/api/manufacturing", async (req, res) => {
  const payload = batchSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query(
      `INSERT INTO manufacturing_batches (batch_number, raw_materials, output, status, notes, start_date, end_date)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, NOW(), CASE WHEN $4 = 'completed' THEN NOW() ELSE NULL END)
       ON CONFLICT (batch_number) DO UPDATE
       SET raw_materials = EXCLUDED.raw_materials,
           output = EXCLUDED.output,
           status = EXCLUDED.status,
           notes = EXCLUDED.notes,
           updated_at = NOW(),
           end_date = CASE WHEN EXCLUDED.status = 'completed' THEN NOW() ELSE manufacturing_batches.end_date END
       RETURNING *`,
      [payload.batch_number, JSON.stringify(payload.raw_materials), JSON.stringify(payload.output), payload.status, payload.notes]
    );
    if (payload.status === "in_progress") {
      await adjustInventory(client, payload.raw_materials, -1, "manufacturing", payload.batch_number, "wip_start");
    }
    if (payload.status === "completed") {
      await adjustInventory(client, payload.output, 1, "manufacturing", payload.batch_number, "wip_completion");
    }
    await client.query("COMMIT");
    publishEvent("manufacturing_changed", { batch_number: payload.batch_number, status: payload.status });
    res.status(201).json(created.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.get("/api/manufacturing", async (_req, res) => {
  const data = await pool.query("SELECT * FROM manufacturing_batches ORDER BY updated_at DESC");
  res.json(data.rows);
});

app.get("/api/history", async (req, res) => {
  const sourceType = req.query.sourceType as string | undefined;
  const values: string[] = [];
  let where = "";
  if (sourceType && ["sales", "purchase", "manufacturing", "manual", "import"].includes(sourceType)) {
    where = "WHERE source_type = $1";
    values.push(sourceType);
  }
  const data = await pool.query(`SELECT * FROM inventory_transactions ${where} ORDER BY created_at DESC LIMIT 500`, values);
  res.json(data.rows);
});

app.get("/api/history/export.csv", async (req, res) => {
  const sourceType = req.query.sourceType as string | undefined;
  const values: string[] = [];
  let where = "";
  if (sourceType && ["sales", "purchase", "manufacturing", "manual", "import"].includes(sourceType)) {
    where = "WHERE source_type = $1";
    values.push(sourceType);
  }
  const data = await pool.query(`SELECT transaction_type, reference_id, product_code, quantity_delta, source_type, created_at FROM inventory_transactions ${where} ORDER BY created_at DESC LIMIT 500`, values);
  const headers = ["transaction_type", "reference_id", "product_code", "quantity_delta", "source_type", "created_at"];
  const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(","), ...data.rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(","))];
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="inventory-history.csv"');
  res.send(lines.join("\n"));
});

app.get("/api/history/export.pdf", async (req, res) => {
  const sourceType = req.query.sourceType as string | undefined;
  const values: string[] = [];
  let where = "";
  if (sourceType && ["sales", "purchase", "manufacturing", "manual", "import"].includes(sourceType)) {
    where = "WHERE source_type = $1";
    values.push(sourceType);
  }
  const data = await pool.query(`SELECT transaction_type, reference_id, product_code, quantity_delta, source_type, created_at FROM inventory_transactions ${where} ORDER BY created_at DESC LIMIT 120`, values);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="inventory-history.pdf"');
  const doc = new PDFDocument({ margin: 32, size: "A4" });
  doc.pipe(res);
  doc.fontSize(18).text("Inventory History Export", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#555").text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown();
  for (const row of data.rows) {
    doc.fillColor("black").fontSize(10).text(
      `${row.created_at.toISOString()} | ${row.source_type} | ${row.transaction_type} | ${row.reference_id} | ${row.product_code} | ${row.quantity_delta}`
    );
  }
  doc.end();
});

app.get("/api/dashboard", async (_req, res) => {
  const [products, lowStock, salesCount, purchaseCount, mfgCount] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count, COALESCE(SUM(quantity), 0)::int AS total_units FROM products"),
    pool.query("SELECT COUNT(*)::int AS count FROM products WHERE quantity < 10"),
    pool.query("SELECT COUNT(*)::int AS count FROM orders WHERE type = 'sales'"),
    pool.query("SELECT COUNT(*)::int AS count FROM orders WHERE type = 'purchase'"),
    pool.query("SELECT COUNT(*)::int AS count FROM manufacturing_batches")
  ]);
  res.json({
    products: products.rows[0],
    lowStock: lowStock.rows[0].count,
    salesOrders: salesCount.rows[0].count,
    purchaseOrders: purchaseCount.rows[0].count,
    batches: mfgCount.rows[0].count
  });
});

app.post("/api/import/parse", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "File is required" });
  }
  const kind = String(req.body.kind || "").toLowerCase();
  const route = kind === "pdf" ? "pdf" : kind === "image" ? "image" : "excel";
  const form = new FormData();
  form.append("file", req.file.buffer, req.file.originalname);
  try {
    const response = await axios.post(`${pythonServiceUrl}/parse/${route}`, form, { headers: form.getHeaders() });
    return res.json(response.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail || error.message;
      return res.status(502).json({ success: false, columns: [], rows: [], confidence: 0.0, error: String(detail) });
    }
    throw error;
  }
});

app.post("/api/import/validate", async (req, res) => {
  const schema = z.array(
    z.object({
      product_code: z.string().min(1),
      name: z.string().min(1),
      quantity: z.number().int().nonnegative(),
      price: z.number().nonnegative().default(0),
      weight: z.number().nonnegative().default(0),
      description: z.string().optional().default("")
    })
  );
  const parsed = schema.safeParse(req.body.rows);
  if (!parsed.success) {
    return res.status(422).json({ errors: parsed.error.flatten() });
  }
  res.json({ valid: true, rows: parsed.data });
});

app.post("/api/import/save", async (req, res) => {
  const rows = z
    .array(
      z.object({
        product_code: z.string().min(1),
        name: z.string().min(1),
        quantity: z.number().int().nonnegative(),
        price: z.number().nonnegative().default(0),
        weight: z.number().nonnegative().default(0),
        description: z.string().optional().default("")
      })
    )
    .parse(req.body.rows);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const existing = await client.query("SELECT quantity FROM products WHERE product_code = $1 FOR UPDATE", [row.product_code]);
      if (existing.rowCount === 0) {
        await client.query(
          `INSERT INTO products (product_code, name, description, weight, price, quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [row.product_code, row.name, row.description || "", row.weight, row.price, row.quantity]
        );
      } else {
        const qty = Number(existing.rows[0].quantity) + row.quantity;
        await client.query(
          `UPDATE products
           SET name = $1, description = $2, weight = $3, price = $4, quantity = $5, last_updated = NOW()
           WHERE product_code = $6`,
          [row.name, row.description || "", row.weight, row.price, qty, row.product_code]
        );
      }
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, reference_id, product_code, quantity_delta, source_type, payload)
         VALUES ('import_upsert', $1, $2, $3, 'import', $4::jsonb)`,
        [`import_${Date.now()}`, row.product_code, row.quantity, JSON.stringify(row)]
      );
    }
    await client.query("COMMIT");
    publishEvent("inventory_changed", { source: "import", count: rows.length });
    res.json({ message: "Import completed", count: rows.length });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: "Validation failed", issues: error.issues });
  }
  const err = error as Error;
  return res.status(500).json({ message: err.message || "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`IMS backend listening on ${port}`);
});
