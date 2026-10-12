
import { useCallback, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "./firebase";

const API = "http://127.0.0.1:8000";

const GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const ROLES = ["Donor", "Hospital", "Blood Bank"];

const emptyDonor = {
  blood_group: "O+",
  age: "",
  phone: "",
  city: "",
  available: false,
  last_donation_date: "",
};

const emptyStock = {
  blood_group: "O+",
  units: "",
  city: "",
  expiry_date: "",
};

const emptyRequirement = {
  blood_group: "O+",
  units_needed: "1",
  city: "",
  urgency: "Normal",
  contact_phone: "",
  notes: "",
};

async function api(path, firebaseUser, method = "GET", body = null) {
  const token = await firebaseUser.getIdToken();

  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.detail || data.message || `Request failed (${response.status})`
    );
  }

  return data;
}

function ContactLinks({ name, email, phone }) {
  return (
    <div className="space-y-1 text-sm">
      {name && <p className="font-semibold text-slate-800">{name}</p>}

      {email ? (
        <p>
          <span className="text-slate-500">Email: </span>
          <a
            href={`mailto:${email}`}
            className="break-all text-blue-700 underline"
          >
            {email}
          </a>
        </p>
      ) : (
        <p className="text-slate-500">Email not provided</p>
      )}

      {phone ? (
        <p>
          <span className="text-slate-500">Phone: </span>
          <a
            href={`tel:${phone}`}
            className="text-blue-700 underline"
          >
            {phone}
          </a>
        </p>
      ) : (
        <p className="text-slate-500">Phone not provided</p>
      )}
    </div>
  );
}

function Card({ title, children, className = "" }) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      {title && (
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  options,
  placeholder = "",
  required = false,
  min,
  max,
  disabled = false,
}) {
  const common =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 disabled:bg-slate-100";

  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>

      {options ? (
        <select
          className={common}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={common}
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          min={min}
          max={max}
          disabled={disabled}
        />
      )}
    </label>
  );
}

function Button({
  children,
  onClick,
  type = "button",
  disabled = false,
  variant = "primary",
}) {
  const colors =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : variant === "secondary"
        ? "bg-slate-200 text-slate-800 hover:bg-slate-300"
        : variant === "success"
          ? "bg-emerald-600 hover:bg-emerald-700"
          : "bg-rose-600 hover:bg-rose-700";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${colors} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();

  const color =
    normalized === "approved" ||
    normalized === "accepted" ||
    normalized === "open"
      ? "bg-emerald-100 text-emerald-800"
      : normalized === "rejected" ||
          normalized === "declined" ||
          normalized === "closed" ||
          normalized === "withdrawn"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-800";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>
      {status || "Unknown"}
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-rose-700">{value}</p>
    </div>
  );
}

function Empty({ children = "Nothing to show yet." }) {
  return (
    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
      {children}
    </p>
  );
}

