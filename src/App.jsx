import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import {
  Truck,
  Package,
  MapPin,
  UserRound,
  Search,
  Menu,
  X,
  ArrowRight,
  ShieldCheck,
  Globe2,
  Clock3,
  CheckCircle2,
  Plus,
  LogOut,
  LayoutDashboard,
  Users,
  Printer,
  MessageCircle,
  Plane,
  Box,
  ChevronRight,
  CircleHelp,
  Sparkles,
  Pencil,
} from "lucide-react";

const STATUSES = [
  "Order Created",
  "Shipped Out",
  "On Transit",
  "Ready for Pickup",
  "Out on Delivery",
  "Delivered Successfully",
];
function date(v) {
  return v
    ? new Date(v).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}
function App() {
  const [db, setDb] = useState({ customers: [], shipments: [] });
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("home"),
    [menu, setMenu] = useState(false),
    [adminTab, setAdminTab] = useState("overview"),
    [tracking, setTracking] = useState(""),
    [pendingTracking, setPendingTracking] = useState(""),
    [notice, setNotice] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [authMode, setAuthMode] = useState("login"),
    [auth, setAuth] = useState({ name: "", email: "", password: "" }),
    [selected, setSelected] = useState(null);
  const say = (s) => {
    setNotice(s);
    setTimeout(() => setNotice(""), 3200);
  };
  const refreshData = useCallback(async (currentUser) => {
    if (!currentUser) {
      setDb({ customers: [], shipments: [] });
      return;
    }
    const [shipments, customers] = await Promise.all([
      api.shipments(),
      currentUser.role === "admin" ? api.customers() : Promise.resolve([]),
    ]);
    setDb({ shipments, customers });
  }, []);
  useEffect(() => {
    let active = true;
    api
      .me()
      .then(async (currentUser) => {
        if (!active) return;
        setUser(currentUser);
        if (currentUser) {
          await refreshData(currentUser);
          if (active)
            setPage(currentUser.role === "admin" ? "admin" : "customer");
        }
      })
      .catch((error) => {
        if (active) say(error.message);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [refreshData]);
  const go = (p) => {
    if (p === "auth" && user) {
      p = user.role === "admin" ? "admin" : "customer";
    }
    if (["customer", "admin", "track"].includes(p) && !user) {
      setAuthMode("login");
      setPage("auth");
      say("Sign in to access your account.");
      return;
    }
    if (p === "admin" && user?.role !== "admin") {
      say("Administrator access is required.");
      return;
    }
    if (p === "customer" && user?.role !== "customer") {
      say("Customer access is required.");
      return;
    }
    setPage(p);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const showAuth = (mode = "login") => {
    setAuthMode(mode);
    go("auth");
  };
  const navigateToSection = (id) => {
    setMenu(false);
    const scroll = () =>
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    if (page === "home") {
      scroll();
      return;
    }
    setPage("home");
    window.requestAnimationFrame(() => window.requestAnimationFrame(scroll));
  };
  const openRecentShipments = () => {
    if (!user) {
      showAuth("login");
      say("Sign in to view your recent shipments.");
      return;
    }
    if (user.role === "admin") {
      setAdminTab("shipments");
      go("admin");
      return;
    }
    go("customer");
  };
  const startShipping = () => {
    if (!user) {
      showAuth("register");
      return;
    }
    if (user.role === "admin") {
      setAdminTab("create");
      go("admin");
      return;
    }
    say("Shipment orders are created by the QuickEx delivery team.");
  };
  const openShipment = async (trackingId, currentUser = user) => {
    if (!currentUser) {
      setPendingTracking(trackingId);
      setAuthMode("login");
      setPage("auth");
      say("Sign in to view this shipment.");
      return;
    }
    try {
      const shipment = await api.shipment(trackingId);
      setSelected(shipment);
      setPage("track");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      say(error.message);
    }
  };
  const finishAuthentication = async (currentUser) => {
    setUser(currentUser);
    setAuth({ name: "", email: "", password: "" });
    try {
      await refreshData(currentUser);
    } catch (error) {
      say(error.message);
    }
    const trackingId = pendingTracking;
    setPendingTracking("");
    if (trackingId) {
      await openShipment(trackingId, currentUser);
      return;
    }
    setPage(currentUser.role === "admin" ? "admin" : "customer");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const track = async (id) => {
    const trackingId = String(id || "").trim();
    if (!trackingId) {
      say("Enter a tracking ID.");
      return;
    }
    setTracking(trackingId);
    await openShipment(trackingId);
  };
  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await finishAuthentication(
        await api.login({ email: auth.email, password: auth.password }),
      );
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  };
  const register = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await finishAuthentication(
        await api.register({
          name: auth.name,
          email: auth.email,
          password: auth.password,
        }),
      );
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    try {
      await api.logout();
      setUser(null);
      setSelected(null);
      setDb({ customers: [], shipments: [] });
      setPage("home");
      setMenu(false);
      say("You have signed out.");
    } catch (error) {
      say(error.message);
    }
  };
  const addComment = async (comment) => {
    try {
      const shipment = await api.addComment(selected.trackingId, comment);
      setSelected(shipment);
      await refreshData(user);
    } catch (error) {
      say(error.message);
      throw error;
    }
  };
  const current = selected;
  if (!ready)
    return (
      <div className="loading-screen" role="status">
        Loading QuickEx…
      </div>
    );
  return (
    <div className="app">
      <header className="topbar">
        <div className="nav-wrap">
          <button className="brand" onClick={() => go("home")}>
            <span className="brand-icon">
              <Truck size={25} />
            </span>
            <span>
              Quick<span>Ex</span>
              <small>QUICK EXPRESS PARCEL DELIVERY</small>
            </span>
          </button>
          <nav className={menu ? "nav open" : "nav"}>
            <button onClick={() => go("home")}>Home</button>
            <button onClick={openRecentShipments}>
              Recent Shipments
            </button>
            <button onClick={() => navigateToSection("tracking-box")}>
              Tracking
            </button>
            <button onClick={() => navigateToSection("delivery-info")}>
              Locations
            </button>
            <button onClick={() => go("support")}>Support</button>
          </nav>
          <div className="nav-actions">
            {user ? (
              <>
                <button
                  className="nav-user"
                  aria-label={user.name}
                  onClick={() =>
                    go(user.role === "admin" ? "admin" : "customer")
                  }
                >
                  <UserRound size={16} />
                  {user.name.split(" ")[0]}
                </button>
                <button
                  className="signout-btn"
                  aria-label="Sign out"
                  onClick={signOut}
                >
                  <LogOut size={15} />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <button
                className="nav-login"
                onClick={() => showAuth("login")}
              >
                Sign Up or Log In <UserRound size={17} />
              </button>
            )}
            <button className="mobile-menu" onClick={() => setMenu(!menu)}>
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {notice && <div className="toast">{notice}</div>}
      {page === "home" && (
        <>
          <section className="hero">
            <div className="hero-shade"></div>
            <div className="hero-content">
              <div className="eyebrow">
                <span></span> QUICK EXPRESS PARCEL DELIVERY
              </div>
              <h1>
                Ship further
                <br />
                for what’s <em>next.</em>
              </h1>
              <p>
                Reliable shipping solutions to help your business and your world
                move forward.
              </p>
              <div className="hero-buttons">
                {!user ? (
                  <button
                    className="primary"
                    onClick={() => showAuth("register")}
                  >
                    Register now <ArrowRight size={17} />
                  </button>
                ) : (
                  <button className="primary" onClick={openRecentShipments}>
                    {user.role === "admin"
                      ? "Manage shipments"
                      : "Recent shipments"}{" "}
                    <ArrowRight size={17} />
                  </button>
                )}
                <button
                  className="ghost-light"
                  onClick={() => navigateToSection("tracking-box")}
                >
                  Track a package
                </button>
              </div>
            </div>
            <div className="hero-tag">
              <Plane size={18} /> Moving your world forward
            </div>
          </section>
          <section className="quick-links" aria-label="Quick shipping links">
            <button onClick={() => (user ? openRecentShipments() : showAuth("register"))}>
              <Box size={20} />
              <span>{user ? "Recent shipments" : "Get a quote"}</span>
            </button>
            <button onClick={startShipping}>
              <Package size={20} />
              <span>{user?.role === "admin" ? "Create shipment" : "Ship now"}</span>
            </button>
            <button onClick={() => navigateToSection("delivery-info")}>
              <MapPin size={20} />
              <span>Worldwide delivery</span>
            </button>
            <button onClick={() => go("support")}>
              <CircleHelp size={20} />
              <span>Get support</span>
            </button>
          </section>
          <section className="track-panel" id="tracking-box">
            <div className="track-icon">
              <Package size={24} />
            </div>
            <div className="track-copy">
              <h2>Where is your package?</h2>
              <p>
                Enter your QuickEx tracking number to get the latest delivery
                updates.
              </p>
            </div>
            <form
              className="track-form"
              onSubmit={(e) => {
                e.preventDefault();
                track(tracking);
              }}
            >
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="Enter tracking number"
                aria-label="Tracking number"
              />
              <button className="primary" disabled={busy}>
                TRACK PACKAGE <ArrowRight size={16} />
              </button>
            </form>
          </section>
          <section className="section intro" id="why-quickex">
            <div className="intro-copy">
              <div className="section-heading">
                <span className="kicker">WHY SHIP WITH US</span>
                <h2>Shipping that works harder for you.</h2>
                <p>
                  From everyday deliveries to global shipments, we make it
                  easier to keep your business and life moving forward.
                </p>
              </div>
              <div className="feature-grid">
                <Feature
                  icon={<Truck />}
                  title="Reliable shipping"
                  text="Count on consistent pickup and delivery, with real-time updates at every step."
                />
                <Feature
                  icon={<Sparkles />}
                  title="Professional-rate options"
                  text="Access competitive rates and services designed for your business needs."
                />
                <Feature
                  icon={<Globe2 />}
                  title="Worldwide coverage"
                  text="Ship to more destinations with dependable service and clear tracking."
                />
                <Feature
                  icon={<UserRound />}
                  title="Personalized pricing"
                  text="Get solutions tailored to your shipping volume and preferences."
                />
              </div>
              <button
                className="primary intro-cta"
                onClick={startShipping}
              >
                Start shipping now <ArrowRight size={16} />
              </button>
            </div>
            <img
              className="intro-photo"
              src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1000&q=85"
              alt="QuickEx team preparing parcels for delivery"
            />
          </section>
          <section className="delivery-info section" id="delivery-info">
            <div className="delivery-info-heading">
              <span className="kicker">DELIVERY INFORMATION</span>
              <h2>We deliver worldwide.</h2>
              <p>
                QuickEx connects your shipments to destinations around the
                world. Check the latest tracking updates for the route, location
                and delivery status of your package.
              </p>
              <button
                className="primary"
                onClick={() => navigateToSection("tracking-box")}
              >
                Track a shipment <ArrowRight size={16} />
              </button>
            </div>
            <div className="delivery-info-cards">
              <article>
                <Globe2 />
                <h3>Worldwide destinations</h3>
                <p>View shipment progress from origin through final delivery.</p>
              </article>
              <article>
                <MapPin />
                <h3>Location updates</h3>
                <p>See the latest facility or delivery location recorded.</p>
              </article>
              <article>
                <Clock3 />
                <h3>Delivery progress</h3>
                <p>Follow each status update added to your shipment history.</p>
              </article>
            </div>
          </section>
          <section className="section cards-section">
            <div className="center-head">
              <span className="kicker">DELIVERY MANAGEMENT MADE SIMPLE</span>
              <h2>Helpful tools for every delivery.</h2>
              <p>
                Helpful tools and resources to keep you informed from pickup to
                delivery.
              </p>
            </div>
            <div className="service-grid">
              <Service
                image="https://images.unsplash.com/photo-1590650153855-d9e808231d41?auto=format&fit=crop&w=800&q=80"
                title="Instant support and help resources"
                text="Get quick answers, manage your shipments and find the support you need."
                link="GET SUPPORT"
                onClick={() => go("support")}
              />
              <Service
                image="https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80"
                title="Mobile delivery updates"
                text="Track your package and receive timely notifications wherever you are."
                link="TRACK A PACKAGE"
                onClick={() => navigateToSection("tracking-box")}
              />
              <Service
                image="https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=800&q=80"
                title="Secure proof of delivery"
                text="Get delivery confirmation when your package reaches its destination."
                link="LEARN MORE"
                onClick={() => navigateToSection("delivery-info")}
              />
            </div>
          </section>
          <section className="seasonal section">
            <div>
              <span className="kicker">SEASONAL SHIPPING</span>
              <h2>Be ready for what’s ahead.</h2>
              <p>
                Keep your deliveries on track with helpful information on
                shipping deadlines, service updates and other tips to plan
                ahead.
              </p>
              <button
                className="primary"
                onClick={() => navigateToSection("delivery-info")}
              >
                Delivery information <ArrowRight size={16} />
              </button>
            </div>
            <img
              src="https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=1000&q=85"
              alt="Cargo containers ready for seasonal shipping"
            />
          </section>
          <section className="business-updates section">
            <img
              src="https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=1000&q=85"
              alt="Small business owner packing an order"
            />
            <div>
              <span className="kicker">BUSINESS UPDATES</span>
              <h2>Get ready for international shipments.</h2>
              <p>
                Prepare for changing requirements and customs processes so your
                deliveries keep moving. Learn practical tips to ship globally
                with confidence.
              </p>
              <button
                className="text-btn"
                onClick={() => navigateToSection("delivery-info")}
              >
                Explore shipping <ArrowRight size={14} />
              </button>
            </div>
          </section>
        </>
      )}
      {page === "auth" && (
        <main className="auth-layout">
          <div className="auth-aside">
            <span className="kicker">WELCOME TO QUICKEX</span>
            <h1>
              {authMode === "login"
                ? "Good to see you again."
                : "Your next delivery starts here."}
            </h1>
            <p>
              Sign in to follow your packages, review shipment history and stay
              in control of every delivery.
            </p>
            <div className="aside-stat">
              <Package />
              <div>
                <b>Best place for your fast Parcel Delivery.</b>
                <small>Track your Shipments faster.</small>
              </div>
            </div>
          </div>
          <div className="auth-card">
            <div className="auth-tabs">
              <button
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                Log in
              </button>
              <button
                className={authMode === "register" ? "active" : ""}
                onClick={() => setAuthMode("register")}
              >
                Create account
              </button>
            </div>
            <h2>
              {authMode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="muted">
              {authMode === "login"
                ? "Enter your details to access your dashboard."
                : "A few details and you are ready to track."}
            </p>
            <form
              onSubmit={authMode === "login" ? login : register}
              className="stack-form"
            >
              {authMode === "register" && (
                <label>
                  Full name
                  <input
                    required
                    value={auth.name}
                    onChange={(e) => setAuth({ ...auth, name: e.target.value })}
                    placeholder="Your full name"
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  required
                  type="email"
                  value={auth.email}
                  onChange={(e) => setAuth({ ...auth, email: e.target.value })}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                Password
                <input
                  required
                  minLength="12"
                  type="password"
                  value={auth.password}
                  onChange={(e) =>
                    setAuth({ ...auth, password: e.target.value })
                  }
                  placeholder="At least 12 characters"
                />
              </label>
              <button className="primary full" disabled={busy}>
                {authMode === "login"
                  ? "Log in to your account"
                  : "Create account"}{" "}
                <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </main>
      )}
      {page === "support" && (
        <SupportPage
          tracking={tracking}
          setTracking={setTracking}
          onTrack={track}
          onRecentShipments={openRecentShipments}
          onDeliveryInfo={() => navigateToSection("delivery-info")}
        />
      )}
      {page === "customer" && user?.role === "customer" && (
        <Customer
          user={user}
          shipments={db.shipments}
          onTrack={(s) => openShipment(s.trackingId)}
          onBrowse={() => go("home")}
        />
      )}
      {page === "track" && current && (
        <TrackPage
          shipment={current}
          user={user}
          canComment={
            user?.role === "customer" &&
            user.email.toLowerCase() === current.email?.toLowerCase()
          }
          onBack={() =>
            go(
              user
                ? user.role === "admin"
                  ? "admin"
                  : "customer"
                : "home",
            )
          }
          onComment={addComment}
        />
      )}
      {page === "admin" && user?.role === "admin" && (
        <Admin
          db={db}
          user={user}
          activeTab={adminTab}
          onTabChange={setAdminTab}
          refreshData={refreshData}
          onTrack={(s) => {
            setSelected(s);
            setAdminTab("shipments");
            go("track");
          }}
          say={say}
        />
      )}
      {page !== "home" && page !== "auth" && !user && (
        <div className="empty-state">
          <h2>Please log in to continue</h2>
          <button className="primary" onClick={() => go("auth")}>
            Log in
          </button>
        </div>
      )}
      <footer>
        <div className="footer-top">
          <button className="brand footer-brand" onClick={() => go("home")}>
            <span className="brand-icon">
              <Truck />
            </span>
            <span>
              Quick<span>Ex</span>
              <small>QUICK EXPRESS PARCEL DELIVERY</small>
            </span>
          </button>
          <p>Shipping made simple. Moving your world forward.</p>
          <button
            className="outline"
            onClick={() => (user ? openRecentShipments() : showAuth("register"))}
          >
            {user ? "My account" : "Get started"} <ArrowRight size={15} />
          </button>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} QuickEx Delivery.
          </span>
          <span>Shipping · Tracking · Support</span>
        </div>
      </footer>
    </div>
  );
}
function Feature({ icon, title, text }) {
  return (
    <div className="feature">
      <span className="feature-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Service({ image, title, text, link, onClick }) {
  return (
    <div className="service-card">
      <img src={image} alt="" loading="lazy" />
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="service-action" onClick={onClick}>
        {link} <ArrowRight size={14} />
      </button>
    </div>
  );
}
function Customer({ user, shipments, onTrack, onBrowse }) {
  return (
    <main className="dashboard">
      <div className="dash-heading">
        <div>
          <span className="kicker">Track your Shipments faster.</span>
          <h1>Hello, {user.name.split(" ")[0]}.</h1>
          <p>Here is what is happening with your shipments.</p>
        </div>
        <button className="primary" onClick={onBrowse}>
          Track another package <Search size={16} />
        </button>
      </div>
      <div className="stats">
        <Stat
          label="My shipments"
          value={shipments.length}
          icon={<Package />}
        />
        <Stat
          label="In progress"
          value={
            shipments.filter((s) => s.status !== "Delivered Successfully")
              .length
          }
          icon={<Truck />}
        />
        <Stat
          label="Delivered"
          value={
            shipments.filter((s) => s.status === "Delivered Successfully")
              .length
          }
          icon={<CheckCircle2 />}
        />
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>My shipments</h2>
            <p>All packages connected to your account.</p>
          </div>
          <span className="pill">{shipments.length} TOTAL</span>
        </div>
        {shipments.length === 0 ? (
          <div className="empty-state">
            <Package size={34} />
            <h3>No shipments yet</h3>
            <p>
              When an administrator creates a shipment for your email, it will
              appear here.
            </p>
          </div>
        ) : (
          <div className="shipment-list">
            {shipments.map((s) => (
              <article className="shipment-row" key={s.id}>
                <div className="shipment-symbol">
                  <Package />
                </div>
                <div className="shipment-main">
                  <b>{s.trackingId}</b>
                  <span>
                    {s.origin} <ArrowRight size={12} /> {s.destination}
                  </span>
                  <small>
                    Recipient: {s.recipient} · Created {date(s.createdAt)}
                  </small>
                </div>
                <div className="shipment-status">
                  <Status value={s.status} />
                  <small>ETA: {s.eta || "Not set"}</small>
                </div>
                <button className="outline" onClick={() => onTrack(s)}>
                  View details <ChevronRight size={15} />
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="account-note">
        <ShieldCheck />
        <div>
          <b>Your account is ready</b>
          <p>
            Use the tracking number provided by QuickEx to view your package
            journey and leave a recipient comment.
          </p>
        </div>
      </div>
    </main>
  );
}
function Stat({ label, value, icon }) {
  return (
    <div className="stat">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
function Status({ value }) {
  let cls =
    value === "Delivered Successfully"
      ? "green"
      : value === "Out on Delivery"
        ? "orange"
        : "purple";
  return (
    <span className={"status " + cls}>
      <i />
      {value}
    </span>
  );
}
function TrackPage({ shipment: s, user, canComment, onBack, onComment }) {
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  return (
    <main className="dashboard track-page">
      <div className="tracking-watermark" aria-hidden="true">
        QUICKEX
      </div>
      <button className="back-link" onClick={onBack}>
        ← Back to dashboard
      </button>
      <div className="track-title">
        <div>
          <span className="track-brandline">
            <Truck size={15} /> QUICKEX LOGISTICS · SHIPMENT RECORD
          </span>
          <h1>{s.trackingId}</h1>
          <p>
            Shipment details and the latest movement updates · Created {date(s.createdAt)}
          </p>
        </div>
        <button className="outline print-btn" onClick={() => window.print()}>
          <Printer size={16} /> Print shipment
        </button>
      </div>
      <div className="tracking-summary">
        <div>
          <small>CURRENT STATUS</small>
          <Status value={s.status} />
        </div>
        <div>
          <small>ORIGIN</small>
          <b>{s.origin}</b>
        </div>
        <div>
          <small>DESTINATION</small>
          <b>{s.destination}</b>
        </div>
        <div>
          <small>ESTIMATED DELIVERY</small>
          <b>{s.eta || "To be confirmed"}</b>
        </div>
      </div>
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Shipment journey</h2>
              <p>Every milestone recorded by the delivery team.</p>
            </div>
            <span className="pill">{s.updates.length} UPDATES</span>
          </div>
          <div className="timeline">
            {[...s.updates].reverse().map((u, i) => (
              <div className="timeline-item" key={i}>
                <span className="timeline-dot">
                  {u.status === "Delivered Successfully" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Truck size={15} />
                  )}
                </span>
                <div>
                  <b>{u.status}</b>
                  <p>
                    <MapPin size={13} />{" "}
                    {u.location || "Location not specified"}
                  </p>
                  <span>{u.note}</span>
                  <small>{date(u.at)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel recipient-panel">
          <h2>Recipient information</h2>
          <Info label="Recipient" value={s.recipient} />
          <Info label="Email" value={s.email} />
          <Info label="Delivery address" value={s.address} />
          <Info label="Country" value={s.country} />
          <Info
            label="Package contents"
            value={s.contents || "Not specified"}
          />
          <div className="comment-box">
            <h3>
              <MessageCircle size={17} /> Recipient comments
            </h3>
            {s.comments?.length ? (
              s.comments.map((c, i) => (
                <div className="comment" key={i}>
                  <b>{c.by}</b>
                  <p>{c.text}</p>
                  <small>{date(c.at)}</small>
                </div>
              ))
            ) : (
              <p className="muted">No comments yet.</p>
            )}
            {canComment && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  setPosting(true);
                  Promise.resolve(onComment(comment.trim()))
                    .then(() => setComment(""))
                    .catch(() => {})
                    .finally(() => setPosting(false));
                }}
              >
                <textarea
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Leave a delivery comment..."
                />
                <button className="primary full" disabled={posting}>
                  Post comment <ArrowRight size={15} />
                </button>
              </form>
            )}
            {!user && (
              <p className="muted">Log in to leave a recipient comment.</p>
            )}
            {user && !canComment && (
              <p className="muted">
                Sign in with the recipient’s account to leave a comment.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
function Info({ label, value }) {
  return (
    <div className="info-line">
      <small>{label}</small>
      <b>{value || "—"}</b>
    </div>
  );
}
function SupportPage({
  tracking,
  setTracking,
  onTrack,
  onRecentShipments,
  onDeliveryInfo,
}) {
  return (
    <main className="support-page">
      <section className="support-hero">
        <span className="kicker">QUICKEX SUPPORT</span>
        <h1>Help with your shipment, every step of the way.</h1>
        <p>
          Look up your tracking updates or find out what each shipment status
          means.
        </p>
        <form
          className="support-track-form"
          onSubmit={(event) => {
            event.preventDefault();
            onTrack(tracking);
          }}
        >
          <label htmlFor="support-tracking">Tracking ID</label>
          <div>
            <input
              id="support-tracking"
              required
              value={tracking}
              onChange={(event) => setTracking(event.target.value)}
              placeholder="Enter your tracking ID"
            />
            <button className="primary">
              Get tracking updates <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </section>
      <section className="support-grid" aria-label="Shipment help">
        <article className="panel">
          <span className="support-icon">
            <Package />
          </span>
          <h2>View recent shipments</h2>
          <p>
            Sign in to see shipments linked to your account and open their
            delivery history.
          </p>
          <button className="text-btn" onClick={onRecentShipments}>
            View shipments <ArrowRight size={14} />
          </button>
        </article>
        <article className="panel">
          <span className="support-icon">
            <MapPin />
          </span>
          <h2>Understand tracking updates</h2>
          <p>
            Each update includes the current status, the latest recorded
            location and a delivery note.
          </p>
          <button className="text-btn" onClick={onDeliveryInfo}>
            Explore delivery information <ArrowRight size={14} />
          </button>
        </article>
        <article className="panel support-status-panel">
          <span className="support-icon">
            <Clock3 />
          </span>
          <h2>Shipment status guide</h2>
          <ol>
            {STATUSES.map((status) => (
              <li key={status}>{status}</li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
}
function emptyShipmentForm() {
  return {
    recipient: "",
    email: "",
    address: "",
    country: "Nigeria",
    origin: "Lagos, Nigeria",
    destination: "",
    contents: "",
    eta: "",
  };
}
function Admin({
  db,
  user,
  activeTab,
  onTabChange,
  refreshData,
  onTrack,
  say,
}) {
  const [tab, setTabState] = useState(activeTab),
    [form, setForm] = useState(emptyShipmentForm),
    [editingId, setEditingId] = useState(null),
    [query, setQuery] = useState(""),
    [saving, setSaving] = useState(false);
  const setTab = (nextTab) => {
    setTabState(nextTab);
    onTabChange(nextTab);
  };
  useEffect(() => setTabState(activeTab), [activeTab]);
  const shipments = db.shipments;
  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const shipment = await api.createShipment(form);
      await refreshData(user);
      setForm(emptyShipmentForm());
      say("Shipment created. Tracking ID: " + shipment.trackingId);
      setTab("shipments");
    } catch (error) {
      say(error.message);
    } finally {
      setSaving(false);
    }
  };
  const startEdit = (shipment) => {
    setEditingId(shipment.id);
    setForm({
      recipient: shipment.recipient || "",
      email: shipment.email || "",
      address: shipment.address || "",
      country: shipment.country || "",
      origin: shipment.origin || "",
      destination: shipment.destination || "",
      contents: shipment.contents || "",
      eta: shipment.eta || "",
    });
    setTab("edit");
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateShipment(editingId, form);
      await refreshData(user);
      setEditingId(null);
      setTab("shipments");
      say("Shipment details saved.");
    } catch (error) {
      say(error.message);
    } finally {
      setSaving(false);
    }
  };
  const cancelEdit = () => {
    setEditingId(null);
    setTab("shipments");
  };
  const changeStatus = async (id, status, location, note) => {
    try {
      await api.updateStatus(id, { status, location, note });
      await refreshData(user);
      say("Shipment status updated.");
    } catch (error) {
      say(error.message);
      throw error;
    }
  };
  const filtered = shipments.filter((s) =>
    [s.trackingId, s.recipient, s.email]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <main className="admin-shell">
      <aside className="admin-side">
        <div className="admin-label">ADMIN CONSOLE</div>
        <button
          className={tab === "overview" ? "selected" : ""}
          onClick={() => setTab("overview")}
        >
          <LayoutDashboard /> Overview
        </button>
        <button
          className={tab === "shipments" ? "selected" : ""}
          onClick={() => setTab("shipments")}
        >
          <Package /> Shipments
        </button>
        <button
          className={tab === "create" ? "selected" : ""}
          onClick={() => setTab("create")}
        >
          <Plus /> Create order
        </button>
        <button
          className={tab === "customers" ? "selected" : ""}
          onClick={() => setTab("customers")}
        >
          <Users /> Customers
        </button>
        <div className="admin-side-bottom">
          <ShieldCheck />
          <span>
            QuickEx secure
            <br />
            admin workspace
          </span>
        </div>
      </aside>
      <div className="admin-content">
        <div className="admin-top">
          <div>
            <span className="kicker">
              Track. Manage. Update. and many more...
            </span>
            <h1>
              {tab === "overview"
                ? "Dashboard overview"
                : tab === "shipments"
                  ? "Shipment management"
                  : tab === "create"
                    ? "Create a shipment"
                    : tab === "edit"
                      ? "Edit shipment details"
                    : "Customer directory"}
            </h1>
          </div>
          <span className="admin-avatar">QA</span>
        </div>
        {tab === "overview" && (
          <>
            <div className="stats admin-stats">
              <Stat
                label="Total shipments"
                value={shipments.length}
                icon={<Package />}
              />
              <Stat
                label="In transit"
                value={
                  shipments.filter((s) =>
                    ["Shipped Out", "On Transit", "Out on Delivery"].includes(
                      s.status,
                    ),
                  ).length
                }
                icon={<Truck />}
              />
              <Stat
                label="Ready for pickup"
                value={
                  shipments.filter((s) => s.status === "Ready for Pickup")
                    .length
                }
                icon={<MapPin />}
              />
              <Stat
                label="Delivered"
                value={
                  shipments.filter((s) => s.status === "Delivered Successfully")
                    .length
                }
                icon={<CheckCircle2 />}
              />
            </div>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Recent shipments</h2>
                  <p>Latest orders and delivery activity.</p>
                </div>
                <button
                  className="text-btn"
                  onClick={() => setTab("shipments")}
                >
                  View all <ArrowRight size={14} />
                </button>
              </div>
              <ShipmentTable
                rows={shipments.slice(0, 5)}
                onTrack={onTrack}
                onStatus={changeStatus}
                onEdit={startEdit}
              />
            </div>
            <div className="quick-create">
              <div>
                <h3>Need to register a new package?</h3>
                <p>
                  Create an order and generate a unique tracking ID for the
                  recipient.
                </p>
              </div>
              <button className="primary" onClick={() => setTab("create")}>
                Create new order <Plus size={16} />
              </button>
            </div>
          </>
        )}
        {tab === "create" && (
          <div className="panel create-panel">
            <div className="panel-head">
              <div>
                <h2>New package order</h2>
                <p>
                  Enter recipient and shipment details. A tracking ID is
                  generated automatically.
                </p>
              </div>
              <span className="pill">NEW ORDER</span>
            </div>
            <form className="admin-form" onSubmit={create}>
              <ShipmentFields form={form} setForm={setForm} />
              <div className="wide form-submit">
                <button className="primary" disabled={saving}>
                  Create order & generate tracking ID <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        )}
        {tab === "edit" && (
          <div className="panel create-panel">
            <div className="panel-head">
              <div>
                <h2>Update shipment details</h2>
                <p>
                  Changes are saved immediately and will appear in the
                  recipient’s tracking view.
                </p>
              </div>
              <button className="outline" type="button" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
            <form className="admin-form" onSubmit={saveEdit}>
              <div className="form-section-title">
                TRACKING ID:{" "}
                {shipments.find((shipment) => shipment.id === editingId)
                  ?.trackingId || "Shipment"}
              </div>
              <ShipmentFields form={form} setForm={setForm} />
              <div className="wide form-submit">
                <button className="primary" disabled={saving}>
                  Save shipment details <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        )}
        {tab === "shipments" && (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>All shipments</h2>
                <p>Search, inspect and update package status.</p>
              </div>
              <span className="pill">{shipments.length} RECORDS</span>
            </div>
            <div className="table-tools">
              <div className="search-input">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tracking ID, recipient or email"
                />
              </div>
              <button className="primary" onClick={() => setTab("create")}>
                <Plus size={15} /> New order
              </button>
            </div>
            <ShipmentTable
              rows={filtered}
              onTrack={onTrack}
              onStatus={changeStatus}
              onEdit={startEdit}
            />
          </div>
        )}
        {tab === "customers" && (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Registered customers</h2>
                <p>All registered customer accounts.</p>
              </div>
              <span className="pill">{db.customers.length} CUSTOMERS</span>
            </div>
            <div className="customer-list">
              {db.customers.map((c) => (
                <div className="customer-row" key={c.id}>
                  <span className="customer-avatar">
                    {c.name
                      .split(" ")
                      .map((x) => x[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div>
                    <b>{c.name}</b>
                    <small>{c.email}</small>
                  </div>
                  <span className="pill">
                    {c.shipmentCount || 0} shipments
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
function ShipmentFields({ form, setForm }) {
  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));
  return (
    <>
      <div className="form-section-title">RECIPIENT DETAILS</div>
      <label>
        Recipient's full name
        <input
          required
          value={form.recipient}
          onChange={update("recipient")}
          placeholder="Full name"
        />
      </label>
      <label>
        Recipient email
        <input
          required
          type="email"
          value={form.email}
          onChange={update("email")}
          placeholder="recipient@email.com"
        />
      </label>
      <label className="wide">
        Delivery address
        <input
          required
          value={form.address}
          onChange={update("address")}
          placeholder="Street, city, postal code"
        />
      </label>
      <label>
        Country
        <input required value={form.country} onChange={update("country")} />
      </label>
      <label>
        Package contents
        <input
          value={form.contents}
          onChange={update("contents")}
          placeholder="e.g. Documents"
        />
      </label>
      <div className="form-section-title">SHIPMENT ROUTE</div>
      <label>
        Origin
        <input required value={form.origin} onChange={update("origin")} />
      </label>
      <label>
        Destination
        <input
          required
          value={form.destination}
          onChange={update("destination")}
          placeholder="City, country"
        />
      </label>
      <label>
        Estimated delivery
        <input type="date" value={form.eta} onChange={update("eta")} />
      </label>
    </>
  );
}
function ShipmentTable({ rows, onTrack, onStatus, onEdit }) {
  const [pending, setPending] = useState(null);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const requestStatusUpdate = (shipment, status) => {
    setPending({ id: shipment.id, trackingId: shipment.trackingId, status });
    setLocation(shipment.destination || shipment.origin || "");
    setNote(`Shipment status updated to ${status.toLowerCase()}.`);
  };
  const saveStatusUpdate = async (event) => {
    event.preventDefault();
    if (!pending) return;
    setSaving(true);
    try {
      await onStatus(pending.id, pending.status, location.trim(), note.trim());
      setPending(null);
    } catch {
      // The parent displays the server error; keep the form open for correction.
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>TRACKING ID</th>
            <th>RECIPIENT</th>
            <th>ROUTE</th>
            <th>STATUS</th>
            <th>UPDATE STATUS</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>
                <b className="tracking-code">{s.trackingId}</b>
                <small>{date(s.createdAt)}</small>
              </td>
              <td>
                <b>{s.recipient}</b>
                <small>{s.email}</small>
              </td>
              <td>
                {s.origin}
                <small>to {s.destination}</small>
              </td>
              <td>
                <Status value={s.status} />
              </td>
              <td>
                <select
                  value={s.status}
                  onChange={(e) => {
                    requestStatusUpdate(s, e.target.value);
                  }}
                >
                  {STATUSES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  className="icon-btn"
                  onClick={() => requestStatusUpdate(s, s.status)}
                  title="Add tracking update"
                  aria-label={`Add tracking update for ${s.trackingId}`}
                >
                  <MapPin />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => onTrack(s)}
                  title="View shipment"
                  aria-label={`View shipment ${s.trackingId}`}
                >
                  <ChevronRight />
                </button>
                <button
                  className="icon-btn edit-btn"
                  onClick={() => onEdit(s)}
                  title="Edit shipment"
                  aria-label={`Edit shipment ${s.trackingId}`}
                >
                  <Pencil />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="empty-state">No matching shipments.</div>
      )}
      {pending && (
        <div className="modal-backdrop">
          <form
            className="status-modal"
            onSubmit={saveStatusUpdate}
            role="dialog"
            aria-modal="true"
            aria-label="Update shipment status"
          >
            <div className="panel-head">
              <div>
                <h2>Update shipment status</h2>
                <p>{pending.trackingId}</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPending(null)}
                aria-label="Cancel status update"
              >
                <X size={17} />
              </button>
            </div>
            <label>
              Shipment status
              <select
                value={pending.status}
                onChange={(event) =>
                  setPending({ ...pending, status: event.target.value })
                }
              >
                {STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Current location
              <input
                required
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="City, facility or pickup point"
              />
            </label>
            <label>
              Tracking note
              <textarea
                required
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add an update for the recipient"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="outline"
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                Save status update <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
export default App;
