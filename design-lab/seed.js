/* Generates the synthetic dataset the test copies boot with. Invented, not the user's
   records: the real backup is financial data and this repo is public. Shaped like
   four months of ordinary use so every screen has something to render -- a redesign
   judged against empty tables is not judged at all. */
const R = (seed => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)(20260915);
const pick = a => a[Math.floor(R() * a.length)];
const money = (lo, hi) => Math.round((lo + R() * (hi - lo)) * 100) / 100;
const iso = d => d.toISOString().slice(0, 10);

const TODAY = new Date("2026-09-15T00:00:00Z");
const dayBack = n => { const d = new Date(TODAY); d.setUTCDate(d.getUTCDate() - n); return d; };

let seq = 0;
const uid = p => p + "_" + (1757000000000 + (seq++) * 97) + "_" + R().toString(36).slice(2, 7);

const SPEND = [
  ["Food", ["Jollibee lunch","Grocery run","Coffee","Milk tea","Dinner out","Palengke veggies","Bakery","Street food"], 80, 1400],
  ["Transport", ["Grab to office","Jeepney fare","Gas","MRT load","Toll","Angkas"], 25, 1200],
  ["Bills", ["Meralco","Maynilad","Globe postpaid","Converge wifi","Netflix","Spotify"], 199, 3800],
  ["Shopping", ["Shopee order","Lazada order","Uniqlo shirt","Shoes","Phone case"], 250, 4500],
  ["Health", ["Pharmacy","Dental cleaning","Vitamins","Check-up"], 300, 3500],
  ["Entertainment", ["Cinema","Concert ticket","Steam sale","Board game night"], 250, 2800],
  ["Other", ["Gift for mom","Donation","Haircut","Printing"], 100, 1500]
];
const BANKS = ["Maya Bank","GCash","BPI","Cash / Physical wallet","GoTyme"];

const expenses = [];
for (let d = 0; d < 120; d++){
  const n = R() < 0.25 ? 0 : (R() < 0.7 ? 1 : 2);
  for (let i = 0; i < n; i++){
    const [cat, descs, lo, hi] = pick(SPEND);
    expenses.push({
      id: uid("e"), description: pick(descs), amount: money(lo, hi),
      category: cat, tags: R() < 0.18 ? [pick(["recurring","work","family"])] : [],
      date: iso(dayBack(d)), bank: R() < 0.8 ? pick(BANKS) : null,
      originalAmount: null, originalCurrency: null
    });
  }
}

const incomes = [];
for (let m = 0; m < 4; m++){
  incomes.push({
    id: uid("i"), description: "Monthly salary", amount: 52000,
    category: "Salary", tags: [], date: iso(dayBack(m * 30 + 3)),
    bank: "BPI", originalAmount: null, originalCurrency: null
  });
  if (R() < 0.6) incomes.push({
    id: uid("i"), description: pick(["Logo design","Website tweak","Consulting call"]),
    amount: money(3500, 18000), category: "Freelance", tags: [],
    date: iso(dayBack(m * 30 + 14)), bank: "Maya Bank",
    originalAmount: null, originalCurrency: null
  });
}
incomes.push({ id: uid("i"), description: "13th month (partial)", amount: 21000,
  category: "Bonus", tags: [], date: iso(dayBack(45)), bank: "BPI",
  originalAmount: null, originalCurrency: null });

const savings = [
  { id: uid("sv"), provider: "Maya Bank",             amount: 84250.40, rate: 3.5, taxRate: 20, tiered: true,  tierCap: 100000, tierOverRate: 1.5, dateAdded: iso(dayBack(210)) },
  { id: uid("sv"), provider: "GCash GSave",           amount: 31400.00, rate: 2.6, taxRate: 20, tiered: false, tierCap: null, tierOverRate: null, dateAdded: iso(dayBack(180)) },
  { id: uid("sv"), provider: "CIMB Bank PH",          amount: 60000.00, rate: 4.0, taxRate: 20, tiered: false, tierCap: null, tierOverRate: null, dateAdded: iso(dayBack(150)) },
  { id: uid("sv"), provider: "Cash / Physical wallet", amount: 4820.00, rate: 0,   taxRate: 0,  tiered: false, tierCap: null, tierOverRate: null, dateAdded: iso(dayBack(120)) }
];
savings.forEach(a => { a.opening = a.amount; });

