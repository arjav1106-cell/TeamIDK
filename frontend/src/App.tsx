import axios from "axios";
import { Download, Factory, FileUp, History, LayoutDashboard, LogOut, Package, ShoppingBag, Truck, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const API_BASE = "http://localhost:4001/api";
const api = axios.create({ baseURL: API_BASE });
const getToken = () => localStorage.getItem("ims_token") || "";
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

type Product = { product_code: string; name: string; description: string; weight: number; price: number; quantity: number };
type LineItem = { product_code: string; quantity: number; price: number; name?: string };

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/sales", label: "Sales", icon: Truck },
  { to: "/purchases", label: "Purchases", icon: ShoppingBag },
  { to: "/manufacturing", label: "Manufacturing", icon: Factory },
  { to: "/history", label: "History", icon: History }
];

function Layout({ children, onLogout, live }: { children: React.ReactNode; onLogout: () => void; live: boolean }) {
  const location = useLocation();
  return (
    <div className="min-h-screen flex bg-darkBg text-textPrimary">
      <aside className="w-64 bg-darkSidebar border-r border-darkBorder p-4">
        <h1 className="text-xl font-bold mb-6">IMS</h1>
        <nav className="space-y-2">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition ${location.pathname === item.to ? "bg-darkCard text-accent" : "text-textSecondary hover:bg-darkCard hover:text-textPrimary"}`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <header className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Inventory Management System</h2>
          <div className="flex items-center gap-3">
            <span className={`text-sm flex items-center gap-1 ${live ? "text-green-400" : "text-textSecondary"}`}>
              <Wifi size={14} />
              {live ? "Real-time connected" : "Real-time disconnected"}
            </span>
            <button className="px-3 py-1.5 rounded-lg border border-darkBorder text-textSecondary hover:text-textPrimary flex items-center gap-2" onClick={onLogout}>
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function Dashboard({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => {
    api.get("/dashboard").then((r) => setStats(r.data));
  }, [refreshKey]);
  const chartData = useMemo(
    () => [
      { name: "Products", value: stats?.products?.count || 0 },
      { name: "Sales", value: stats?.salesOrders || 0 },
      { name: "Purchases", value: stats?.purchaseOrders || 0 },
      { name: "Batches", value: stats?.batches || 0 }
    ],
    [stats]
  );
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-4 gap-4">
        <StatCard title="Products" value={stats?.products?.count || 0} />
        <StatCard title="Total Units" value={stats?.products?.total_units || 0} />
        <StatCard title="Low Stock" value={stats?.lowStock || 0} />
        <StatCard title="Sales Orders" value={stats?.salesOrders || 0} />
      </div>
      <div className="card p-4 h-80">
        <h3 className="text-lg font-medium mb-3">Operational Snapshot</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
            <XAxis dataKey="name" stroke="#9AA4B2" />
            <YAxis stroke="#9AA4B2" />
            <Tooltip />
            <Bar dataKey="value" fill="#F4C430" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-textSecondary text-sm">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function ProductsPage({ refreshKey }: { refreshKey: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<Product>({ product_code: "", name: "", description: "", weight: 0, price: 0, quantity: 0 });
  const [showImport, setShowImport] = useState(false);
  const load = () => api.get("/products").then((r) => setProducts(r.data));
  useEffect(() => {
    void load();
  }, [refreshKey]);
  const save = async () => {
    await api.post("/products", form);
    setForm({ product_code: "", name: "", description: "", weight: 0, price: 0, quantity: 0 });
    load();
  };
  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <div className="card p-4 lg:col-span-2">
        <h3 className="font-semibold mb-4">Product Master</h3>
        <div className="space-y-2">
          <input className="field" placeholder="Product Code" value={form.product_code} onChange={(e) => setForm({ ...form, product_code: e.target.value })} />
          <input className="field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="field" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input className="field" type="number" placeholder="Weight" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} />
          <input className="field" type="number" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          <input className="field" type="number" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          <div className="flex gap-2">
            <button className="button-primary" onClick={save}>Save Product</button>
            <button className="px-3 py-2 rounded-lg border border-darkBorder text-textSecondary hover:text-textPrimary" onClick={() => setShowImport(true)}>
              <FileUp size={14} className="inline mr-2" />
              Smart Import
            </button>
          </div>
        </div>
      </div>
      <div className="card p-4 lg:col-span-3 overflow-auto">
        <h3 className="font-semibold mb-4">Current Inventory</h3>
        <Table
          columns={["Code", "Name", "Price", "Qty"]}
          rows={products.map((p) => [p.product_code, p.name, INR.format(p.price), p.quantity])}
        />
      </div>
      {showImport && <ImportModal onClose={() => { setShowImport(false); load(); }} />}
    </div>
  );
}

function OrdersPage({ type, refreshKey }: { type: "sales" | "purchase"; refreshKey: number }) {
  const [partyName, setPartyName] = useState("");
  const [partyContact, setPartyContact] = useState("");
  const [status, setStatus] = useState(type === "sales" ? "quotation" : "quotation");
  const [rows, setRows] = useState<LineItem[]>([{ product_code: "", quantity: 1, price: 0 }]);
  const [orders, setOrders] = useState<any[]>([]);
  const load = () => api.get(`/orders?type=${type}`).then((r) => setOrders(r.data));
  useEffect(() => {
    void load();
  }, [type, refreshKey]);
  const addRow = () => setRows([...rows, { product_code: "", quantity: 1, price: 0 }]);
  const save = async () => {
    await api.post("/orders", { type, party_name: partyName, party_contact: partyContact, products: rows, status, notes: "" });
    setPartyName("");
    setPartyContact("");
    setRows([{ product_code: "", quantity: 1, price: 0 }]);
    load();
  };
  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <div className="card p-4 lg:col-span-2 space-y-3">
        <h3 className="font-semibold">{type === "sales" ? "Sales Flow" : "Purchase Flow"}</h3>
        <input className="field" placeholder={type === "sales" ? "Customer Name" : "Supplier Name"} value={partyName} onChange={(e) => setPartyName(e.target.value)} />
        <input className="field" placeholder="Contact" value={partyContact} onChange={(e) => setPartyContact(e.target.value)} />
        <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
          {(type === "sales" ? ["quotation", "packing", "dispatch", "history"] : ["quotation", "payment_pending", "completed", "history"]).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <input className="field" placeholder="Product Code" value={row.product_code} onChange={(e) => {
              const list = [...rows];
              list[i].product_code = e.target.value;
              setRows(list);
            }} />
            <input className="field" type="number" placeholder="Qty" value={row.quantity} onChange={(e) => {
              const list = [...rows];
              list[i].quantity = Number(e.target.value);
              setRows(list);
            }} />
            <input className="field" type="number" placeholder="Price" value={row.price} onChange={(e) => {
              const list = [...rows];
              list[i].price = Number(e.target.value);
              setRows(list);
            }} />
          </div>
        ))}
        <div className="flex gap-2">
          <button className="px-3 py-2 border border-darkBorder rounded-lg" onClick={addRow}>+ Add Line</button>
          <button className="button-primary" onClick={save}>Save Order</button>
        </div>
      </div>
      <div className="card p-4 lg:col-span-3">
        <h3 className="font-semibold mb-3">Order History</h3>
        <Table columns={["ID", "Party", "Status", "Items"]} rows={orders.map((o) => [o.order_id.slice(0, 8), o.party_name, o.status, o.products.length])} />
      </div>
    </div>
  );
}

function ManufacturingPage({ refreshKey }: { refreshKey: number }) {
  const [batch, setBatch] = useState("BATCH-001");
  const [status, setStatus] = useState("planned");
  const [raw, setRaw] = useState<LineItem[]>([{ product_code: "", quantity: 1, price: 0 }]);
  const [out, setOut] = useState<LineItem[]>([{ product_code: "", quantity: 1, price: 0 }]);
  const [list, setList] = useState<any[]>([]);
  const load = () => api.get("/manufacturing").then((r) => setList(r.data));
  useEffect(() => {
    void load();
  }, [refreshKey]);
  const save = async () => {
    await api.post("/manufacturing", {
      batch_number: batch,
      raw_materials: raw.map((r) => ({ product_code: r.product_code, quantity: r.quantity })),
      output: out.map((r) => ({ product_code: r.product_code, quantity: r.quantity })),
      status,
      notes: ""
    });
    load();
  };
  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <div className="card p-4 lg:col-span-2 space-y-2">
        <h3 className="font-semibold">WIP Batch Tracking</h3>
        <input className="field" value={batch} onChange={(e) => setBatch(e.target.value)} />
        <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
          {["planned", "in_progress", "completed", "cancelled"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="text-sm text-textSecondary">Raw Materials</div>
        {raw.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <input className="field" placeholder="Code" value={r.product_code} onChange={(e) => {
              const x = [...raw];
              x[i].product_code = e.target.value;
              setRaw(x);
            }} />
            <input className="field" type="number" placeholder="Qty" value={r.quantity} onChange={(e) => {
              const x = [...raw];
              x[i].quantity = Number(e.target.value);
              setRaw(x);
            }} />
          </div>
        ))}
        <button className="px-3 py-2 border border-darkBorder rounded-lg" onClick={() => setRaw([...raw, { product_code: "", quantity: 1, price: 0 }])}>+ Raw</button>
        <div className="text-sm text-textSecondary">Output</div>
        {out.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <input className="field" placeholder="Code" value={r.product_code} onChange={(e) => {
              const x = [...out];
              x[i].product_code = e.target.value;
              setOut(x);
            }} />
            <input className="field" type="number" placeholder="Qty" value={r.quantity} onChange={(e) => {
              const x = [...out];
              x[i].quantity = Number(e.target.value);
              setOut(x);
            }} />
          </div>
        ))}
        <button className="px-3 py-2 border border-darkBorder rounded-lg" onClick={() => setOut([...out, { product_code: "", quantity: 1, price: 0 }])}>+ Output</button>
        <button className="button-primary" onClick={save}>Save Batch</button>
      </div>
      <div className="card p-4 lg:col-span-3">
        <h3 className="font-semibold mb-3">Manufacturing List</h3>
        <Table columns={["Batch", "Status", "Raw Lines", "Output Lines"]} rows={list.map((b) => [b.batch_number, b.status, b.raw_materials.length, b.output.length])} />
      </div>
    </div>
  );
}

function HistoryPage({ refreshKey }: { refreshKey: number }) {
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    const q = filter === "all" ? "" : `?sourceType=${filter}`;
    api.get(`/history${q}`).then((r) => setRows(r.data));
  }, [filter, refreshKey]);
  const exportFile = async (kind: "csv" | "pdf") => {
    const q = filter === "all" ? "" : `?sourceType=${filter}`;
    const endpoint = `/history/export.${kind}${q}`;
    const response = await api.get(endpoint, { responseType: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(response.data);
    link.download = `inventory-history.${kind}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <div className="card p-4">
      <div className="flex justify-between mb-3">
        <h3 className="font-semibold">Inventory Transactions</h3>
        <div className="flex gap-2 items-center">
          <select className="field max-w-56" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="sales">Sales</option>
            <option value="purchase">Purchases</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="import">Import</option>
          </select>
          <button className="px-3 py-2 border border-darkBorder rounded-lg flex items-center gap-2" onClick={() => exportFile("csv")}><Download size={14} /> CSV</button>
          <button className="px-3 py-2 border border-darkBorder rounded-lg flex items-center gap-2" onClick={() => exportFile("pdf")}><Download size={14} /> PDF</button>
        </div>
      </div>
      <Table columns={["Type", "Ref", "Product", "Delta", "Time"]} rows={rows.map((r) => [r.transaction_type, r.reference_id, r.product_code, r.quantity_delta, new Date(r.created_at).toLocaleString()])} />
    </div>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState("excel");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const parse = async () => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const parsed = await api.post("/import/parse", form, { headers: { "Content-Type": "multipart/form-data" } });
    setRows(parsed.data.rows || []);
  };
  const save = async () => {
    try {
      await api.post("/import/validate", { rows });
      await api.post("/import/save", { rows });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Validation failed");
    }
  };
  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center p-4">
      <div className="card w-full max-w-4xl p-4 space-y-3">
        <div className="flex justify-between">
          <h4 className="font-semibold">Smart Import Pipeline</h4>
          <button onClick={onClose}>x</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="excel">Excel (.xlsx)</option>
            <option value="pdf">PDF</option>
            <option value="image">Image OCR</option>
          </select>
          <input type="file" className="field" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="button-primary" onClick={parse}>Upload {"->"} Parse {"->"} Preview</button>
        </div>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <div className="max-h-72 overflow-auto border border-darkBorder rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-darkSidebar"><tr><th className="p-2">Code</th><th className="p-2">Name</th><th className="p-2">Qty</th><th className="p-2">Price</th></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-darkBorder">
                  <td className="p-2"><input className="field" value={row.product_code || ""} onChange={(e) => { const x = [...rows]; x[i].product_code = e.target.value; setRows(x); }} /></td>
                  <td className="p-2"><input className="field" value={row.name || ""} onChange={(e) => { const x = [...rows]; x[i].name = e.target.value; setRows(x); }} /></td>
                  <td className="p-2"><input className="field" type="number" value={row.quantity || 0} onChange={(e) => { const x = [...rows]; x[i].quantity = Number(e.target.value); setRows(x); }} /></td>
                  <td className="p-2"><input className="field" type="number" value={row.price || 0} onChange={(e) => { const x = [...rows]; x[i].price = Number(e.target.value); setRows(x); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <button className="button-primary" onClick={save}>Validate and Save</button>
        </div>
      </div>
    </div>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-textSecondary border-b border-darkBorder">
            {columns.map((column) => <th key={column} className="p-2">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-darkBorder/50 hover:bg-darkSidebar/40">
              {row.map((cell, j) => <td key={j} className="p-2">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [user, setUser] = useState("shared-user");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async () => {
    try {
      const response = await api.post("/auth/login", { user, password });
      localStorage.setItem("ims_token", response.data.token);
      onLogin();
    } catch {
      setError("Invalid shared password");
    }
  };
  return (
    <div className="min-h-screen grid place-items-center bg-darkBg p-4">
      <div className="card w-full max-w-md p-6 space-y-3">
        <h1 className="text-xl font-semibold">IMS Shared Login</h1>
        <p className="text-sm text-textSecondary">Single login for up to 5 concurrent internal users.</p>
        <input className="field" value={user} onChange={(e) => setUser(e.target.value)} placeholder="Display name" />
        <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Shared password" />
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <button className="button-primary w-full" onClick={submit}>Login</button>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [refreshKey, setRefreshKey] = useState(0);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!authed) return;
    const token = getToken();
    if (!token) return;
    const events = new EventSource(`${API_BASE}/events?token=${encodeURIComponent(token)}`);
    events.onopen = () => setLive(true);
    events.onerror = () => setLive(false);
    events.onmessage = () => setRefreshKey((v) => v + 1);
    return () => {
      events.close();
      setLive(false);
    };
  }, [authed]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const logout = () => {
    localStorage.removeItem("ims_token");
    setAuthed(false);
  };

  return (
    <Layout onLogout={logout} live={live}>
      <Routes>
        <Route path="/" element={<Dashboard refreshKey={refreshKey} />} />
        <Route path="/products" element={<ProductsPage refreshKey={refreshKey} />} />
        <Route path="/sales" element={<OrdersPage type="sales" refreshKey={refreshKey} />} />
        <Route path="/purchases" element={<OrdersPage type="purchase" refreshKey={refreshKey} />} />
        <Route path="/manufacturing" element={<ManufacturingPage refreshKey={refreshKey} />} />
        <Route path="/history" element={<HistoryPage refreshKey={refreshKey} />} />
      </Routes>
    </Layout>
  );
}
