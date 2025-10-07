// Safety Recall Search — Fuzzy matching + CSV VIN upload + Export/Email 📬
// 🔨🤖🔧 Built by GPT-5 (HTML + CSS + JavaScript expert)

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const state = {
  data: [],
  filtered: [],
  batchRows: [], // holds rows for export when VIN list is uploaded
  threshold: 0.75,
};

// -------------------- Fuzzy Matching -------------------- //
const norm = (x) => (x ?? "").toString().trim().toLowerCase();

/** Levenshtein distance with O(mn) DP */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: 2 }, () => new Array(n + 1));
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = i & 1;
    const prev = cur ^ 1;
    dp[cur][0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[cur][j] = Math.min(
        dp[prev][j] + 1,
        dp[cur][j - 1] + 1,
        dp[prev][j - 1] + cost
      );
    }
  }
  return dp[m & 1][n];
}

/** Similarity ratio between 0–1 */
function similarity(a, b) {
  if (!a && !b) return 1;
  const dist = levenshtein(norm(a), norm(b));
  return 1 - dist / Math.max(a.length, b.length);
}

// -------------------- Core Logic -------------------- //

function readCriteria() {
  const fields = ["vin", "make", "model", "year", "recallNumber"];
  const c = {};
  for (const f of fields) c[f] = ($("#" + f)?.value ?? "").trim();
  return c;
}

function matchRecord(record, criteria, threshold) {
  const vinQ = criteria.vin;
  const makeQ = criteria.make;
  const modelQ = criteria.model;
  const yearQ = criteria.year;
  const recallQ = criteria.recallNumber;

  // If VIN entered → fuzzy match VIN only
  if (vinQ) {
    return similarity(record.vin, vinQ) >= threshold;
  }

  // If VIN blank → match Make/Model/Year/Recall
  const makeOK = makeQ ? similarity(record.make, makeQ) >= threshold : true;
  const modelOK = modelQ ? similarity(record.model, modelQ) >= threshold : true;
  const yearOK = yearQ ? String(record.year) === String(yearQ) : true;
  const recallOK = recallQ ? similarity(record.recallNumber, recallQ) >= threshold : true;
  return makeOK && modelOK && yearOK && recallOK;
}

// -------------------- Rendering -------------------- //

function renderNoMatches(msg = "No matches found.") {
  $("#results").innerHTML = `<div class="result"><div>${msg}</div></div>`;
  $("#resultCount").textContent = "0";
  $("#exportBar").classList.add("hidden");
}