const loansGiven = [
  { id: uid("lg"), person: "Kuya Ramon", amount: 8000,  dateGiven: iso(dayBack(64)), deadline: iso(dayBack(-16)), status: "outstanding", bank: "Maya Bank" },
  { id: uid("lg"), person: "Aira",       amount: 2500,  dateGiven: iso(dayBack(38)), deadline: iso(dayBack(-4)),  status: "outstanding", bank: "GCash" },
  { id: uid("lg"), person: "Jen",        amount: 15000, dateGiven: iso(dayBack(96)), deadline: iso(dayBack(6)),   status: "outstanding", bank: "BPI" },
  { id: uid("lg"), person: "Marco",      amount: 4200,  dateGiven: iso(dayBack(150)), deadline: iso(dayBack(60)), status: "repaid",      bank: "Maya Bank" }
];
const loansTaken = [
  { id: uid("lt"), person: "Tita Let",  amount: 12000, dateGiven: iso(dayBack(80)), deadline: iso(dayBack(-25)), status: "outstanding", bank: "BPI" },
  { id: uid("lt"), person: "Office SSS", amount: 6000, dateGiven: iso(dayBack(200)), deadline: iso(dayBack(45)),  status: "repaid",      bank: "BPI" }
];

const investments = [
  { id: uid("inv"), name: "BDO Equity Fund",  category: "Mutual Fund / UITF", amount: 25000, projectedPrice: 31000, actualSoldPrice: null,  feePercent: 2, dateAdded: iso(dayBack(160)), bank: "BPI" },
  { id: uid("inv"), name: "JFC shares",       category: "Stocks",             amount: 18000, projectedPrice: 22500, actualSoldPrice: null,  feePercent: 1.5, dateAdded: iso(dayBack(95)), bank: "BPI" },
  { id: uid("inv"), name: "ETH (small bag)",  category: "Crypto",             amount: 9000,  projectedPrice: 14000, actualSoldPrice: 12400, feePercent: 3, dateAdded: iso(dayBack(240)), bank: "Maya Bank" }
];

const budgets = { Food: 12000, Transport: 5000, Bills: 6500, Shopping: 4000, Entertainment: 2500 };

const recurring = [
  { id: uid("r"), description: "Converge wifi", amount: 1699, category: "Bills", dayOfMonth: 8,  bank: "BPI",        lastPosted: iso(dayBack(7)) },
  { id: uid("r"), description: "Netflix",       amount: 549,  category: "Bills", dayOfMonth: 20, bank: "Maya Bank",  lastPosted: iso(dayBack(26)) }
];

const currencies = [
  { code: "USD", name: "US Dollar", rate: 58.6,  updatedAt: Date.now() },
  { code: "JPY", name: "Japanese Yen", rate: 0.39, updatedAt: Date.now() }
];

const networth = [];
for (let m = 6; m >= 0; m--){
  networth.push({ date: iso(dayBack(m * 30)), netWorth: Math.round(150000 + (6 - m) * 6400 + R() * 5000) });
}

const out = {
  spendly_expenses_v1: expenses,
  spendly_incomes_v1: incomes,
  spendly_savings_v1: savings,
  spendly_loans_given_v1: loansGiven,
  spendly_loans_taken_v1: loansTaken,
  spendly_investments_v1: investments,
  spendly_budgets_v1: budgets,
  spendly_recurring_v1: recurring,
  spendly_currencies_v1: currencies,
  spendly_networth_history_v1: networth,
  spendly_welcome_dismissed_v1: true,
  spendly_categories_v1: ["Food","Transport","Entertainment","Bills","Shopping","Health","Other"]
};

require("fs").writeFileSync(process.argv[2], JSON.stringify(out));
console.log("expenses=" + expenses.length + " incomes=" + incomes.length +
  " savings=" + savings.length + " loans=" + (loansGiven.length + loansTaken.length) +
  " investments=" + investments.length);
