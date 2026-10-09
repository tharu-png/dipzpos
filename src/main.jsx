import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import "./styles.css";

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const r of registrations) {
      r.unregister();
    }
  });
  if ("caches" in window) {
    caches.keys().then((names) => {
      for (const name of names) caches.delete(name);
    });
  }
}

const STORAGE_KEY = "dipz-pos-state-v1";
const DEFAULT_SETTINGS = {
  standardPrice: 500,
  premiumPrice: 600,
  dragonfruitPrice: 400,
  coconutPrice: 350,
  marshmallowPrice: 350,
  pack80Price: 80,
  sharePercent: 10,
  adminPin: "2468",
  venueName: "Shakshuka Food Park",
  syncServerUrl: "http://localhost:3001/api/sync-excel",
  googleSheetsUrl: "",
  autoSyncEnabled: true,
};
const PRODUCTS = [
  {
    id: "standard",
    code: "DIPZ-STD",
    name: "Standard Banana",
    priceKey: "standardPrice",
    stock: true,
    art: "banana",
  },
  {
    id: "premium",
    code: "DIPZ-PRM",
    name: "Premium Banana",
    priceKey: "premiumPrice",
    stock: true,
    art: "banana premium",
  },
  {
    id: "dragonfruit",
    code: "DIPZ-DRG",
    name: "Dragonfruit Ice Cream",
    priceKey: "dragonfruitPrice",
    stock: true,
    art: "dragonfruit",
  },
  {
    id: "coconut",
    code: "DIPZ-CNT",
    name: "Coconut Ice Cream",
    priceKey: "coconutPrice",
    stock: true,
    art: "coconut",
  },
  {
    id: "marshmallow",
    code: "DIPZ-MSH",
    name: "Chocolate Marshmallows",
    priceKey: "marshmallowPrice",
    stock: true,
    art: "marshmallow",
  },
];
const PACKS = {
  pack80: { code: "PACK-80", name: "Packing", priceKey: "pack80Price" },
};

const todayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const money = (value) => `LKR ${Number(value || 0).toLocaleString("en-LK")}`;
const dateLabel = (key) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("en-LK", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
const timeLabel = (value) =>
  new Date(value).toLocaleTimeString("en-LK", {
    hour: "numeric",
    minute: "2-digit",
  });
const emptyState = () => ({
  activeDate: todayKey(),
  cart: [],
  packaging: null,
  paymentMethod: "cash",
  cashReceived: "",
  orders: [],
  history: [],
  settings: { ...DEFAULT_SETTINGS },
  stock: {
    started: "",
    remaining: "",
    closing: "",
    products: {},
    locked: false,
    submitted: false,
  },
});
const cleanSettings = (settings) =>
  Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS).map((key) => [
      key,
      ["adminPin", "venueName", "syncServerUrl", "googleSheetsUrl"].includes(key)
        ? typeof settings?.[key] === "string"
          ? settings[key]
          : DEFAULT_SETTINGS[key]
        : key === "autoSyncEnabled"
          ? settings?.[key] !== undefined ? Boolean(settings[key]) : true
          : Number.isFinite(Number(settings?.[key]))
            ? Number(settings[key])
            : DEFAULT_SETTINGS[key],
    ]),
  );
const orderCount = (order) =>
  (order.items || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
const normalizeOrders = (orders) =>
  (Array.isArray(orders) ? orders : []).filter(Boolean).map((order, index) => {
    if (Array.isArray(order.items))
      return {
        ...order,
        id: order.id || `DIPZ-${String(index + 1).padStart(3, "0")}`,
      };
    const product = order.tier === "premium" ? PRODUCTS[1] : PRODUCTS[0];
    return {
      id: `DIPZ-${String(order.number || index + 1).padStart(3, "0")}`,
      timestamp: order.timestamp || new Date().toISOString(),
      total: Number(order.price || 0),
      status: "completed",
      items: [
        {
          product: product.id,
          code: product.code,
          name: product.name,
          price: Number(order.price || 0),
          quantity: 1,
        },
      ],
    };
  });
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed) return emptyState();
    return {
      ...emptyState(),
      ...parsed,
      settings: cleanSettings(parsed.settings),
      orders: normalizeOrders(parsed.orders),
      history: Array.isArray(parsed.history) ? parsed.history : [],
      stock: { ...emptyState().stock, ...(parsed.stock || {}) },
    };
  } catch {
    return emptyState();
  }
}
function totals(orders) {
  return orders.reduce(
    (result, order) => {
      if (order.status === "refunded") return result;
      result.revenue += Number(order.total || 0);
      (order.items || []).forEach((item) => {
        if (item.product === "standard")
          result.standard += Number(item.quantity || 0);
        if (item.product === "premium")
          result.premium += Number(item.quantity || 0);
      });
      return result;
    },
    { revenue: 0, standard: 0, premium: 0 },
  );
}
function productCounts(orders) {
  return orders.reduce((counts, order) => {
    if (order.status === "refunded") return counts;
    (order.items || []).forEach((item) => {
      if (item.product !== "packaging") counts[item.product] = (counts[item.product] || 0) + Number(item.quantity || 0);
    });
    return counts;
  }, {});
}