function renderResults(list, isBatch = false) {
  const container = $("#results");
  container.innerHTML = "";
  const frag = document.createDocumentFragment();

  list.forEach((r) => {
    const el = document.createElement("article");
    el.className = "result";
    const statusClass = String(r.recallStatus).toLowerCase().includes("open")
      ? "open"
      : "closed";

    const docs = (r.documents || []).map((d) => {
      const href = d.startsWith("docs/") ? d : `docs/${d}`;
      const label = d.split("/").pop();
      return `<a class="doc" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }).join("");

    el.innerHTML = `
      <div class="row">
        <span class="kv"><span class="k">VIN</span><span class="v">${r.vin}</span></span>
        <span class="kv"><span class="k">Recall #</span><span class="v">${r.recallNumber}</span></span>
        <span class="kv"><span class="k">Status</span><span class="v status ${statusClass}">${r.recallStatus}</span></span>
      </div>
      <div class="docs">${docs || "<em>No documents.</em>"}</div>
    `;
    frag.appendChild(el);
  });

  container.appendChild(frag);
  $("#resultCount").textContent = String(list.length);
  $("#exportBar").classList.toggle("hidden", list.length === 0 && !isBatch);
}

// -------------------- CSV Upload -------------------- //

async function parseCsvFile(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  let vins = [];

  if (lines.length === 0) return [];

  if (lines[0].toLowerCase().includes("vin")) {
    vins = lines.slice(1).map((l) => l.split(",")[0].trim()).filter(Boolean);
  } else {
    vins = lines.map((l) => l.split(",")[0].trim());
  }
  return vins;
}

// -------------------- Export Helpers -------------------- //

function exportResultsCSV(rows) {
  const header = "VIN,RecallNumber,RecallStatus\n";
  const body = rows.map((r) =>
    `"${r.vin}","${r.recallNumber}","${r.recallStatus}"`
  ).join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "recall_results.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function emailResultsCSV(rows, email) {
  const subject = encodeURIComponent("Safety Recall Results");
  const body = encodeURIComponent(
    rows
      .map((r) => `VIN: ${r.vin}\nRecall: ${r.recallNumber}\nStatus: ${r.recallStatus}`)
      .join("\n\n")
  );
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

// -------------------- Search -------------------- //

function onSearch(e) {
  e?.preventDefault?.();
  const threshold = parseFloat($("#threshold").value || "0.75");
  state.threshold = threshold;

  const criteria = readCriteria();
  const csvFile = $("#csvFile").files[0];

  // Batch CSV VIN mode
  if (csvFile) {
    parseCsvFile(csvFile).then((vins) => {
      const results = [];
      vins.forEach((v) => {
        const match = state.data.find(
          (r) => similarity(r.vin, v) >= threshold
        );
        if (match) results.push(match);
      });
      state.filtered = results;
      state.batchRows = results.map((r) => ({
        vin: r.vin,
        recallNumber: r.recallNumber,
        recallStatus: r.recallStatus,
      }));
      if (results.length === 0) renderNoMatches("No VINs matched.");
      else renderResults(results, true);
    });
    return;
  }

  // Normal single search
  const hasInput = Object.values(criteria).some((v) => v);
  if (!hasInput) {
    renderNoMatches("Enter a VIN, Make, Model, or upload a CSV.");
    return;
  }

  const list = state.data.filter((r) => matchRecord(r, criteria, threshold));
  state.filtered = list;
  state.batchRows = list.map((r) => ({
    vin: r.vin,
    recallNumber: r.recallNumber,
    recallStatus: r.recallStatus,
  }));

  if (list.length === 0) renderNoMatches();
  else renderResults(list);
}

function onClear() {
  ["vin", "make", "model", "year", "recallNumber"].forEach((id) => {
    $("#" + id).value = "";
  });
  $("#csvFile").value = "";
  renderNoMatches("Enter search info or upload CSV.");
}

// -------------------- Data Load -------------------- //
async function loadData() {
  try {
    const res = await fetch("data/recalls.json", { cache: "no-store" });
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("Data must be an array.");
    state.data = json;
  } catch (err) {
    console.error(err);
    $("#results").innerHTML = `<div class="result"><div>Error loading data file.</div></div>`;
  }
}

// -------------------- Init -------------------- //
document.addEventListener("DOMContentLoaded", async () => {
  $("#yearNow").textContent = String(new Date().getFullYear());
  await loadData();
  renderNoMatches("Enter a VIN, Make/Model, or upload CSV.");

  $("#searchForm").addEventListener("submit", onSearch);
  $("#clearBtn").addEventListener("click", onClear);
  $("#threshold").addEventListener("input", (e) => {
    $("#thVal").textContent = e.target.value;
  });

  $("#downloadBtn").addEventListener("click", () => {
    if (state.batchRows.length === 0) {
      alert("No results to export yet.");
      return;
    }
    exportResultsCSV(state.batchRows);
  });

  $("#emailBtn").addEventListener("click", () => {
    const email = $("#emailInput").value.trim();
    if (!email) {
      alert("Please enter your email.");
      return;
    }
    if (state.batchRows.length === 0) {
      alert("No results to email yet.");
      return;
    }
    emailResultsCSV(state.batchRows, email);
  });
});