function PageHeading({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

function RequestTable({
  requests,
  onDecision,
  loading,
  showActions = false,
}) {
  if (!requests.length) {
    return <Empty>No blood-stock requests found.</Empty>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="p-3">Request</th>
            <th className="p-3">Blood</th>
            <th className="p-3">City</th>
            <th className="p-3">Units</th>
            <th className="p-3">Contact</th>
            <th className="p-3">Status</th>
            {showActions && <th className="p-3">Action</th>}
          </tr>
        </thead>

        <tbody>
          {requests.map((request) => (
            <tr key={request.id} className="border-t border-slate-100">
              <td className="p-3">#{request.id}</td>
              <td className="p-3 font-semibold">{request.blood_group}</td>
              <td className="p-3">{request.city}</td>
              <td className="p-3">{request.units_requested}</td>

              <td className="p-3">
                {showActions ? (
                  <ContactLinks
                    name={request.hospital_name}
                    email={request.hospital_email}
                    phone={request.hospital_phone}
                  />
                ) : (
                  <ContactLinks
                    name={request.blood_bank_name}
                    email={request.blood_bank_email}
                    phone={request.blood_bank_phone}
                  />
                )}
              </td>

              <td className="p-3">
                <StatusBadge status={request.status} />
              </td>

              {showActions && (
                <td className="p-3">
                  {request.status === "Pending" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={loading}
                        variant="success"
                        onClick={() => onDecision(request.id, "Approved")}
                      >
                        Approve
                      </Button>
                      <Button
                        disabled={loading}
                        variant="danger"
                        onClick={() => onDecision(request.id, "Rejected")}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : (
                    "Processed"
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContactProfileCard({
  profile,
  accountPhone,
  setAccountPhone,
  saveContactProfile,
  loading,
}) {
  return (
    <Card title="My Contact Details">
      <p className="mb-4 text-sm text-slate-600">
        Other users can contact your organisation through the details shared
        in relevant authenticated requests.
      </p>

      <div className="mb-4 rounded-xl bg-slate-50 p-3">
        <ContactLinks
          name={profile?.name}
          email={profile?.email}
          phone={accountPhone}
        />
      </div>

      <form onSubmit={saveContactProfile} className="space-y-4">
        <Field
          label="Account phone number"
          value={accountPhone}
          onChange={setAccountPhone}
          placeholder="Enter your contact number"
          required
          type="tel"
        />
        <Button type="submit" disabled={loading}>
          Save Contact Details
        </Button>
      </form>
    </Card>
  );
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Donor");

  const [donor, setDonor] = useState(emptyDonor);
  const [accountPhone, setAccountPhone] = useState("");

  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [stockForm, setStockForm] = useState(emptyStock);
  const [editingStockId, setEditingStockId] = useState(null);
  const [requestUnits, setRequestUnits] = useState({});

  const [donors, setDonors] = useState([]);
  const [donorsSearched, setDonorsSearched] = useState(false);
  const [donorFilter, setDonorFilter] = useState({
    blood_group: "O+",
    city: "",
  });

  const [donorRequests, setDonorRequests] = useState([]);
  const [donorRequestForm, setDonorRequestForm] = useState(emptyRequirement);
  const [donorInterests, setDonorInterests] = useState({});
  const [interestedRequestIds, setInterestedRequestIds] = useState([]);

  const [directDonors, setDirectDonors] = useState([]);
  const [directDonorsSearched, setDirectDonorsSearched] = useState(false);
  const [directDonorFilter, setDirectDonorFilter] = useState({
    blood_group: "O+",
    city: "",
  });
  const [directDonorRequests, setDirectDonorRequests] = useState([]);
  const [directRequestMessages, setDirectRequestMessages] = useState({});

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const notify = (text) => {
    setMessage(text);
    setError("");
  };

  const fail = (text) => {
    setError(text);
    setMessage("");
  };

  const clearUserData = () => {
    setProfile(null);
    setAccountPhone("");
    setDonor(emptyDonor);
    setInventory([]);
    setRequests([]);
    setDonors([]);
    setDonorsSearched(false);
    setDonorRequests([]);
    setDonorInterests({});
    setInterestedRequestIds([]);
    setDirectDonors([]);
    setDirectDonorsSearched(false);
    setDirectDonorRequests([]);
  };

  const loadProfile = useCallback(async (user) => {
    const result = await api("/me", user);
    setProfile(result);
    setAccountPhone(result.phone || "");
    return result;
  }, []);

  const loadDashboard = useCallback(async (user, currentProfile) => {
    if (currentProfile.role === "Donor") {
      const [donorProfile, requirements, directRequests] = await Promise.all([
        api("/donor-profile", user),
        api("/donor-requests", user),
        api("/direct-donor-requests", user),
      ]);

      setDonor({
        blood_group: donorProfile.blood_group || "O+",
        age: donorProfile.age ?? "",
        phone: donorProfile.phone || "",
        city: donorProfile.city || "",
        available: Boolean(donorProfile.available),
        last_donation_date: donorProfile.last_donation_date || "",
      });

      setDonorRequests(requirements);
      setDirectDonorRequests(directRequests);
      return;
    }

    const [stock, bloodRequests] = await Promise.all([
      api("/inventory", user),
      api("/blood-requests", user),
    ]);

    setInventory(stock);
    setRequests(bloodRequests);

    if (currentProfile.role === "Hospital") {
      const requirements = await api("/donor-requests", user);
      setDonorRequests(requirements);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      const currentProfile = await loadProfile(firebaseUser);
      await loadDashboard(firebaseUser, currentProfile);
    } catch (err) {
      fail(err.message);
    }
  }, [firebaseUser, loadProfile, loadDashboard]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      clearUserData();
      setMessage("");
      setError("");

      if (!user) return;

      setLoading(true);

      try {
        const currentProfile = await api("/me", user);
        setProfile(currentProfile);
        setAccountPhone(currentProfile.phone || "");
        await loadDashboard(user, currentProfile);
      } catch (err) {
        fail(
          `Could not load your profile: ${err.message}. If this is a new account, sign out and register again.`
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [loadDashboard]);

async function handleAuth(event) {
event.preventDefault();
setLoading(true);
setError("");
setMessage("");

try {
if (mode === "register") {
const credential = await createUserWithEmailAndPassword(
auth,
email.trim(),
password
);

  await api("/register-profile", credential.user, "POST", {
    name: name.trim(),
    role,
  });

  notify("Account created successfully!");
} else {
  await signInWithEmailAndPassword(auth, email.trim(), password);
  notify("Logged in successfully!");
}

} catch (err) {
let friendlyMessage = "Something went wrong. Please try again.";

if (
  err.code === "auth/invalid-credential" ||
  err.code === "auth/wrong-password" ||
  err.code === "auth/user-not-found"
) {
  friendlyMessage =
    "Incorrect email or password. Please check your details and try again.";
} else if (err.code === "auth/too-many-requests") {
  friendlyMessage =
    "Too many login attempts. Please try again later.";
} else if (err.code === "auth/network-request-failed") {
  friendlyMessage =
    "Network error. Please check your internet connection.";
} else if (err.code === "auth/email-already-in-use") {
  friendlyMessage =
    "This email is already registered. Please log in instead.";
} else if (err.code === "auth/weak-password") {
  friendlyMessage =
    "Your password is too weak. Please choose a stronger password.";
} else if (err.code === "auth/invalid-email") {
  friendlyMessage =
    "Please enter a valid email address.";
}

fail(friendlyMessage);

} finally {
setLoading(false);
}
}

  async function handleLogout() {
    await signOut(auth);
    clearUserData();
    setProfile(null);
    setFirebaseUser(null);
    notify("Logged out successfully.");
  }

  async function saveDonor(event) {
    event.preventDefault();
    setLoading(true);

    try {
      await api("/donor-profile", firebaseUser, "PUT", {
        ...donor,
        age: Number(donor.age),
        phone: donor.phone.trim(),
        city: donor.city.trim(),
        last_donation_date: donor.last_donation_date || null,
      });

      await refreshDashboard();
      notify("Donor profile saved successfully!");
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveContactProfile(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const result = await api(
        "/contact-profile",
        firebaseUser,
        "PUT",
        { phone: accountPhone.trim() }
      );

      setProfile(result.user);
      setAccountPhone(result.user.phone || "");
      notify(result.message);
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function addOrUpdateStock(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...stockForm,
        units: Number(stockForm.units),
        city: stockForm.city.trim(),
      };

      if (editingStockId) {
        await api(
          `/inventory/${editingStockId}`,
          firebaseUser,
          "PUT",
          payload
        );
        notify("Inventory updated successfully!");
      } else {
        await api("/inventory", firebaseUser, "POST", payload);
        notify("Inventory added successfully!");
      }

      setStockForm(emptyStock);
      setEditingStockId(null);
      await refreshDashboard();
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startEditingStock(item) {
    setEditingStockId(item.id);
    setStockForm({
      blood_group: item.blood_group,
      units: String(item.units),
      city: item.city,
      expiry_date: item.expiry_date,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function createBloodRequest(item) {
    const units = Number(requestUnits[item.id] || 1);

    if (!Number.isInteger(units) || units < 1) {
      fail("Enter a valid number of units.");
      return;
    }

    setLoading(true);

    try {
      await api("/blood-requests", firebaseUser, "POST", {
        inventory_id: item.id,
        units_requested: units,
      });

      await refreshDashboard();
      notify("Blood-stock request submitted successfully!");
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function decideBloodRequest(id, status) {
    setLoading(true);

    try {
      await api(`/blood-requests/${id}`, firebaseUser, "PATCH", { status });
      await refreshDashboard();
      notify(`Request ${status.toLowerCase()} successfully.`);
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function searchDonors(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const query = new URLSearchParams();

      if (donorFilter.blood_group) {
        query.set("blood_group", donorFilter.blood_group);
      }

      if (donorFilter.city.trim()) {
        query.set("city", donorFilter.city.trim());
      }

      const result = await api(
        `/donors?${query.toString()}`,
        firebaseUser
      );

      setDonors(result);
      setDonorsSearched(true);
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createDonorRequirement(event) {
    event.preventDefault();
    setLoading(true);

    try {
      await api("/donor-requests", firebaseUser, "POST", {
        ...donorRequestForm,
        units_needed: Number(donorRequestForm.units_needed),
        city: donorRequestForm.city.trim(),
        contact_phone: donorRequestForm.contact_phone.trim() || null,
        notes: donorRequestForm.notes.trim() || null,
      });

      setDonorRequestForm(emptyRequirement);
      await refreshDashboard();
      notify("Donor requirement posted successfully!");
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function expressInterest(requestId) {
    setLoading(true);

    try {
      await api(
        `/donor-requests/${requestId}/interest`,
        firebaseUser,
        "POST"
      );
      await refreshDashboard();
      notify("Your interest has been sent to the hospital!");
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function withdrawInterest(requestId) {
    setLoading(true);

    try {
      await api(
        `/donor-requests/${requestId}/interest`,
        firebaseUser,
        "DELETE"
      );
      await refreshDashboard();
      notify("Your interest has been withdrawn.");
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function closeDonorRequirement(requestId) {
    setLoading(true);

    try {
      await api(`/donor-requests/${requestId}`, firebaseUser, "PATCH", {
        status: "Closed",
      });
      await refreshDashboard();
      notify("Donor requirement closed.");
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function viewInterestedDonors(requestId) {
    setLoading(true);

    try {
      const result = await api(
        `/donor-requests/${requestId}/interests`,
        firebaseUser
      );

      setDonorInterests((previous) => ({
        ...previous,
        [requestId]: result,
      }));

      setInterestedRequestIds((previous) =>
        previous.includes(requestId)
          ? previous
          : [...previous, requestId]
      );
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function searchDirectDonors(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const query = new URLSearchParams();

      if (directDonorFilter.blood_group) {
        query.set("blood_group", directDonorFilter.blood_group);
      }

      if (directDonorFilter.city.trim()) {
        query.set("city", directDonorFilter.city.trim());
      }

      const result = await api(
        `/donors?${query.toString()}`,
        firebaseUser
      );

      setDirectDonors(result);
      setDirectDonorsSearched(true);
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendDirectDonorRequest(recipientId) {
    setLoading(true);

    try {
      await api("/direct-donor-requests", firebaseUser, "POST", {
        recipient_user_id: recipientId,
        message: directRequestMessages[recipientId] || null,
      });

      setDirectRequestMessages((previous) => ({
        ...previous,
        [recipientId]: "",
      }));

      await refreshDashboard();
      notify("Direct donor request sent successfully!");
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function decideDirectRequest(requestId, status) {
    setLoading(true);

    try {
      await api(
        `/direct-donor-requests/${requestId}`,
        firebaseUser,
        "PATCH",
        { status }
      );

      await refreshDashboard();
      notify(
        status === "Accepted"
          ? "Request accepted. Contact details are now available."
          : "Request declined."
      );
    } catch (err) {
      fail(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------
  // Login and registration
  // ------------------------------------------------

  if (!firebaseUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-rose-50 px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-rose-100 bg-white p-8 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-3xl">
              🩸
            </div>
            <h1 className="text-3xl font-bold text-rose-700">
              Blood Connect
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Connecting blood donors, hospitals and blood banks.
            </p>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setMode("login")}
              className={`rounded-lg py-2 text-sm font-semibold ${
                mode === "login"
                  ? "bg-white text-rose-700 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setMode("register")}
              className={`rounded-lg py-2 text-sm font-semibold ${
                mode === "register"
                  ? "bg-white text-rose-700 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {message && (
            <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
              {message}
            </p>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {mode === "register" && (
              <>
                <Field
                  label="Full name / Organisation name"
                  value={name}
                  onChange={setName}
                  placeholder="Enter your name"
                  required
                />

                <Field
                  label="Account type"
                  value={role}
                  onChange={setRole}
                  options={ROLES}
                  required
                />
              </>
            )}

            <Field
              label="Email address"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
            />

            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Enter your password"
              required
            />

            <Button type="submit" disabled={loading}>
              {loading
                ? "Please wait..."
                : mode === "register"
                  ? "Create Account"
                  : "Login"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Secure sign-in powered by Firebase Authentication.
          </p>
        </div>
      </main>
    );
  }

  // ------------------------------------------------
  // Shared dashboard header
  // ------------------------------------------------

  const header = (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-rose-700 p-5 text-white shadow-lg">
      <div>
        <p className="text-sm text-rose-100">Blood Connect</p>
        <h1 className="text-2xl font-bold">
          Welcome, {profile?.name || firebaseUser.email}
        </h1>
        <p className="mt-1 text-sm text-rose-100">
          {profile?.role || "Loading profile..."} Dashboard
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-white/15 px-3 py-2 text-sm">
          {profile?.email || firebaseUser.email}
        </span>
        <Button variant="secondary" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  );

  const notifications = (
    <>
      {message && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <span>{message}</span>
          <button onClick={() => setMessage("")} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </>
  );

  // ------------------------------------------------
  // Donor dashboard
  // ------------------------------------------------

  if (profile?.role === "Donor") {
    const incomingRequests = directDonorRequests.filter(
      (item) => item.direction === "Received"
    );

    const sentRequests = directDonorRequests.filter(
      (item) => item.direction === "Sent"
    );

    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-7xl">
          {header}
          {notifications}

          <PageHeading
            title="Donor Dashboard"
            subtitle="Manage your donor profile and connect with hospitals and other donors."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Matching Hospital Requests" value={donorRequests.length} />
            <Stat label="Direct Donor Requests" value={directDonorRequests.length} />
            <Stat
              label="Availability"
              value={donor.available ? "Available" : "Unavailable"}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="My Donor Profile">
              <form onSubmit={saveDonor} className="space-y-4">
                <Field
                  label="Blood group"
                  value={donor.blood_group}
                  onChange={(value) =>
                    setDonor({ ...donor, blood_group: value })
                  }
                  options={GROUPS}
                  required
                />

                <Field
                  label="Age"
                  type="number"
                  min="18"
                  max="100"
                  value={donor.age}
                  onChange={(value) =>
                    setDonor({ ...donor, age: value })
                  }
                  required
                />

                <Field
                  label="Phone number"
                  type="tel"
                  value={donor.phone}
                  onChange={(value) =>
                    setDonor({ ...donor, phone: value })
                  }
                  required
                />

                <Field
                  label="City"
                  value={donor.city}
                  onChange={(value) =>
                    setDonor({ ...donor, city: value })
                  }
                  required
                />

                <Field
                  label="Last donation date"
                  type="date"
                  value={donor.last_donation_date}
                  onChange={(value) =>
                    setDonor({ ...donor, last_donation_date: value })
                  }
                />

                <label className="flex items-center gap-3 rounded-xl bg-rose-50 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={donor.available}
                    onChange={(e) =>
                      setDonor({ ...donor, available: e.target.checked })
                    }
                    className="h-4 w-4 accent-rose-600"
                  />
                  I am available to donate blood
                </label>

                <p className="text-xs text-slate-500">
                  Only mark yourself available when you meet the applicable
                  donation eligibility requirements.
                </p>

                <Button type="submit" disabled={loading}>
                  Save Donor Profile
                </Button>
              </form>
            </Card>

            <Card title="My Account Details">
              <ContactLinks
                name={profile?.name}
                email={profile?.email}
                phone={donor.phone}
              />
              <p className="mt-4 text-sm text-slate-500">
                Your contact details are shared with hospitals through donor
                search. Other donors can access your contact details only
                after you accept their direct request.
              </p>
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Blood Requests Near Me">
              <p className="mb-4 text-sm text-slate-500">
                These are open hospital requirements matching your blood group
                and city.
              </p>

              {donorRequests.length === 0 ? (
                <Empty>
                  No matching open hospital requirements. Complete your profile
                  and mark yourself available to find matching requests.
                </Empty>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {donorRequests.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-bold text-slate-800">
                          {item.blood_group} blood needed
                        </h3>
                        <StatusBadge status={item.urgency} />
                      </div>

                      <p className="mt-2 text-sm text-slate-600">
                        Hospital: {item.hospital_name || "Hospital"}
                      </p>
                      <p className="text-sm text-slate-600">
                        City: {item.city}
                      </p>
                      <p className="text-sm text-slate-600">
                        Units needed: {item.units_needed}
                      </p>

                      {item.notes && (
                        <p className="mt-2 text-sm text-slate-600">
                          Notes: {item.notes}
                        </p>
                      )}

                      <div className="mt-4 rounded-lg bg-slate-50 p-3">
                        <ContactLinks
                          name={item.hospital_name}
                          email={item.hospital_email}
                          phone={item.hospital_phone}
                        />

                        {item.contact_phone &&
                          item.contact_phone !== item.hospital_phone && (
                            <p className="mt-1 text-sm">
                              Request contact:{" "}
                              <a
                                href={`tel:${item.contact_phone}`}
                                className="text-blue-700 underline"
                              >
                                {item.contact_phone}
                              </a>
                            </p>
                          )}
                      </div>

                      <div className="mt-4">
                        {item.has_interest ? (
                          <Button
                            variant="secondary"
                            disabled={loading}
                            onClick={() => withdrawInterest(item.id)}
                          >
                            Withdraw Interest
                          </Button>
                        ) : (
                          <Button
                            disabled={loading}
                            onClick={() => expressInterest(item.id)}
                          >
                            Express Interest
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Find Other Donors">
              <p className="mb-4 text-sm text-slate-500">
                Search for donors with the same blood group in your city.
                Contact details are shared only after a direct request is
                accepted.
              </p>

              <form
                onSubmit={(e) => {
                  setDirectDonorFilter({
                    ...directDonorFilter,
                    city: directDonorFilter.city.trim(),
                  });
                  searchDirectDonors(e);
                }}
                className="mb-5 grid gap-4 sm:grid-cols-3"
              >
                <Field
                  label="Blood group"
                  value={directDonorFilter.blood_group}
                  onChange={(value) =>
                    setDirectDonorFilter({
                      ...directDonorFilter,
                      blood_group: value,
                    })
                  }
                  options={GROUPS}
                />

                <Field
                  label="City"
                  value={directDonorFilter.city}
                  onChange={(value) =>
                    setDirectDonorFilter({
                      ...directDonorFilter,
                      city: value,
                    })
                  }
                  placeholder="Enter your city"
                  required
                />

                <div className="flex items-end">
                  <Button type="submit" disabled={loading}>
                    Search Donors
                  </Button>
                </div>
              </form>

              {directDonorsSearched &&
                (directDonors.length === 0 ? (
                  <Empty>No matching available donors found.</Empty>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {directDonors.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <h3 className="font-bold text-slate-800">
                          {item.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Blood group: {item.blood_group}
                        </p>
                        <p className="text-sm text-slate-600">
                          City: {item.city}
                        </p>
                        <p className="mt-1 text-sm text-emerald-700">
                          Available donor
                        </p>

                        <p className="mt-2 text-xs text-slate-500">
                          Contact details are not shown before acceptance.
                        </p>

                        <label className="mt-3 block">
                          <span className="text-sm text-slate-600">
                            Optional message
                          </span>
                          <textarea
                            value={directRequestMessages[item.id] || ""}
                            onChange={(e) =>
                              setDirectRequestMessages({
                                ...directRequestMessages,
                                [item.id]: e.target.value,
                              })
                            }
                            maxLength={500}
                            rows={2}
                            placeholder="Introduce yourself..."
                            className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm"
                          />
                        </label>

                        <div className="mt-3">
                          <Button
                            disabled={loading}
                            onClick={() => sendDirectDonorRequest(item.id)}
                          >
                            Send Direct Request
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
            </Card>
          </div>

          <div className="mt-6">
            <Card title="My Direct Donor Requests">
              {directDonorRequests.length === 0 ? (
                <Empty>No direct donor requests yet.</Empty>
              ) : (
                <div className="space-y-4">
                  {directDonorRequests.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">
                            {item.direction === "Sent"
                              ? `Request sent to ${item.other_name}`
                              : `Request from ${item.other_name}`}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {item.other_blood_group} · {item.other_city}
                          </p>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>

                      {item.message && (
                        <p className="mt-3 text-sm text-slate-600">
                          Message: {item.message}
                        </p>
                      )}

                      {item.status === "Pending" &&
                        item.direction === "Received" && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              variant="success"
                              disabled={loading}
                              onClick={() =>
                                decideDirectRequest(item.id, "Accepted")
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              variant="danger"
                              disabled={loading}
                              onClick={() =>
                                decideDirectRequest(item.id, "Declined")
                              }
                            >
                              Decline
                            </Button>
                          </div>
                        )}

                      {item.status === "Accepted" && (
                        <div className="mt-4 rounded-xl bg-emerald-50 p-3">
                          <p className="mb-2 text-sm font-semibold text-emerald-800">
                            Contact details shared after acceptance
                          </p>
                          <ContactLinks
                            name={item.other_name}
                            email={item.contact_email}
                            phone={item.contact_phone}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    );
  }

  // ------------------------------------------------
  // Blood Bank dashboard
  // ------------------------------------------------

  if (profile?.role === "Blood Bank") {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-7xl">
          {header}
          {notifications}

          <PageHeading
            title="Blood Bank Dashboard"
            subtitle="Manage blood inventory and respond to hospital stock requests."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Inventory Entries" value={inventory.length} />
            <Stat
              label="Pending Requests"
              value={requests.filter((r) => r.status === "Pending").length}
            />
            <Stat
              label="Available Units"
              value={inventory.reduce((sum, item) => sum + item.units, 0)}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <ContactProfileCard
              profile={profile}
              accountPhone={accountPhone}
              setAccountPhone={setAccountPhone}
              saveContactProfile={saveContactProfile}
              loading={loading}
            />

            <Card title={editingStockId ? "Update Inventory" : "Add Blood Inventory"}>
              <form onSubmit={addOrUpdateStock} className="space-y-4">
                <Field
                  label="Blood group"
                  value={stockForm.blood_group}
                  onChange={(value) =>
                    setStockForm({ ...stockForm, blood_group: value })
                  }
                  options={GROUPS}
                  required
                />

                <Field
                  label="Units available"
                  type="number"
                  min="0"
                  value={stockForm.units}
                  onChange={(value) =>
                    setStockForm({ ...stockForm, units: value })
                  }
                  required
                />

                <Field
                  label="City"
                  value={stockForm.city}
                  onChange={(value) =>
                    setStockForm({ ...stockForm, city: value })
                  }
                  required
                />

                <Field
                  label="Expiry date"
                  type="date"
                  value={stockForm.expiry_date}
                  onChange={(value) =>
                    setStockForm({ ...stockForm, expiry_date: value })
                  }
                  required
                />

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={loading}>
                    {editingStockId ? "Update Inventory" : "Add Inventory"}
                  </Button>

                  {editingStockId && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingStockId(null);
                        setStockForm(emptyStock);
                      }}
                    >
                      Cancel Edit
                    </Button>
                  )}
                </div>
              </form>
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Manage My Inventory">
              {inventory.length === 0 ? (
                <Empty>No inventory entries available.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-3">Blood group</th>
                        <th className="p-3">City</th>
                        <th className="p-3">Units</th>
                        <th className="p-3">Expiry</th>
                        <th className="p-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="p-3 font-semibold">
                            {item.blood_group}
                          </td>
                          <td className="p-3">{item.city}</td>
                          <td className="p-3">{item.units}</td>
                          <td className="p-3">{item.expiry_date}</td>
                          <td className="p-3">
                            <Button
                              variant="secondary"
                              onClick={() => startEditingStock(item)}
                            >
                              Edit
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Hospital Stock Requests">
              <RequestTable
                requests={requests}
                onDecision={decideBloodRequest}
                loading={loading}
                showActions
              />
            </Card>
          </div>
        </div>
      </main>
    );
  }

  // ------------------------------------------------
  // Hospital dashboard
  // ------------------------------------------------

  if (profile?.role === "Hospital") {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-7xl">
          {header}
          {notifications}

          <PageHeading
            title="Hospital Dashboard"
            subtitle="Find blood inventory, request stock and connect with available donors."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Available Stock Entries" value={inventory.length} />
            <Stat
              label="My Stock Requests"
              value={requests.length}
            />
            <Stat
              label="My Donor Requirements"
              value={donorRequests.length}
            />
          </div>

          <div className="mt-6">
            <ContactProfileCard
              profile={profile}
              accountPhone={accountPhone}
              setAccountPhone={setAccountPhone}
              saveContactProfile={saveContactProfile}
              loading={loading}
            />
          </div>

          <div className="mt-6">
            <Card title="Find Blood Inventory">
              {inventory.length === 0 ? (
                <Empty>No available blood inventory found.</Empty>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {inventory.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-lg font-bold text-slate-800">
                          {item.blood_group}
                        </h3>
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-800">
                          {item.units} units
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-slate-600">
                        City: {item.city}
                      </p>
                      <p className="text-sm text-slate-600">
                        Expiry date: {item.expiry_date}
                      </p>

                      <div className="mt-4 rounded-xl bg-slate-50 p-3">
                        <p className="mb-2 text-sm font-semibold">
                          Blood Bank Contact
                        </p>
                        <ContactLinks
                          name={item.blood_bank_name}
                          email={item.blood_bank_email}
                          phone={item.blood_bank_phone}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap items-end gap-3">
                        <label className="block">
                          <span className="text-sm text-slate-600">
                            Units requested
                          </span>
                          <input
                            type="number"
                            min="1"
                            max={item.units}
                            value={requestUnits[item.id] || "1"}
                            onChange={(e) =>
                              setRequestUnits({
                                ...requestUnits,
                                [item.id]: e.target.value,
                              })
                            }
                            className="mt-1 w-28 rounded-xl border border-slate-300 px-3 py-2.5"
                          />
                        </label>

                        <Button
                          disabled={loading}
                          onClick={() => createBloodRequest(item)}
                        >
                          Request Blood
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="mt-6">
            <Card title="My Blood Stock Requests">
              <RequestTable requests={requests} />
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Find Available Donors">
              <form
                onSubmit={searchDonors}
                className="mb-5 grid gap-4 sm:grid-cols-3"
              >
                <Field
                  label="Blood group"
                  value={donorFilter.blood_group}
                  onChange={(value) =>
                    setDonorFilter({ ...donorFilter, blood_group: value })
                  }
                  options={GROUPS}
                />

                <Field
                  label="City"
                  value={donorFilter.city}
                  onChange={(value) =>
                    setDonorFilter({ ...donorFilter, city: value })
                  }
                  placeholder="Enter city"
                  required
                />

                <div className="flex items-end">
                  <Button type="submit" disabled={loading}>
                    Search Donors
                  </Button>
                </div>
              </form>

              {donorsSearched &&
                (donors.length === 0 ? (
                  <Empty>No matching available donors found.</Empty>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {donors.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <h3 className="font-bold text-slate-800">
                          {item.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Blood group: {item.blood_group}
                        </p>
                        <p className="text-sm text-slate-600">
                          City: {item.city}
                        </p>

                        <div className="mt-3 rounded-xl bg-slate-50 p-3">
                          <ContactLinks
                            name={item.name}
                            email={item.email}
                            phone={item.phone}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Create Donor Requirement">
              <p className="mb-4 text-sm text-slate-500">
                Post a requirement to notify matching available donors.
              </p>

              <form
                onSubmit={createDonorRequirement}
                className="grid gap-4 sm:grid-cols-2"
              >
                <Field
                  label="Blood group needed"
                  value={donorRequestForm.blood_group}
                  onChange={(value) =>
                    setDonorRequestForm({
                      ...donorRequestForm,
                      blood_group: value,
                    })
                  }
                  options={GROUPS}
                />

                <Field
                  label="Units needed"
                  type="number"
                  min="1"
                  value={donorRequestForm.units_needed}
                  onChange={(value) =>
                    setDonorRequestForm({
                      ...donorRequestForm,
                      units_needed: value,
                    })
                  }
                  required
                />

                <Field
                  label="City"
                  value={donorRequestForm.city}
                  onChange={(value) =>
                    setDonorRequestForm({
                      ...donorRequestForm,
                      city: value,
                    })
                  }
                  required
                />

                <Field
                  label="Urgency"
                  value={donorRequestForm.urgency}
                  onChange={(value) =>
                    setDonorRequestForm({
                      ...donorRequestForm,
                      urgency: value,
                    })
                  }
                  options={["Normal", "Urgent", "Critical"]}
                />

                <Field
                  label="Request-specific contact phone (optional)"
                  type="tel"
                  value={donorRequestForm.contact_phone}
                  onChange={(value) =>
                    setDonorRequestForm({
                      ...donorRequestForm,
                      contact_phone: value,
                    })
                  }
                />

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    Notes (optional)
                  </span>
                  <textarea
                    value={donorRequestForm.notes}
                    onChange={(e) =>
                      setDonorRequestForm({
                        ...donorRequestForm,
                        notes: e.target.value,
                      })
                    }
                    maxLength={500}
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  />
                </label>

                <div className="sm:col-span-2">
                  <Button type="submit" disabled={loading}>
                    Post Donor Requirement
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Manage My Donor Requirements">
              {donorRequests.length === 0 ? (
                <Empty>You haven't posted any donor requirements yet.</Empty>
              ) : (
                <div className="space-y-4">
                  {donorRequests.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-bold">
                            {item.blood_group} · {item.city}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            Units needed: {item.units_needed} · Urgency:{" "}
                            {item.urgency}
                          </p>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>

                      {item.notes && (
                        <p className="mt-2 text-sm text-slate-600">
                          Notes: {item.notes}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          disabled={loading}
                          onClick={() => viewInterestedDonors(item.id)}
                        >
                          View Interested Donors
                        </Button>

                        {item.status === "Open" && (
                          <Button
                            variant="danger"
                            disabled={loading}
                            onClick={() => closeDonorRequirement(item.id)}
                          >
                            Close Requirement
                          </Button>
                        )}
                      </div>

                      {interestedRequestIds.includes(item.id) && (
                        <div className="mt-4 rounded-xl bg-slate-50 p-4">
                          <h4 className="mb-3 font-semibold">
                            Interested Donors
                          </h4>

                          {(donorInterests[item.id] || []).length === 0 ? (
                            <Empty>
                              No donors have expressed interest yet.
                            </Empty>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                              {donorInterests[item.id].map((person) => (
                                <div
                                  key={person.id}
                                  className="rounded-xl border border-slate-200 bg-white p-3"
                                >
                                  <ContactLinks
                                    name={person.name}
                                    email={person.email}
                                    phone={person.phone}
                                  />
                                  <p className="mt-2 text-sm text-slate-500">
                                    Blood group: {person.blood_group}
                                  </p>
                                  <p className="text-sm text-slate-500">
                                    City: {person.city}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    );
  }

  // ------------------------------------------------
  // Profile loading or unsupported role
  // ------------------------------------------------

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card title="Loading Blood Connect">
        {loading ? (
          <p className="text-sm text-slate-600">Loading your dashboard...</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Your account profile could not be loaded.
            </p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <Button onClick={refreshDashboard}>Try Again</Button>
            <Button variant="secondary" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}