function ProductArt({ type }) {
  return (
    <span className={`product-art ${type}`} aria-hidden="true">
      {type.includes("dragonfruit")
        ? "✦"
        : type.includes("coconut")
          ? "◒"
          : type.includes("marshmallow")
            ? "◆"
            : "🍌"}
    </span>
  );
}
function Nav({ screen, setScreen }) {
  return (
    <nav className="nav-row">
      {[
        ["sell", "Sell"],
        ["history", "History"],
        ["reports", "Reports"],
        ["settings", "Settings"],
      ].map(([id, label]) => (
        <button
          key={id}
          className={`nav-button ${screen === id ? "active" : ""}`}
          onClick={() => setScreen(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

async function triggerSpreadsheetSync(orders, stock, settings) {
  const activeOrders = (orders || []).filter((o) => o.status !== "refunded");
  let standardSold = 0;
  let premiumSold = 0;
  let cashCollected = 0;
  let digitalCollected = 0;

  activeOrders.forEach((o) => {
    (o.items || []).forEach((item) => {
      if (item.product === "standard") standardSold += Number(item.quantity || 0);
      if (item.product === "premium") premiumSold += Number(item.quantity || 0);
    });
    const method = o.payment?.method || "cash";
    if (method === "cash") {
      cashCollected += Number(o.total || 0);
    } else {
      digitalCollected += Number(o.total || 0);
    }
  });

  const payload = {
    date: todayKey(),
    venue: settings.venueName || "Shakshuka Food Park",
    standardSold,
    premiumSold,
    freeUnits: 0,
    startedStock: stock.started !== "" ? Number(stock.started) : null,
    remainingStock: stock.remaining !== "" ? Number(stock.remaining) : null,
    cashCollected,
    digitalCollected,
    notes: `POS sync at ${new Date().toLocaleTimeString("en-LK")}`,
  };

  let localSuccess = false;
  let googleSuccess = false;
  let errorMsg = null;

  const candidateUrls = [
    settings.syncServerUrl,
    "/api/sync-excel",
    "http://localhost:3001/api/sync-excel",
  ].filter(Boolean);
  const uniqueUrls = [...new Set(candidateUrls)];

  for (const url of uniqueUrls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        localSuccess = true;
        errorMsg = null;
        break;
      } else {
        const data = await res.json().catch(() => ({}));
        errorMsg = data.error || "Sync server returned error";
      }
    } catch (err) {
      errorMsg = err.message || "Failed to reach sync server";
    }
  }

  if (settings.googleSheetsUrl && settings.googleSheetsUrl.trim()) {
    try {
      await fetch(settings.googleSheetsUrl.trim(), {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      googleSuccess = true;
    } catch {
      // no-cors fetch
    }
  }

  return { localSuccess, googleSuccess, errorMsg, time: new Date().toLocaleTimeString("en-LK") };
}

function App() {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("sell");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [adminMode, setAdminMode] = useState(false);
  const [adminPinEntry, setAdminPinEntry] = useState("");
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [otherOpening, setOtherOpening] = useState({
    dragonfruit: "",
    coconut: "",
    marshmallow: "",
  });
  const [receipt, setReceipt] = useState(null);
  const [toast, setToast] = useState("");
  const [syncInfo, setSyncInfo] = useState({
    status: "idle",
    lastTime: null,
    connected: false,
    localExcelExists: false,
  });
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    const checkEndpoints = ["/api/spreadsheet-status", "http://localhost:3001/api/spreadsheet-status"];
    const runCheck = async () => {
      for (const ep of checkEndpoints) {
        try {
          const res = await fetch(ep);
          if (res.ok) {
            const data = await res.json();
            setSyncInfo((prev) => ({
              ...prev,
              connected: data.connected || false,
              localExcelExists: data.localExcelExists || false,
            }));
            break;
          }
        } catch {
          // try next endpoint
        }
      }
    };
    runCheck();
  }, []);

  const handleSync = async (customOrders = state.orders, customStock = state.stock) => {
    setSyncInfo((prev) => ({ ...prev, status: "syncing" }));
    const res = await triggerSpreadsheetSync(customOrders, customStock, state.settings);
    if (res.localSuccess || res.googleSuccess) {
      setSyncInfo((prev) => ({
        ...prev,
        status: "synced",
        lastTime: res.time,
        connected: true,
      }));
      notify("Synced with Excel Tracker!");
    } else {
      setSyncInfo((prev) => ({
        ...prev,
        status: "error",
        errorMsg: res.errorMsg,
      }));
      notify("Excel sync failed. Check server endpoint.");
    }
    return res;
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const cartItems = useMemo(() => {
    const items = [...state.cart];
    if (state.packaging && PACKS[state.packaging]) {
      const pack = PACKS[state.packaging];
      items.push({
        product: "packaging",
        code: pack.code,
        name: `${pack.name} (${money(state.settings[pack.priceKey])})`,
        price: state.settings[pack.priceKey],
        quantity: 1,
      });
    }
    return items;
  }, [state.cart, state.packaging, state.settings]);
  const cartTotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const dayTotals = totals(state.orders);
  const cashReceived = Number(state.cashReceived);
  const stockRemaining =
    state.stock.remaining === "" ? null : Number(state.stock.remaining);
  const catalogProducts = PRODUCTS.filter((product) => {
    const matchesSearch = `${product.name} ${product.code}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesCategory =
      category === "all" ||
      (category === "banana" && ["standard", "premium"].includes(product.id)) ||
      (category === "ice" && ["dragonfruit", "coconut"].includes(product.id)) ||
      (category === "treat" && product.id === "marshmallow");
    return matchesSearch && matchesCategory;
  });

  const update = (patch) => setState((current) => ({ ...current, ...patch }));
  const notify = (message) => setToast(message);
  const addToCart = (productId) => {
    const product = PRODUCTS.find((item) => item.id === productId);
    if (!product) return;
    const balance = state.stock.products?.[productId]?.remaining;
    if (balance !== undefined && balance !== "" && Number(balance) <= 0)
      return notify("That product is out of stock.");
    const existing = state.cart.find((item) => item.product === productId);
    const cart = existing
      ? state.cart.map((item) =>
          item.product === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      : [
          ...state.cart,
          {
            product: productId,
            code: product.code,
            name: product.name,
            price: state.settings[product.priceKey],
            quantity: 1,
          },
        ];
    update({ cart });
  };
  const changeQuantity = (product, amount) =>
    update({
      cart: state.cart
        .map((item) =>
          item.product === product
            ? { ...item, quantity: item.quantity + amount }
            : item,
        )
        .filter((item) => item.quantity > 0),
    });
  const selectPacking = (packaging) =>
    update({ packaging: state.packaging === packaging ? null : packaging });
  const finishAdmin = () => {
    setAdminMode(false);
    setAdminPinEntry("");
    setOpening("");
    setClosing("");
    setOtherOpening({ dragonfruit: "", coconut: "", marshmallow: "" });
  };
  const unlockAdmin = () => {
    if (adminPinEntry !== state.settings.adminPin)
      return notify("Incorrect admin PIN.");
    setAdminMode(true);
    setOpening(state.stock.started);
    setClosing(state.stock.closing);
    setOtherOpening(
      Object.fromEntries(
        ["dragonfruit", "coconut", "marshmallow"].map((id) => [
          id,
          state.stock.products?.[id]?.started || "",
        ]),
      ),
    );
    setAdminPinEntry("");
  };
  const startShift = () => {
    const value = Number(opening);
    if (!Number.isInteger(value) || value < 0)
      return notify("Enter a valid opening banana count.");
    const products = Object.fromEntries(
      Object.entries(otherOpening).map(([id, count]) => [
        id,
        { started: count, remaining: count },
      ]),
    );
    setState((current) => ({
      ...current,
      stock: {
        ...current.stock,
        started: String(value),
        remaining: String(value),
        closing: "",
        products,
        locked: true,
        submitted: false,
      },
    }));
    finishAdmin();
    notify("Opening stock saved and admin controls locked.");
  };
  const submitClosing = () => {
    const value = Number(closing);
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > Number(state.stock.started)
    )
      return notify("Enter a valid closing banana count.");
    setState((current) => ({
      ...current,
      stock: { ...current.stock, closing: String(value), submitted: true },
    }));
    finishAdmin();
    notify("Closing count submitted and admin controls locked.");
  };
  const checkout = () => {
    if (!state.cart.length) return;
    if (
      state.paymentMethod === "cash" &&
      (!Number.isFinite(cashReceived) || cashReceived < cartTotal)
    )
      return notify("Cash received must cover the bill total.");
    const id = `DIPZ-${String(state.orders.length + 1).padStart(3, "0")}`;
    const payment = {
      method: state.paymentMethod,
      received: state.paymentMethod === "cash" ? cashReceived : cartTotal,
      change: state.paymentMethod === "cash" ? cashReceived - cartTotal : 0,
    };
    const order = {
      id,
      timestamp: new Date().toISOString(),
      items: cartItems,
      total: cartTotal,
      payment,
      status: "completed",
    };
    const products = { ...(state.stock.products || {}) };
    cartItems.forEach((item) => {
      if (products[item.product])
        products[item.product] = {
          ...products[item.product],
          remaining: Math.max(
            0,
            Number(
              products[item.product].remaining ||
                products[item.product].started,
            ) - item.quantity,
          ),
        };
    });
    const bananas = cartItems.reduce(
      (sum, item) =>
        sum +
        (["standard", "premium"].includes(item.product) ? item.quantity : 0),
      0,
    );
    const newOrders = [...state.orders, order];
    const newStock = {
      ...state.stock,
      remaining:
        state.stock.remaining === ""
          ? ""
          : String(Math.max(0, Number(state.stock.remaining) - bananas)),
      products,
      closing: "",
      submitted: false,
    };
    update({
      orders: newOrders,
      cart: [],
      packaging: null,
      cashReceived: "",
      stock: newStock,
    });
    setReceipt(order);
    notify(`${id} checked out.`);
    if (state.settings.autoSyncEnabled !== false) {
      handleSync(newOrders, newStock);
    }
  };
  const refund = (orderId) => {
    if (!adminMode)
      return notify("Admin must unlock controls in Settings before refunds.");
    if (!window.confirm(`Refund ${orderId}?`)) return;
    update({
      orders: state.orders.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status: "refunded",
              refundedAt: new Date().toISOString(),
            }
          : order,
      ),
    });
    finishAdmin();
    notify(`${orderId} marked as refunded.`);
  };
  const finishDay = () => {
    if (state.cart.length) return notify("Checkout the current bill first.");
    if (!state.orders.length) return notify("Add at least one order first.");
    if (!state.stock.submitted)
      return notify("Admin must submit the closing banana count first.");
    if (!window.confirm("Finish and archive today? This cannot be undone."))
      return;
    const share = (dayTotals.revenue * state.settings.sharePercent) / 100;
    const archive = {
      date: state.activeDate,
      orders: state.orders,
      totals: dayTotals,
      revenueShare: { venue: share, net: dayTotals.revenue - share },
      reconciliation: {
        started: Number(state.stock.started),
        remaining: Number(state.stock.closing),
        used: Number(state.stock.started) - Number(state.stock.closing),
        gap:
          Number(state.stock.started) -
          Number(state.stock.closing) -
          dayTotals.standard -
          dayTotals.premium,
        status:
          Number(state.stock.started) - Number(state.stock.closing) ===
          dayTotals.standard + dayTotals.premium
            ? "matches"
            : "mismatch",
      },
    };
    update({
      history: [archive, ...state.history],
      activeDate: todayKey(),
      orders: [],
      cart: [],
      packaging: null,
      stock: {
        started: "",
        remaining: "",
        closing: "",
        products: {},
        locked: false,
        submitted: false,
      },
    });
    notify("Day archived.");
  };
  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { app: "DIPZ POS", exportedAt: new Date().toISOString(), state },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `dipz-backup-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify("Backup exported.");
  };
  const importData = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        const imported = backup.state || backup;
        if (!imported.settings || !Array.isArray(imported.orders))
          throw new Error("Invalid");
        localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
        window.location.reload();
      } catch {
        notify("Invalid backup. Nothing was changed.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="rail-brand"><h1 className="brand">DIPZ</h1><span>Cart POS</span></div>
        <Nav screen={screen} setScreen={setScreen} />
        <div className="rail-footer">
          <span className="offline-dot" style={{ background: syncInfo.status === "synced" ? "#16a34a" : syncInfo.status === "syncing" ? "#eab308" : "#ca8a04" }} />
          <span>{syncInfo.status === "synced" ? `Excel Synced (${syncInfo.lastTime})` : syncInfo.status === "syncing" ? "Syncing Excel..." : "Excel Sync Ready"}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-topbar">
          <div className="toolbar-search-group"><label className="global-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products..." /></label><button className="filter-button" type="button" onClick={() => setCategory("all")}>⌘ <span>Filter</span></button></div>
          <div className="topbar-meta">
            <span className="report-date" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: syncInfo.status === "synced" ? "#16a34a" : "#eab308" }} />
              <span>{syncInfo.status === "synced" ? "Excel Synced 🟢" : "Excel Tracker Ready"}</span>
            </span>
            <span className="date-label">{dateLabel(state.activeDate)}</span>
            <span className="user-chip"><span className="user-avatar">D</span><span><strong>DIPZ staff</strong><small>Cart operator</small></span></span>
          </div>
        </header>
      {storageError && (
        <div className="storage-notice visible">
          Local storage is unavailable. Keep this page open until storage is
          restored.
        </div>
      )}
      <main>
        {screen === "sell" && (
          <SellScreen
            state={state}
            setState={setState}
            products={PRODUCTS}
            catalogProducts={catalogProducts}
            category={category}
            setCategory={setCategory}
            stockRemaining={stockRemaining}
            cartItems={cartItems}
            cartTotal={cartTotal}
            addToCart={addToCart}
            changeQuantity={changeQuantity}
            selectPacking={selectPacking}
            checkout={checkout}
            cashReceived={cashReceived}
            finishDay={finishDay}
            setReceipt={setReceipt}
            refund={refund}
            adminMode={adminMode}
          />
        )}
        {screen === "history" && (
          <HistoryScreen history={state.history} setReceipt={setReceipt} />
        )}
        {screen === "reports" && <Reports orders={state.orders} />}
        {screen === "settings" && (
          <Settings
            state={state}
            setState={setState}
            adminMode={adminMode}
            adminPinEntry={adminPinEntry}
            setAdminPinEntry={setAdminPinEntry}
            unlockAdmin={unlockAdmin}
            opening={opening}
            setOpening={setOpening}
            closing={closing}
            setClosing={setClosing}
            otherOpening={otherOpening}
            setOtherOpening={setOtherOpening}
            startShift={startShift}
            submitClosing={submitClosing}
            finishAdmin={finishAdmin}
            exportData={exportData}
            importData={importData}
            handleSync={handleSync}
            syncInfo={syncInfo}
          />
        )}
      </main>
      {receipt && <Receipt order={receipt} close={() => setReceipt(null)} />}
      {toast && (
        <div className="toast-wrap">
          <div className="toast visible">{toast}</div>
        </div>
      )}
      </div>
    </div>
  );
}

function SellScreen({
  state,
  setState,
  products,
  catalogProducts,
  category,
  setCategory,
  stockRemaining,
  cartItems,
  cartTotal,
  addToCart,
  changeQuantity,
  selectPacking,
  checkout,
  cashReceived,
  finishDay,
  setReceipt,
  refund,
  adminMode,
}) {
  const live = (
    <>
      {state.stock.remaining === "" ? "Not set" : state.stock.remaining}
      <span className="stock-extra-list">
        {products
          .filter((product) => !["standard", "premium"].includes(product.id))
          .map((product) => (
            <span key={product.id}>
              {product.name}:{" "}
              {state.stock.products?.[product.id]?.remaining ?? "Not set"}
            </span>
          ))}
      </span>
    </>
  );
  const current = totals(state.orders);
  const counts = productCounts(state.orders);
  const lowStock = products
    .filter((product) => {
      const value = state.stock.products?.[product.id]?.remaining;
      return value !== undefined && value !== "" && Number(value) <= 3;
    })
    .map(
      (product) =>
        `${product.name}: ${state.stock.products[product.id].remaining} left`,
    );
  return (
    <section className="page">
      <div className="pos-layout">
        <section className="panel catalog-panel">
          <div className="list-header">
            <div>
              <h2 className="section-heading">Products</h2>
              <p className="quiet">
                Tap a product to add it to the current bill.
              </p>
            </div>
            <span className="quiet">{products.length} products</span>
          </div>
          <div className="category-tabs">
            {[['all', 'All'], ['banana', 'Bananas'], ['ice', 'Ice cream'], ['treat', 'Treats']].map(([id, label]) => <button key={id} className={category === id ? 'selected' : ''} onClick={() => setCategory(id)}>{label}</button>)}
          </div>
          <div className="catalog-grid">
            {catalogProducts.map((product) => {
              const balance = state.stock.products?.[product.id]?.remaining;
              const disabled =
                balance !== undefined && balance !== "" && Number(balance) <= 0;
              return (
                <button
                  disabled={disabled}
                  className="product-card"
                  key={product.id}
                  onClick={() => addToCart(product.id)}
                >
                  <ProductArt type={product.art} />
                  <span className="product-code">{product.code}</span>
                  <span className="product-name">{product.name}</span>
                  <span className="product-price">
                    {money(state.settings[product.priceKey])}
                    {disabled && " · Sold out"}
                  </span>
                  {!disabled && <span className="product-card-cta">Add to cart</span>}
                </button>
              );
            })}
          </div>
          {!catalogProducts.length && <div className="empty-state">No products match this search.</div>}
          {lowStock.length > 0 && (
            <div className="stock-alert">Low stock: {lowStock.join(" · ")}</div>
          )}
        </section>
        <Bill
          state={state}
          setState={setState}
          cartItems={cartItems}
          cartTotal={cartTotal}
          changeQuantity={changeQuantity}
          selectPacking={selectPacking}
          checkout={checkout}
          cashReceived={cashReceived}
        />
      </div>
      <section className="panel">
        <h2 className="section-heading">Today's completed orders</h2>
        <div className="summary-grid">
          <Summary label="Total revenue" value={money(current.revenue)} wide />
          <Summary label="Orders" value={state.orders.length} />
          <Summary
            label="Venue share"
            value={money((current.revenue * state.settings.sharePercent) / 100)}
          />
        </div>
        <div className="product-count-grid">
          {products.map((product) => (
            <span key={product.id}>
              <strong>{counts[product.id] || 0}</strong>
              {product.name}
            </span>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="list-header">
          <h2 className="section-heading">Order history today</h2>
          <span className="quiet">{state.orders.length} orders</span>
        </div>
        <OrderList
          orders={state.orders}
          setReceipt={setReceipt}
          refund={refund}
          adminMode={adminMode}
        />
      </section>
      <section className="panel">
        <h2 className="section-heading">Stock reconciliation</h2>
        <div className="stock-readout">
          <div>
            <span className="result-label">Bananas started</span>
            <strong className="stock-number">
              {state.stock.started || "Not set"}
            </strong>
          </div>
          <div>
            <span className="result-label">Live bananas remaining</span>
            <strong className="stock-number">{live}</strong>
          </div>
        </div>
        <p className="field-help">
          Admin submits the physical closing count in Settings at day end.
        </p>
        <div
          className={`recon-result ${state.stock.submitted ? "matches" : ""}`}
        >
          {state.stock.submitted
            ? `Closing count submitted: ${state.stock.closing}.`
            : "Awaiting admin closing count."}
        </div>
      </section>
      <section className="panel">
        <h2 className="section-heading">Finish day</h2>
        <p className="quiet">
          Archive today's orders after Admin submits the closing count.
        </p>
        <button className="action-button primary" onClick={finishDay}>
          Finish day
        </button>
      </section>
    </section>
  );
}
function Bill({
  state,
  setState,
  cartItems,
  cartTotal,
  changeQuantity,
  selectPacking,
  checkout,
  cashReceived,
}) {
  return (
    <section className="panel bill-panel">
      <div className="bill-header">
        <h2 className="section-heading">Current bill</h2>
        <span className="quiet">
          {cartItems.reduce((sum, item) => sum + item.quantity, 0)} items
        </span>
      </div>
      <ol className="bill-list">
        {cartItems.length ? (
          cartItems.map((item) => (
            <li className="bill-line" key={item.code}>
              <span>
                <span className="bill-item-name">{item.name}</span>
                <span className="bill-item-code">{item.code}</span>
              </span>
              {item.product === "packaging" ? (
                <button
                  className="qty-button"
                  onClick={() => selectPacking(null)}
                >
                  ×
                </button>
              ) : (
                <span className="qty-control">
                  <button
                    className="qty-button"
                    onClick={() => changeQuantity(item.product, -1)}
                  >
                    −
                  </button>
                  <span className="qty-value">{item.quantity}</span>
                  <button
                    className="qty-button"
                    onClick={() => changeQuantity(item.product, 1)}
                  >
                    +
                  </button>
                </span>
              )}
              <span className="bill-line-total">
                {money(item.price * item.quantity)}
              </span>
            </li>
          ))
        ) : (
          <li className="empty-state">No items in the current bill.</li>
        )}
      </ol>
      <div className="packing-options">
        <button
          className={`packing-button ${state.packaging === "pack80" ? "selected" : ""}`}
          onClick={() => selectPacking("pack80")}
        >
          Pack · {money(state.settings.pack80Price)}
        </button>
        <button
          className={`packing-button ${state.packaging === "pack100" ? "selected" : ""}`}
          onClick={() => selectPacking("pack100")}
        >
          Pack · {money(state.settings.pack100Price)}
        </button>
      </div>
      <div className="bill-total">
        <span>Total</span>
        <span>{money(cartTotal)}</span>
      </div>
      <div className="payment-box">
        <label className="field-label" htmlFor="payment-method">
          Payment method
        </label>
        <select
          id="payment-method"
          className="payment-select"
          value={state.paymentMethod}
          onChange={(event) =>
            setState((current) => ({
              ...current,
              paymentMethod: event.target.value,
            }))
          }
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
        {state.paymentMethod === "cash" && (
          <>
            <label className="field-label" htmlFor="cash-received">
              Cash received (LKR)
            </label>
            <input
              id="cash-received"
              type="number"
              className="payment-input"
              value={state.cashReceived}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  cashReceived: event.target.value,
                }))
              }
            />
            <div className="change-readout">
              Change: {money(Math.max(0, Number(cashReceived) - cartTotal))}
            </div>
          </>
        )}
      </div>
      <button
        className="checkout-button"
        disabled={
          !state.cart.length ||
          (state.paymentMethod === "cash" &&
            (!Number.isFinite(cashReceived) || cashReceived < cartTotal))
        }
        onClick={checkout}
      >
        Checkout
      </button>
    </section>
  );
}
function Summary({ label, value, wide }) {
  return (
    <div className={`summary-item ${wide ? "wide" : ""}`}>
      <span className="summary-label">{label}</span>
      <strong className="summary-value">{value}</strong>
    </div>
  );
}
function OrderList({
  orders,
  setReceipt,
  refund,
  adminMode,
  readOnly = false,
}) {
  return (
    <ol className="order-list">
      {orders.length ? (
        [...orders].reverse().map((order) => (
          <li
            className={`order-row ${order.status === "refunded" ? "refunded" : ""}`}
            key={order.id}
          >
            <span className="order-number">{order.id}</span>
            <span className="order-detail">
              <span className="order-tier-name">
                {orderCount(order)} item{orderCount(order) === 1 ? "" : "s"}
              </span>
              <span className="order-time">{timeLabel(order.timestamp)}</span>
            </span>
            <span className="order-amount">
              {order.status === "refunded" ? "REFUNDED" : money(order.total)}
            </span>
            {order.status !== "refunded" && (
              <>
                <button
                  className="order-action"
                  onClick={() => setReceipt(order)}
                >
                  View bill
                </button>
                {!readOnly && (
                  <button
                    className="order-action danger"
                    title={adminMode ? "Refund this order" : "Admin access required"}
                    onClick={() => refund(order.id)}
                  >
                    Refund
                  </button>
                )}
              </>
            )}
          </li>
        ))
      ) : (
        <li className="empty-state">No orders logged yet.</li>
      )}
    </ol>
  );
}

function HistoryScreen({ history, setReceipt }) {
  const [selected, setSelected] = useState(null);
  if (selected)
    return (
      <section className="page">
        <button
          className="action-button back-button"
          onClick={() => setSelected(null)}
        >
          ← Back to history
        </button>
        <div className="panel">
          <h2 className="section-heading">{dateLabel(selected.date)}</h2>
          <div className="summary-grid">
            <Summary label="Orders" value={selected.orders.length} />
            <Summary label="Revenue" value={money(selected.totals.revenue)} />
          </div>
          <div className="recon-result matches">
            Stock {selected.reconciliation.status}:{" "}
            {selected.reconciliation.remaining} bananas counted.
          </div>
          <OrderList
            orders={selected.orders}
            setReceipt={setReceipt}
            readOnly
          />
        </div>
      </section>
    );
  return (
    <section className="page">
      <h2 className="section-heading">Past days</h2>
      <div className="panel">
        <ul className="history-list">
          {history.length ? (
            history.map((day) => (
              <li key={`${day.date}-${day.orders[0]?.id || "empty"}`}>
                <button
                  className="history-row"
                  onClick={() => setSelected(day)}
                >
                  <span>
                    <span className="history-date">{dateLabel(day.date)}</span>
                    <span className="history-meta">
                      {day.orders.length} orders · {money(day.totals.revenue)}
                    </span>
                  </span>
                  <span className={`status ${day.reconciliation.status}`}>
                    {day.reconciliation.status}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="empty-state">No finished days yet.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
function Reports({ orders }) {
  const productChartRef = useRef(null);
  const paymentChartRef = useRef(null);
  const report = orders.reduce(
    (result, order) => {
      if (order.status === "refunded") {
        result.refunds += order.total;
        return result;
      }
      (order.items || []).forEach((item) => {
        if (item.product !== "packaging")
          result.products[item.product] =
            (result.products[item.product] || 0) + item.quantity;
      });
      const method = order.payment?.method || "other";
      result.payments[method] = (result.payments[method] || 0) + order.total;
      return result;
    },
    { refunds: 0, products: {}, payments: {} },
  );
  const activeOrders = orders.filter((order) => order.status !== "refunded");
  const netSales = totals(orders).revenue;
  const averageOrder = activeOrders.length ? netSales / activeOrders.length : 0;

  useEffect(() => {
    const productChart = new Chart(productChartRef.current, {
      type: "bar",
      data: {
        labels: PRODUCTS.map((product) => product.name.replace("Chocolate ", "")),
        datasets: [{
          data: PRODUCTS.map((product) => report.products[product.id] || 0),
          backgroundColor: ["#facc15", "#f59e0b", "#fde047", "#eab308", "#d97706"],
          borderRadius: 8,
          borderSkipped: false,
          barThickness: 28,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { displayColors: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#94a3b8", font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: "rgba(255, 255, 255, 0.08)" }, ticks: { precision: 0, color: "#94a3b8" } },
        },
      },
    });
    const paymentLabels = Object.keys(report.payments);
    const paymentChart = new Chart(paymentChartRef.current, {
      type: "doughnut",
      data: {
        labels: paymentLabels.length ? paymentLabels.map((method) => method[0].toUpperCase() + method.slice(1)) : ["No payments"],
        datasets: [{ data: paymentLabels.length ? paymentLabels.map((method) => report.payments[method]) : [1], backgroundColor: ["#facc15", "#f59e0b", "#eab308"], borderWidth: 0, hoverOffset: 4 }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: "68%", plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", usePointStyle: true, padding: 16 } } } },
    });
    return () => { productChart.destroy(); paymentChart.destroy(); };
  }, [orders, report.payments, report.products]);

  return (
    <section className="page reports-page">
      <div className="reports-heading"><div><span className="eyebrow">Performance overview</span><h2 className="section-heading">Today's report</h2><p className="quiet">A live view of the shift, built from completed local receipts.</p></div><span className="report-date">{dateLabel(todayKey())}</span></div>
      <div className="report-kpis"><div className="report-kpi accent"><span>Net sales</span><strong>{money(netSales)}</strong><small>After refunds</small></div><div className="report-kpi"><span>Receipts</span><strong>{activeOrders.length}</strong><small>Completed today</small></div><div className="report-kpi"><span>Average order</span><strong>{money(averageOrder)}</strong><small>Per receipt</small></div><div className="report-kpi"><span>Refunds</span><strong>{money(report.refunds)}</strong><small>Admin actions</small></div></div>
      <div className="report-chart-grid"><section className="report-chart-card"><div className="report-card-heading"><div><span className="eyebrow">Volume</span><h3>Product sales</h3></div><span className="chart-unit">Units</span></div><div className="chart-wrap"><canvas ref={productChartRef} /></div></section><section className="report-chart-card"><div className="report-card-heading"><div><span className="eyebrow">Tender mix</span><h3>Payments</h3></div><span className="chart-unit">Value</span></div><div className="chart-wrap doughnut"><canvas ref={paymentChartRef} /></div></section></div>
      <section className="panel report-detail-panel"><div className="report-card-heading"><div><span className="eyebrow">Breakdown</span><h3>Product detail</h3></div><span className="quiet">{PRODUCTS.length} products</span></div>{PRODUCTS.map((product) => <div className="report-line" key={product.id}><span><strong>{product.name}</strong><small>{product.code}</small></span><strong>{report.products[product.id] || 0} sold</strong></div>)}</section>
    </section>
  );
}

function Settings({
  state,
  setState,
  adminMode,
  adminPinEntry,
  setAdminPinEntry,
  unlockAdmin,
  opening,
  setOpening,
  closing,
  setClosing,
  otherOpening,
  setOtherOpening,
  startShift,
  submitClosing,
  finishAdmin,
  exportData,
  importData,
  handleSync,
  syncInfo,
}) {
  return (
    <section className="page">
      <h2 className="section-heading">Settings</h2>

      <div className="panel">
        <h3 className="subheading">📊 Spreadsheet & Store Sync</h3>
        <p className="quiet">
          Automatically updates <code>DIPZ-Business-Tracker.xlsx</code> on the Admin Laptop whenever an order is marked on the store tablet.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "14px 0" }}>
          <label className="field-label">
            Venue Name
            <input
              type="text"
              value={state.settings.venueName || "Shakshuka Food Park"}
              onChange={(e) =>
                setState((current) => ({
                  ...current,
                  settings: { ...current.settings, venueName: e.target.value },
                }))
              }
            />
          </label>
          <label className="field-label">
            Admin Laptop Sync Endpoint URL
            <input
              type="text"
              placeholder="/api/sync-excel or http://192.168.1.XX:5173/api/sync-excel"
              value={state.settings.syncServerUrl || "/api/sync-excel"}
              onChange={(e) =>
                setState((current) => ({
                  ...current,
                  settings: { ...current.settings, syncServerUrl: e.target.value },
                }))
              }
            />
          </label>
          <label className="field-label">
            Google Sheets Webhook URL (For Remote Sync from Store to Admin at Home)
            <input
              type="text"
              placeholder="https://script.google.com/macros/s/..."
              value={state.settings.googleSheetsUrl || ""}
              onChange={(e) =>
                setState((current) => ({
                  ...current,
                  settings: { ...current.settings, googleSheetsUrl: e.target.value },
                }))
              }
            />
          </label>
        </div>

        <div className="admin-lock" style={{ marginTop: "12px", background: "rgba(250, 204, 21, 0.08)", border: "1px dashed var(--yellow-border)" }}>
          <strong style={{ display: "block", color: "var(--yellow-dark)", marginBottom: "4px" }}>
            🏠 Admin at Home? Use Google Sheets Live Remote Sync!
          </strong>
          <p className="quiet" style={{ margin: 0, fontSize: "13px" }}>
            Import <code>DIPZ-Business-Tracker.xlsx</code> into Google Sheets on Google Drive. Then go to <strong>Extensions &gt; Apps Script</strong>, paste the script code, click <strong>Deploy &gt; Web app (Anyone)</strong>, and paste the generated URL above. Whenever orders are placed at the store, your Google Sheet updates live on your laptop at home!
          </p>
        </div>

        <div className="button-row">
          <button className="action-button primary" onClick={() => handleSync()}>
            ⚡ Sync Excel Tracker Now
          </button>
          <a
            className="action-button"
            href="/api/download-excel"
            download="DIPZ-Business-Tracker.xlsx"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            📥 Download Updated Excel (.xlsx)
          </a>
        </div>
      </div>
      <div className="panel">
        <p className="quiet">Prices and revenue sharing apply to new bills.</p>
        <div className="form-grid two-col">
          {[
            "standardPrice",
            "premiumPrice",
            "dragonfruitPrice",
            "coconutPrice",
            "marshmallowPrice",
            "pack80Price",
            "pack100Price",
            "sharePercent",
          ].map((key) => (
            <label className="field-label" key={key}>
              {key.replace(/Price|Percent/g, " ").replace(/([A-Z])/g, " $1")}
              <input
                type="number"
                value={state.settings[key]}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    settings: {
                      ...current.settings,
                      [key]: Number(event.target.value),
                    },
                  }))
                }
              />
            </label>
          ))}
        </div>
        <button
          className="action-button primary"
          onClick={() =>
            setState((current) => ({
              ...current,
              settings: { ...current.settings },
            }))
          }
        >
          Save settings
        </button>
      </div>
      <div className="panel">
        <h3 className="subheading">Data safety</h3>
        <p className="quiet">
          Export a backup before clearing browser data or moving devices.
        </p>
        <button className="action-button" onClick={exportData}>
          Export backup
        </button>
        <label className="action-button file-button">
          Import backup
          <input
            type="file"
            accept="application/json"
            hidden
            onChange={importData}
          />
        </label>
      </div>
      <div className="panel">
        <h3 className="subheading">Admin controls</h3>
        {!adminMode ? (
          <div className="form-grid two-col">
            <input
              className="payment-input"
              type="password"
              value={adminPinEntry}
              placeholder="Admin PIN"
              onChange={(event) => setAdminPinEntry(event.target.value)}
            />
            <button className="action-button" onClick={unlockAdmin}>
              Unlock admin controls
            </button>
          </div>
        ) : (
          <>
            <div className="form-grid two-col">
              <label className="field-label">
                Opening bananas
                <input
                  type="number"
                  value={opening}
                  onChange={(event) => setOpening(event.target.value)}
                />
              </label>
              <label className="field-label">
                Closing bananas
                <input
                  type="number"
                  value={closing}
                  onChange={(event) => setClosing(event.target.value)}
                />
              </label>
              {Object.keys(otherOpening).map((id) => (
                <label className="field-label" key={id}>
                  {id} opening stock
                  <input
                    type="number"
                    value={otherOpening[id]}
                    onChange={(event) =>
                      setOtherOpening((current) => ({
                        ...current,
                        [id]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="button-row">
              <button className="action-button primary" onClick={startShift}>
                Save opening stock
              </button>
              <button className="action-button primary" onClick={submitClosing}>
                Submit closing count
              </button>
              <button className="action-button" onClick={finishAdmin}>
                Lock controls
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
function Receipt({ order, close }) {
  return (
    <div className="receipt-modal">
      <div className="receipt-card">
        <h2 className="receipt-heading">DIPZ</h2>
        <p className="receipt-meta">
          {order.id} · {dateLabel(order.timestamp.slice(0, 10))} ·{" "}
          {timeLabel(order.timestamp)}
        </p>
        <div className="receipt-lines">
          {order.items.map((item) => (
            <div className="receipt-line" key={`${item.code}-${item.product}`}>
              <span>
                {item.quantity} × {item.name}
              </span>
              <strong>{money(item.price * item.quantity)}</strong>
            </div>
          ))}
        </div>
        <div className="receipt-grand-total">
          <span>Total</span>
          <span>{money(order.total)}</span>
        </div>
        <p className="receipt-meta">
          {order.payment?.method || "cash"}{" "}
          {order.payment?.change
            ? `· Change ${money(order.payment.change)}`
            : ""}
        </p>
        <div className="receipt-actions">
          <button
            className="action-button primary"
            onClick={() => window.print()}
          >
            Print bill
          </button>
          <button className="action-button" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
